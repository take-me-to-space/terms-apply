import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  recovery: boolean;
}>({ session: null, loading: true, recovery: false });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED')
        setRecovery(false);
    });
    // getSession also completes PKCE code exchange performed by the client.
    void supabase.auth.getSession().then(({ data: result }) => {
      setSession(result.session);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading, recovery }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
