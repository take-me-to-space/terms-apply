import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }));
import { runReminders } from '../netlify/functions/reminders';
const job = {
  job_id: '11111111-1111-4111-8111-111111111111',
  lease_token: 'lease',
};
const delivery = {
  ...job,
  commitment_id: 'agreement',
  recipient: 'person@example.com',
  kind: 'goal_checkin',
  deadline_at: '2026-10-17T14:30:00Z',
  pledge_check_at: '2026-10-19T14:30:00Z',
  timezone: 'Asia/Kolkata',
};
beforeEach(() => {
  rpc.mockReset();
  for (const [key, value] of Object.entries({
    SUPABASE_URL: 'https://local-test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only',
    RESEND_API_KEY: 'test-only',
    EMAIL_FROM: 'Terms Apply <hello@example.com>',
    APP_URL: 'https://app.example.com',
  }))
    vi.stubEnv(key, value);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  rpc.mockImplementation(async (name: string) => ({
    data:
      name === 'claim_reminders'
        ? [job]
        : name === 'get_reminder_delivery'
          ? [delivery]
          : null,
    error: null,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('scheduled email boundary', () => {
  it('staggers a due batch before rechecking consent and sending', async () => {
    vi.useFakeTimers();
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === 'claim_reminders'
          ? [0, 1, 2].map((n) => ({ ...job, job_id: `job-${n}` }))
          : name === 'get_reminder_delivery'
            ? [delivery]
            : null,
      error: null,
    }));
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ id: 'provider-123' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetcher);
    const running = runReminders();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(749);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(750);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse((await running).body).sent).toBe(3);
  });
  it('does not claim jobs or promise delivery without configured email', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect((await runReminders()).statusCode).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects invalid application origins', async () => {
    vi.stubEnv('APP_URL', 'not-a-url');
    expect((await runReminders()).statusCode).toBe(503);
    vi.stubEnv('APP_URL', 'http://example.com');
    expect((await runReminders()).statusCode).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rechecks relevance before sending and skips cancelled delivery', async () => {
    rpc.mockImplementation(async (name: string) => ({
      data: name === 'claim_reminders' ? [job] : [],
      error: null,
    }));
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(JSON.parse((await runReminders()).body).cancelled).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends a stable idempotency key and stores the provider result', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'provider-123' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(JSON.parse((await runReminders()).body).sent).toBe(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      `terms-apply/${job.job_id}`,
    );
    expect(rpc).toHaveBeenCalledWith('finish_reminder', {
      p_job_id: job.job_id,
      p_lease_token: 'lease',
      p_provider_id: 'provider-123',
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).text).toContain(
      '/settings',
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body).html).toContain(
      'Manage email reminders',
    );
  });
  it('keeps rate-limit errors retryable without logging the provider response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('private provider detail', { status: 429 }),
        ),
    );
    expect(JSON.parse((await runReminders()).body).failed).toBe(1);
    expect(rpc).toHaveBeenCalledWith(
      'finish_reminder',
      expect.objectContaining({
        p_error: 'email_http_429',
        p_permanent: false,
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      'private provider detail',
    );
  });
  it('records permanent rejection distinctly from an uncertain timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 422 })),
    );
    await runReminders();
    expect(rpc).toHaveBeenCalledWith(
      'finish_reminder',
      expect.objectContaining({ p_permanent: true }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await runReminders();
    expect(rpc).toHaveBeenCalledWith(
      'finish_reminder',
      expect.objectContaining({
        p_error: expect.stringContaining('Delivery uncertain'),
      }),
    );
  });
});
