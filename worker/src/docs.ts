import { Env, User, HttpError, json, readJson, str, requireStaff, requireUser, isStaffRole } from './lib';
import { getSettings, type Settings } from './settings';
import { getBrand } from './brand';
import { sendMail, staffRecipients, esc } from './email';
import { computeDoc, addDays, today, num, r2, stateCode, inrFmt, type LineIn } from '../../shared/calc';
import { nextNumber, dateField, customerForRequest, type PartyRow } from './masters';

export const DOC_TYPES = ['boq', 'quotation', 'invoice', 'purchase'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_LABEL: Record<DocType, string> = { boq: 'BOQ', quotation: 'Quotation', invoice: 'Tax invoice', purchase: 'Purchase bill' };
const SALES: DocType[] = ['boq', 'quotation', 'invoice'];

export interface DocRow {
  id: number; type: DocType; number: string | null; status: 'draft' | 'issued' | 'sent' | 'accepted' | 'cancelled';
  party_id: number | null; request_id: number | null; source_doc_id: number | null; doc_date: string; due_date: string | null;
  valid_until: string | null; ref_no: string | null; ref_date: string | null; party_name: string | null; party_gstin: string | null;
  party_address: string | null; party_state_code: string | null; ship_to: string | null; place_of_supply: string | null;
  reverse_charge: number; subject: string | null; subtotal: number; discount: number; taxable: number; cgst: number; sgst: number;
  igst: number; round_off: number; total: number; cost: number; notes: string | null; terms: string | null; revision: number;
  tally_exported_at: string | null; created_by: number | null; issued_at: string | null; created_at: string; updated_at: string;
}

const site = (env: Env, p: string) => `${env.SITE_URL}${p}`;
const inr = (n: number) => `₹ ${inrFmt(n)}`;

/* ---------------- access ---------------- */

/** Clients may see their own non-draft quotations and invoices. */
async function canClientSee(env: Env, u: User, d: DocRow): Promise<boolean> {
  if (!['quotation', 'invoice'].includes(d.type) || d.status === 'draft') return false;
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM documents d LEFT JOIN parties p ON p.id = d.party_id LEFT JOIN requests r ON r.id = d.request_id
      WHERE d.id = ? AND (r.user_id = ? OR p.user_id = ? OR (p.email IS NOT NULL AND p.email = ?))`,
  ).bind(d.id, u.id, u.id, u.email).first();
  return !!row;
}

async function loadDoc(env: Env, id: number): Promise<DocRow> {
  const d = await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocRow>();
  if (!d) throw new HttpError(404, 'Document not found');
  return d;
}

/* ---------------- list & read ---------------- */

const LIST_SQL = `SELECT d.id, d.type, d.number, d.status, d.doc_date, d.due_date, d.valid_until, d.party_id, d.party_name, d.request_id,
  d.subject, d.ref_no, d.taxable, d.total, d.cost, d.revision, d.tally_exported_at, d.created_at, r.ref AS request_ref,
  (SELECT COALESCE(SUM(x.amount + x.tds), 0) FROM payments x WHERE x.doc_id = d.id AND x.cancelled = 0) AS paid
  FROM documents d LEFT JOIN requests r ON r.id = d.request_id`;

export async function listDocs(req: Request, env: Env) {
  await requireStaff(req, env);
  const url = new URL(req.url);
  const sp = url.searchParams;
  const where: string[] = [];
  const args: unknown[] = [];
  const type = sp.get('type');
  if (type && (DOC_TYPES as readonly string[]).includes(type)) { where.push('d.type = ?'); args.push(type); }
  const status = sp.get('status');
  if (status === 'open') where.push("d.status NOT IN ('cancelled')");
  else if (status) { where.push('d.status = ?'); args.push(status); }
  for (const [k, col, op] of [['from', 'd.doc_date', '>='], ['to', 'd.doc_date', '<=']] as const) { const v = sp.get(k); if (v) { where.push(`${col} ${op} ?`); args.push(v); } }
  for (const k of ['party_id', 'request_id'] as const) { const v = Number(sp.get(k)); if (v) { where.push(`d.${k} = ?`); args.push(v); } }
  const q = sp.get('q')?.trim();
  if (q) { where.push('(d.number LIKE ? OR d.party_name LIKE ? OR d.subject LIKE ? OR d.ref_no LIKE ? OR r.ref LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l, l); }
  const { results } = await env.DB.prepare(`${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.doc_date DESC, d.id DESC LIMIT 500`).bind(...args).all();
  return json({ documents: results });
}

/** Documents visible to the signed-in client (portal). */
export async function myDocs(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `${LIST_SQL} LEFT JOIN parties p ON p.id = d.party_id
      WHERE d.type IN ('quotation', 'invoice') AND d.status != 'draft' AND (r.user_id = ? OR p.user_id = ? OR (p.email IS NOT NULL AND p.email = ?))
      ORDER BY d.doc_date DESC, d.id DESC LIMIT 200`,
  ).bind(u.id, u.id, u.email).all();
  return json({ documents: results });
}

export async function getDoc(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  const d = await loadDoc(env, id);
  const staff = isStaffRole(u);
  if (!staff && !(await canClientSee(env, u, d))) throw new HttpError(404, 'Document not found');
  const { results: lines } = await env.DB.prepare('SELECT * FROM doc_lines WHERE doc_id = ? ORDER BY sort, id').bind(id).all<any>();
  const { results: payments } = await env.DB.prepare('SELECT id, number, kind, pay_date, amount, tds, mode, reference, cancelled FROM payments WHERE doc_id = ? ORDER BY pay_date, id').bind(id).all<any>();
  const s = await getSettings(env);
  const req2 = d.request_id ? await env.DB.prepare('SELECT id, ref, title, status, user_id FROM requests WHERE id = ?').bind(d.request_id).first<any>() : null;
  const party = d.party_id ? await env.DB.prepare('SELECT id, name, email, phone, contact_person, kind FROM parties WHERE id = ?').bind(d.party_id).first<any>() : null;
  const tax = computeDoc(lines, { intra: !d.igst && (d.cgst > 0 || isIntra(s, d)), roundOff: false });
  const paid = r2(payments.filter((p) => !p.cancelled).reduce((a, p) => a + p.amount + (p.tds || 0), 0));
  const company = {
    state_code: s.company_state_code, signatory: s.signatory, footer: s.invoice_footer,
    bank: { name: s.bank_name, account_name: s.bank_account_name, account: s.bank_account, ifsc: s.bank_ifsc, branch: s.bank_branch, upi: s.upi_id },
  };
  const out: any = { document: d, lines, byHsn: tax.totals.byHsn, byRate: tax.totals.byRate, payments: staff ? payments : payments.filter((p) => !p.cancelled), paid, balance: r2(d.total - paid), company, request: req2, party: staff ? party : null };
  if (!staff) { delete out.document.cost; out.lines = lines.map(({ cost_rate, ...l }: any) => l); }
  return json(out);
}

const isIntra = (s: Settings, d: Pick<DocRow, 'type' | 'place_of_supply' | 'party_state_code'>) =>
  d.type === 'purchase' ? (d.party_state_code || s.company_state_code) === s.company_state_code : (d.place_of_supply || s.company_state_code) === s.company_state_code;

/* ---------------- create / update ---------------- */

function parseLines(raw: unknown): LineIn[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'Add at least one line item');
  if (raw.length > 300) throw new HttpError(400, 'Too many lines (max 300)');
  return raw.map((l: any, i: number) => {
    const description = str(l?.description, `Line ${i + 1} description`, { required: true, max: 1000 });
    const qty = num(l.qty, NaN), rate = num(l.rate, NaN);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, `Line ${i + 1}: quantity must be more than 0`);
    if (!Number.isFinite(rate) || rate < 0) throw new HttpError(400, `Line ${i + 1}: enter a valid rate`);
    const gst = num(l.gst_rate, 0);
    if (gst < 0 || gst > 40) throw new HttpError(400, `Line ${i + 1}: GST rate must be 0 to 40%`);
    const hsn = str(l.hsn, 'HSN', { max: 10 }).replace(/\s/g, '');
    if (hsn && !/^\d{4,8}$/.test(hsn)) throw new HttpError(400, `Line ${i + 1}: HSN/SAC should be 4 to 8 digits`);
    return {
      item_id: Number(l.item_id) || null, description, make: str(l.make, 'Make', { max: 100 }), hsn, qty, unit: str(l.unit, 'Unit', { max: 20 }) || 'Nos', rate,
      discount_pct: Math.min(100, Math.max(0, num(l.discount_pct))), gst_rate: gst, cost_rate: l.cost_rate === '' || l.cost_rate == null ? undefined : num(l.cost_rate),
    };
  });
}

async function writeDoc(env: Env, u: User, b: Record<string, any>, existing: DocRow | null): Promise<number> {
  const s = await getSettings(env);
  const type: DocType = existing?.type ?? b.type;
  if (!DOC_TYPES.includes(type)) throw new HttpError(400, 'Unknown document type');

  if (existing) {
    if (existing.status === 'cancelled') throw new HttpError(409, 'Cancelled documents cannot be edited');
    if (type === 'invoice' && existing.status !== 'draft') throw new HttpError(409, 'Issued tax invoices cannot be edited. Cancel it and issue a new one.');
    if (type === 'quotation' && existing.status === 'accepted') throw new HttpError(409, 'This quotation has been accepted; create a revised copy instead.');
  }

  const doc_date = dateField(b.doc_date ?? existing?.doc_date ?? today(), 'Date', true)!;
  const lines = parseLines(b.lines);

  // Request link
  const request_id = Number(b.request_id ?? existing?.request_id) || null;
  const request = request_id ? await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(request_id).first<any>() : null;
  if (request_id && !request) throw new HttpError(400, 'Linked request not found');

  // Party
  let party_id = Number(b.party_id ?? existing?.party_id) || null;
  if (!party_id && request && type !== 'purchase') party_id = await customerForRequest(env, request);
  if (!party_id && type !== 'boq') throw new HttpError(400, type === 'purchase' ? 'Choose the supplier' : 'Choose the customer');
  const party = party_id ? await env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(party_id).first<PartyRow>() : null;
  if (party_id && !party) throw new HttpError(400, 'Party not found');
  if (party && type === 'purchase' && party.kind !== 'supplier') throw new HttpError(400, 'Purchase bills must be from a supplier');
  if (party && SALES.includes(type) && party.kind !== 'customer') throw new HttpError(400, 'Sales documents must be for a customer');

  const party_state = party?.state_code || (party?.gstin ? party.gstin.slice(0, 2) : '') || null;
  const pos = type === 'purchase' ? s.company_state_code : stateCode(b.place_of_supply) || party_state || s.company_state_code;
  const intra = type === 'purchase' ? (party_state || s.company_state_code) === s.company_state_code : pos === s.company_state_code;
  const { lines: calc, totals } = computeDoc(lines, { intra, roundOff: type !== 'purchase' && s.round_off !== 'no' });
  let round_off = totals.roundOff, total = totals.total;
  if (type === 'purchase' && b.round_off !== undefined && b.round_off !== '') { round_off = r2(num(b.round_off)); total = r2(totals.taxable + totals.tax + round_off); }

  const credit = party?.credit_days ?? parseInt(s.invoice_due_days, 10);
  const fields: Record<string, unknown> = {
    type, party_id, request_id, doc_date,
    due_date: dateField(b.due_date, 'Due date') ?? (type === 'invoice' || type === 'purchase' ? (existing?.due_date && !b.doc_date ? existing.due_date : addDays(doc_date, Number.isFinite(credit) ? credit : 30)) : null),
    valid_until: dateField(b.valid_until, 'Valid until') ?? (type === 'quotation' ? addDays(doc_date, parseInt(s.quotation_validity_days, 10) || 30) : null),
    ref_no: str(b.ref_no, 'Reference no.', { max: 60 }) || null,
    ref_date: dateField(b.ref_date, 'Reference date'),
    party_name: party?.name ?? (request ? request.contact_company || request.contact_name : null),
    party_gstin: party?.gstin ?? null,
    party_address: party ? [party.address, [party.city, party.pincode].filter(Boolean).join(' - ')].filter(Boolean).join('\n') || null : null,
    party_state_code: party_state,
    ship_to: str(b.ship_to, 'Ship to', { max: 500 }) || null,
    place_of_supply: pos,
    reverse_charge: b.reverse_charge ? 1 : 0,
    subject: str(b.subject, 'Subject', { max: 300 }) || (request ? request.title : null),
    subtotal: totals.subtotal, discount: totals.discount, taxable: totals.taxable, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst,
    round_off, total, cost: totals.cost,
    notes: str(b.notes, 'Notes', { max: 4000 }) || null,
    terms: b.terms === undefined || b.terms === null ? (existing ? existing.terms : type === 'quotation' ? s.terms_quotation : type === 'invoice' ? s.terms_invoice : null) : str(b.terms, 'Terms', { max: 6000 }) || null,
  };
  if (type === 'purchase' && !fields.ref_no) throw new HttpError(400, "Enter the supplier's bill number");

  // Link only items that exist
  const ids = [...new Set(calc.map((l) => l.item_id).filter(Boolean))] as number[];
  const known = new Set<number>();
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT id FROM items WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: number }>();
    results.forEach((r) => known.add(r.id));
  }

  let id: number;
  if (existing) {
    id = existing.id;
    if (type === 'quotation' && ['issued', 'sent'].includes(existing.status)) fields.revision = existing.revision + 1;
    const keys = Object.keys(fields);
    await env.DB.prepare(`UPDATE documents SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...keys.map((k) => fields[k]), id).run();
  } else {
    fields.source_doc_id = Number(b.source_doc_id) || null;
    fields.created_by = u.id;
    const keys = Object.keys(fields);
    const res = await env.DB.prepare(`INSERT INTO documents (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => fields[k])).run();
    id = Number(res.meta.last_row_id);
  }
  const stmts = [env.DB.prepare('DELETE FROM doc_lines WHERE doc_id = ?').bind(id)];
  calc.forEach((l, i) => stmts.push(env.DB.prepare(
    `INSERT INTO doc_lines (doc_id, sort, item_id, description, make, hsn, qty, unit, rate, discount_pct, gst_rate, cost_rate, taxable, cgst, sgst, igst, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, i, l.item_id && known.has(l.item_id) ? l.item_id : null, l.description, l.make || null, l.hsn || null, l.qty, l.unit || 'Nos', l.rate, l.discount_pct ?? 0, l.gst_rate ?? 0, l.cost_rate ?? null, l.taxable, l.cgst, l.sgst, l.igst, l.amount)));
  await env.DB.batch(stmts);

  // Purchases are recorded immediately; others when the user chooses "issue".
  if ((type === 'purchase' && (!existing || existing.status === 'draft')) || (b.issue && (!existing || existing.status === 'draft'))) await issue(env, s, id);
  return id;
}

