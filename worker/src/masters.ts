import { Env, HttpError, json, readJson, str, requireStaff } from './lib';
import type { Settings } from './settings';
import { fyOf, formatNumber, num, r2, stateCode, validGstin } from '../../shared/calc';

/* ---------------- shared helpers ---------------- */

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export function dateField(v: unknown, field: string, required = false): string | null {
  if (v === undefined || v === null || v === '') { if (required) throw new HttpError(400, `${field} is required`); return null; }
  if (!isDate(v)) throw new HttpError(400, `${field} must be a valid date`);
  return v;
}

/** Gap-free running number per type and financial year, e.g. PA/26-27/0007. */
export async function nextNumber(env: Env, s: Settings, type: string, date: string): Promise<string> {
  const fy = fyOf(date);
  const row = await env.DB.prepare(
    'INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value',
  ).bind(`${type}:${fy}`, ).first<{ value: number }>();
  const pattern = (s as any)[`${type}_pattern`] || `${type.toUpperCase()}/{FY}/{NNNN}`;
  return formatNumber(pattern, fy, row!.value);
}

/** Outstanding balance per party (customer: receivable; supplier: payable; lender: loan outstanding). */
export const BALANCE_SQL = `(p.opening_balance
  + COALESCE((SELECT SUM(d.total) FROM documents d WHERE d.party_id = p.id AND d.status NOT IN ('draft', 'cancelled')
      AND d.type = CASE p.kind WHEN 'customer' THEN 'invoice' WHEN 'supplier' THEN 'purchase' ELSE '-' END), 0)
  + COALESCE((SELECT SUM(x.amount) FROM payments x WHERE x.party_id = p.id AND x.cancelled = 0 AND x.kind = 'loan_received'), 0)
  - COALESCE((SELECT SUM(CASE WHEN x.kind = 'loan_repayment' THEN x.amount - x.interest ELSE x.amount + x.tds END)
      FROM payments x WHERE x.party_id = p.id AND x.cancelled = 0 AND x.kind IN ('receipt', 'payment', 'loan_repayment')), 0))`;

export const STOCK_SQL = `(i.opening_qty
  + COALESCE((SELECT SUM(l.qty) FROM doc_lines l JOIN documents d ON d.id = l.doc_id WHERE l.item_id = i.id AND d.type = 'purchase' AND d.status NOT IN ('draft', 'cancelled')), 0)
  - COALESCE((SELECT SUM(l.qty) FROM doc_lines l JOIN documents d ON d.id = l.doc_id WHERE l.item_id = i.id AND d.type = 'invoice' AND d.status NOT IN ('draft', 'cancelled')), 0))`;

/* ---------------- items ---------------- */

export interface ItemRow {
  id: number; code: string | null; name: string; make: string | null; description: string | null; category: string | null;
  hsn: string | null; gst_rate: number; unit: string; sale_rate: number; purchase_rate: number; opening_qty: number;
  reorder_level: number | null; is_service: number; tally_name: string | null; active: number;
}

export function itemFields(b: Record<string, any>, partial = false) {
  const f: Record<string, unknown> = {};
  const has = (k: string) => k in b && b[k] !== undefined;
  if (!partial || has('name')) f.name = str(b.name, 'Item name', { required: true, max: 200 });
  if (has('code')) f.code = str(b.code, 'Code', { max: 60 }) || null;
  if (has('make')) f.make = str(b.make, 'Make', { max: 100 }) || null;
  if (has('description')) f.description = str(b.description, 'Description', { max: 1000 }) || null;
  if (has('category')) f.category = str(b.category, 'Category', { max: 100 }) || null;
  if (has('hsn')) {
    const h = str(b.hsn, 'HSN/SAC', { max: 10 }).replace(/\s/g, '');
    if (h && !/^\d{4,8}$/.test(h)) throw new HttpError(400, `HSN/SAC "${h}" should be 4 to 8 digits`);
    f.hsn = h || null;
  }
  if (has('gst_rate')) {
    const g = num(b.gst_rate, NaN);
    if (!Number.isFinite(g) || g < 0 || g > 40) throw new HttpError(400, 'GST rate must be between 0 and 40%');
    f.gst_rate = g;
  }
  if (has('unit')) f.unit = str(b.unit, 'Unit', { max: 20 }) || 'Nos';
  for (const k of ['sale_rate', 'purchase_rate', 'opening_qty'] as const) if (has(k)) f[k] = r2(num(b[k]));
  if (has('reorder_level')) f.reorder_level = b.reorder_level === '' || b.reorder_level === null ? null : num(b.reorder_level);
  if (has('is_service')) f.is_service = b.is_service ? 1 : 0;
  if (has('tally_name')) f.tally_name = str(b.tally_name, 'Tally name', { max: 200 }) || null;
  if (has('active')) f.active = b.active === false || b.active === 0 || b.active === '0' ? 0 : 1;
  return f;
}

