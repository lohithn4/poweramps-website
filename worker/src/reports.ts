import { Env, HttpError, json, requireStaff } from './lib';
import { getSettings } from './settings';
import { r2, today, validGstin, posLabel } from '../../shared/calc';

/** GST unit codes (UQC) for the HSN summary. */
const UQC: Record<string, string> = {
  nos: 'NOS', no: 'NOS', number: 'NOS', numbers: 'NOS', pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS', set: 'SET', sets: 'SET',
  mtr: 'MTR', mtrs: 'MTR', m: 'MTR', meter: 'MTR', metre: 'MTR', rmt: 'MTR', kg: 'KGS', kgs: 'KGS', ltr: 'LTR', l: 'LTR', box: 'BOX',
  pair: 'PRS', prs: 'PRS', roll: 'ROL', rolls: 'ROL', sqm: 'SQM', sqft: 'SQF', ton: 'TON', tonne: 'TON', unit: 'UNT', units: 'UNT', bundle: 'BDL', coil: 'OTH', lot: 'OTH', job: 'OTH', ls: 'OTH',
};
const uqc = (u: string | null) => UQC[String(u ?? '').toLowerCase().replace(/[^a-z]/g, '')] ?? 'OTH';
const monthOk = (m: string | null): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** GSTR-1 sections and GSTR-3B summary for one month. */
export async function gstReport(req: Request, env: Env) {
  await requireStaff(req, env);
  const month = new URL(req.url).searchParams.get('month') ?? today().slice(0, 7);
  if (!monthOk(month)) throw new HttpError(400, 'Choose a month');
  const s = await getSettings(env);
  const home = s.company_state_code;

  const { results: invs } = await env.DB.prepare(
    "SELECT * FROM documents WHERE type = 'invoice' AND number IS NOT NULL AND substr(doc_date, 1, 7) = ? ORDER BY doc_date, number",
  ).bind(month).all<any>();
  const live = invs.filter((d) => d.status !== 'cancelled');
  const ids = live.map((d) => d.id);
  const lines = ids.length
    ? (await env.DB.prepare(`SELECT * FROM doc_lines WHERE doc_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<any>()).results
    : [];
  const linesOf = new Map<number, any[]>();
  for (const l of lines) (linesOf.get(l.doc_id) ?? linesOf.set(l.doc_id, []).get(l.doc_id)!).push(l);

  const b2b: any[] = [], b2cl: any[] = [];
  const b2cs = new Map<string, any>();
  const hsn = { b2b: new Map<string, any>(), b2c: new Map<string, any>() };
  const out = { taxable: 0, igst: 0, cgst: 0, sgst: 0, invoices: live.length, value: 0 };
  const interUnreg = new Map<string, { pos: string; taxable: number; igst: number }>();

  for (const d of live) {
    const pos = d.place_of_supply || home;
    const registered = !!d.party_gstin && validGstin(d.party_gstin);
    const inter = pos !== home;
    out.taxable += d.taxable; out.igst += d.igst; out.cgst += d.cgst; out.sgst += d.sgst; out.value += d.total;
    const byRate = new Map<number, { taxable: number; igst: number; cgst: number; sgst: number }>();
    for (const l of linesOf.get(d.id) ?? []) {
      const br = byRate.get(l.gst_rate) ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      br.taxable += l.taxable; br.igst += l.igst; br.cgst += l.cgst; br.sgst += l.sgst;
      byRate.set(l.gst_rate, br);
      const hm = registered ? hsn.b2b : hsn.b2c;
      const key = `${l.hsn ?? ''}|${uqc(l.unit)}|${l.gst_rate}`;
      const h = hm.get(key) ?? { hsn: l.hsn ?? '', description: l.description.slice(0, 30), uqc: uqc(l.unit), qty: 0, value: 0, rate: l.gst_rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      h.qty += l.qty; h.value += l.amount; h.taxable += l.taxable; h.igst += l.igst; h.cgst += l.cgst; h.sgst += l.sgst;
      hm.set(key, h);
    }
    for (const [rate, t] of byRate) {
      if (registered) b2b.push({ gstin: d.party_gstin, name: d.party_name, number: d.number, date: d.doc_date, value: d.total, pos: posLabel(pos), reverse_charge: d.reverse_charge ? 'Y' : 'N', type: 'Regular B2B', rate, taxable: r2(t.taxable), igst: r2(t.igst), cgst: r2(t.cgst), sgst: r2(t.sgst) });
      else if (inter && d.total > 100000) b2cl.push({ number: d.number, date: d.doc_date, value: d.total, pos: posLabel(pos), rate, taxable: r2(t.taxable), igst: r2(t.igst) });
      else {
        const k = `${pos}|${rate}`;
        const c = b2cs.get(k) ?? { type: 'OE', pos: posLabel(pos), rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
        c.taxable += t.taxable; c.igst += t.igst; c.cgst += t.cgst; c.sgst += t.sgst;
        b2cs.set(k, c);
      }
      if (!registered && inter) {
        const u = interUnreg.get(pos) ?? { pos: posLabel(pos), taxable: 0, igst: 0 };
        u.taxable += t.taxable; u.igst += t.igst;
        interUnreg.set(pos, u);
      }
    }
  }

  // Purchases (input tax credit) for 3B
  const itc = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(taxable), 0) AS taxable, COALESCE(SUM(igst), 0) AS igst, COALESCE(SUM(cgst), 0) AS cgst, COALESCE(SUM(sgst), 0) AS sgst FROM documents WHERE type = 'purchase' AND status NOT IN ('draft', 'cancelled') AND substr(doc_date, 1, 7) = ?",
  ).bind(month).first<any>();

  const nums = invs.map((d) => d.number as string);
  const docsIssued = nums.length ? [{ nature: 'Invoices for outward supply', from: nums[0], to: nums[nums.length - 1], total: invs.length, cancelled: invs.filter((d) => d.status === 'cancelled').length }] : [];
  const round = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && k !== 'rate' && k !== 'qty' ? r2(v) : v]));
  const net = { igst: r2(out.igst - itc.igst), cgst: r2(out.cgst - itc.cgst), sgst: r2(out.sgst - itc.sgst) };

  return json({
    month, company_gstin: s.company_gstin, home_state: posLabel(home),
    gstr1: {
      b2b, b2cl,
      b2cs: [...b2cs.values()].map(round),
      hsn_b2b: [...hsn.b2b.values()].map((h) => ({ ...round(h), qty: r2(h.qty) })),
      hsn_b2c: [...hsn.b2c.values()].map((h) => ({ ...round(h), qty: r2(h.qty) })),
      docs: docsIssued,
    },
    gstr3b: {
      outward: round(out),
      inter_state_unregistered: [...interUnreg.values()].map(round),
      itc: { count: itc.n, taxable: r2(itc.taxable), igst: r2(itc.igst), cgst: r2(itc.cgst), sgst: r2(itc.sgst) },
      net,
      payable_total: r2(Math.max(0, net.igst) + Math.max(0, net.cgst) + Math.max(0, net.sgst)),
    },
  });
}

/** Sales or purchase register for a date range. */
export async function register(req: Request, env: Env) {
  await requireStaff(req, env);
  const sp = new URL(req.url).searchParams;
  const type = sp.get('type') === 'purchase' ? 'purchase' : 'invoice';
  const from = sp.get('from') ?? `${today().slice(0, 7)}-01`, to = sp.get('to') ?? today();
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.number, d.ref_no, d.ref_date, d.doc_date, d.status, d.party_name, d.party_gstin, d.place_of_supply, d.taxable, d.cgst, d.sgst, d.igst, d.round_off, d.total,
       (SELECT COALESCE(SUM(amount + tds), 0) FROM payments x WHERE x.doc_id = d.id AND x.cancelled = 0) AS paid
       FROM documents d WHERE d.type = ? AND d.number IS NOT NULL AND d.doc_date BETWEEN ? AND ? ORDER BY d.doc_date, d.number`,
  ).bind(type, from, to).all();
  return json({ type, from, to, rows: results });
}

/** Receivables / payables per party with ageing (unallocated payments settle the oldest bills first). */
export async function outstanding(req: Request, env: Env) {
  await requireStaff(req, env);
  const kind = new URL(req.url).searchParams.get('kind') === 'supplier' ? 'supplier' : 'customer';
  const docType = kind === 'customer' ? 'invoice' : 'purchase';
  const payKind = kind === 'customer' ? 'receipt' : 'payment';
  const t = today();
  const { results: parties } = await env.DB.prepare('SELECT id, name, phone, email, opening_balance, credit_days FROM parties WHERE kind = ?').bind(kind).all<any>();
  const { results: docs } = await env.DB.prepare(`SELECT id, party_id, number, ref_no, doc_date, due_date, total FROM documents WHERE type = ? AND status NOT IN ('draft', 'cancelled') ORDER BY doc_date, id`).bind(docType).all<any>();
  const { results: pays } = await env.DB.prepare('SELECT party_id, doc_id, amount + tds AS amt FROM payments WHERE kind = ? AND cancelled = 0').bind(payKind).all<any>();

  const against = new Map<number, number>();
  const loose = new Map<number, number>();
  for (const p of pays) {
    if (p.doc_id) against.set(p.doc_id, (against.get(p.doc_id) ?? 0) + p.amt);
    else loose.set(p.party_id, (loose.get(p.party_id) ?? 0) + p.amt);
  }
  const days = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);
  const rows = parties.map((p) => {
    let pool = loose.get(p.id) ?? 0;
    const buckets = { opening: 0, current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    let opening = p.opening_balance;
    if (opening > 0) { const use = Math.min(opening, pool); opening -= use; pool -= use; }
    buckets.opening = r2(opening);
    const bills: any[] = [];
    for (const d of docs.filter((d) => d.party_id === p.id)) {
      let due = r2(d.total - (against.get(d.id) ?? 0));
      if (due > 0 && pool > 0) { const use = Math.min(due, pool); due = r2(due - use); pool -= use; }
      if (due <= 0.5) continue;
      const late = days(d.due_date ?? d.doc_date, t);
      const k = late <= 0 ? 'current' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'd90plus';
      buckets[k] = r2(buckets[k] + due);
      bills.push({ id: d.id, number: d.number, ref_no: d.ref_no, date: d.doc_date, due_date: d.due_date, total: d.total, due, days_late: Math.max(0, late) });
    }
    const total = r2(Object.values(buckets).reduce((a, b) => a + b, 0) - pool);
    return { id: p.id, name: p.name, phone: p.phone, email: p.email, ...buckets, advance: r2(pool), total, bills };
  }).filter((r) => Math.abs(r.total) > 0.5 || r.bills.length);
  rows.sort((a, b) => b.total - a.total);
  return json({ kind, as_of: t, rows });
}
