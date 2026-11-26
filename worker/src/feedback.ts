import { Env, HttpError, json, readJson, str, requireStaff, currentUser, issueToken, consumeToken, rateLimit, clientIp, sha256, now, isDev } from './lib';
import { sendMail, staffRecipients, esc } from './email';

const site = (env: Env, p: string) => `${env.SITE_URL}${p}`;

/** Emailed when an order is marked delivered. Link works without signing in for 60 days. */
export async function feedbackLink(env: Env, requestId: number): Promise<string> {
  const token = await issueToken(env, 'feedback', { requestId }, 60 * 86400);
  return site(env, `/portal/feedback/?token=${token}`);
}

/** Looks up a feedback link without using it up. */
export async function lookupFeedback(req: Request, env: Env) {
  await rateLimit(env, `fb-lookup:${clientIp(req)}`, 30, 3600);
  const b = await readJson(req);
  const token = typeof b.token === 'string' ? b.token : '';
  const row = token.length >= 20 ? await env.DB.prepare("SELECT request_id, expires_at, used_at FROM tokens WHERE token_hash = ? AND purpose = 'feedback'").bind(await sha256(token)).first<any>() : null;
  if (!row || row.expires_at < now()) throw new HttpError(400, 'This feedback link is invalid or has expired', 'bad_token');
  const r = await env.DB.prepare('SELECT id, ref, title, contact_name, contact_company, site_location FROM requests WHERE id = ?').bind(row.request_id).first<any>();
  const done = await env.DB.prepare('SELECT rating FROM feedback WHERE request_id = ?').bind(row.request_id).first();
  return json({ request: r, alreadySubmitted: !!done || !!row.used_at });
}

export async function submitFeedback(req: Request, env: Env) {
  await rateLimit(env, `fb:${clientIp(req)}`, 10, 3600);
  const b = await readJson<Record<string, any>>(req);
  let requestId: number;
  if (b.token) {
    const t = await consumeToken(env, b.token, 'feedback');
    requestId = t.request_id!;
  } else {
    const u = await currentUser(req, env);
    if (!u) throw new HttpError(401, 'Please sign in', 'unauthenticated');
    const r = await env.DB.prepare('SELECT id, user_id, status FROM requests WHERE id = ?').bind(Number(b.request_id)).first<any>();
    if (!r || r.user_id !== u.id) throw new HttpError(404, 'Order not found');
    if (r.status !== 'delivered') throw new HttpError(409, 'You can rate an order once it has been delivered');
    requestId = r.id;
  }
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) throw new HttpError(400, 'Choose a rating from 0 to 10');
  const comment = str(b.comment, 'Comment', { max: 2000 });
  const consent = b.consent === true || b.consent === 'on' || b.consent === '1';
  const display_name = str(b.display_name, 'Name', { max: 100 });
  const company = str(b.company, 'Company', { max: 150 });
  const role = str(b.role, 'Role', { max: 100 });
  const city = str(b.city, 'City', { max: 100 });
  if (consent && rating >= 9 && (!comment || comment.length < 10)) throw new HttpError(400, 'Please write a sentence or two so we can share your words');
  const status = consent && rating >= 9 ? 'pending' : 'received';

  const exists = await env.DB.prepare('SELECT id FROM feedback WHERE request_id = ?').bind(requestId).first();
  if (exists) throw new HttpError(409, 'Feedback for this order has already been received. Thank you!');
  await env.DB.prepare('INSERT INTO feedback (request_id, rating, comment, consent, display_name, company, role, city, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(requestId, rating, comment || null, consent ? 1 : 0, display_name || null, company || null, role || null, city || null, status).run();
  await env.DB.prepare('INSERT INTO request_events (request_id, status, note, visible_to_client, actor_id) VALUES (?, NULL, ?, 1, NULL)')
    .bind(requestId, `Client feedback received: ${rating}/10`).run();

  const r = await env.DB.prepare('SELECT ref, title, contact_name, contact_company FROM requests WHERE id = ?').bind(requestId).first<any>();
  const low = rating <= 6;
  await sendMail(env, {
    to: staffRecipients(env),
    subject: `${low ? 'LOW RATING ' : ''}${rating}/10 feedback for ${r?.ref}`,
    heading: `${r?.contact_name ?? 'A client'} rated ${r?.ref} ${rating}/10`,
    body: `<p><strong>${esc(r?.title ?? '')}</strong>${r?.contact_company ? ` · ${esc(r.contact_company)}` : ''}</p>${comment ? `<p style="padding:12px 14px;background:#f5f6f8;border-left:3px solid #1f5fcc;border-radius:6px">${esc(comment)}</p>` : ''}
      <p>${status === 'pending' ? 'The client agreed to publish this as a testimonial. Approve it in the staff portal to show it on the website.' : low ? 'Please follow up with the client.' : ''}</p>`,
    cta: { label: status === 'pending' ? 'Review testimonial' : 'Open feedback', url: site(env, '/staff/feedback/') },
  });
  return json({ ok: true, status });
}

