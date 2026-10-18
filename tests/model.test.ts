import { describe, expect, it, vi } from 'vitest';
import {
  draftSchema,
  isResolved,
  localInput,
  localToISO,
  status,
  type Commitment,
} from '../src/lib/model';
import { reminderEmail, type Delivery } from '../netlify/functions/reminders';
const base = {
  id: 'a',
  goal: 'Walk',
  goal_reports: [],
  pledge_reports: [],
  withdrawals: [],
  deadline_at: '2020-01-01T20:00:00Z',
  pledge_check_at: '2020-01-03T20:00:00Z',
} as unknown as Commitment;
describe('honest status presentation', () => {
  it('does not turn silence into a failure', () => {
    expect(status(base).label).toBe('No report yet');
    expect(isResolved(base)).toBe(false);
  });
  it('keeps a not-yet pledge open even after the check-in', () => {
    const record = {
      ...base,
      goal_reports: [{ outcome: 'late' }],
      pledge_reports: [{ outcome: 'not_yet' }],
    } as Commitment;
    expect(isResolved(record)).toBe(false);
    expect(status(record).label).toBe('Completed late');
  });
  it('does not present a withdrawal as completion', () => {
    const c = { ...base, withdrawals: [{ reason: 'changed' }] } as Commitment;
    expect(status(c).label).toBe('Withdrawn');
    expect(isResolved(c)).toBe(true);
  });
});
describe('local time inputs', () => {
  it('rejects skipped and ambiguous DST times rather than silently scheduling a different instant', () => {
    vi.stubEnv('TZ', 'America/New_York');
    try {
      expect(() => localToISO('2026-03-08T02:30')).toThrow('valid local time');
      expect(() => localToISO('2026-11-01T01:30')).toThrow('occurs twice');
      expect(localToISO('2026-11-01T01:30', 'first')).toBe(
        '2026-11-01T05:30:00.000Z',
      );
      expect(localToISO('2026-11-01T01:30', 'second')).toBe(
        '2026-11-01T06:30:00.000Z',
      );
      expect(localToISO('2026-11-01T03:30')).toBe('2026-11-01T08:30:00.000Z');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('roundtrips precise completion times instead of rounding them before confirmation', () => {
    const d = new Date();
    expect(localToISO(localInput(d, 'millisecond'))).toBe(d.toISOString());
  });
  it('rejects invalid dates and past deadlines', () => {
    expect(() => localToISO('2026-02-31T20:00')).toThrow('valid local time');
    expect(() => localToISO('')).toThrow();
    expect(
      draftSchema.safeParse({
        goal: 'Walk',
        doneMeans: 'Outside',
        deadline: '2020-01-01T20:00',
        pledge: 'No Netflix',
        pledgeCheck: '2020-01-03T20:00',
        timezone: 'UTC',
      }).success,
    ).toBe(false);
  });
});
describe('private reminder copy', () => {
  const d: Delivery = {
    job_id: 'j',
    recipient: 'person@example.com',
    commitment_id: '123',
    kind: 'before_deadline',
    deadline_at: '2026-10-19T14:30:00Z',
    pledge_check_at: '2026-10-21T17:30:00Z',
    timezone: 'Asia/Kolkata',
  };
  it('uses the stored timezone, private deep link, and opt-out link', () => {
    const mail = reminderEmail(d, 'https://app.example.com');
    expect(mail.text).toContain('Asia/Kolkata');
    expect(mail.text).toContain('8:00');
    expect(mail.text).toContain('https://app.example.com/commitments/123');
    expect(mail.text).toContain('https://app.example.com/settings');
    expect(mail.text).not.toContain(d.recipient);
    expect(mail.html).toContain('https://app.example.com/commitments/123');
    expect(mail.html).toContain('https://app.example.com/settings');
    expect(mail.html).not.toContain(d.recipient);
  });
  it('encodes the agreement ID in links in both formats', () => {
    const mail = reminderEmail(
      { ...d, commitment_id: '\"><script>alert(1)</script>' },
      'https://app.example.com',
    );
    expect(mail.text).toContain(
      encodeURIComponent('\"><script>alert(1)</script>'),
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain(
      encodeURIComponent('\"><script>alert(1)</script>'),
    );
  });
  it('says a late report can describe an on-time completion', () => {
    expect(
      reminderEmail({ ...d, kind: 'goal_checkin' }, 'https://app.example.com')
        .text,
    ).toContain('A late report can still describe an on-time completion');
  });
});
