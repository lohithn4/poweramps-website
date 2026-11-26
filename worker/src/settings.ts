import { Env, HttpError, json, readJson, requireAdmin, requireStaff } from './lib';
import { getBrand } from './brand';
import { stateCode } from '../../shared/calc';

/**
 * Business settings stored in the private database (never in the public repo):
 * numbering, default terms, bank details and Tally ledger names.
 * Company identity (name, address, GSTIN) comes from the website's brand.json.
 */
export const SETTING_KEYS = [
  'company_state_code',
  'boq_pattern', 'quotation_pattern', 'invoice_pattern', 'purchase_pattern',
  'receipt_pattern', 'payment_pattern', 'loan_received_pattern', 'loan_repayment_pattern',
  'quotation_validity_days', 'invoice_due_days', 'round_off',
  'terms_quotation', 'terms_invoice', 'invoice_footer', 'signatory',
  'bank_name', 'bank_account_name', 'bank_account', 'bank_ifsc', 'bank_branch', 'upi_id',
  'tally_company', 'tally_version', 'tally_inventory', 'tally_sales_ledger', 'tally_purchase_ledger',
  'tally_cgst_out', 'tally_sgst_out', 'tally_igst_out', 'tally_cgst_in', 'tally_sgst_in', 'tally_igst_in',
  'tally_round_off', 'tally_bank_ledger', 'tally_cash_ledger', 'tally_interest_ledger', 'tally_tds_ledger',
  'tally_debtors_group', 'tally_creditors_group', 'tally_loans_group',
  'tally_sales_vch', 'tally_purchase_vch', 'tally_receipt_vch', 'tally_payment_vch',
] as const;
/** Tally releases whose XML layouts differ: Prime 3.0+ moved GST/address details into dated lists. */
export const TALLY_VERSIONS = ['prime3', 'prime1', 'erp9', 'legacy'] as const;
export type TallyVersion = (typeof TALLY_VERSIONS)[number];
export type Settings = Record<(typeof SETTING_KEYS)[number], string> & { company_gstin: string; company_name: string };

async function defaults(env: Env): Promise<Settings> {
  const b = await getBrand(env);
  const p = b.refPrefix;
  return {
    company_gstin: b.gstin,
    company_name: b.legalName,
    company_state_code: stateCode(b.gstin) || stateCode(b.state) || '29',
    boq_pattern: `${p}/BOQ/{FY}/{NNN}`,
    quotation_pattern: `${p}/Q/{FY}/{NNNN}`,
    invoice_pattern: `${p}/{FY}/{NNNN}`,
    purchase_pattern: 'PB/{FY}/{NNNN}',
    receipt_pattern: 'RV/{FY}/{NNNN}',
    payment_pattern: 'PV/{FY}/{NNNN}',
    loan_received_pattern: 'LR/{FY}/{NNN}',
    loan_repayment_pattern: 'LP/{FY}/{NNN}',
    quotation_validity_days: '30',
    invoice_due_days: '30',
    round_off: 'yes',
    terms_quotation: [
      'Prices are exclusive of GST unless stated; GST extra as applicable.',
      'Delivery: 3 to 4 weeks from receipt of technically and commercially clear purchase order and advance.',
      'Payment: 50% advance with PO, balance against proforma invoice before dispatch.',
      'Freight, unloading, installation and commissioning extra unless included above.',
      'Warranty: 12 months from date of supply against manufacturing defects.',
    ].join('\n'),
    terms_invoice: [
      'Goods once sold will not be taken back.',
      'Interest @ 18% p.a. will be charged on payments delayed beyond the due date.',
      'Subject to Bengaluru jurisdiction.',
    ].join('\n'),
    invoice_footer: 'This is a computer-generated document.',
    signatory: 'Authorised Signatory',
    bank_name: '', bank_account_name: '', bank_account: '', bank_ifsc: '', bank_branch: '', upi_id: '',
    tally_company: '',
    tally_version: 'prime3',
    tally_inventory: 'no',
    tally_sales_ledger: 'Sales',
    tally_purchase_ledger: 'Purchase',
    tally_cgst_out: 'Output CGST', tally_sgst_out: 'Output SGST', tally_igst_out: 'Output IGST',
    tally_cgst_in: 'Input CGST', tally_sgst_in: 'Input SGST', tally_igst_in: 'Input IGST',
    tally_round_off: 'Round Off',
    tally_bank_ledger: 'Bank Account',
    tally_cash_ledger: 'Cash',
    tally_interest_ledger: 'Interest Paid',
    tally_tds_ledger: 'TDS Receivable',
    tally_debtors_group: 'Sundry Debtors',
    tally_creditors_group: 'Sundry Creditors',
    tally_loans_group: 'Unsecured Loans',
    tally_sales_vch: 'Sales', tally_purchase_vch: 'Purchase', tally_receipt_vch: 'Receipt', tally_payment_vch: 'Payment',
  };
}

export async function getSettings(env: Env): Promise<Settings> {
  const s = await defaults(env);
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  for (const r of results) if ((SETTING_KEYS as readonly string[]).includes(r.key)) (s as any)[r.key] = r.value;
  return s;
}

export async function readSettings(req: Request, env: Env) {
  await requireStaff(req, env);
  return json({ settings: await getSettings(env), defaults: await defaults(env) });
}

export async function saveSettings(req: Request, env: Env) {
  await requireAdmin(req, env);
  const b = await readJson<Record<string, unknown>>(req);
  const stmts: D1PreparedStatement[] = [];
  for (const k of SETTING_KEYS) {
    if (!(k in b)) continue;
    const v = typeof b[k] === 'string' ? (b[k] as string).trim() : String(b[k] ?? '');
    if (v.length > 4000) throw new HttpError(400, `${k} is too long`);
    if (k === 'tally_version' && !(TALLY_VERSIONS as readonly string[]).includes(v)) throw new HttpError(400, 'Unknown Tally version');
    if (k.endsWith('_pattern') && v && !/\{N+\}/.test(v)) throw new HttpError(400, 'Number formats must contain a counter like {NNNN}');
    if (k.endsWith('_pattern') && v.replace(/\{FY\}/g, '00-00').replace(/\{YYYY\}/g, '0000').replace(/\{(N+)\}/g, (_, n) => '0'.repeat(n.length)).length > 16)
      throw new HttpError(400, 'GST rules allow at most 16 characters in a document number');
    stmts.push(env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(k, v));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, settings: await getSettings(env) });
}