export async function listFeedback(req: Request, env: Env) {
  await requireStaff(req, env);
  const { results } = await env.DB.prepare(
    `SELECT f.*, r.ref, r.title, r.contact_name, r.contact_company, r.contact_email, u.name AS reviewer
       FROM feedback f JOIN requests r ON r.id = f.request_id LEFT JOIN users u ON u.id = f.reviewed_by ORDER BY f.id DESC LIMIT 500`,
  ).all();
  const avg = await env.DB.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg, SUM(CASE WHEN rating >= 9 THEN 1 ELSE 0 END) AS promoters, SUM(CASE WHEN rating <= 6 THEN 1 ELSE 0 END) AS detractors FROM feedback').first<any>();
  const nps = avg?.n ? Math.round(((avg.promoters - avg.detractors) / avg.n) * 100) : null;
  return json({ feedback: results, stats: { count: avg?.n ?? 0, average: avg?.avg ? Math.round(avg.avg * 10) / 10 : null, nps } });
}

/** Approve (publish) or hide a testimonial. Only 9-10 ratings with consent can be published. */
export async function reviewFeedback(req: Request, env: Env, id: number) {
  const u = await requireStaff(req, env);
  const b = await readJson<Record<string, any>>(req);
  const f = await env.DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(id).first<any>();
  if (!f) throw new HttpError(404, 'Feedback not found');
  const status = String(b.status);
  if (!['published', 'hidden', 'pending'].includes(status)) throw new HttpError(400, 'Unknown status');
  if (status === 'published' && !(f.consent && f.rating >= 9)) throw new HttpError(409, 'Only 9 or 10 ratings where the client agreed to be quoted can be published');
  await env.DB.prepare(`UPDATE feedback SET status = ?, reviewed_by = ?, published_at = ${status === 'published' ? "datetime('now')" : 'published_at'} WHERE id = ?`).bind(status, u.id, id).run();
  let republished = false;
  if (status === 'published' || f.status === 'published') republished = await triggerRebuild(env);
  return json({ ok: true, republished });
}

/** Public: approved testimonials for the website (read at build time). */
export async function publicTestimonials(_req: Request, env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.rating, f.comment AS quote, COALESCE(f.display_name, r.contact_name) AS person, f.role,
            COALESCE(f.company, r.contact_company) AS company, COALESCE(f.city, r.site_location) AS city, r.title AS project, f.published_at
       FROM feedback f JOIN requests r ON r.id = f.request_id
      WHERE f.status = 'published' AND f.consent = 1 AND f.rating >= 9 ORDER BY f.published_at DESC LIMIT 60`,
  ).all();
  return json({ testimonials: results }, 200, { 'Cache-Control': 'public, max-age=300' });
}

/** Optionally republish the website at once (needs GITHUB_DISPATCH_TOKEN); otherwise the daily build picks it up. */
async function triggerRebuild(env: Env): Promise<boolean> {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPO || isDev(env)) return false;
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/deploy.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'portal-api', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!res.ok) console.error('[rebuild] dispatch failed', res.status, await res.text());
  return res.ok;
}
