import { Env, HttpError, json, readJson, requireStaff, requireAdmin } from './lib';
import { getSettings, type Settings } from './settings';
import { partyFields, itemFields, type PartyRow, type ItemRow } from './masters';
import { r2, stateName } from '../../shared/calc';

/* ==========================================================================
   IMPORT: rows already parsed in the browser (Tally XML or CSV/Excel-as-CSV).
   mode: upsert = create new + update existing; create = only add new;
         update = only update existing. Empty cells never wipe existing data.
   ========================================================================== */

type Mode = 'upsert' | 'create' | 'update';
interface Plan { row: number; action: 'create' | 'update' | 'skip' | 'error'; name: string; changes?: string[]; error?: string }

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ''));

export async function importData(req: Request, env: Env) {
  const u = await requireStaff(req, env);
  const b = await readJson<Record<string, any>>(req, 3_000_000);
  const entity = b.entity;
  const mode: Mode = ['upsert', 'create', 'update'].includes(b.mode) ? b.mode : 'upsert';
  const dryRun = b.dryRun !== false;
  const rows: Record<string, unknown>[] = Array.isArray(b.rows) ? b.rows : [];
  if (!['parties', 'items'].includes(entity)) throw new HttpError(400, 'Choose what to import');
  if (!rows.length) throw new HttpError(400, 'No rows found in the file');
  if (rows.length > 5000) throw new HttpError(400, 'Please import at most 5,000 rows at a time');

  const plans: Plan[] = [];
  const stmts: D1PreparedStatement[] = [];
  let created = 0, updated = 0, skipped = 0, errors = 0;

  if (entity === 'parties') {
    const { results: existing } = await env.DB.prepare('SELECT * FROM parties').all<PartyRow>();
    const key = (k: string, s: string) => `${k}|${s.toLowerCase().trim()}`;
    const byTally = new Map<string, PartyRow>(), byName = new Map<string, PartyRow>(), byGstin = new Map<string, PartyRow>();
    for (const p of existing) { if (p.tally_name) byTally.set(key(p.kind, p.tally_name), p); byName.set(key(p.kind, p.name), p); if (p.gstin) byGstin.set(key(p.kind, p.gstin), p); }
    const seen = new Set<string>();
    rows.forEach((raw, i) => {
      const r = clean(raw);
      const name = String(r.name ?? r.tally_name ?? '').trim();
      try {
        if (!name) throw new Error('Name is missing');
        const kind = String(r.kind ?? '').toLowerCase();
        if (!['customer', 'supplier', 'lender'].includes(kind)) throw new Error('Type must be customer, supplier or lender');
        const k = key(kind, name);
        if (seen.has(k)) { plans.push({ row: i + 1, action: 'skip', name, error: 'Duplicate row in file' }); skipped++; return; }
        seen.add(k);
        const match: PartyRow | null = (r.tally_name ? byTally.get(key(kind, String(r.tally_name))) : undefined) ?? byName.get(k) ?? (r.gstin ? byGstin.get(key(kind, String(r.gstin).toUpperCase())) : undefined) ?? null;
        let gstinWarn = '';
        if (r.gstin) {
          try { partyFields({ gstin: r.gstin }, true); } catch { gstinWarn = `GSTIN ${r.gstin} looks invalid, skipped`; delete r.gstin; }
        }
        if (match) {
          if (mode === 'create') { plans.push({ row: i + 1, action: 'skip', name, error: 'Already exists' }); skipped++; return; }
          const f = partyFields({ ...r, kind, name: match.name }, true);
          delete f.kind; if (r.name && String(r.name).toLowerCase() === match.name.toLowerCase()) delete f.name;
          if (!match.tally_name && r.tally_name) f.tally_name = String(r.tally_name);
          const changes = Object.keys(f).filter((c) => String((match as any)[c] ?? '') !== String(f[c] ?? ''));
          if (!changes.length) { plans.push({ row: i + 1, action: 'skip', name, error: 'No changes' }); skipped++; return; }
          plans.push({ row: i + 1, action: 'update', name: match.name, changes, ...(gstinWarn ? { error: gstinWarn } : {}) });
          updated++;
          stmts.push(env.DB.prepare(`UPDATE parties SET ${changes.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...changes.map((c) => f[c]), match.id));
        } else {
          if (mode === 'update') { plans.push({ row: i + 1, action: 'skip', name, error: 'Not found (update-only mode)' }); skipped++; return; }
          const f = partyFields({ ...r, kind, name });
          if (r.tally_name) f.tally_name = String(r.tally_name);
          plans.push({ row: i + 1, action: 'create', name, ...(gstinWarn ? { error: gstinWarn } : {}) });
          created++;
          const keys = Object.keys(f);
          stmts.push(env.DB.prepare(`INSERT INTO parties (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((c) => f[c])));
        }
      } catch (e: any) { plans.push({ row: i + 1, action: 'error', name, error: e.message }); errors++; }
    });
  } else {
    const { results: existing } = await env.DB.prepare('SELECT * FROM items').all<ItemRow>();
    const low = (s: unknown) => String(s ?? '').toLowerCase().trim();
    const byTally = new Map<string, ItemRow>(), byName = new Map<string, ItemRow>(), byCode = new Map<string, ItemRow>();
    for (const it of existing) { if (it.tally_name) byTally.set(low(it.tally_name), it); byName.set(low(it.name), it); if (it.code) byCode.set(low(it.code), it); }
    const seen = new Set<string>();
    rows.forEach((raw, i) => {
      const r = clean(raw);
      const name = String(r.name ?? r.tally_name ?? '').trim();
      try {
        if (!name) throw new Error('Name is missing');
        if (seen.has(low(name))) { plans.push({ row: i + 1, action: 'skip', name, error: 'Duplicate row in file' }); skipped++; return; }
        seen.add(low(name));
        const match: ItemRow | null = (r.tally_name ? byTally.get(low(r.tally_name)) : undefined) ?? byName.get(low(name)) ?? (r.code ? byCode.get(low(r.code)) : undefined) ?? null;
        let warn = '';
        if (r.hsn && !/^\d{4,8}$/.test(String(r.hsn).replace(/\s/g, ''))) { warn = `HSN "${r.hsn}" skipped (should be 4 to 8 digits)`; delete r.hsn; }
        if (match) {
          if (mode === 'create') { plans.push({ row: i + 1, action: 'skip', name, error: 'Already exists' }); skipped++; return; }
          const f = itemFields({ ...r, name: match.name }, true);
          if (low(r.name) === low(match.name)) delete f.name;
          if (!match.tally_name && r.tally_name) f.tally_name = String(r.tally_name);
          const changes = Object.keys(f).filter((c) => String((match as any)[c] ?? '') !== String(f[c] ?? ''));
          if (!changes.length) { plans.push({ row: i + 1, action: 'skip', name, error: 'No changes' }); skipped++; return; }
          plans.push({ row: i + 1, action: 'update', name: match.name, changes, ...(warn ? { error: warn } : {}) });
          updated++;
          stmts.push(env.DB.prepare(`UPDATE items SET ${changes.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...changes.map((c) => f[c]), match.id));
        } else {
          if (mode === 'update') { plans.push({ row: i + 1, action: 'skip', name, error: 'Not found (update-only mode)' }); skipped++; return; }
          const f = itemFields({ ...r, name });
          if (r.tally_name) f.tally_name = String(r.tally_name);
          plans.push({ row: i + 1, action: 'create', name, ...(warn ? { error: warn } : {}) });
          created++;
          const keys = Object.keys(f);
          stmts.push(env.DB.prepare(`INSERT INTO items (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((c) => f[c])));
        }
      } catch (e: any) { plans.push({ row: i + 1, action: 'error', name, error: e.message }); errors++; }
    });
  }

  if (!dryRun && stmts.length) {
    for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
    await env.DB.prepare('INSERT INTO import_log (entity, source, mode, created, updated, skipped, actor_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(entity, String(b.source ?? '').slice(0, 200) || null, mode, created, updated, skipped + errors, u.id).run();
  }
  return json({ ok: true, dryRun, entity, mode, created, updated, skipped, errors, plans: plans.slice(0, 1000) });
}

export async function importHistory(req: Request, env: Env) {
  await requireStaff(req, env);
  const { results } = await env.DB.prepare('SELECT l.*, u.name AS actor FROM import_log l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.id DESC LIMIT 50').all();
  return json({ imports: results });
}

/* ==========================================================================
   EXPORT to Tally (XML "Import Data" envelopes). Import masters first, then vouchers.
   Debit amounts are negative in Tally XML; ISDEEMEDPOSITIVE=Yes marks a debit.
   ========================================================================== */

const x = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const amt = (n: number) => r2(n).toFixed(2);
const tdate = (d: string) => d.replace(/-/g, '');
const tag = (name: string, v: unknown) => (v === undefined || v === null || v === '' ? '' : `<${name}>${x(v)}</${name}>`);

function envelope(kind: 'All Masters' | 'Vouchers', company: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC><REPORTNAME>${kind}</REPORTNAME>${company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${x(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ''}</REQUESTDESC>
   <REQUESTDATA>
${body}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}
const msg = (inner: string) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${inner}\n    </TALLYMESSAGE>`;
const ledgerName = (p: { tally_name?: string | null; name: string }) => p.tally_name || p.name;
const rateLedger = (pattern: string, rate: number) => pattern.replace(/\{RATE\}/g, String(rate));

function entry(ledger: string, amount: number, extra = '', listTag = 'ALLLEDGERENTRIES.LIST', isParty = false) {
  // amount > 0 = credit, < 0 = debit
  return `      <${listTag}>${tag('LEDGERNAME', ledger)}<ISDEEMEDPOSITIVE>${amount < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>${isParty ? '<ISPARTYLEDGER>Yes</ISPARTYLEDGER>' : ''}<AMOUNT>${amt(amount)}</AMOUNT>${extra}</${listTag}>`;
}
const bill = (name: string, type: 'New Ref' | 'Agst Ref' | 'On Account' | 'Advance', amount: number, creditDays?: number | null) =>
  `<BILLALLOCATIONS.LIST>${type === 'On Account' ? '' : tag('NAME', name)}<BILLTYPE>${type}</BILLTYPE>${creditDays ? `<BILLCREDITPERIOD>${creditDays} Days</BILLCREDITPERIOD>` : ''}<AMOUNT>${amt(amount)}</AMOUNT></BILLALLOCATIONS.LIST>`;

function partyMaster(p: PartyRow, s: Settings) {
  const parent = p.kind === 'customer' ? s.tally_debtors_group : p.kind === 'supplier' ? s.tally_creditors_group : s.tally_loans_group;
  const lines = String(p.address ?? '').split(/\n|,\s*(?=\S)/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
  const state = p.state_code ? stateName(p.state_code) : '';
  return msg(`     <LEDGER NAME="${x(ledgerName(p))}">
      <NAME.LIST><NAME>${x(ledgerName(p))}</NAME></NAME.LIST>
      ${tag('PARENT', parent)}
      <ISBILLWISEON>${p.kind === 'lender' ? 'No' : 'Yes'}</ISBILLWISEON>
      ${lines.length ? `<ADDRESS.LIST TYPE="String">${lines.map((l) => tag('ADDRESS', l)).join('')}</ADDRESS.LIST>` : ''}
      ${tag('LEDSTATENAME', state)}${state ? '<COUNTRYNAME>India</COUNTRYNAME>' : ''}${tag('PINCODE', p.pincode)}
      ${p.kind !== 'lender' ? `<GSTREGISTRATIONTYPE>${p.gstin ? 'Regular' : 'Unregistered/Consumer'}</GSTREGISTRATIONTYPE>${tag('PARTYGSTIN', p.gstin)}` : ''}
      ${tag('LEDGERPHONE', p.phone)}${tag('EMAIL', p.email)}${tag('LEDGERCONTACT', p.contact_person)}
      ${p.credit_days ? `<BILLCREDITPERIOD>${p.credit_days} Days</BILLCREDITPERIOD>` : ''}
     </LEDGER>`);
}

function itemMaster(i: ItemRow) {
  return msg(`     <STOCKITEM NAME="${x(i.tally_name || i.name)}">
      <NAME.LIST><NAME>${x(i.tally_name || i.name)}</NAME></NAME.LIST>
      ${tag('BASEUNITS', i.unit || 'Nos')}${tag('DESCRIPTION', i.description)}
      ${i.hsn ? `<GSTDETAILS.LIST><APPLICABLEFROM>20170701</APPLICABLEFROM><HSNCODE>${x(i.hsn)}</HSNCODE><TAXABILITY>Taxable</TAXABILITY></GSTDETAILS.LIST>` : ''}
     </STOCKITEM>`);
}

export async function tallyExport(req: Request, env: Env) {
  await requireStaff(req, env);
  const sp = new URL(req.url).searchParams;
  const part = sp.get('part') === 'masters' ? 'masters' : 'vouchers';
  const from = sp.get('from') ?? '2000-01-01', to = sp.get('to') ?? '2999-12-31';
  const onlyNew = sp.get('only_new') !== '0';
  const include = new Set((sp.get('include') ?? 'sales,purchases,receipts,payments,loans').split(','));
  const s = await getSettings(env);
  const inventory = s.tally_inventory === 'yes';

  const docTypes = [include.has('sales') && 'invoice', include.has('purchases') && 'purchase'].filter(Boolean) as string[];
  const payKinds = [include.has('receipts') && 'receipt', include.has('payments') && 'payment', include.has('loans') && 'loan_received', include.has('loans') && 'loan_repayment'].filter(Boolean) as string[];
  const docs = docTypes.length ? (await env.DB.prepare(
    `SELECT * FROM documents WHERE type IN (${docTypes.map(() => '?').join(',')}) AND status NOT IN ('draft', 'cancelled') AND doc_date BETWEEN ? AND ? ${onlyNew ? 'AND tally_exported_at IS NULL' : ''} ORDER BY doc_date, id`,
  ).bind(...docTypes, from, to).all<any>()).results : [];
  const pays = payKinds.length ? (await env.DB.prepare(
    `SELECT x.*, d.number AS doc_number, d.ref_no AS doc_ref FROM payments x LEFT JOIN documents d ON d.id = x.doc_id
      WHERE x.kind IN (${payKinds.map(() => '?').join(',')}) AND x.cancelled = 0 AND x.pay_date BETWEEN ? AND ? ${onlyNew ? 'AND x.tally_exported_at IS NULL' : ''} ORDER BY x.pay_date, x.id`,
  ).bind(...payKinds, from, to).all<any>()).results : [];

  const partyIds = [...new Set([...docs.map((d) => d.party_id), ...pays.map((p) => p.party_id)].filter(Boolean))];
  const parties = new Map<number, PartyRow>();
  if (partyIds.length) (await env.DB.prepare(`SELECT * FROM parties WHERE id IN (${partyIds.map(() => '?').join(',')})`).bind(...partyIds).all<PartyRow>()).results.forEach((p) => parties.set(p.id, p));

  const lines = new Map<number, any[]>();
  if (docs.length) {
    const { results } = await env.DB.prepare(`SELECT l.*, i.name AS item_name, i.tally_name AS item_tally FROM doc_lines l LEFT JOIN items i ON i.id = l.item_id WHERE l.doc_id IN (${docs.map(() => '?').join(',')}) ORDER BY l.sort, l.id`).bind(...docs.map((d) => d.id)).all<any>();
    for (const l of results) (lines.get(l.doc_id) ?? lines.set(l.doc_id, []).get(l.doc_id)!).push(l);
  }

  // Parties/items that came from Tally (tally_name set) already exist there; only send new ones.
  const newParties = [...parties.values()].filter((p) => !p.tally_name);
  const newItemIds: number[] = [];
  const counts = { documents: docs.length, payments: pays.length, parties: newParties.length, items: 0 };
  let xml: string;
  if (part === 'masters') {
    const blocks = newParties.map((p) => partyMaster(p, s));
    if (inventory) {
      const itemIds = [...new Set([...lines.values()].flat().map((l) => l.item_id).filter(Boolean))];
      if (itemIds.length) {
        // Items that came from Tally already exist there; only send the new ones.
        const { results } = await env.DB.prepare(`SELECT * FROM items WHERE tally_name IS NULL AND id IN (${itemIds.map(() => '?').join(',')})`).bind(...itemIds).all<ItemRow>();
        results.forEach((i) => { blocks.push(itemMaster(i)); newItemIds.push(i.id); });
        counts.items = results.length;
      }
    }
    xml = envelope('All Masters', s.tally_company, blocks.join('\n'));
  } else {
    const blocks: string[] = [];
    for (const d of docs) {
      const p = parties.get(d.party_id)!;
      const pl = ledgerName(p);
      const ls = lines.get(d.id) ?? [];
      const sale = d.type === 'invoice';
      const sign = sale ? 1 : -1; // sales: income/taxes credit (+); purchases: debit (−)
      const vtype = sale ? s.tally_sales_vch : s.tally_purchase_vch;
      const billRef = sale ? d.number : (d.ref_no || d.number);
      const listTag = inventory ? 'LEDGERENTRIES.LIST' : 'ALLLEDGERENTRIES.LIST';
      const head = sale ? s.tally_sales_ledger : s.tally_purchase_ledger;
      const out: string[] = [];
      out.push(entry(pl, -sign * d.total, bill(billRef, 'New Ref', -sign * d.total, p.credit_days), listTag, true));
      if (inventory) {
        for (const l of ls) {
          const item = l.item_tally || l.item_name;
          const ledger = rateLedger(head, l.gst_rate);
          if (item) out.push(`      <ALLINVENTORYENTRIES.LIST>${tag('STOCKITEMNAME', item)}<ISDEEMEDPOSITIVE>${sale ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE><RATE>${amt(l.rate)}/${x(l.unit || 'Nos')}</RATE>${l.discount_pct ? `<DISCOUNT>${l.discount_pct}</DISCOUNT>` : ''}<AMOUNT>${amt(sign * l.taxable)}</AMOUNT><ACTUALQTY> ${l.qty} ${x(l.unit || 'Nos')}</ACTUALQTY><BILLEDQTY> ${l.qty} ${x(l.unit || 'Nos')}</BILLEDQTY>
       <ACCOUNTINGALLOCATIONS.LIST>${tag('LEDGERNAME', ledger)}<ISDEEMEDPOSITIVE>${sale ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE><AMOUNT>${amt(sign * l.taxable)}</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>`);
          else out.push(entry(ledger, sign * l.taxable, '', listTag));
        }
      } else {
        const byLedger = new Map<string, number>();
        for (const l of ls) { const k = rateLedger(head, l.gst_rate); byLedger.set(k, r2((byLedger.get(k) ?? 0) + l.taxable)); }
        for (const [ledger, v] of byLedger) out.push(entry(ledger, sign * v, '', listTag));
      }
      const taxes: [string, number][] = sale
        ? [[s.tally_cgst_out, d.cgst], [s.tally_sgst_out, d.sgst], [s.tally_igst_out, d.igst]]
        : [[s.tally_cgst_in, d.cgst], [s.tally_sgst_in, d.sgst], [s.tally_igst_in, d.igst]];
      for (const [ledger, v] of taxes) if (v) out.push(entry(ledger, sign * v, '', listTag));
      if (d.round_off) out.push(entry(s.tally_round_off, sign * d.round_off, '', listTag));
      const narration = `${sale ? 'Invoice' : 'Bill'} ${billRef}${d.subject ? `: ${d.subject}` : ''}${d.ref_no && sale ? ` | PO ${d.ref_no}` : ''}`;
      blocks.push(msg(`     <VOUCHER VCHTYPE="${x(vtype)}" ACTION="Create" OBJVIEW="${inventory ? 'Invoice Voucher View' : 'Accounting Voucher View'}">
      <DATE>${tdate(d.doc_date)}</DATE><EFFECTIVEDATE>${tdate(d.doc_date)}</EFFECTIVEDATE>
      ${tag('VOUCHERTYPENAME', vtype)}${tag('VOUCHERNUMBER', d.number)}${tag('REFERENCE', sale ? d.ref_no : d.ref_no)}${d.ref_date ? `<REFERENCEDATE>${tdate(d.ref_date)}</REFERENCEDATE>` : ''}
      ${tag('PARTYLEDGERNAME', pl)}${tag('PARTYNAME', d.party_name)}${tag('PARTYGSTIN', d.party_gstin)}
      ${tag('STATENAME', stateName(d.party_state_code || ''))}${tag('PLACEOFSUPPLY', stateName(d.place_of_supply || ''))}
      ${tag('NARRATION', narration)}
      <PERSISTEDVIEW>${inventory ? 'Invoice Voucher View' : 'Accounting Voucher View'}</PERSISTEDVIEW><ISINVOICE>${inventory ? 'Yes' : 'No'}</ISINVOICE>
${out.join('\n')}
     </VOUCHER>`));
    }
    for (const pay of pays) {
      const p = parties.get(pay.party_id)!;
      const pl = ledgerName(p);
      const cash = pay.mode === 'cash' ? s.tally_cash_ledger : s.tally_bank_ledger;
      const inflow = pay.kind === 'receipt' || pay.kind === 'loan_received';
      const vtype = inflow ? s.tally_receipt_vch : s.tally_payment_vch;
      const out: string[] = [];
      if (pay.kind === 'receipt') {
        const settled = r2(pay.amount + pay.tds);
        out.push(entry(pl, settled, pay.doc_number ? bill(pay.doc_number, 'Agst Ref', settled) : bill('', 'On Account', settled), 'ALLLEDGERENTRIES.LIST', true));
        out.push(entry(cash, -pay.amount));
        if (pay.tds) out.push(entry(s.tally_tds_ledger, -pay.tds));
      } else if (pay.kind === 'payment') {
        const ref = pay.doc_ref || pay.doc_number;
        out.push(entry(pl, -pay.amount, ref ? bill(ref, 'Agst Ref', -pay.amount) : bill('', 'On Account', -pay.amount), 'ALLLEDGERENTRIES.LIST', true));
        out.push(entry(cash, pay.amount));
      } else if (pay.kind === 'loan_received') {
        out.push(entry(pl, pay.amount, '', 'ALLLEDGERENTRIES.LIST', true));
        out.push(entry(cash, -pay.amount));
      } else {
        out.push(entry(pl, -r2(pay.amount - pay.interest), '', 'ALLLEDGERENTRIES.LIST', true));
        if (pay.interest) out.push(entry(s.tally_interest_ledger, -pay.interest));
        out.push(entry(cash, pay.amount));
      }
      const narration = [pay.kind.replace('_', ' '), pay.mode.toUpperCase(), pay.reference, pay.notes].filter(Boolean).join(' | ');
      blocks.push(msg(`     <VOUCHER VCHTYPE="${x(vtype)}" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <DATE>${tdate(pay.pay_date)}</DATE><EFFECTIVEDATE>${tdate(pay.pay_date)}</EFFECTIVEDATE>
      ${tag('VOUCHERTYPENAME', vtype)}${tag('VOUCHERNUMBER', pay.number)}${tag('PARTYLEDGERNAME', pl)}${tag('NARRATION', narration)}
      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
${out.join('\n')}
     </VOUCHER>`));
    }
    xml = envelope('Vouchers', s.tally_company, blocks.join('\n'));
  }
  return json({ part, xml, counts, doc_ids: docs.map((d) => d.id), payment_ids: pays.map((p) => p.id), party_ids: newParties.map((p) => p.id), item_ids: newItemIds });
}

/** Marks entries as sent to Tally so the next export skips them. */
export async function tallyMark(req: Request, env: Env) {
  await requireStaff(req, env);
  const b = await readJson<Record<string, any>>(req, 500_000);
  const docIds = (Array.isArray(b.doc_ids) ? b.doc_ids : []).map(Number).filter(Boolean);
  const payIds = (Array.isArray(b.payment_ids) ? b.payment_ids : []).map(Number).filter(Boolean);
  const value = b.undo ? null : new Date().toISOString().slice(0, 19).replace('T', ' ');
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < docIds.length; i += 90) { const c = docIds.slice(i, i + 90); stmts.push(env.DB.prepare(`UPDATE documents SET tally_exported_at = ? WHERE id IN (${c.map(() => '?').join(',')})`).bind(value, ...c)); }
  for (let i = 0; i < payIds.length; i += 90) { const c = payIds.slice(i, i + 90); stmts.push(env.DB.prepare(`UPDATE payments SET tally_exported_at = ? WHERE id IN (${c.map(() => '?').join(',')})`).bind(value, ...c)); }
  // Masters now exist in Tally under the same name.
  const partyIds = (Array.isArray(b.party_ids) ? b.party_ids : []).map(Number).filter(Boolean);
  const itemIds = (Array.isArray(b.item_ids) ? b.item_ids : []).map(Number).filter(Boolean);
  if (!b.undo) {
    for (let i = 0; i < partyIds.length; i += 90) { const c = partyIds.slice(i, i + 90); stmts.push(env.DB.prepare(`UPDATE parties SET tally_name = name WHERE tally_name IS NULL AND id IN (${c.map(() => '?').join(',')})`).bind(...c)); }
    for (let i = 0; i < itemIds.length; i += 90) { const c = itemIds.slice(i, i + 90); stmts.push(env.DB.prepare(`UPDATE items SET tally_name = name WHERE tally_name IS NULL AND id IN (${c.map(() => '?').join(',')})`).bind(...c)); }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, documents: docIds.length, payments: payIds.length, parties: partyIds.length, items: itemIds.length });
}

/** Admin: wipe imported masters that are unused (to redo a bad import). */
export async function purgeUnused(req: Request, env: Env) {
  await requireAdmin(req, env);
  const b = await readJson<Record<string, any>>(req);
  if (b.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm');
  if (b.entity === 'items') {
    const r = await env.DB.prepare('DELETE FROM items WHERE id NOT IN (SELECT item_id FROM doc_lines WHERE item_id IS NOT NULL)').run();
    return json({ ok: true, deleted: r.meta.changes });
  }
  if (b.entity === 'parties') {
    const r = await env.DB.prepare(`DELETE FROM parties WHERE id NOT IN (SELECT party_id FROM documents WHERE party_id IS NOT NULL)
      AND id NOT IN (SELECT party_id FROM payments) AND id NOT IN (SELECT party_id FROM requests WHERE party_id IS NOT NULL)`).run();
    return json({ ok: true, deleted: r.meta.changes });
  }
  throw new HttpError(400, 'Choose items or parties');
}
