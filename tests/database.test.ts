import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
async function role(name = 'authenticated', id = ALICE) {
  await db.exec('reset role;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${name};`);
}
async function admin() {
  await db.exec('reset role;');
}
async function create(hours = 3) {
  const result = await db.query<{ id: string }>(
    `select public.create_commitment('Walk for 30 minutes', '30 minutes walking outside', now() + $1 * interval '1 hour', 'No Netflix for two evenings', now() + interval '3 days', 'Asia/Kolkata') as id`,
    [hours],
  );
  return result.rows[0].id;
}
async function pastCommitment({ due = '-1 hour', pledge = '-1 minute' } = {}) {
  const id = await create();
  await admin();
  await db.query(
    `update public.commitments set created_at = now()-interval '2 days', confirmed_at = now()-interval '2 days', deadline_at = now()+$2::interval, pledge_check_at = now()+$3::interval where id=$1`,
    [id, due, pledge],
  );
  await role();
  return id;
}
async function scalar<T = string>(sql: string, params: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, params)).rows[0].value;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
});
beforeEach(async () => {
  await admin();
  await db.exec(
    "truncate auth.users cascade; update billing_config set enabled=false,environment='test_mode',started_at=now();",
  );
  await db.query(
    "insert into auth.users values($1,'alice@example.com',now()),($2,'bob@example.com',now())",
    [ALICE, BOB],
  );
  await role();
});
afterAll(async () => {
  await db.close();
});

