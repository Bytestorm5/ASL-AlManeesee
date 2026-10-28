/* The admin password, held for the browser session (sessionStorage) and
   shared by every tool under /admin, so signing in once covers them all. */
import { checkPassword } from '../api.ts';

const KEY = 'asl-admin-pw';

export function storedPassword(): string {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}
export function rememberPassword(pw: string): void {
  try { sessionStorage.setItem(KEY, pw); } catch { /* the page keeps it in memory */ }
}
export function forgetPassword(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Check a password against the server; remember it when it is right. */
export async function signIn(pw: string): Promise<boolean> {
  const ok = await checkPassword(pw);
  if (ok) rememberPassword(pw); else forgetPassword();
  return ok;
}
