/**
 * Shared business maths for the ERP: used by the API (authoritative) and the
 * website (live preview), so totals on screen always match what is saved.
 * Pure functions only: no DOM, no database.
 */

/* ---------------- Indian states (GST state codes) ---------------- */

export const STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '96': 'Outside India',
};

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
/** Finds a state code from a code, GSTIN or (loosely matched) state name. */
export function stateCode(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}$/.test(s)) { const c = s.padStart(2, '0'); return STATES[c] ? c : ''; }
  if (/^\d{2}[A-Z0-9]{13}$/i.test(s)) return STATES[s.slice(0, 2)] ? s.slice(0, 2) : '';
  const n = norm(s);
  const alias: Record<string, string> = { orissa: '21', pondicherry: '34', uttaranchal: '05', newdelhi: '07', nctofdelhi: '07', jammuandkashmir: '01', damananddiu: '26', dadraandnagarhaveli: '26' };
  if (alias[n]) return alias[n];
  for (const [code, name] of Object.entries(STATES)) if (norm(name) === n) return code;
  return '';
}
export const stateName = (code: string) => STATES[code] ?? '';
export const posLabel = (code: string) => (code && STATES[code] ? `${code}-${STATES[code]}` : '');

/* ---------------- GSTIN ---------------- */

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Checks format and the check digit. */
export function validGstin(g: string): boolean {
  const s = String(g ?? '').trim().toUpperCase();
  if (!GSTIN_RE.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(s[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === s[14];
}

/* ---------------- money ---------------- */

export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const num = (v: unknown, d = 0) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : d; };

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

export interface LineIn {
  item_id?: number | null;
  description: string;
  make?: string;
  hsn?: string;
  qty: number;
  unit?: string;
  rate: number;
  discount_pct?: number;
  gst_rate?: number;
  cost_rate?: number;
}
export interface LineOut extends LineIn {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  amount: number;
}
export interface Totals {
  subtotal: number;       // before discounts
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  roundOff: number;
  total: number;
  cost: number;           // BOQ costing
  byRate: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
  byHsn: { hsn: string; description: string; unit: string; qty: number; rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
}

/**
 * Computes every line and the document totals.
 * intra = supplier and place of supply in the same state (CGST + SGST), else IGST.
 */
export function computeDoc(lines: LineIn[], opts: { intra: boolean; roundOff?: boolean; taxed?: boolean }) {
  const taxed = opts.taxed !== false;
  const out: LineOut[] = lines.map((l) => {
    const qty = num(l.qty), rate = num(l.rate), disc = Math.min(100, Math.max(0, num(l.discount_pct)));
    const gst = taxed ? Math.max(0, num(l.gst_rate)) : 0;
    const gross = r2(qty * rate);
    const taxable = r2(gross * (1 - disc / 100));
    let cgst = 0, sgst = 0, igst = 0;
    if (opts.intra) { cgst = r2((taxable * gst) / 200); sgst = cgst; } else igst = r2((taxable * gst) / 100);
    const tax = r2(cgst + sgst + igst);
    return { ...l, qty, rate, discount_pct: disc, gst_rate: gst, taxable, cgst, sgst, igst, tax, amount: r2(taxable + tax) };
  });
  const sum = (k: keyof LineOut) => r2(out.reduce((a, l) => a + (Number(l[k]) || 0), 0));
  const subtotal = r2(out.reduce((a, l) => a + r2(l.qty * l.rate), 0));
  const taxable = sum('taxable'), cgst = sum('cgst'), sgst = sum('sgst'), igst = sum('igst');
  const tax = r2(cgst + sgst + igst);
  const exact = r2(taxable + tax);
  const total = opts.roundOff === false ? exact : Math.round(exact);
  const cost = r2(out.reduce((a, l) => a + num(l.cost_rate) * l.qty, 0));

  const rateMap = new Map<number, Totals['byRate'][number]>();
  const hsnMap = new Map<string, Totals['byHsn'][number]>();
  for (const l of out) {
    const g = l.gst_rate ?? 0;
    const br = rateMap.get(g) ?? { rate: g, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    br.taxable = r2(br.taxable + l.taxable); br.cgst = r2(br.cgst + l.cgst); br.sgst = r2(br.sgst + l.sgst); br.igst = r2(br.igst + l.igst);
    rateMap.set(g, br);
    const hk = `${l.hsn || '-'}|${g}`;
    const bh = hsnMap.get(hk) ?? { hsn: l.hsn || '', description: l.description, unit: l.unit || 'NOS', qty: 0, rate: g, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    bh.qty = r2(bh.qty + l.qty); bh.taxable = r2(bh.taxable + l.taxable); bh.cgst = r2(bh.cgst + l.cgst); bh.sgst = r2(bh.sgst + l.sgst); bh.igst = r2(bh.igst + l.igst);
    hsnMap.set(hk, bh);
  }
  const totals: Totals = {
    subtotal, discount: r2(subtotal - taxable), taxable, cgst, sgst, igst, tax,
    roundOff: r2(total - exact), total: r2(total), cost,
    byRate: [...rateMap.values()].sort((a, b) => a.rate - b.rate),
    byHsn: [...hsnMap.values()],
  };
  return { lines: out, totals };
}

/* ---------------- dates & numbering ---------------- */

export const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST
/** Indian financial year label for a YYYY-MM-DD date, e.g. "26-27". */
export function fyOf(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Fills a number pattern like "PA/{FY}/{NNNN}". */
export function formatNumber(pattern: string, fy: string, seq: number): string {
  return pattern
    .replace(/\{FY\}/g, fy)
    .replace(/\{YYYY\}/g, '20' + fy.slice(0, 2))
    .replace(/\{(N+)\}/g, (_, n: string) => String(seq).padStart(n.length, '0'));
}

/* ---------------- amount in words (Indian system) ---------------- */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n: number) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`; }
function three(n: number) { const h = Math.floor(n / 100), r = n % 100; return [h ? `${ONES[h]} Hundred` : '', r ? two(r) : ''].filter(Boolean).join(' '); }
function intWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${intWords(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return parts.join(' ');
}
export function amountInWords(amount: number): string {
  const a = Math.abs(r2(amount));
  const rupees = Math.floor(a), paise = Math.round((a - rupees) * 100);
  return `Indian Rupees ${intWords(rupees)}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

export const inrFmt = (n: number, dec = 2) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
