import { Env, HttpError, json, readJson, str, requireStaff } from './lib';
import { getSettings } from './settings';
import { num, r2, today } from '../../shared/calc';
import { nextNumber, dateField, BALANCE_SQL, STOCK_SQL, type PartyRow } from './masters';

export const PAY_KINDS = { receipt: 'customer', payment: 'supplier', loan_received: 'lender', loan_repayment: 'lender' } as const;
type PayKind = keyof typeof PAY_KINDS;
export const MODES = ['bank', 'upi', 'neft', 'rtgs', 'cheque', 'cash', 'card', 'other'];

export async function listPayments(req: Request, env: Env) {
  await requireStaff(req, env);
  const sp = new URL(req.url).searchParams;
  const where: string[] = [];
  const args: unknown[] = [];
  const kind = sp.get('kind');
  if (kind && kind in PAY_KINDS) { where.push('x.kind = ?'); args.push(kind); }
  const party = Number(sp.get('party_id'));
  if (party) { where.push('x.party_id = ?'); args.push(party); }
  for (const [k, op] of [['from', '>='], ['to', '<=']] as const) { const v = sp.get(k); if (v) { where.push(`x.pay_date ${op} ?`); args.push(v); } }
  const q = sp.get('q')?.trim();
  if (q) { where.push('(x.number LIKE ? OR p.name LIKE ? OR x.reference LIKE ? OR d.number LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l); }
  const { results } = await env.DB.prepare(
    `SELECT x.*, p.name AS party_name, p.kind AS party_kind, d.number AS doc_number
       FROM payments x JOIN parties p ON p.id = x.party_id LEFT JOIN documents d ON d.id = x.doc_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY x.pay_date DESC, x.id DESC LIMIT 500`,
  ).bind(...args).all();
  return json({ payments: results });
}

export async function createPayment(req: Request, env: Env) {
  const u = await requireStaff(req, env);
  const b = await readJson<Record<string, any>>(req);
  const kind = b.kind as PayKind;
  if (!(kind in PAY_KINDS)) throw new HttpError(400, 'Choose what kind of entry this is');
  const party = await env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(Number(b.party_id)).first<PartyRow>();
  if (!party) throw new HttpError(400, 'Choose the party');
  if (party.kind !== PAY_KINDS[kind]) throw new HttpError(400, `A ${kind.replace('_', ' ')} must be for a ${PAY_KINDS[kind]}`);
  const amount = r2(num(b.amount, NaN));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount greater than 0');
  const interest = kind === 'loan_repayment' ? r2(Math.max(0, num(b.interest))) : 0;
  if (interest > amount) throw new HttpError(400, 'Interest cannot be more than the amount paid');
  const tds = kind === 'receipt' ? r2(Math.max(0, num(b.tds))) : 0;
  const pay_date = dateField(b.pay_date ?? today(), 'Date', true)!;
  const mode = (typeof b.mode === 'string' && MODES.includes(b.mode)) ? b.mode : 'bank';

  let doc_id: number | null = Number(b.doc_id) || null;
  if (doc_id) {
    const d = await env.DB.prepare(`SELECT d.id, d.type, d.status, d.party_id, d.total,
        (SELECT COALESCE(SUM(amount + tds), 0) FROM payments x WHERE x.doc_id = d.id AND x.cancelled = 0) AS paid FROM documents d WHERE d.id = ?`).bind(doc_id).first<any>();
    const want = kind === 'receipt' ? 'invoice' : kind === 'payment' ? 'purchase' : null;
    if (!d || !want || d.type !== want || d.party_id !== party.id) throw new HttpError(400, 'That document does not belong to this party');
    if (['draft', 'cancelled'].includes(d.status)) throw new HttpError(400, 'Payments can only be recorded against issued documents');
    if (r2(d.paid + amount + tds) > r2(d.total) + 0.5) throw new HttpError(400, `This is more than the balance due (₹ ${r2(d.total - d.paid)})`);
  } else doc_id = null;

  const s = await getSettings(env);
  const number = await nextNumber(env, s, kind, pay_date);
  const res = await env.DB.prepare(
    'INSERT INTO payments (number, kind, party_id, doc_id, pay_date, amount, interest, tds, mode, reference, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(number, kind, party.id, doc_id, pay_date, amount, interest, tds, mode, str(b.reference, 'Reference', { max: 100 }) || null, str(b.notes, 'Notes', { max: 1000 }) || null, u.id).run();
  return json({ ok: true, id: Number(res.meta.last_row_id), number }, 201);
}

export async function cancelPayment(req: Request, env: Env, id: number) {
  await requireStaff(req, env);
  const res = await env.DB.prepare('UPDATE payments SET cancelled = 1 WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Entry not found');
  return json({ ok: true });
}

/** Headline numbers for the accounts dashboard. */
export async function summary(req: Request, env: Env) {
  await requireStaff(req, env);
  const t = today();
  const month = t.slice(0, 7);
  const q = <T>(sql: string, ...args: unknown[]) => env.DB.prepare(sql).bind(...args).first<T>();
  const [bal, sales, coll, itc, overdue, quotes, lowStock, fb] = await Promise.all([
    env.DB.prepare(`SELECT p.kind, SUM(CASE WHEN b > 0 THEN b ELSE 0 END) AS due, SUM(CASE WHEN b < 0 THEN -b ELSE 0 END) AS advance
       FROM (SELECT p.kind, ${BALANCE_SQL} AS b FROM parties p) p GROUP BY p.kind`).all<{ kind: string; due: number; advance: number }>(),
    q<any>("SELECT COUNT(*) AS n, COALESCE(SUM(taxable), 0) AS taxable, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(cgst + sgst + igst), 0) AS tax FROM documents WHERE type = 'invoice' AND status NOT IN ('draft', 'cancelled') AND substr(doc_date, 1, 7) = ?", month),
    q<any>("SELECT COALESCE(SUM(amount), 0) AS amt FROM payments WHERE kind = 'receipt' AND cancelled = 0 AND substr(pay_date, 1, 7) = ?", month),
    q<any>("SELECT COALESCE(SUM(cgst + sgst + igst), 0) AS tax FROM documents WHERE type = 'purchase' AND status NOT IN ('draft', 'cancelled') AND substr(doc_date, 1, 7) = ?", month),
    q<any>(`SELECT COUNT(*) AS n, COALESCE(SUM(total - paid), 0) AS amt FROM (SELECT d.total, (SELECT COALESCE(SUM(amount + tds), 0) FROM payments x WHERE x.doc_id = d.id AND x.cancelled = 0) AS paid
       FROM documents d WHERE d.type = 'invoice' AND d.status NOT IN ('draft', 'cancelled') AND d.due_date < ?) WHERE total - paid > 0.5`, t),
    q<any>("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS amt FROM documents WHERE type = 'quotation' AND status IN ('issued', 'sent') AND (valid_until IS NULL OR valid_until >= ?)", t),
    q<any>(`SELECT COUNT(*) AS n FROM items i WHERE i.active = 1 AND i.is_service = 0 AND i.reorder_level IS NOT NULL AND ${STOCK_SQL} <= i.reorder_level`),
    q<any>("SELECT COUNT(*) AS n FROM feedback WHERE status = 'pending'"),
  ]);
  const by = Object.fromEntries(bal.results.map((r) => [r.kind, r]));
  return json({
    month,
    receivable: r2(by.customer?.due ?? 0),
    payable: r2(by.supplier?.due ?? 0),
    loans: r2(by.lender?.due ?? 0),
    sales_month: { count: sales?.n ?? 0, taxable: r2(sales?.taxable ?? 0), total: r2(sales?.total ?? 0), tax: r2(sales?.tax ?? 0) },
    collected_month: r2(coll?.amt ?? 0),
    gst_estimate: r2((sales?.tax ?? 0) - (itc?.tax ?? 0)),
    overdue: { count: overdue?.n ?? 0, amount: r2(overdue?.amt ?? 0) },
    open_quotes: { count: quotes?.n ?? 0, amount: r2(quotes?.amt ?? 0) },
    low_stock: lowStock?.n ?? 0,
    pending_testimonials: fb?.n ?? 0,
  });
}
