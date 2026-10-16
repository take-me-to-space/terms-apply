import { createClient } from '@supabase/supabase-js';
import type { Commitment } from './model';
import { normalizeCommitment } from './records';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const remindersAvailable =
  import.meta.env.VITE_REMINDERS_ENABLED === 'true';
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
export function client() {
  if (!supabase)
    throw new Error(
      'Accounts are not connected yet. The operator needs to connect Supabase before you can save a commitment.',
    );
  return supabase;
}
export async function getCommitments() {
  const records: Commitment[] = [];
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await client()
      .from('commitments')
      .select('*, goal_reports(*), pledge_reports(*), withdrawals(*)')
      .order('confirmed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 249);
    if (error) throw error;
    records.push(...data.map(normalizeCommitment));
    if (data.length < 250) return records;
  }
}
export function friendlyError(error: unknown): string {
  if (
    error instanceof Error ||
    (typeof error === 'object' && error && 'message' in error)
  ) {
    const message = String(error.message);
    if (/fetch|network/i.test(message))
      return 'Could not reach the server. Check your connection and try again.';
    if (/rate limit/i.test(message))
      return 'A few too many attempts. Give it a moment, then try again.';
    return message;
  }
  return 'Something did not save. Please try again.';
}