export async function listItems(req: Request, env: Env) {
  await requireStaff(req, env);
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const where: string[] = [];
  const args: unknown[] = [];
  if (url.searchParams.get('all') !== '1') where.push('i.active = 1');
  if (q) { where.push('(i.name LIKE ? OR i.code LIKE ? OR i.make LIKE ? OR i.hsn LIKE ? OR i.category LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l, l); }
  const { results } = await env.DB.prepare(
    `SELECT i.*, ${STOCK_SQL} AS stock FROM items i ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.name COLLATE NOCASE LIMIT 2000`,
  ).bind(...args).all();
  return json({ items: results });
}

async function upsertGuard(env: Env, name: string, id = 0) {
  const dup = await env.DB.prepare('SELECT id FROM items WHERE name = ? COLLATE NOCASE AND id != ?').bind(name, id).first();
  if (dup) throw new HttpError(409, `An item named "${name}" already exists`);
}

export async function createItem(req: Request, env: Env) {
  await requireStaff(req, env);
  const f = itemFields(await readJson(req));
  await upsertGuard(env, f.name as string);
  const keys = Object.keys(f);
  const res = await env.DB.prepare(`INSERT INTO items (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => f[k])).run();
  return json({ ok: true, id: Number(res.meta.last_row_id) }, 201);
}

export async function updateItem(req: Request, env: Env, id: number) {
  await requireStaff(req, env);
  const f = itemFields(await readJson(req), true);
  if (!Object.keys(f).length) throw new HttpError(400, 'Nothing to update');
  if (f.name) await upsertGuard(env, f.name as string, id);
  const keys = Object.keys(f);
  const res = await env.DB.prepare(`UPDATE items SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...keys.map((k) => f[k]), id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Item not found');
  return json({ ok: true });
}

/* ---------------- parties ---------------- */

export interface PartyRow {
  id: number; kind: 'customer' | 'supplier' | 'lender'; name: string; contact_person: string | null; gstin: string | null;
  state_code: string | null; address: string | null; city: string | null; pincode: string | null; phone: string | null;
  email: string | null; opening_balance: number; credit_days: number | null; user_id: number | null; tally_name: string | null;
  notes: string | null; active: number;
}
export const PARTY_KINDS = ['customer', 'supplier', 'lender'] as const;

export function partyFields(b: Record<string, any>, partial = false) {
  const f: Record<string, unknown> = {};
  const has = (k: string) => k in b && b[k] !== undefined;
  if (!partial || has('kind')) {
    if (!PARTY_KINDS.includes(b.kind)) throw new HttpError(400, 'Choose customer, supplier or lender');
    f.kind = b.kind;
  }
  if (!partial || has('name')) f.name = str(b.name, 'Name', { required: true, max: 200 });
  for (const [k, label, max] of [['contact_person', 'Contact person', 100], ['address', 'Address', 500], ['city', 'City', 100], ['phone', 'Phone', 40], ['notes', 'Notes', 2000], ['tally_name', 'Tally name', 200]] as const)
    if (has(k)) f[k] = str(b[k], label, { max }) || null;
  if (has('pincode')) { const p = str(b.pincode, 'PIN code', { max: 10 }); if (p && !/^\d{6}$/.test(p)) throw new HttpError(400, 'PIN code must be 6 digits'); f.pincode = p || null; }
  if (has('email')) { const e = str(b.email, 'Email', { max: 254 }).toLowerCase(); if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, 'Enter a valid email'); f.email = e || null; }
  if (has('gstin')) {
    const g = str(b.gstin, 'GSTIN', { max: 15 }).toUpperCase().replace(/\s/g, '');
    if (g && !validGstin(g)) throw new HttpError(400, `GSTIN ${g} is not valid. Please check it.`);
    f.gstin = g || null;
    if (g && !has('state_code')) f.state_code = g.slice(0, 2);
  }
  if (has('state_code') || has('state')) {
    const c = stateCode(b.state_code ?? b.state);
    if ((b.state_code ?? b.state) && !c) throw new HttpError(400, 'Unknown state');
    f.state_code = c || null;
  }
  if (has('opening_balance')) f.opening_balance = r2(num(b.opening_balance));
  if (has('credit_days')) f.credit_days = b.credit_days === '' || b.credit_days === null ? null : Math.max(0, Math.round(num(b.credit_days)));
  if (has('active')) f.active = b.active === false || b.active === 0 || b.active === '0' ? 0 : 1;
  return f;
}

export async function listParties(req: Request, env: Env) {
  await requireStaff(req, env);
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const q = url.searchParams.get('q')?.trim();
  const where: string[] = [];
  const args: unknown[] = [];
  if (url.searchParams.get('all') !== '1') where.push('p.active = 1');
  if (kind && (PARTY_KINDS as readonly string[]).includes(kind)) { where.push('p.kind = ?'); args.push(kind); }
  if (q) { where.push('(p.name LIKE ? OR p.gstin LIKE ? OR p.email LIKE ? OR p.phone LIKE ? OR p.city LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l, l); }
  const { results } = await env.DB.prepare(
    `SELECT p.*, ${BALANCE_SQL} AS balance FROM parties p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.name COLLATE NOCASE LIMIT 2000`,
  ).bind(...args).all();
  return json({ parties: results });
}

async function partyGuard(env: Env, kind: string, name: string, id = 0) {
  const dup = await env.DB.prepare('SELECT id FROM parties WHERE kind = ? AND name = ? COLLATE NOCASE AND id != ?').bind(kind, name, id).first();
  if (dup) throw new HttpError(409, `A ${kind} named "${name}" already exists`);
}

export async function createParty(req: Request, env: Env) {
  await requireStaff(req, env);
  const f = partyFields(await readJson(req));
  await partyGuard(env, f.kind as string, f.name as string);
  if (f.email && f.kind === 'customer') {
    const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(f.email).first<{ id: number }>();
    if (u) f.user_id = u.id;
  }
  const keys = Object.keys(f);
  const res = await env.DB.prepare(`INSERT INTO parties (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => f[k])).run();
  return json({ ok: true, id: Number(res.meta.last_row_id) }, 201);
}

export async function updateParty(req: Request, env: Env, id: number) {
  await requireStaff(req, env);
  const cur = await env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(id).first<PartyRow>();
  if (!cur) throw new HttpError(404, 'Party not found');
  const f = partyFields(await readJson(req), true);
  if (!Object.keys(f).length) throw new HttpError(400, 'Nothing to update');
  if (f.name || f.kind) await partyGuard(env, (f.kind as string) ?? cur.kind, (f.name as string) ?? cur.name, id);
  if (f.kind && f.kind !== cur.kind) {
    const used = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM documents WHERE party_id = ?) + (SELECT COUNT(*) FROM payments WHERE party_id = ?) AS n').bind(id, id).first<{ n: number }>();
    if (used && used.n > 0) throw new HttpError(409, 'This party already has documents or payments, so its type cannot change');
  }
  const keys = Object.keys(f);
  await env.DB.prepare(`UPDATE parties SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...keys.map((k) => f[k]), id).run();
  return json({ ok: true });
}

/** Party with its running ledger statement. */
export async function getParty(req: Request, env: Env, id: number) {
  await requireStaff(req, env);
  const p = await env.DB.prepare(`SELECT p.*, ${BALANCE_SQL} AS balance FROM parties p WHERE p.id = ?`).bind(id).first<PartyRow & { balance: number }>();
  if (!p) throw new HttpError(404, 'Party not found');
  const docType = p.kind === 'customer' ? 'invoice' : p.kind === 'supplier' ? 'purchase' : null;
  const { results: docs } = await env.DB.prepare(
    `SELECT d.id, d.type, d.number, d.status, d.doc_date, d.due_date, d.ref_no, d.total, d.subject,
       (SELECT COALESCE(SUM(amount + tds), 0) FROM payments x WHERE x.doc_id = d.id AND x.cancelled = 0) AS paid
       FROM documents d WHERE d.party_id = ? ORDER BY d.doc_date DESC, d.id DESC LIMIT 500`,
  ).bind(id).all<any>();
  const { results: pays } = await env.DB.prepare(
    'SELECT x.*, d.number AS doc_number FROM payments x LEFT JOIN documents d ON d.id = x.doc_id WHERE x.party_id = ? ORDER BY x.pay_date DESC, x.id DESC LIMIT 500',
  ).bind(id).all<any>();

  type Entry = { date: string; kind: string; ref: string; particulars: string; up: number; down: number; link?: string };
  const entries: Entry[] = [];
  for (const d of docs) if (d.type === docType && !['draft', 'cancelled'].includes(d.status))
    entries.push({ date: d.doc_date, kind: d.type, ref: d.number ?? '', particulars: d.type === 'invoice' ? 'Tax invoice' : `Purchase bill${d.ref_no ? ` (${d.ref_no})` : ''}`, up: d.total, down: 0, link: `doc:${d.id}` });
  for (const x of pays) if (!x.cancelled) {
    if (x.kind === 'loan_received') entries.push({ date: x.pay_date, kind: x.kind, ref: x.number ?? '', particulars: `Loan received (${x.mode})`, up: x.amount, down: 0 });
    else if (x.kind === 'loan_repayment') entries.push({ date: x.pay_date, kind: x.kind, ref: x.number ?? '', particulars: `Repayment${x.interest ? `, incl. interest ${x.interest}` : ''} (${x.mode})`, up: 0, down: r2(x.amount - x.interest) });
    else entries.push({ date: x.pay_date, kind: x.kind, ref: x.number ?? '', particulars: `${x.kind === 'receipt' ? 'Received' : 'Paid'} (${x.mode})${x.doc_number ? ` against ${x.doc_number}` : ''}${x.tds ? `, TDS ${x.tds}` : ''}`, up: 0, down: r2(x.amount + (x.tds || 0)) });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  let run = p.opening_balance;
  const statement = [{ date: '', kind: 'opening', ref: '', particulars: 'Opening balance', up: 0, down: 0, balance: r2(run) }, ...entries.map((e) => ({ ...e, balance: (run = r2(run + e.up - e.down)) }))];
  return json({ party: p, documents: docs, payments: pays, statement });
}

/** Finds or creates the customer for a website request (matched by portal account, email, then company name). */
export async function customerForRequest(env: Env, r: { id: number; user_id: number | null; contact_name: string; contact_email: string; contact_phone: string | null; contact_company: string | null; party_id?: number | null }): Promise<number> {
  if (r.party_id) return r.party_id;
  let p = r.user_id ? await env.DB.prepare("SELECT id FROM parties WHERE kind = 'customer' AND user_id = ?").bind(r.user_id).first<{ id: number }>() : null;
  if (!p) p = await env.DB.prepare("SELECT id FROM parties WHERE kind = 'customer' AND email = ?").bind(r.contact_email).first<{ id: number }>();
  const name = (r.contact_company || r.contact_name).trim();
  if (!p) p = await env.DB.prepare("SELECT id FROM parties WHERE kind = 'customer' AND name = ? COLLATE NOCASE").bind(name).first<{ id: number }>();
  if (!p) {
    const res = await env.DB.prepare("INSERT INTO parties (kind, name, contact_person, email, phone, user_id) VALUES ('customer', ?, ?, ?, ?, ?)")
      .bind(name, r.contact_company ? r.contact_name : null, r.contact_email, r.contact_phone, r.user_id).run();
    p = { id: Number(res.meta.last_row_id) };
  }
  await env.DB.prepare('UPDATE requests SET party_id = ? WHERE id = ?').bind(p.id, r.id).run();
  return p.id;
}
