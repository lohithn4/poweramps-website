import {
  Env, User, HttpError, json, redirect, readJson, str, email as emailField, password as passwordField,
  hashPassword, verifyPassword, createSession, currentUser, requireUser, publicUser, issueToken, consumeToken,
  rateLimit, clientIp, sessionCookie, readCookie, SESSION_COOKIE, sha256, randomToken, pkceChallenge, now, isDev, safeNext,
} from './lib';
import { sendMail, esc } from './email';
import { getBrand } from './brand';

const link = (env: Env, path: string) => `${env.SITE_URL}${path}`;

async function sendVerification(env: Env, user: { id: number; email: string; name: string }, next = '') {
  const token = await issueToken(env, 'verify_email', { userId: user.id }, 3 * 86400);
  const brand = await getBrand(env);
  await sendMail(env, {
    to: user.email,
    subject: `Verify your email: ${brand.name} client portal`,
    heading: `Welcome, ${user.name.split(' ')[0]}!`,
    body: `<p>Please confirm your email address to activate your ${esc(brand.name)} client account. You can then build panels, request quotes and track your orders.</p>`,
    cta: { label: next.startsWith('/build') ? 'Verify & start building' : 'Verify my email', url: link(env, `/portal/verify/?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`) },
    footnote: 'This link expires in 3 days. If you did not create an account, you can ignore this email.',
  });
  return token;
}

