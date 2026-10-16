import type { Commitment, GoalReport, PledgeReport, Withdrawal } from './model';
type RawCommitment = Omit<
  Commitment,
  'goal_reports' | 'pledge_reports' | 'withdrawals'
> & {
  goal_reports: GoalReport | GoalReport[] | null;
  pledge_reports: PledgeReport[] | null;
  withdrawals: Withdrawal | Withdrawal[] | null;
};
function list<T>(value: T | T[] | null): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}
// PostgREST returns reverse UNIQUE relationships as an object/null, and
// one-to-many relationships as arrays. Normalize only at the API boundary.
export function normalizeCommitment(row: RawCommitment): Commitment {
  return {
    ...row,
    goal_reports: list(row.goal_reports),
    pledge_reports: list(row.pledge_reports),
    withdrawals: list(row.withdrawals),
  };
}
