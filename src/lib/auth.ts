import { supabase } from './supabase';

const SESSION_KEY = 'dockflow_session_email';

/**
 * Checks email/password against the dockflow_users table via the
 * dockflow_login() Postgres function, never a direct table read — the
 * anon key has no SELECT grant on dockflow_users, so credentials aren't
 * exposed over the API even though this is a deliberately simple,
 * hardcoded-in-Supabase login rather than real Supabase Auth.
 */
export async function login(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('dockflow_login', {
    p_email: email.trim().toLowerCase(),
    p_password: password,
  });
  if (error) throw error;
  if (data) {
    localStorage.setItem(SESSION_KEY, email.trim().toLowerCase());
    return true;
  }
  return false;
}

export function getSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}
