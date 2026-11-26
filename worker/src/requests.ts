import { Env, User, HttpError, json, readJson, str, email as emailField, currentUser, requireUser, requireStaff, issueToken, consumeToken, rateLimit, clientIp, isDev } from './lib';
import { sendMail, staffRecipients, esc } from './email';
import { getBrand } from './brand';
import { feedbackLink } from './feedback';
import { markQuoteDocAccepted } from './docs';

export const STATUSES = {
  pending_verification: 'Awaiting email confirmation',
  new: 'Received',
  reviewing: 'Under review',
  quoted: 'Quotation sent',
  accepted: 'Order confirmed',
  in_design: 'Design & drawings',
  in_production: 'Fabrication & assembly',
  testing: 'Testing',
  ready: 'Ready for dispatch',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
} as const;
type Status = keyof typeof STATUSES;

interface Row {
  id: number; ref: string; kind: 'quote' | 'order'; status: Status; user_id: number | null;
  contact_name: string; contact_email: string; contact_phone: string | null; contact_company: string | null;
  title: string; config: string; summary: string | null; quantity: number; site_location: string | null;
  required_by: string | null; notes: string | null; quote_amount: number | null; quote_validity_days: number | null;
  quote_note: string | null; quoted_at: string | null; created_at: string; updated_at: string;
}

const site = (env: Env, path: string) => `${env.SITE_URL}${path}`;
const inr = (n: number) => '₹ ' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const label = (s: string) => STATUSES[s as Status] ?? s;

async function addEvent(env: Env, requestId: number, status: string | null, note: string | null, visible: boolean, actorId: number | null) {
  await env.DB.prepare('INSERT INTO request_events (request_id, status, note, visible_to_client, actor_id) VALUES (?, ?, ?, ?, ?)')
    .bind(requestId, status, note, visible ? 1 : 0, actorId).run();
}

async function notifyStaffNew(env: Env, r: Pick<Row, 'id' | 'ref' | 'kind' | 'title' | 'contact_name' | 'contact_company'>) {
  await sendMail(env, {
    to: staffRecipients(env),
    subject: `New ${r.kind === 'order' ? 'ORDER' : 'quote request'} ${r.ref}: ${r.title}`,
    heading: `New ${r.kind === 'order' ? 'order' : 'quote request'} ${r.ref}`,
    body: `<p><strong>${esc(r.title)}</strong></p><p>From ${esc(r.contact_name)}${r.contact_company ? `, ${esc(r.contact_company)}` : ''}.</p>`,
    cta: { label: 'Open in staff dashboard', url: site(env, `/staff/request/?id=${r.id}`) },
  });
}

async function notifyClientReceived(env: Env, r: Pick<Row, 'id' | 'ref' | 'kind' | 'title' | 'contact_email' | 'contact_name'>) {
  await sendMail(env, {
    to: r.contact_email,
    subject: `We received your ${r.kind === 'order' ? 'order' : 'quote request'} ${r.ref}`,
    heading: `Thank you, ${r.contact_name.split(' ')[0]}`,
    body: `<p>We've received your ${r.kind === 'order' ? 'order' : 'quote request'} <strong>${r.ref}</strong> for <strong>${esc(r.title)}</strong>.</p>
           <p>Our engineers will review your requirements and get back to you shortly. You can follow its progress in your client portal.</p>`,
    cta: { label: 'Track my request', url: site(env, `/portal/request/?id=${r.id}`) },
  });
}

/* ---------------- create ---------------- */

