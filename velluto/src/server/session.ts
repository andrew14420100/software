// Next.js glue: current user from the session cookie, guards, JSON helpers, CSRF origin check.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, userFromToken, type User } from "./auth.ts";

export async function currentUser(): Promise<User | null> {
  const c = await cookies();
  return userFromToken(c.get(SESSION_COOKIE)?.value);
}
export async function requireUserPage(next = "/"): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(`/accedi?next=${encodeURIComponent(next)}`);
  return u;
}
export async function requireAdminPage(): Promise<User> {
  const u = await requireUserPage("/admin");
  if (u.role !== "admin") redirect("/");
  return u;
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

/** Reject cross-site state-changing requests (defence in depth on top of SameSite=Lax cookies). */
export async function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new HttpError(403, "Origine non consentita");
}

export async function apiUser(req: Request, opts: { admin?: boolean } = {}): Promise<User> {
  await assertSameOrigin(req);
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Accesso richiesto");
  if (opts.admin && u.role !== "admin") throw new HttpError(403, "Solo amministratori");
  return u;
}

/** Wrap a route handler: maps HttpError/validation errors to JSON responses. */
export function handler<A extends unknown[]>(fn: (req: Request, ...a: A) => Promise<Response>) {
  return async (req: Request, ...a: A) => {
    try { return await fn(req, ...a); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: e instanceof Error ? e.message : "Errore interno" }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, "JSON non valido"); }
}