describe('server permissions and private immutable agreements', () => {
  it('deduplicates a repeated confirmation without allowing different terms or another owner', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    const deadline = new Date(Date.now() + 86400000).toISOString();
    const check = new Date(Date.now() + 3 * 86400000).toISOString();
    const sql = 'select create_commitment($1,$2,$3,$4,$5,$6,$7) as value';
    const args = [
      'Walk outside',
      '30 minutes',
      deadline,
      'No TV',
      check,
      'UTC',
      requestId,
    ];
    expect(await scalar(sql, args)).toBe(requestId);
    expect(await scalar(sql, args)).toBe(requestId);
    expect(
      await scalar<number>('select count(*)::int as value from commitments'),
    ).toBe(1);
    await expect(
      db.query(sql, ['Different goal', ...args.slice(1)]),
    ).rejects.toThrow('different terms');
    await role('authenticated', BOB);
    await expect(db.query(sql, args)).rejects.toThrow('different terms');
  });
  it('uses the authenticated identity and isolates another account', async () => {
    const id = await create();
    expect(await scalar('select user_id::text as value from commitments')).toBe(
      ALICE,
    );
    await role('authenticated', BOB);
    expect(
      await scalar<number>('select count(*)::int as value from commitments'),
    ).toBe(0);
    await expect(
      db.query("select report_goal($1,'completed',now())", [id]),
    ).rejects.toThrow('not found');
    await expect(
      db.query('select withdraw_commitment($1)', [id]),
    ).rejects.toThrow('not found');
    await expect(
      db.query("select report_pledge($1,'honoured')", [id]),
    ).rejects.toThrow('not found');
  });
  it('rejects anonymous writes and direct edits of terms and answers', async () => {
    const id = await create();
    await expect(
      db.query("update commitments set goal='Changed' where id=$1", [id]),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query('delete from commitments where id=$1', [id]),
    ).rejects.toThrow('permission denied');
    await expect(
      db.exec(
        "insert into goal_reports(commitment_id,outcome) select id,'missed' from commitments",
      ),
    ).rejects.toThrow('permission denied');
    await role('anon', '');
    await expect(create()).rejects.toThrow('permission denied');
    await expect(db.exec('select * from commitments')).rejects.toThrow(
      'permission denied',
    );
    await expect(db.exec('select delete_my_account()')).rejects.toThrow(
      'permission denied',
    );
  });
  it('validates dates, timezone, trimmed content, and field limits on the server', async () => {
    await expect(create(-1)).rejects.toThrow('future deadline');
    await expect(
      db.exec(
        "select create_commitment('walk','outside',now()+interval '1 day','no tv',now(),'UTC')",
      ),
    ).rejects.toThrow('after the goal deadline');
    await expect(
      db.exec(
        "select create_commitment('walk','outside',now()+interval '1 day','no tv',now()+interval '2 days','Fake/Zone')",
      ),
    ).rejects.toThrow('Unknown timezone');
    await expect(
      db.exec(
        "select create_commitment('   ','outside',now()+interval '1 day','no tv',now()+interval '2 days','UTC')",
      ),
    ).rejects.toThrow('check constraint');
  });
  it('cannot read another user’s reports or reasons through nested tables', async () => {
    const id = await pastCommitment();
    await db.query("select report_goal($1,'missed')", [id]);
    await db.query("select report_pledge($1,'not_yet','private note')", [id]);
    const second = await create();
    await db.query("select withdraw_commitment($1,'private reason')", [second]);
    await role('authenticated', BOB);
    for (const table of ['goal_reports', 'pledge_reports', 'withdrawals'])
      expect(
        await scalar<number>(`select count(*)::int as value from ${table}`),
      ).toBe(0);
  });
});
describe('goal, pledge, and withdrawal transitions', () => {
  it('allows early completion, keeps the original terms, and does not trigger a pledge', async () => {
    const id = await create();
    expect(
      await scalar("select report_goal($1,'completed',now()) as value", [id]),
    ).toBe('on_time');
    await expect(
      db.query("select report_pledge($1,'honoured')", [id]),
    ).rejects.toThrow('No pledge');
    await expect(
      db.query('select withdraw_commitment($1)', [id]),
    ).rejects.toThrow('cannot be withdrawn');
    await expect(
      db.query("select report_goal($1,'completed',now())", [id]),
    ).rejects.toThrow('already recorded');
    await admin();
    expect(
      await scalar<number>(
        "select count(*)::int as value from reminder_jobs where status <> 'cancelled'",
      ),
    ).toBe(0);
    expect(await scalar('select goal as value from commitments')).toBe(
      'Walk for 30 minutes',
    );
  });
  it('records a late report of an on-time completion as on time', async () => {
    const id = await pastCommitment();
    expect(
      await scalar(
        "select report_goal($1,'completed',now()-interval '2 hours') as value",
        [id],
      ),
    ).toBe('on_time');
    expect(
      await scalar<boolean>(
        'select completed_at < reported_at as value from goal_reports',
      ),
    ).toBe(true);
  });
  it('late completion activates the pledge regardless of caller labels', async () => {
    const id = await pastCommitment();
    expect(
      await scalar("select report_goal($1,'completed',now()) as value", [id]),
    ).toBe('late');
    await admin();
    expect(
      await scalar<number>(
        "select count(*)::int as value from reminder_jobs where kind='pledge_checkin'",
      ),
    ).toBe(1);
  });
  it('does not permit early missed reports or impossible completion times', async () => {
    const id = await create();
    await expect(
      db.query("select report_goal($1,'missed')", [id]),
    ).rejects.toThrow('not passed');
    await expect(
      db.query("select report_goal($1,'completed',now()+interval '1 day')", [
        id,
      ]),
    ).rejects.toThrow('between confirmation and now');
    await expect(
      db.query("select report_goal($1,'completed',now()-interval '1 day')", [
        id,
      ]),
    ).rejects.toThrow('between confirmation and now');
  });
  it('does not infer failure from elapsed dates or absent reports', async () => {
    await pastCommitment();
    expect(
      await scalar<number>('select count(*)::int as value from goal_reports'),
    ).toBe(0);
    expect(
      await scalar<number>('select count(*)::int as value from pledge_reports'),
    ).toBe(0);
  });
  it('keeps not-yet answers and permits a later final answer without overwriting', async () => {
    const id = await pastCommitment();
    await db.query("select report_goal($1,'missed')", [id]);
    await db.query("select report_pledge($1,'not_yet','need more time')", [id]);
    await admin();
    await db.exec(
      "update pledge_reports set reported_at=now()-interval '2 minutes'",
    );
    await role();
    await db.query("select report_pledge($1,'honoured')", [id]);
    expect(
      await scalar<number>('select count(*)::int as value from pledge_reports'),
    ).toBe(2);
    await expect(
      db.query("select report_pledge($1,'not_honoured')", [id]),
    ).rejects.toThrow('already recorded');
    await expect(
      db.exec("update pledge_reports set outcome='honoured'"),
    ).rejects.toThrow('permission denied');
  });
  it('leaves time for the pledge instead of accepting an immediate final report', async () => {
    const id = await pastCommitment({ pledge: '2 days' });
    await db.query("select report_goal($1,'missed')", [id]);
    await expect(
      db.query("select report_pledge($1,'honoured')", [id]),
    ).rejects.toThrow('not arrived');
    await db.query("select report_pledge($1,'not_yet')", [id]);
  });
  it('withdraws without erasing the original or creating a successful outcome', async () => {
    const id = await create();
    await db.query("select withdraw_commitment($1,'Plans changed')", [id]);
    expect(await scalar('select reason as value from withdrawals')).toBe(
      'Plans changed',
    );
    expect(
      await scalar<number>('select count(*)::int as value from commitments'),
    ).toBe(1);
    await expect(
      db.query("select report_goal($1,'completed',now())", [id]),
    ).rejects.toThrow('withdrawn');
    await admin();
    expect(
      await scalar<number>(
        "select count(*)::int as value from reminder_jobs where status <> 'cancelled'",
      ),
    ).toBe(0);
  });
});