/** After a user proves they own an email, attach any quote requests made with it. */
async function claimRequests(env: Env, userId: number, email: string) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE requests SET status = 'new', email_verified = 1, updated_at = datetime('now')
                     WHERE contact_email = ? AND status = 'pending_verification'`).bind(email),
    env.DB.prepare('UPDATE requests SET user_id = ? WHERE contact_email = ? AND user_id IS NULL').bind(userId, email),
  ]);
}

/* ---------------- email + password ---------------- */

export async function register(req: Request, env: Env) {
  await rateLimit(env, `register:${clientIp(req)}`, 8, 3600);
  const b = await readJson(req);
  const email = emailField(b.email);
  const name = str(b.name, 'Name', { required: true, min: 2, max: 100 });
  const phone = str(b.phone, 'Phone', { required: true, max: 30 });
  if (phone.replace(/\D/g, '').length < 10) throw new HttpError(400, 'Please enter a valid phone number (at least 10 digits)');
  const company = str(b.company, 'Company', { max: 150 });
  const pw = passwordField(b.password);
  const hash = await hashPassword(pw);

  const existing = await env.DB.prepare('SELECT id, email_verified_at, password_hash FROM users WHERE email = ?').bind(email).first<User>();
  let id: number;
  if (existing?.email_verified_at) {
    throw new HttpError(409, 'An account with this email already exists. Please sign in or reset your password.', 'exists');
  } else if (existing) {
    id = existing.id;
    await env.DB.prepare('UPDATE users SET name = ?, phone = ?, company = ?, password_hash = ? WHERE id = ?').bind(name, phone, company, hash, id).run();
  } else {
    const r = await env.DB.prepare('INSERT INTO users (email, name, phone, company, password_hash) VALUES (?, ?, ?, ?, ?)')
      .bind(email, name, phone || null, company || null, hash)
      .run();
    id = Number(r.meta.last_row_id);
  }
  const token = await sendVerification(env, { id, email, name }, b.next ? safeNext(b.next) : '');
  return json({ ok: true, message: 'Check your inbox to verify your email.', ...(isDev(env) ? { devToken: token } : {}) }, 201);
}

export async function verifyEmail(req: Request, env: Env) {
  const b = await readJson(req);
  const t = await consumeToken(env, b.token, 'verify_email');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(t.user_id).first<User>();
  if (!user) throw new HttpError(400, 'Account not found');
  await env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?").bind(user.id).run();
  await claimRequests(env, user.id, user.email);
  const cookie = await createSession(env, user.id);
  return json({ ok: true, user: publicUser({ ...user, email_verified_at: 'now' }) }, 200, { 'Set-Cookie': cookie });
}

export async function resendVerification(req: Request, env: Env) {
  await rateLimit(env, `resend:${clientIp(req)}`, 5, 3600);
  const b = await readJson(req);
  const email = emailField(b.email);
  const user = await env.DB.prepare('SELECT id, email, name, email_verified_at FROM users WHERE email = ?').bind(email).first<User>();
  if (user && !user.email_verified_at) await sendVerification(env, user, b.next ? safeNext(b.next) : '');
  return json({ ok: true, message: 'If that account needs verifying, a new link is on its way.' });
}

export async function login(req: Request, env: Env) {
  const b = await readJson(req);
  const email = emailField(b.email);
  await rateLimit(env, `login:${clientIp(req)}`, 20, 900);
  await rateLimit(env, `login:${email}`, 10, 900);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1').bind(email).first<User>();
  const ok = await verifyPassword(typeof b.password === 'string' ? b.password : '', user?.password_hash);
  if (!user || !ok) {
    if (user && !user.password_hash) throw new HttpError(401, 'This account uses Google/Microsoft/LinkedIn sign-in. Use that button, or reset your password to add one.', 'social_only');
    throw new HttpError(401, 'Incorrect email or password');
  }
  if (!user.email_verified_at) throw new HttpError(403, 'Please verify your email first. We can send a new link.', 'unverified');
  const cookie = await createSession(env, user.id);
  return json({ ok: true, user: publicUser(user) }, 200, { 'Set-Cookie': cookie });
}

export async function logout(req: Request, env: Env) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(env, '', 0) });
}

export async function me(req: Request, env: Env) {
  const u = await currentUser(req, env);
  return json({ user: u ? publicUser(u) : null });
}

export async function updateMe(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const b = await readJson(req);
  const name = str(b.name, 'Name', { required: true, min: 2, max: 100 });
  const phone = str(b.phone, 'Phone', { max: 30 });
  const company = str(b.company, 'Company', { max: 150 });
  await env.DB.prepare('UPDATE users SET name = ?, phone = ?, company = ? WHERE id = ?').bind(name, phone || null, company || null, u.id).run();
  return json({ ok: true, user: publicUser({ ...u, name, phone, company }) });
}

export async function forgotPassword(req: Request, env: Env) {
  await rateLimit(env, `forgot:${clientIp(req)}`, 5, 3600);
  const b = await readJson(req);
  const email = emailField(b.email);
  const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE email = ? AND active = 1').bind(email).first<User>();
  let devToken: string | undefined;
  if (user) {
    const token = await issueToken(env, 'reset_password', { userId: user.id }, 3600);
    devToken = token;
    await sendMail(env, {
      to: user.email,
      subject: `Reset your ${(await getBrand(env)).name} password`,
      heading: 'Reset your password',
      body: '<p>We received a request to reset the password for your account.</p>',
      cta: { label: 'Choose a new password', url: link(env, `/portal/reset/?token=${token}`) },
      footnote: 'This link expires in 1 hour. If you did not ask for this, you can ignore this email.',
    });
  }
  return json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.', ...(isDev(env) && devToken ? { devToken } : {}) });
}

export async function resetPassword(req: Request, env: Env) {
  const b = await readJson(req);
  const pw = passwordField(b.password);
  const t = await consumeToken(env, b.token, 'reset_password');
  const hash = await hashPassword(pw);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?").bind(hash, t.user_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.user_id),
  ]);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(t.user_id).first<User>();
  if (user) await claimRequests(env, user.id, user.email);
  const cookie = await createSession(env, t.user_id!);
  return json({ ok: true, user: user ? publicUser(user) : null }, 200, { 'Set-Cookie': cookie });
}

export async function changePassword(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const b = await readJson(req);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first<{ password_hash: string | null }>();
  if (row?.password_hash && !(await verifyPassword(String(b.current ?? ''), row.password_hash))) throw new HttpError(400, 'Current password is incorrect');
  const hash = await hashPassword(passwordField(b.password));
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, u.id).run();
  return json({ ok: true });
}

/** One-time creation of the first admin, protected by the SETUP_TOKEN secret. */
export async function setupAdmin(req: Request, env: Env) {
  const b = await readJson(req);
  if (!env.SETUP_TOKEN || b.token !== env.SETUP_TOKEN) throw new HttpError(403, 'Invalid setup token');
  const admins = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first<{ n: number }>();
  if ((admins?.n ?? 0) > 0) throw new HttpError(409, 'An admin already exists');
  const email = emailField(b.email);
  const name = str(b.name, 'Name', { required: true, max: 100 });
  const hash = await hashPassword(passwordField(b.password));
  await env.DB.prepare(
    `INSERT INTO users (email, name, password_hash, role, email_verified_at) VALUES (?, ?, ?, 'admin', datetime('now'))
     ON CONFLICT(email) DO UPDATE SET role = 'admin', password_hash = excluded.password_hash, email_verified_at = datetime('now')`,
  ).bind(email, name, hash).run();
  return json({ ok: true, message: 'Admin created. You can now sign in.' }, 201);
}

/* ---------------- social sign-in (OpenID Connect) ---------------- */

interface Provider {
  label: string;
  authorize: string;
  token: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
  pkce: boolean;
  issuerOk: (iss: string) => boolean;
  emailVerified: (c: Record<string, unknown>) => boolean;
}

function providers(env: Env): Record<string, Provider> {
  const truthy = (v: unknown) => v === true || v === 'true';
  const p: Record<string, Provider> = {
    google: {
      label: 'Google',
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      scope: 'openid email profile',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      pkce: true,
      issuerOk: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
      emailVerified: (c) => truthy(c.email_verified),
    },
    microsoft: {
      label: 'Microsoft',
      authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scope: 'openid email profile',
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      pkce: true,
      issuerOk: (iss) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/.test(iss),
      // Microsoft only vouches for the email when the optional `xms_edov` claim is true.
      emailVerified: (c) => truthy(c.xms_edov),
    },
    linkedin: {
      label: 'LinkedIn',
      authorize: 'https://www.linkedin.com/oauth/v2/authorization',
      token: 'https://www.linkedin.com/oauth/v2/accessToken',
      scope: 'openid profile email',
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
      pkce: false,
      issuerOk: (iss) => iss === 'https://www.linkedin.com',
      emailVerified: (c) => truthy(c.email_verified),
    },
  };
  if (isDev(env)) {
    // Local-only fake provider for testing the sign-in flow without real credentials.
    p.dev = {
      label: 'Dev (local only)', authorize: `${env.API_URL}/auth/oauth/dev/mock`, token: '', scope: 'openid', clientId: 'dev', clientSecret: 'dev',
      pkce: false, issuerOk: () => true, emailVerified: () => true,
    };
  }
  return p;
}

const enabled = (p: Provider) => !!(p.clientId && p.clientSecret);

export async function listProviders(_req: Request, env: Env) {
  const list = Object.entries(providers(env)).filter(([, p]) => enabled(p)).map(([id, p]) => ({ id, label: p.label }));
  return json({ providers: list });
}

export async function oauthStart(req: Request, env: Env, providerId: string) {
  const p = providers(env)[providerId];
  if (!p || !enabled(p)) throw new HttpError(404, 'Sign-in provider not available');
  await rateLimit(env, `oauth:${clientIp(req)}`, 30, 600);
  const url = new URL(req.url);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const nonce = randomToken(16);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now()),
    env.DB.prepare('INSERT INTO oauth_states (state, provider, code_verifier, nonce, next_path, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(state, providerId, verifier, nonce, safeNext(url.searchParams.get('next')), now() + 600),
  ]);
  const auth = new URL(p.authorize);
  auth.searchParams.set('client_id', p.clientId!);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('redirect_uri', `${env.API_URL}/auth/oauth/${providerId}/callback`);
  auth.searchParams.set('scope', p.scope);
  auth.searchParams.set('state', state);
  auth.searchParams.set('nonce', nonce);
  if (p.pkce) {
    auth.searchParams.set('code_challenge', await pkceChallenge(verifier));
    auth.searchParams.set('code_challenge_method', 'S256');
  }
  if (providerId === 'google' || providerId === 'microsoft') auth.searchParams.set('prompt', 'select_account');
  return redirect(auth.toString());
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  if (!part) throw new HttpError(400, 'Bad identity token');
  const s = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decodeURIComponent(Array.from(s, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
}

export async function oauthCallback(req: Request, env: Env, providerId: string) {
  const fail = (code: string) => redirect(link(env, `/portal/login/?error=${code}`));
  const p = providers(env)[providerId];
  if (!p || !enabled(p)) return fail('provider');
  const url = new URL(req.url);
  if (url.searchParams.get('error')) return fail('cancelled');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return fail('invalid');

  const st = await env.DB.prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?')
    .bind(state, providerId)
    .first<{ code_verifier: string; nonce: string; next_path: string; expires_at: number }>();
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  if (!st || st.expires_at < now()) return fail('expired');

  // Exchange the code for an ID token, server-to-server over TLS (OIDC Core §3.1.3.7).
  let claims: Record<string, unknown>;
  if (providerId === 'dev') {
    const e = atob(code);
    claims = { sub: `dev:${e}`, email: e, name: e.split('@')[0], nonce: st.nonce, aud: 'dev', iss: 'dev', exp: now() + 60 };
  } else {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.API_URL}/auth/oauth/${providerId}/callback`,
      client_id: p.clientId!,
      client_secret: p.clientSecret!,
    });
    if (p.pkce) form.set('code_verifier', st.code_verifier);
    const tr = await fetch(p.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form });
    if (!tr.ok) {
      console.error('[oauth] token exchange failed', providerId, tr.status, await tr.text());
      return fail('exchange');
    }
    const tok = (await tr.json()) as { id_token?: string };
    if (!tok.id_token) return fail('exchange');
    claims = decodeJwtPayload(tok.id_token);
  }

  // Validate the identity token.
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(p.clientId) || !p.issuerOk(String(claims.iss)) || Number(claims.exp) < now()) return fail('invalid');
  if (claims.nonce !== undefined && claims.nonce !== st.nonce) return fail('invalid');

  const sub = String(claims.sub ?? '');
  const mail = String(claims.email ?? (providerId === 'microsoft' ? claims.preferred_username ?? '' : '')).toLowerCase();
  const verifiedByProvider = p.emailVerified(claims);
  const name = String(claims.name ?? ([claims.given_name, claims.family_name].filter(Boolean).join(' ') || mail.split('@')[0]));
  if (!sub) return fail('invalid');

  // 1) Known social account
  let user = await env.DB.prepare(
    'SELECT u.* FROM oauth_accounts o JOIN users u ON u.id = o.user_id WHERE o.provider = ? AND o.provider_user_id = ?',
  ).bind(providerId, sub).first<User>();

  if (!user) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return fail('no_email');
    const existing = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(mail).first<User>();
    if (existing) {
      // 2) Link to an existing account only when the provider vouches for the email.
      if (!verifiedByProvider) return fail('email_in_use');
      user = existing;
      if (!existing.email_verified_at) await env.DB.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?").bind(existing.id).run();
    } else {
      // 3) New account
      const r = await env.DB.prepare(
        `INSERT INTO users (email, name, email_verified_at) VALUES (?, ?, ${verifiedByProvider ? "datetime('now')" : 'NULL'})`,
      ).bind(mail, name.slice(0, 100)).run();
      user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(Number(r.meta.last_row_id)).first<User>();
    }
    await env.DB.prepare('INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id, email) VALUES (?, ?, ?, ?)')
      .bind(providerId, sub, user!.id, mail).run();
    if (!verifiedByProvider && !user!.email_verified_at) {
      await sendVerification(env, user!);
      return redirect(link(env, `/portal/login/?notice=verify_sent&email=${encodeURIComponent(mail)}`));
    }
    user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user!.id).first<User>();
  }

  if (!user || !user.active) return fail('disabled');
  if (!user.email_verified_at) {
    await sendVerification(env, user);
    return redirect(link(env, `/portal/login/?notice=verify_sent&email=${encodeURIComponent(user.email)}`));
  }
  await claimRequests(env, user.id, user.email);
  const cookie = await createSession(env, user.id);
  const dest = user.role === 'client' ? st.next_path : st.next_path.startsWith('/portal') ? '/staff/' : st.next_path;
  return redirect(link(env, dest), { 'Set-Cookie': cookie });
}

/** Dev-only mock consent screen. */
export function oauthDevMock(req: Request, env: Env) {
  if (!isDev(env)) throw new HttpError(404, 'Not found');
  const url = new URL(req.url);
  const state = esc(url.searchParams.get('state') ?? '');
  const cb = `${env.API_URL}/auth/oauth/dev/callback`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Dev sign-in</title><body style="font-family:sans-serif;padding:40px">
     <h2>Dev sign-in (local testing only)</h2>
     <form onsubmit="event.preventDefault();location='${cb}?state=${state}&code='+btoa(this.e.value)">
     <input name="e" type="email" required placeholder="you@example.com" style="padding:8px;width:260px"> <button>Continue</button></form>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
