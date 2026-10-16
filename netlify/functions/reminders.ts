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
  const url = `${origin}/commitments/${delivery.commitment_id}`;
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
      subject: 'A little time left. Your terms still apply.',
      text: `A reminder about your agreement: the goal deadline is ${time} (${delivery.timezone}). Already finished? You can record it now.`,
    },
    goal_checkin: {
      subject: 'What happened?',
      text: `Your goal deadline was ${time} (${delivery.timezone}). Completed on time, completed late, or missed? Tell us when you actually finished. A late report can still describe an on-time completion.`,
    },
    pledge_checkin: {
      subject: 'And your side of the deal?',
      text: `Your pledge check-in was set for ${time} (${delivery.timezone}). Did you honour it? Honoured, not honoured, and not yet are separate answers. We take your word for it.`,
    },
  };
  const m = messages[delivery.kind];
  return {
    subject: m.subject,
    text: `${m.text}\n\nOpen your private agreement: ${url}\n\nUse the app to record your answer; email replies are not recorded. An unanswered check-in stays unreported.\n\nYou opted in to Terms Apply reminders. Turn them off: ${settings}\n\nTerms Apply — Your goal. Your pledge. Your word.`,
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