describe('durable, opted-in reminders', () => {
  it('skips stale advance reminders for last-minute commitments', async () => {
    await create(1);
    await admin();
    expect(
      await scalar<number>(
        "select count(*)::int as value from reminder_jobs where kind='before_deadline'",
      ),
    ).toBe(0);
  });
  it('does not expose jobs or worker RPCs to the browser', async () => {
    await expect(db.exec('select * from reminder_jobs')).rejects.toThrow(
      'permission denied',
    );
    await expect(db.exec('select claim_reminders()')).rejects.toThrow(
      'permission denied',
    );
  });
  it('cancels delivery when consent is absent and never invents a goal outcome', async () => {
    await pastCommitment();
    await admin();
    await db.exec("update reminder_jobs set due_at=now()-interval '1 minute'");
    await role('service_role');
    const jobs = await db.query<{ job_id: string; lease_token: string }>(
      'select * from claim_reminders()',
    );
    expect(jobs.rows.length).toBe(2);
    for (const j of jobs.rows)
      expect(
        (
          await db.query('select * from get_reminder_delivery($1,$2)', [
            j.job_id,
            j.lease_token,
          ])
        ).rows,
      ).toHaveLength(0);
    expect(
      await scalar<number>(
        "select count(*)::int as value from reminder_jobs where status='cancelled'",
      ),
    ).toBe(2);
    expect(
      await scalar<number>('select count(*)::int as value from goal_reports'),
    ).toBe(0);
  });
  it('leases once, rechecks opt-out, and makes stale lease tokens ineffective', async () => {
    await db.exec('select set_reminders(true)');
    const id = await create(1);
    await admin();
    await db.exec("update reminder_jobs set due_at=now()-interval '1 minute'");
    await role('service_role');
    const jobs = await db.query<{ job_id: string; lease_token: string }>(
      'select * from claim_reminders()',
    );
    const j = jobs.rows[0];
    expect(
      (await db.query('select * from claim_reminders()')).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query('select * from get_reminder_delivery($1,$2)', [
          j.job_id,
          j.lease_token,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query('select * from get_reminder_delivery($1,$2)', [
          j.job_id,
          BOB,
        ])
      ).rows,
    ).toHaveLength(0);
    await role();
    await db.exec('select set_reminders(false)');
    await role('service_role');
    expect(
      (
        await db.query('select * from get_reminder_delivery($1,$2)', [
          j.job_id,
          j.lease_token,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      await scalar(
        'select status as value from reminder_jobs where commitment_id=$1',
        [id],
      ),
    ).toBe('cancelled');
  });
  it('respects verification and stops irrelevant messages after a report', async () => {
    await db.exec('select set_reminders(true)');
    const id = await create(1);
    await admin();
    await db.exec(
      "update reminder_jobs set due_at=now()-interval '1 minute'; update auth.users set email_confirmed_at=null",
    );
    await role('service_role');
    const job = (
      await db.query<{ job_id: string; lease_token: string }>(
        'select * from claim_reminders()',
      )
    ).rows[0];
    expect(
      await scalar<boolean>('select reminder_is_eligible($1) as value', [
        job.job_id,
      ]),
    ).toBe(false);
    await admin();
    await db.exec('update auth.users set email_confirmed_at=now()');
    await role();
    await db.query("select report_goal($1,'completed',now())", [id]);
    await role('service_role');
    expect(
      (
        await db.query('select * from get_reminder_delivery($1,$2)', [
          job.job_id,
          job.lease_token,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it('records delivery, retries transient failure, and bounds uncertain retries', async () => {
    await db.exec('select set_reminders(true)');
    await create(1);
    await admin();
    await db.exec("update reminder_jobs set due_at=now()-interval '1 minute'");
    await role('service_role');
    const job = (
      await db.query<{ job_id: string; lease_token: string }>(
        'select * from claim_reminders()',
      )
    ).rows[0];
    await db.query("select finish_reminder($1,$2,null,'email_http_429')", [
      job.job_id,
      job.lease_token,
    ]);
    expect(await scalar('select status as value from reminder_jobs')).toBe(
      'pending',
    );
    await admin();
    await db.exec(
      "update reminder_jobs set available_at=now(), first_attempt_at=now()-interval '24 hours'",
    );
    await role('service_role');
    expect(
      (await db.query('select * from claim_reminders()')).rows,
    ).toHaveLength(0);
    expect(await scalar('select status as value from reminder_jobs')).toBe(
      'failed',
    );
  });
  it('marks a provider-accepted delivery once and retains diagnostics', async () => {
    await db.exec('select set_reminders(true)');
    await create(1);
    await admin();
    await db.exec("update reminder_jobs set due_at=now()-interval '1 minute'");
    await role('service_role');
    const j = (
      await db.query<{ job_id: string; lease_token: string }>(
        'select * from claim_reminders()',
      )
    ).rows[0];
    await db.query("select finish_reminder($1,$2,'provider-123')", [
      j.job_id,
      j.lease_token,
    ]);
    expect(await scalar('select status as value from reminder_jobs')).toBe(
      'sent',
    );
    expect(
      (await db.query('select * from claim_reminders()')).rows,
    ).toHaveLength(0);
  });
});
describe('account deletion', () => {
  it('deletes only the authenticated account and cascades its app data and jobs', async () => {
    await create();
    await db.exec('select set_reminders(true)');
    await role('authenticated', BOB);
    await create();
    await role();
    await db.exec('select delete_my_account()');
    await admin();
    expect(
      await scalar<number>('select count(*)::int as value from auth.users'),
    ).toBe(1);
    expect(await scalar('select user_id::text as value from commitments')).toBe(
      BOB,
    );
    expect(
      await scalar<number>('select count(*)::int as value from preferences'),
    ).toBe(0);
    expect(
      await scalar<number>('select count(*)::int as value from reminder_jobs'),
    ).toBe(2);
  });
});

async function enableBilling(environment = 'test_mode') {
  await admin();
  await db.query(
    "update billing_config set enabled=true,environment=$1,started_at=now()-interval '1 day'",
    [environment],
  );
  await db.query(
    'insert into billing_test_users values($1) on conflict do nothing',
    [ALICE],
  );
  await role();
}
async function billingState() {
  return scalar<{
    enabled: boolean;
    paid: boolean;
    used: number;
    renewing: boolean;
  }>('select get_billing_state() as value');
}
async function paidSnapshot({
  valid = true,
  environment = 'test_mode',
  status = 'active',
  cancel = false,
  observed = new Date().toISOString(),
  periodEnd = new Date(Date.now() + 86400000).toISOString(),
} = {}) {
  await role('service_role');
  await db.query(
    "insert into billing_customers(user_id,environment,customer_id,checkout_id,checkout_state) values($1,$2,'cus_alice','cks_paid','open') on conflict do nothing",
    [ALICE, environment],
  );
  await db.query('select apply_billing_snapshot($1,$2,$3,$4,$5,$6)', [
    ALICE,
    environment,
    observed,
    JSON.stringify([
      {
        subscription_id: 'sub_alice',
        product_id: 'pdt_0NqIIp0MtDK9rLdhZdqff',
        status,
        cancel_at_period_end: cancel,
        next_billing_at: periodEnd,
      },
    ]),
    JSON.stringify([
      {
        payment_id: 'pay_alice',
        subscription_id: 'sub_alice',
        product_id: 'pdt_0NqIIp0MtDK9rLdhZdqff',
        starts_at: new Date(Date.now() - 86400000).toISOString(),
        ends_at: periodEnd,
        valid,
      },
    ]),
    JSON.stringify(['cks_paid']),
  ]);
  await role();
}
describe('billing access, allowances and lifecycle', () => {
  it('keeps rollout off by default and isolates test mode to the owner allowlist', async () => {
    expect((await billingState()).enabled).toBe(false);
    await enableBilling();
    expect((await billingState()).enabled).toBe(true);
    await role('authenticated', BOB);
    expect((await billingState()).enabled).toBe(false);
    for (let i = 0; i < 4; i++) await create();
    await role();
    for (let i = 0; i < 3; i++) await create();
    await expect(create()).rejects.toThrow('Monthly allowance used');
  });
  it('counts confirmed commitments, preserves idempotent retries, and never refunds usage on withdrawal', async () => {
    await enableBilling();
    const args = [
      'Write the application',
      'One submitted application',
      new Date(Date.now() + 86400000).toISOString(),
      'No Netflix',
      new Date(Date.now() + 2 * 86400000).toISOString(),
      'UTC',
      '33333333-3333-4333-8333-333333333333',
    ];
    const sql = 'select create_commitment($1,$2,$3,$4,$5,$6,$7) as value';
    const id = await scalar(sql, args);
    await db.query('select withdraw_commitment($1)', [id]);
    await create();
    await create();
    expect(await scalar(sql, args)).toBe(id);
    expect((await billingState()).used).toBe(3);
    await expect(create()).rejects.toThrow('Monthly allowance used');
    // A full quota does not prevent recording the goal or reading existing records.
    const active = await scalar(
      'select id::text as value from commitments where id<>$1 limit 1',
      [id],
    );
    await db.query("select report_goal($1,'completed',now())", [active]);
    expect(
      await scalar<number>('select count(*)::int as value from commitments'),
    ).toBe(3);
  });
  it('resets by UTC calendar month and does not count pre-rollout records', async () => {
    const legacy = await create();
    await enableBilling();
    await admin();
    await db.query(
      "update commitments set confirmed_at=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'-interval '1 second' where id=$1",
      [legacy],
    );
    await role();
    expect((await billingState()).used).toBe(0);
    await create();
    expect((await billingState()).used).toBe(1);
    await admin();
    await db.exec(
      "update billing_config set started_at=now()+interval '1 second'",
    );
    await role();
    expect((await billingState()).used).toBe(0);
  });
  it('grants Plus only from a paid receipt and separates test receipts from live access', async () => {
    await enableBilling();
    await paidSnapshot();
    expect((await billingState()).paid).toBe(true);
    for (let i = 0; i < 5; i++) await create();
    await admin();
    await db.exec("update billing_config set environment='live_mode'");
    await role();
    expect((await billingState()).paid).toBe(false);
    await expect(create()).rejects.toThrow('Monthly allowance used');
    await role('authenticated', BOB);
    expect((await billingState()).paid).toBe(false);
  });
  it('retains paid access after cancelling renewal and refuses to extend an expired or refunded period', async () => {
    await enableBilling();
    await paidSnapshot({ cancel: true });
    expect((await billingState()).paid).toBe(true);
    expect((await billingState()).renewing).toBe(false);
    await paidSnapshot({
      valid: false,
      observed: new Date(Date.now() + 1000).toISOString(),
    });
    expect((await billingState()).paid).toBe(false);
    // A delayed older event cannot restore a refunded receipt.
    await paidSnapshot({ observed: new Date(Date.now() - 1000).toISOString() });
    expect((await billingState()).paid).toBe(false);
  });
  it('blocks browser tampering with subscriptions, receipts, test access, and service RPCs', async () => {
    for (const table of [
      'billing_config',
      'billing_test_users',
      'billing_customers',
      'billing_subscriptions',
      'billing_receipts',
      'billing_events',
    ]) {
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(
        'permission denied',
      );
    }
    await expect(
      db.query("select reserve_billing_checkout($1,'test_mode')", [BOB]),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query(
        "select apply_billing_snapshot($1,'test_mode',now(),'[]','[]','[]')",
        [BOB],
      ),
    ).rejects.toThrow('permission denied');
    await role('anon', '');
    await expect(db.query('select get_billing_state()')).rejects.toThrow(
      'permission denied',
    );
  });
  it('serialises checkout reservations, reuses unfinished sessions, and refuses duplicate subscriptions', async () => {
    await enableBilling();
    await role('service_role');
    const reserve =
      "select (reserve_billing_checkout($1,'test_mode')).checkout_request::text as value";
    const first = await scalar(reserve, [ALICE]);
    await expect(db.query(reserve, [ALICE])).rejects.toThrow('already opening');
    await db.exec(
      "update billing_customers set checkout_lease_until=now()-interval '1 second'",
    );
    expect(await scalar(reserve, [ALICE])).toBe(first);
    await paidSnapshot();
    await role('service_role');
    await expect(db.query(reserve, [ALICE])).rejects.toThrow(
      'existing subscription',
    );
    await expect(db.query(reserve, [BOB])).rejects.toThrow('not available');
  });
  it('does not let account deletion orphan subscriptions or a still-payable checkout', async () => {
    await enableBilling();
    await paidSnapshot({ cancel: true });
    await expect(db.exec('select delete_my_account()')).rejects.toThrow(
      'Close billing',
    );
    await paidSnapshot({
      status: 'cancelled',
      observed: new Date(Date.now() + 1000).toISOString(),
    });
    await admin();
    await db.exec("update billing_customers set checkout_state='open'");
    await role();
    await expect(db.exec('select delete_my_account()')).rejects.toThrow(
      'Close billing',
    );
    await admin();
    await db.exec("update billing_customers set checkout_state='complete'");
    await role();
    await db.exec('select delete_my_account()');
    await admin();
    expect(
      await scalar<number>(
        'select count(*)::int as value from billing_receipts',
      ),
    ).toBe(0);
    expect(
      await scalar<number>('select count(*)::int as value from auth.users'),
    ).toBe(1);
  });
});
