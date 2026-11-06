import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './env.ts';

/** The header every admin tool sends its password in. */
export const PASSWORD_HEADER = 'x-admin-password';

const enc = new TextEncoder();

/* Both sides are hashed first so the comparison is over two equal-length
   digests: timingSafeEqual throws on a length mismatch, and comparing lengths
   up front would leak the password's length. */
export async function passwordOk(given: string | null | undefined, want: string | undefined): Promise<boolean> {
  if (!want || !given) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(want)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/* The admin tools send the password in x-admin-password. Scripts may send it
   as a standard bearer token instead (`Authorization: Bearer <password>`),
   which is what credential stores and HTTP clients know how to attach. */
export async function isAuthed(c: Context<AppEnv>): Promise<boolean> {
  const bearer = /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') ?? '')?.[1]?.trim();
  return (await passwordOk(c.req.header(PASSWORD_HEADER), c.env.ADMIN_PASSWORD))
    || passwordOk(bearer, c.env.ADMIN_PASSWORD);
}

/** Refuses the request with 401 unless it carries the admin password. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await isAuthed(c))) return c.json({ error: 'Wrong password' }, 401);
  await next();
};