async function issue(env: Env, s: Settings, id: number) {
  const d = await loadDoc(env, id);
  if (d.status !== 'draft') return d;
  if (d.total < 0) throw new HttpError(400, 'Total cannot be negative');
  const number = d.number ?? await nextNumber(env, s, d.type, d.doc_date);
  await env.DB.prepare("UPDATE documents SET number = ?, status = 'issued', issued_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(number, id).run();
  return { ...d, number, status: 'issued' as const };
}

export async function createDoc(req: Request, env: Env) {
  const u = await requireStaff(req, env);
  const id = await writeDoc(env, u, await readJson(req, 400_000), null);
  return json({ ok: true, id }, 201);
}

export async function updateDoc(req: Request, env: Env, id: number) {
  const u = await requireStaff(req, env);
  const id2 = await writeDoc(env, u, await readJson(req, 400_000), await loadDoc(env, id));
  return json({ ok: true, id: id2 });
}

export async function issueDoc(req: Request, env: Env, id: number) {
  await requireStaff(req, env);
  const d = await issue(env, await getSettings(env), id);
  return json({ ok: true, number: d.number });
}

export async function cancelDoc(req: Request, env: Env, id: number) {
  await requireStaff(req, env);
  const d = await loadDoc(env, id);
  if (d.status === 'cancelled') return json({ ok: true });
  const paid = await env.DB.prepare('SELECT COUNT(*) AS n FROM payments WHERE doc_id = ? AND cancelled = 0').bind(id).first<{ n: number }>();
  if (paid && paid.n > 0) throw new HttpError(409, 'Cancel the payments recorded against this document first');
  await env.DB.prepare("UPDATE documents SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

/** Deletes a draft that was never issued (keeps numbering gap-free). */
export async function deleteDoc(req: Request, env: Env, id: number) {
  await requireStaff(req, env);
  const d = await loadDoc(env, id);
  if (d.status !== 'draft' || d.number) throw new HttpError(409, 'Only unissued drafts can be deleted; cancel issued documents instead');
  await env.DB.batch([
    env.DB.prepare('UPDATE requests SET quote_doc_id = NULL WHERE quote_doc_id = ?').bind(id),
    env.DB.prepare('UPDATE documents SET source_doc_id = NULL WHERE source_doc_id = ?').bind(id),
    env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

/** BOQ → quotation → invoice, or a copy of any document, as a new draft. */
export async function convertDoc(req: Request, env: Env, id: number) {
  const u = await requireStaff(req, env);
  const b = await readJson(req);
  const d = await loadDoc(env, id);
  const to = String(b.to ?? d.type) as DocType;
  if (!DOC_TYPES.includes(to)) throw new HttpError(400, 'Unknown document type');
  if ((d.type === 'purchase') !== (to === 'purchase')) throw new HttpError(400, 'Purchase bills can only be copied to purchase bills');
  const { results: lines } = await env.DB.prepare('SELECT * FROM doc_lines WHERE doc_id = ? ORDER BY sort, id').bind(id).all<any>();
  const newId = await writeDoc(env, u, {
    type: to, party_id: d.party_id, request_id: d.request_id, source_doc_id: d.id, doc_date: today(), subject: d.subject,
    ref_no: to === 'purchase' ? `${d.ref_no ?? ''}-copy` : d.ref_no, place_of_supply: d.place_of_supply, ship_to: d.ship_to, notes: d.notes,
    terms: to === d.type ? d.terms : undefined,
    lines: lines.map((l) => ({ item_id: l.item_id, description: l.description, make: l.make, hsn: l.hsn, qty: l.qty, unit: l.unit, rate: l.rate, discount_pct: l.discount_pct, gst_rate: l.gst_rate, cost_rate: l.cost_rate })),
  }, null);
  return json({ ok: true, id: newId }, 201);
}

/* ---------------- sending & acceptance ---------------- */

async function addRequestEvent(env: Env, requestId: number, status: string | null, note: string, actorId: number | null) {
  await env.DB.prepare('INSERT INTO request_events (request_id, status, note, visible_to_client, actor_id) VALUES (?, ?, ?, 1, ?)').bind(requestId, status, note, actorId).run();
}

export async function sendDoc(req: Request, env: Env, id: number) {
  const u = await requireStaff(req, env);
  const b = await readJson(req);
  const s = await getSettings(env);
  let d = await loadDoc(env, id);
  if (!['quotation', 'invoice'].includes(d.type)) throw new HttpError(400, 'Only quotations and invoices can be sent to the client');
  if (d.status === 'cancelled') throw new HttpError(409, 'This document is cancelled');
  if (d.status === 'draft') d = { ...d, ...(await issue(env, s, id)) };
  const request = d.request_id ? await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(d.request_id).first<any>() : null;
  const party = d.party_id ? await env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(d.party_id).first<PartyRow>() : null;
  const to = str(b.to, 'Email', { max: 254 }) || request?.contact_email || party?.email;
  if (!to) throw new HttpError(400, 'This customer has no email address. Add one to the customer first.');
  const message = str(b.message, 'Message', { max: 2000 });
  const label = DOC_LABEL[d.type];

  if (d.type === 'quotation') {
    if (d.status === 'issued') await env.DB.prepare("UPDATE documents SET status = 'sent', updated_at = datetime('now') WHERE id = ?").bind(id).run();
    if (request) {
      const days = d.valid_until ? Math.max(1, Math.round((Date.parse(d.valid_until) - Date.parse(d.doc_date)) / 86400000)) : 30;
      const newStatus = ['new', 'reviewing', 'quoted'].includes(request.status) ? 'quoted' : request.status;
      await env.DB.prepare("UPDATE requests SET quote_doc_id = ?, quote_amount = ?, quote_validity_days = ?, quote_note = ?, quoted_at = datetime('now'), status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(id, d.total, days, `Quotation ${d.number}${d.revision ? ` (rev. ${d.revision})` : ''}, total incl. GST`, newStatus, request.id).run();
      await addRequestEvent(env, request.id, newStatus !== request.status ? newStatus : null, `Quotation ${d.number}${d.revision ? ` rev. ${d.revision}` : ''} sent: ${inr(d.total)} incl. GST${message ? `\n${message}` : ''}`, u.id);
    }
  } else if (request) {
    await addRequestEvent(env, request.id, null, `Tax invoice ${d.number} issued: ${inr(d.total)}${d.due_date ? `, due ${d.due_date}` : ''}`, u.id);
  }

  const registered = !!(request?.user_id || party?.user_id || (await env.DB.prepare('SELECT 1 FROM users WHERE email = ? AND email_verified_at IS NOT NULL').bind(to).first()));
  await sendMail(env, {
    to,
    subject: `${label} ${d.number}${d.subject ? `: ${d.subject}` : ''}`,
    heading: d.type === 'quotation' ? 'Your quotation is ready' : `${label} ${d.number}`,
    body: `<p>Dear ${esc(party?.contact_person || request?.contact_name || d.party_name || 'Sir/Madam')},</p>
      ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : `<p>Please find our ${label.toLowerCase()} <strong>${esc(d.number!)}</strong>${d.subject ? ` for <strong>${esc(d.subject)}</strong>` : ''}.</p>`}
      <p style="font-size:22px;font-weight:700;margin:10px 0">${inr(d.total)} <span style="font-size:13px;font-weight:400;color:#667085">incl. GST</span></p>
      ${d.type === 'quotation' && d.valid_until ? `<p>Valid until ${esc(d.valid_until)}.</p>` : ''}${d.type === 'invoice' && d.due_date ? `<p>Payment due by ${esc(d.due_date)}.</p>` : ''}
      <p>${registered ? 'You can view and download it as PDF in your client portal' + (d.type === 'quotation' ? ', and accept it online.' : '.') : `To view it online, create a free account with this email address (${esc(to)}).`}</p>`,
    cta: { label: registered ? `View ${label.toLowerCase()}` : 'Create my account', url: site(env, registered ? `/portal/document/?id=${id}` : `/portal/register/?email=${encodeURIComponent(to)}&next=${encodeURIComponent(`/portal/document/?id=${id}`)}`) },
  });
  return json({ ok: true, number: d.number, to });
}

/** Client accepts a quotation (from the portal). */
export async function acceptDoc(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  const d = await loadDoc(env, id);
  if (!(await canClientSee(env, u, d)) && !isStaffRole(u)) throw new HttpError(404, 'Document not found');
  if (d.type !== 'quotation') throw new HttpError(400, 'Only quotations can be accepted');
  if (!['issued', 'sent'].includes(d.status)) throw new HttpError(409, d.status === 'accepted' ? 'Already accepted' : 'This quotation cannot be accepted');
  if (d.valid_until && d.valid_until < today()) throw new HttpError(409, 'This quotation has expired. Please ask us for a revised quotation.');
  await env.DB.prepare("UPDATE documents SET status = 'accepted', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  const request = d.request_id ? await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(d.request_id).first<any>() : null;
  if (request && ['new', 'reviewing', 'quoted'].includes(request.status)) {
    await env.DB.prepare("UPDATE requests SET kind = 'order', status = 'accepted', quote_doc_id = ?, quote_amount = ?, updated_at = datetime('now') WHERE id = ?").bind(id, d.total, request.id).run();
    await addRequestEvent(env, request.id, 'accepted', `Quotation ${d.number} accepted by client. Order confirmed.`, u.id);
  }
  await sendMail(env, {
    to: staffRecipients(env),
    subject: `ACCEPTED: quotation ${d.number} (${d.party_name ?? ''})`,
    heading: `${d.party_name ?? 'Client'} accepted quotation ${d.number}`,
    body: `<p>${d.subject ? `<strong>${esc(d.subject)}</strong><br>` : ''}${inr(d.total)} incl. GST</p>`,
    cta: { label: request ? 'Open order' : 'Open quotation', url: site(env, request ? `/staff/request/?id=${request.id}` : `/staff/doc/?id=${id}`) },
  });
  return json({ ok: true });
}

/** Called by the request flow when a client accepts from the request page. */
export async function markQuoteDocAccepted(env: Env, docId: number | null) {
  if (docId) await env.DB.prepare("UPDATE documents SET status = 'accepted', updated_at = datetime('now') WHERE id = ? AND status IN ('issued', 'sent')").bind(docId).run();
}
