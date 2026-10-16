import { z } from 'zod';

export type GoalReport = {
  id: string;
  outcome: 'on_time' | 'late' | 'missed';
  completed_at: string | null;
  reported_at: string;
  note: string | null;
};
export type PledgeReport = {
  id: string;
  outcome: 'honoured' | 'not_honoured' | 'not_yet';
  reported_at: string;
  note: string | null;
};
export type Withdrawal = {
  id: string;
  withdrawn_at: string;
  reason: string | null;
};
export type Commitment = {
  id: string;
  user_id: string;
  goal: string;
  done_means: string;
  deadline_at: string;
  pledge: string;
  pledge_check_at: string;
  timezone: string;
  created_at: string;
  confirmed_at: string;
  goal_reports: GoalReport[];
  pledge_reports: PledgeReport[];
  withdrawals: Withdrawal[];
};
export type Draft = {
  goal: string;
  doneMeans: string;
  deadline: string;
  pledge: string;
  pledgeCheck: string;
  timezone: string;
};
export const deviceTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function localInput(
  date: Date,
  precision: 'minute' | 'millisecond' = 'minute',
): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, precision === 'minute' ? 16 : 23);
}
export function localTimeChoices(value: string): Date[] {
  const date = new Date(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    !localInput(date, 'millisecond').startsWith(value)
  )
    return [];
  return [0, 30, 60, 120, -30, -60, -120]
    .map((minutes) => new Date(date.getTime() + minutes * 60_000))
    .filter((candidate) =>
      localInput(candidate, 'millisecond').startsWith(value),
    )
    .sort((a, b) => a.getTime() - b.getTime());
}
export function localToISO(
  value: string,
  occurrence?: 'first' | 'second',
): string {
  const choices = localTimeChoices(value);
  if (!choices.length)
    throw new Error(
      'Choose a valid local time. That time may not exist because the clocks change.',
    );
  if (choices.length > 1 && !occurrence)
    throw new Error(
      'That local time occurs twice because the clocks change. Choose a time outside the repeated hour.',
    );
  return choices[
    occurrence === 'second' ? choices.length - 1 : 0
  ].toISOString();
}
export const draftSchema = z
  .object({
    goal: z
      .string()
      .trim()
      .min(3, 'Give your goal a little more detail.')
      .max(180),
    doneMeans: z
      .string()
      .trim()
      .min(3, 'Describe what done looks like.')
      .max(700),
    deadline: z.string().min(1, 'Choose a deadline.'),
    pledge: z.string().trim().min(3, 'Choose your own pledge.').max(700),
    pledgeCheck: z.string().min(1, 'Choose a pledge check-in time.'),
    timezone: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    let deadline: string, pledgeCheck: string;
    try {
      deadline = localToISO(value.deadline);
    } catch (e) {
      ctx.addIssue({
        code: 'custom',
        path: ['deadline'],
        message:
          e instanceof Error
            ? e.message
            : 'Choose a valid deadline in your local time.',
      });
      return;
    }
    try {
      pledgeCheck = localToISO(value.pledgeCheck);
    } catch (e) {
      ctx.addIssue({
        code: 'custom',
        path: ['pledgeCheck'],
        message:
          e instanceof Error
            ? e.message
            : 'Choose a valid local pledge check-in time.',
      });
      return;
    }
    if (new Date(deadline).getTime() <= Date.now())
      ctx.addIssue({
        code: 'custom',
        path: ['deadline'],
        message: 'Give yourself a deadline in the future.',
      });
    if (new Date(pledgeCheck) <= new Date(deadline))
      ctx.addIssue({
        code: 'custom',
        path: ['pledgeCheck'],
        message: 'Leave time after the goal deadline to carry out your pledge.',
      });
  });
export function formatDate(
  value: string,
  timezone = deviceTimezone(),
  withYear = false,
) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: timezone,
  }).format(new Date(value));
}
export function dateOnly(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}
export function status(
  c: Commitment,
  now = Date.now(),
): { label: string; tone: string; action: string } {
  if (c.withdrawals.length)
    return { label: 'Withdrawn', tone: 'muted', action: 'Original terms kept' };
  const g = c.goal_reports[0];
  if (!g)
    return new Date(c.deadline_at).getTime() <= now
      ? {
          label: 'No report yet',
          tone: 'orange',
          action: 'Time for a check-in',
        }
      : {
          label: 'In progress',
          tone: 'green',
          action: 'A little time, well spent',
        };
  if (g.outcome === 'on_time')
    return {
      label: 'Completed on time',
      tone: 'green',
      action: 'A promise followed through',
    };
  const p = c.pledge_reports.find((r) => r.outcome !== 'not_yet');
  if (p)
    return {
      label:
        p.outcome === 'honoured' ? 'Pledge honoured' : 'Pledge not honoured',
      tone: p.outcome === 'honoured' ? 'green' : 'muted',
      action: g.outcome === 'late' ? 'Goal completed late' : 'Goal missed',
    };
  return {
    label: g.outcome === 'late' ? 'Completed late' : 'Missed',
    tone: 'orange',
    action:
      new Date(c.pledge_check_at).getTime() <= now
        ? 'Your pledge needs a check-in'
        : 'Your pledge is next',
  };
}
export function isResolved(c: Commitment) {
  return (
    c.withdrawals.length > 0 ||
    c.goal_reports[0]?.outcome === 'on_time' ||
    c.pledge_reports.some((p) => p.outcome !== 'not_yet')
  );
}
export const outcomeLabel = {
  on_time: 'Completed on time',
  late: 'Completed late',
  missed: 'Missed',
  honoured: 'Pledge honoured',
  not_honoured: 'Pledge not honoured',
  not_yet: 'Pledge: not yet',
};
