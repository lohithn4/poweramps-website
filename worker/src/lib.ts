export interface Env {
  DB: D1Database;
  SITE_URL: string;
  API_URL: string;
  ALLOWED_ORIGINS: string;
  COOKIE_DOMAIN?: string;
  EMAIL_FROM: string;
  STAFF_NOTIFY_EMAIL?: string;
  DEV?: string;
  BRAND_NAME?: string;   // fallback only; the real brand comes from SITE_URL/brand.json
  REF_PREFIX?: string;   // fallback only
  RESEND_API_KEY?: string;
  SETUP_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
}

export type Role = 'client' | 'staff' | 'admin';
export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  company: string | null;
  role: Role;
  email_verified_at: string | null;
  active: number;
  password_hash?: string | null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const isDev = (env: Env) => env.DEV === 'true';
export const now = () => Math.floor(Date.now() / 1000);

/* ---------------- responses ---------------- */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  });
}

export function redirect(location: string, headers: HeadersInit = {}): Response {
  return new Response(null, { status: 302, headers: { Location: location, ...SECURITY_HEADERS, ...headers } });
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
}

export function withCors(res: Response, req: Request, env: Env): Response {
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    const h = new Headers(res.headers);
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Credentials', 'true');
    h.set('Vary', 'Origin');
    return new Response(res.body, { status: res.status, headers: h });
  }
  return res;
}

export function preflight(req: Request, env: Env): Response {
  const origin = req.headers.get('Origin') ?? '';
  if (!allowedOrigins(env).includes(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

/** CSRF defence for state-changing requests: JSON body + allow-listed Origin. */
export function assertSafeMutation(req: Request, env: Env) {
  const origin = req.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) throw new HttpError(403, 'Origin not allowed');
  const ct = req.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Expected JSON');
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 100_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

/* ---------------- validation ---------------- */

export function str(v: unknown, field: string, { min = 0, max = 200, required = false } = {}): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, `${field} is required`);
  if (s && s.length < min) throw new HttpError(400, `${field} is too short`);
  if (s.length > max) throw new HttpError(400, `${field} is too long`);
  return s;
}

export function email(v: unknown): string {
  const s = str(v, 'Email', { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new HttpError(400, 'Enter a valid email address');
  return s;
}

export function password(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  if (s.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (s.length > 200) throw new HttpError(400, 'Password is too long');
  return s;
}

/* ---------------- crypto ---------------- */

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(input: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return sha256(verifier);
}

const PBKDF2_ITER = 100_000; // Workers maximum

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const salt = Uint8Array.from(atob(saltB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Number(iterStr) }, key, 256);
  const a = b64url(bits);
  // constant-time compare
  if (a.length !== hashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hashB64.charCodeAt(i);
  return diff === 0;
}

/* ---------------- cookies & sessions ---------------- */

export const SESSION_COOKIE = 'portal_session';
const SESSION_DAYS = 30;

export function sessionCookie(env: Env, token: string, maxAge = SESSION_DAYS * 86400): string {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (!isDev(env)) parts.push('Secure');
  if (env.COOKIE_DOMAIN && !isDev(env)) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  return parts.join('; ');
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('Cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, now() + SESSION_DAYS * 86400)
    .run();
  return sessionCookie(env, token);
}

export async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.phone, u.company, u.role, u.email_verified_at, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
  )
    .bind(await sha256(token), now())
    .first<User>();
  return row ?? null;
}

export async function requireUser(req: Request, env: Env): Promise<User> {
  const u = await currentUser(req, env);
  if (!u) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  if (!u.email_verified_at) throw new HttpError(403, 'Please verify your email first', 'unverified');
  return u;
}

export async function requireStaff(req: Request, env: Env): Promise<User> {
  const u = await requireUser(req, env);
  if (u.role !== 'staff' && u.role !== 'admin') throw new HttpError(403, 'Staff only');
  return u;
}

export async function requireAdmin(req: Request, env: Env): Promise<User> {
  const u = await requireUser(req, env);
  if (u.role !== 'admin') throw new HttpError(403, 'Admins only');
  return u;
}

export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  company: u.company,
  role: u.role,
  verified: !!u.email_verified_at,
});

/* ---------------- one-time tokens ---------------- */

export async function issueToken(
  env: Env,
  purpose: 'verify_email' | 'reset_password' | 'confirm_request',
  ids: { userId?: number; requestId?: number },
  ttlSeconds: number,
): Promise<string> {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO tokens (token_hash, purpose, user_id, request_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), purpose, ids.userId ?? null, ids.requestId ?? null, now() + ttlSeconds)
    .run();
  return token;
}

export async function consumeToken(env: Env, token: unknown, purpose: string) {
  if (typeof token !== 'string' || token.length < 20) throw new HttpError(400, 'Invalid or expired link');
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT * FROM tokens WHERE token_hash = ? AND purpose = ?')
    .bind(hash, purpose)
    .first<{ user_id: number | null; request_id: number | null; expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < now()) throw new HttpError(400, 'This link is invalid or has expired', 'bad_token');
  await env.DB.prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ?').bind(now(), hash).run();
  return row;
}

/* ---------------- rate limiting ---------------- */

export async function rateLimit(env: Env, key: string, max: number, windowSec: number) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (!row || t - row.window_start >= windowSec) {
    await env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start')
      .bind(key, t)
      .run();
    return;
  }
  if (row.count >= max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
}

export const clientIp = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'local';

/** Only allow redirects back to paths on our own site. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) ? next : '/portal/';
}