export async function createRequest(req: Request, env: Env) {
  const user = await currentUser(req, env);
  await rateLimit(env, `request:${user ? `u${user.id}` : clientIp(req)}`, user ? 30 : 6, 3600);
  const b = await readJson<Record<string, any>>(req, 200_000);

  const kind = b.kind === 'order' ? 'order' : 'quote';
  const verifiedUser = user && user.email_verified_at ? user : null;
  if (kind === 'order' && !verifiedUser) throw new HttpError(401, 'Please sign in to place an order', 'unauthenticated');

  const title = str(b.title, 'Title', { required: true, max: 200 });
  if (typeof b.config !== 'object' || b.config === null) throw new HttpError(400, 'Panel configuration is missing');
  const config = JSON.stringify(b.config);
  const summary = b.summary && typeof b.summary === 'object' ? JSON.stringify(b.summary) : null;
  const quantity = Math.min(999, Math.max(1, parseInt(b.quantity, 10) || 1));
  const site_location = str(b.site_location, 'Site location', { max: 200 });
  const required_by = str(b.required_by, 'Required by', { max: 30 });
  const notes = str(b.notes, 'Notes', { max: 4000 });

  const c = b.contact ?? {};
  const contact = verifiedUser
    ? { name: verifiedUser.name, email: verifiedUser.email, phone: str(c.phone, 'Phone', { max: 30 }) || verifiedUser.phone, company: str(c.company, 'Company', { max: 150 }) || verifiedUser.company }
    : { name: str(c.name, 'Name', { required: true, min: 2, max: 100 }), email: emailField(c.email), phone: str(c.phone, 'Phone', { required: true, max: 30 }), company: str(c.company, 'Company', { max: 150 }) };

  const status: Status = verifiedUser ? 'new' : 'pending_verification';
  const ins = await env.DB.prepare(
    `INSERT INTO requests (kind, status, user_id, contact_name, contact_email, contact_phone, contact_company, title, config, summary, quantity, site_location, required_by, notes, email_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(kind, status, verifiedUser?.id ?? null, contact.name, contact.email, contact.phone || null, contact.company || null, title, config, summary, quantity, site_location || null, required_by || null, notes || null, verifiedUser ? 1 : 0).run();
  const id = Number(ins.meta.last_row_id);
  const ref = `${(await getBrand(env)).refPrefix}-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
  await env.DB.prepare('UPDATE requests SET ref = ? WHERE id = ?').bind(ref, id).run();
  await addEvent(env, id, status, kind === 'order' ? 'Order placed by client' : 'Quote request submitted', true, verifiedUser?.id ?? null);

  const row = { id, ref, kind, title, contact_name: contact.name, contact_email: contact.email, contact_company: contact.company } as const;
  if (verifiedUser) {
    await Promise.all([notifyClientReceived(env, row), notifyStaffNew(env, row)]);
    return json({ ok: true, id, ref, status }, 201);
  }

  // Anonymous quote: confirm ownership of the email before staff see it.
  const token = await issueToken(env, 'confirm_request', { requestId: id }, 7 * 86400);
  await sendMail(env, {
    to: contact.email,
    subject: `Confirm your quote request ${ref}`,
    heading: 'Please confirm your quote request',
    body: `<p>Thanks for your enquiry for <strong>${esc(title)}</strong>.</p><p>Click below to confirm your email so our engineers can start working on your quotation.</p>`,
    cta: { label: 'Confirm my request', url: site(env, `/portal/confirm/?token=${token}`) },
    footnote: 'This link expires in 7 days.',
  });
  return json({ ok: true, ref, status, needsConfirmation: true, ...(isDev(env) ? { devToken: token } : {}) }, 201);
}

export async function confirmRequest(req: Request, env: Env) {
  const b = await readJson(req);
  const t = await consumeToken(env, b.token, 'confirm_request');
  const r = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(t.request_id).first<Row>();
  if (!r) throw new HttpError(404, 'Request not found');
  if (r.status === 'pending_verification') {
    const owner = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND email_verified_at IS NOT NULL').bind(r.contact_email).first<{ id: number }>();
    await env.DB.prepare("UPDATE requests SET status = 'new', email_verified = 1, user_id = COALESCE(user_id, ?), updated_at = datetime('now') WHERE id = ?").bind(owner?.id ?? null, r.id).run();
    await addEvent(env, r.id, 'new', 'Email confirmed', true, null);
    await Promise.all([notifyClientReceived(env, r), notifyStaffNew(env, r)]);
  }
  return json({ ok: true, ref: r.ref, email: r.contact_email });
}

/* ---------------- read ---------------- */

const LIST_COLS = 'id, ref, kind, status, title, quantity, quote_amount, created_at, updated_at, contact_name, contact_company, contact_email';

export async function listRequests(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const url = new URL(req.url);
  const staffView = (u.role === 'staff' || u.role === 'admin') && url.searchParams.get('scope') === 'all';
  if (!staffView) {
    const { results } = await env.DB.prepare(`SELECT ${LIST_COLS} FROM requests WHERE user_id = ? ORDER BY id DESC LIMIT 200`).bind(u.id).all();
    return json({ requests: results, statuses: STATUSES });
  }
  const where: string[] = [];
  const args: unknown[] = [];
  const status = url.searchParams.get('status');
  const kind = url.searchParams.get('kind');
  const q = url.searchParams.get('q')?.trim();
  if (status === 'open') where.push("status NOT IN ('delivered', 'cancelled', 'pending_verification')");
  else if (status && status in STATUSES) { where.push('status = ?'); args.push(status); }
  else where.push("status != 'pending_verification'");
  if (kind === 'quote' || kind === 'order') { where.push('kind = ?'); args.push(kind); }
  if (q) {
    where.push('(ref LIKE ? OR title LIKE ? OR contact_name LIKE ? OR contact_company LIKE ? OR contact_email LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }
  const sql = `SELECT ${LIST_COLS} FROM requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM requests GROUP BY status').all();
  return json({ requests: results, statuses: STATUSES, counts: counts.results });
}

async function loadFor(env: Env, u: User, id: number): Promise<Row> {
  const r = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<Row>();
  const isStaff = u.role === 'staff' || u.role === 'admin';
  if (!r || (!isStaff && r.user_id !== u.id)) throw new HttpError(404, 'Request not found');
  return r;
}

export async function getRequest(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  const r = await loadFor(env, u, id);
  const isStaff = u.role === 'staff' || u.role === 'admin';
  const { results: events } = await env.DB.prepare(
    `SELECT e.id, e.status, e.note, e.visible_to_client, e.created_at, u.name AS actor
       FROM request_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.request_id = ? ${isStaff ? '' : 'AND e.visible_to_client = 1'} ORDER BY e.id ASC`,
  ).bind(id).all();
  const { results: documents } = await env.DB.prepare(
    `SELECT id, type, number, status, doc_date, valid_until, due_date, total, revision,
       (SELECT COALESCE(SUM(amount + tds), 0) FROM payments x WHERE x.doc_id = d.id AND x.cancelled = 0) AS paid
       FROM documents d WHERE request_id = ? ${isStaff ? '' : "AND type IN ('quotation', 'invoice') AND status != 'draft'"} ORDER BY id DESC`,
  ).bind(id).all();
  const feedback = await env.DB.prepare('SELECT rating, comment, consent, status, created_at FROM feedback WHERE request_id = ?').bind(id).first();
  return json({
    request: { ...r, config: JSON.parse(r.config), summary: r.summary ? JSON.parse(r.summary) : null },
    events: isStaff ? events : events.map(({ actor, ...e }: any) => e),
    statuses: STATUSES,
    documents,
    feedback,
  });
}

/* ---------------- staff actions ---------------- */

export async function updateRequest(req: Request, env: Env, id: number) {
  const u = await requireStaff(req, env);
  const r = await loadFor(env, u, id);
  const b = await readJson<Record<string, any>>(req);
  const status = b.status && b.status !== r.status ? String(b.status) : null;
  if (status && !(status in STATUSES)) throw new HttpError(400, 'Unknown status');
  const note = str(b.note, 'Note', { max: 2000 }) || null;
  const internal = b.internal === true;
  if (!status && !note) throw new HttpError(400, 'Nothing to update');

  if (status) await env.DB.prepare("UPDATE requests SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END, updated_at = datetime('now') WHERE id = ?").bind(status, status, id).run();
  await addEvent(env, id, status, note, !internal, u.id);

  // Delivered: always ask for feedback (no sign-in needed), even if the update itself is internal.
  const feedbackUrl = status === 'delivered' && !(await env.DB.prepare('SELECT 1 FROM feedback WHERE request_id = ?').bind(id).first()) ? await feedbackLink(env, id) : null;
  if (feedbackUrl && (b.notify === false || internal)) {
    await sendMail(env, {
      to: r.contact_email,
      subject: `How did we do? ${r.ref}`,
      heading: 'Your panel has been delivered',
      body: `<p><strong>${esc(r.title)}</strong> (${r.ref}) has been delivered. Thank you for choosing us.</p><p>Could you spare 30 seconds to rate your experience from 0 to 10? It helps us improve.</p>`,
      cta: { label: 'Rate your experience', url: feedbackUrl },
    });
  }
  if (b.notify !== false && !internal) {
    await sendMail(env, {
      to: r.contact_email,
      subject: `Update on ${r.ref}: ${status ? label(status) : 'new message'}`,
      heading: status ? `Your ${r.kind} is now: ${label(status)}` : `New message about ${r.ref}`,
      body: `<p><strong>${esc(r.title)}</strong> (${r.ref})</p>${note ? `<p style="padding:12px 14px;background:#f5f6f8;border-left:3px solid #cd030d;border-radius:6px">${esc(note)}</p>` : ''}${feedbackUrl ? '<p>Could you spare 30 seconds to rate your experience from 0 to 10? It helps us improve.</p>' : ''}`,
      cta: feedbackUrl ? { label: 'Rate your experience', url: feedbackUrl } : { label: 'View details', url: site(env, `/portal/request/?id=${id}`) },
    });
  }
  return json({ ok: true });
}

export async function sendQuote(req: Request, env: Env, id: number) {
  const u = await requireStaff(req, env);
  const r = await loadFor(env, u, id);
  const b = await readJson<Record<string, any>>(req);
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter a valid quote amount');
  const validity = Math.min(365, Math.max(1, parseInt(b.validity_days, 10) || 30));
  const note = str(b.note, 'Note', { max: 4000 }) || null;
  await env.DB.prepare("UPDATE requests SET quote_amount = ?, quote_validity_days = ?, quote_note = ?, quoted_at = datetime('now'), status = 'quoted', updated_at = datetime('now') WHERE id = ?")
    .bind(amount, validity, note, id).run();
  await addEvent(env, id, 'quoted', `Quotation sent: ${inr(amount)} (valid ${validity} days)${note ? `\n${note}` : ''}`, true, u.id);
  await sendMail(env, {
    to: r.contact_email,
    subject: `Quotation for ${r.ref}: ${r.title}`,
    heading: 'Your quotation is ready',
    body: `<p><strong>${esc(r.title)}</strong> (${r.ref}) × ${r.quantity}</p>
           <p style="font-size:24px;font-weight:700;margin:8px 0">${inr(amount)} <span style="font-size:13px;font-weight:400;color:#667085">+ GST as applicable</span></p>
           <p>Valid for ${validity} days.</p>${note ? `<p>${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
           <p>${r.user_id ? 'You can accept this quotation in your client portal.' : 'Create a free account with this email to accept it online, or simply reply to this email.'}</p>`,
    cta: { label: r.user_id ? 'Review & accept' : 'Create my account', url: site(env, r.user_id ? `/portal/request/?id=${id}` : `/portal/register/?email=${encodeURIComponent(r.contact_email)}`) },
  });
  return json({ ok: true });
}

/* ---------------- client actions ---------------- */

export async function acceptQuote(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  const r = await loadFor(env, u, id);
  if (r.user_id !== u.id) throw new HttpError(403, 'Only the client can accept this quotation');
  if (r.status !== 'quoted') throw new HttpError(409, 'This quotation cannot be accepted right now');
  await env.DB.prepare("UPDATE requests SET kind = 'order', status = 'accepted', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  await markQuoteDocAccepted(env, (r as any).quote_doc_id ?? null);
  await addEvent(env, id, 'accepted', 'Quotation accepted by client. Order confirmed.', true, u.id);
  await sendMail(env, {
    to: staffRecipients(env),
    subject: `ORDER CONFIRMED ${r.ref}: ${r.title}`,
    heading: `${r.contact_name} accepted quotation ${r.ref}`,
    body: `<p><strong>${esc(r.title)}</strong> × ${r.quantity}: ${r.quote_amount ? inr(r.quote_amount) : ''}</p>`,
    cta: { label: 'Open order', url: site(env, `/staff/request/?id=${id}`) },
  });
  await notifyClientReceived(env, { ...r, kind: 'order' });
  return json({ ok: true });
}

export async function cancelRequest(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  const r = await loadFor(env, u, id);
  if (r.user_id !== u.id) throw new HttpError(403, 'Not allowed');
  if (!['new', 'reviewing', 'quoted'].includes(r.status)) throw new HttpError(409, 'This request can no longer be cancelled online. Please contact us.');
  const b = await readJson<Record<string, any>>(req);
  const reason = str(b.reason, 'Reason', { max: 1000 }) || null;
  await env.DB.prepare("UPDATE requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  await addEvent(env, id, 'cancelled', `Cancelled by client${reason ? `: ${reason}` : ''}`, true, u.id);
  await sendMail(env, { to: staffRecipients(env), subject: `Cancelled by client: ${r.ref}`, heading: `${r.ref} was cancelled by the client`, body: reason ? `<p>${esc(reason)}</p>` : '' });
  return json({ ok: true });
}
