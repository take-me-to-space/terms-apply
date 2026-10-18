import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

export type Delivery = {
  job_id: string;
  kind: 'before_deadline' | 'goal_checkin' | 'pledge_checkin';
  recipient: string;
  commitment_id: string;
  deadline_at: string;
  pledge_check_at: string;
  timezone: string;
};
export function reminderEmail(delivery: Delivery, origin: string) {
  const url = `${origin}/commitments/${encodeURIComponent(delivery.commitment_id)}`;
  const settings = `${origin}/settings`;
  const time = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: delivery.timezone,
  }).format(
    new Date(
      delivery.kind === 'pledge_checkin'
        ? delivery.pledge_check_at
        : delivery.deadline_at,
    ),
  );
  const messages = {
    before_deadline: {
      subject: 'Your commitment is due soon',
      heading: 'A reminder before your deadline',
      text: `A reminder about your agreement: the goal deadline is ${time} (${delivery.timezone}). Already finished? You can record it now.`,
    },
    goal_checkin: {
      subject: 'What happened?',
      heading: 'What happened?',
      text: `Your goal deadline was ${time} (${delivery.timezone}). Completed on time, completed late, or missed? Tell us when you actually finished. A late report can still describe an on-time completion.`,
    },
    pledge_checkin: {
      subject: 'Time for your pledge check-in',
      heading: 'Did you honour your pledge?',
      text: `Your pledge check-in was set for ${time} (${delivery.timezone}). Record honoured, not honoured, or not yet. “Not yet” leaves the pledge unresolved so you can answer later.`,
    },
  };
  const m = messages[delivery.kind];
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    );
  return {
    subject: m.subject,
    text: `${m.text}\n\nOpen your commitment: ${url}\n\nRecord your answer in the app. Email replies are not recorded. An unanswered check-in stays unreported.\n\nYou opted in to Terms Apply reminders. Turn them off: ${settings}\n\nTerms Apply`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(m.subject)}</title></head><body style="margin:0;background:#faf9f6;color:#242622;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 20px"><table role="presentation" style="width:100%;max-width:520px;margin:auto;border-collapse:collapse"><tr><td style="padding-bottom:22px;border-bottom:2px solid #b63024;font-size:26px;font-weight:bold;letter-spacing:-1px">terms apply<span style="color:#b63024">.</span></td></tr><tr><td style="padding-top:28px"><h1 style="font-size:26px;line-height:1.2;margin:0 0 18px">${escape(m.heading)}</h1><p style="font-size:16px;line-height:1.65;margin:0 0 24px">${escape(m.text)}</p><a href="${escape(url)}" style="display:inline-block;padding:13px 18px;background:#242622;color:#faf9f6;text-decoration:none;font-size:15px;font-weight:bold">Open your commitment →</a><p style="font-size:13px;line-height:1.65;color:#64655d;margin:24px 0 28px">Record your answer in the app. Email replies are not recorded. An unanswered check-in stays unreported.</p></td></tr><tr><td style="border-top:1px solid #d6d5cc;padding-top:18px;font-size:12px;line-height:1.7;color:#64655d">You opted in to Terms Apply reminders.<br><a href="${escape(settings)}" style="color:#64655d">Manage email reminders</a></td></tr></table></td></tr></table></body></html>`,
  };
}

export async function runReminders() {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY,
    EMAIL_FROM,
    APP_URL,
  } = process.env;
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !RESEND_API_KEY ||
    !EMAIL_FROM ||
    !APP_URL
  ) {
    console.error(
      'reminders_unconfigured: required server variables are missing',
    );
    return { statusCode: 503, body: 'Reminder delivery is not configured.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(APP_URL);
  } catch {
    console.error('reminders_invalid_origin');
    return { statusCode: 503, body: 'Invalid application origin.' };
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/'
  ) {
    console.error(
      'reminders_invalid_origin: APP_URL must be a canonical HTTPS origin',
    );
    return { statusCode: 503, body: 'Invalid application origin.' };
  }
  const origin = parsed.origin;
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  });
  const { data: jobs, error } = await db.rpc('claim_reminders', {
    p_limit: 10,
  });
  if (error) {
    console.error('reminders_claim_failed', { code: error.code });
    return { statusCode: 500, body: 'Could not claim reminder jobs.' };
  }
  const counts = {
    claimed: jobs?.length || 0,
    sent: 0,
    cancelled: 0,
    failed: 0,
  };
  await Promise.all(
    (jobs || []).map(
      async (job: { job_id: string; lease_token: string }, index: number) => {
        try {
          // Avoid a ten-request burst against the email provider's rate limit.
          // Wait before the eligibility lookup so consent is checked after waiting.
          if (index)
            await new Promise((resolve) => setTimeout(resolve, index * 750));
          // Recheck consent, withdrawal, outcome, verified email, and lease immediately before sending.
          const { data, error } = await db.rpc('get_reminder_delivery', {
            p_job_id: job.job_id,
            p_lease_token: job.lease_token,
          });
          if (error) throw new Error('delivery_lookup_failed');
          const delivery: Delivery | undefined = data?.[0];
          if (!delivery) {
            counts.cancelled++;
            return;
          }
          const email = reminderEmail(delivery, origin);
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': `terms-apply/${job.job_id}`,
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: delivery.recipient,
              ...email,
            }),
            signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) {
            const permanent =
              response.status >= 400 &&
              response.status < 500 &&
              ![408, 429].includes(response.status);
            const { error: finishError } = await db.rpc('finish_reminder', {
              p_job_id: job.job_id,
              p_lease_token: job.lease_token,
              p_error: `email_http_${response.status}`,
              p_permanent: permanent,
            });
            if (finishError) throw new Error('delivery_status_write_failed');
            counts.failed++;
            console.error('reminder_delivery_failed', {
              job_id: job.job_id,
              status: response.status,
              permanent,
            });
            return;
          }
          const result = (await response.json()) as { id?: string };
          if (!result.id) throw new Error('provider_response_missing_id');
          const { error: finishError } = await db.rpc('finish_reminder', {
            p_job_id: job.job_id,
            p_lease_token: job.lease_token,
            p_provider_id: result.id,
          });
          if (finishError) throw new Error('delivery_status_write_failed');
          counts.sent++;
        } catch {
          counts.failed++;
          // Do not log recipients, email bodies, service errors containing data, or secrets.
          console.error('reminder_delivery_uncertain', { job_id: job.job_id });
          await db.rpc('finish_reminder', {
            p_job_id: job.job_id,
            p_lease_token: job.lease_token,
            p_error:
              'Delivery uncertain; safe retry uses the same provider idempotency key',
          });
        }
      },
    ),
  );
  console.info('reminders_run', counts);
  return { statusCode: 200, body: JSON.stringify(counts) };
}
export const handler = schedule('*/5 * * * *', runReminders);
