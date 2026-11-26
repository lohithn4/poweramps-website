/**
 * Reads Tally exports and spreadsheets in the browser (nothing is uploaded until you apply).
 * - Tally XML (Masters export) from TallyPrime 1.x–6.x, Tally.ERP 9 or Tally 9 / 7.2:
 *   ledgers → customers / suppliers / lenders, stock items → items
 * - Excel (.xlsx, Excel 2003 XML, HTML saved as .xls) and CSV: any columns, matched to fields automatically
 */

export type Row = Record<string, string | number | undefined>;

/* ---------------- text decoding ---------------- */

export function decodeFile(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  // UTF-16 without BOM: many zero bytes at odd positions
  let zeros = 0;
  for (let i = 1; i < Math.min(b.length, 400); i += 2) if (b[i] === 0) zeros++;
  if (zeros > 100) return new TextDecoder('utf-16le').decode(b);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(b);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(b) : utf8;
}

/** Tally writes control-character references (e.g. &#4;) that strict XML parsers reject. */
export function sanitizeXml(s: string) {
  return s
    .replace(/&#(\d+);/g, (m, d) => { const c = Number(d); return c < 32 && ![9, 10, 13].includes(c) ? '' : m; })
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { const c = parseInt(h, 16); return c < 32 && ![9, 10, 13].includes(c) ? '' : m; })
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/* ---------------- numbers ---------------- */

/** "1,23,456.50 Dr" → 123456.5 (Dr positive, Cr negative); "1500.00/Nos" → 1500; "10 Nos" → 10; "18%" → 18 */
export function parseNum(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;
  let sign = 1;
  if (/\bcr\.?$/i.test(s)) { sign = -1; s = s.replace(/\bcr\.?$/i, ''); }
  else if (/\bdr\.?$/i.test(s)) s = s.replace(/\bdr\.?$/i, '');
  if (/^\(.*\)$/.test(s)) { sign *= -1; s = s.slice(1, -1); }
  const m = s.replace(/[₹,\s]/g, '').match(/^-?\d*\.?\d+/);
  if (!m) return undefined;
  const n = parseFloat(m[0]) * sign;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/* ---------------- Tally XML ---------------- */

const kids = (el: Element, tag: string) => [...el.children].filter((c) => c.tagName.toUpperCase() === tag);
const kid = (el: Element, tag: string) => kids(el, tag)[0];
const txt = (el: Element | undefined | null) => (el?.textContent ?? '').trim();
/** Direct child text, else the last matching descendant (newer Tally nests details in dated lists). */
function val(el: Element, ...tags: string[]): string {
  for (const t of tags) {
    const direct = txt(kid(el, t));
    if (direct) return direct;
    const all = el.getElementsByTagName(t);
    for (let i = all.length - 1; i >= 0; i--) { const v = txt(all[i]); if (v) return v; }
  }
  return '';
}
function nameOf(el: Element) {
  const a = el.getAttribute('NAME');
  if (a) return a.trim();
  const list = el.getElementsByTagName('NAME.LIST')[0];
  return txt(list?.getElementsByTagName('NAME')[0]) || val(el, 'NAME');
}
function aliasOf(el: Element) {
  const list = el.getElementsByTagName('NAME.LIST')[0];
  const names = list ? [...list.getElementsByTagName('NAME')].map(txt) : [];
  return names[1] ?? '';
}

const DEBTORS = ['sundry debtors'];
const CREDITORS = ['sundry creditors'];
const LOANS = ['loans (liability)', 'secured loans', 'unsecured loans', 'bank od a/c', 'bank occ a/c', 'bank od accounts'];
/** Tally's built-in groups (all versions, incl. Tally.ERP 9 / Tally 9 spellings). Ledgers ending here are not parties. */
const RESERVED = new Set([
  'primary', 'bank accounts', 'branch / divisions', 'branch/divisions', 'capital account', 'cash-in-hand', 'cash in hand',
  'current assets', 'current liabilities', 'deposits (asset)', 'direct expenses', 'direct incomes', 'expenses (direct)',
  'expenses (indirect)', 'income (direct)', 'income (indirect)', 'duties & taxes', 'duties and taxes', 'fixed assets',
  'indirect expenses', 'indirect incomes', 'investments', 'loans & advances (asset)', 'misc. expenses (asset)',
  'provisions', 'purchase accounts', 'reserves & surplus', 'retained earnings', 'sales accounts', 'stock-in-hand',
  'suspense a/c', 'profit & loss a/c',
]);

export type PartyKind = 'customer' | 'supplier' | 'lender';
/** A ledger whose group chain is not in the file (common when only ledgers were exported). */
export interface PendingLedger { group: string; row: Row; ob: number }
export interface TallyResult {
  parties: Row[]; items: Row[]; ignored: number; groups: number; company: string; counts: Record<string, number>;
  pending: PendingLedger[]; unresolved: { group: string; count: number; guess: PartyKind | '' }[];
}

/** Sets the type on a ledger and turns Tally's opening balance (negative = debit) into this system's sign. */
export function withKind(row: Row, kind: PartyKind, ob: number): Row {
  return { ...row, kind, opening_balance: kind === 'customer' ? -ob : ob };
}

export function parseTallyXml(raw: string): TallyResult {
  const doc = new DOMParser().parseFromString(sanitizeXml(raw), 'text/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('This XML file could not be read. Export again from Tally using “XML (Data Interchange)” format.');

  const parentOf = new Map<string, string>();
  const display = new Map<string, string>();
  for (const g of doc.getElementsByTagName('GROUP')) {
    const n = nameOf(g);
    parentOf.set(n.toLowerCase(), val(g, 'PARENT').trim().replace(/^\W*(?=primary$)/i, ''));
    display.set(n.toLowerCase(), n);
  }
  /** Walks up the group chain. Returns the party type, null (not a party), or the unknown top group's name. */
  const classify = (parent: string): PartyKind | null | { unknown: string } => {
    let p = parent.trim();
    let custom = '';
    for (let depth = 0; p && depth < 20; depth++) {
      const k = p.toLowerCase();
      if (DEBTORS.includes(k)) return 'customer';
      if (CREDITORS.includes(k)) return 'supplier';
      if (LOANS.includes(k)) return 'lender';
      if (k === 'primary') break;
      if (RESERVED.has(k)) return null;
      custom = display.get(k) ?? p;
      if (!parentOf.has(k)) return { unknown: custom };
      p = parentOf.get(k) ?? '';
    }
    return custom ? { unknown: custom } : null;
  };

  const parties: Row[] = [];
  const pending: PendingLedger[] = [];
  let ignored = 0;
  for (const l of doc.getElementsByTagName('LEDGER')) {
    const name = nameOf(l);
    if (!name) continue;
    const parent = val(l, 'PARENT');
    const kind = classify(parent);
    if (kind === null) { ignored++; continue; }
    // TallyPrime 3.0+: dated LEDMAILINGDETAILS / LEDGSTREGDETAILS lists. Tally.ERP 9 / Prime 1–2: flat tags.
    const mailing = l.getElementsByTagName('LEDMAILINGDETAILS.LIST');
    const mail = mailing.length ? mailing[mailing.length - 1] : l;
    const addrEls = [...(mail.getElementsByTagName('ADDRESS').length ? mail : l).getElementsByTagName('ADDRESS')];
    const ob = parseNum(val(l, 'OPENINGBALANCE')) ?? 0; // Tally: negative = debit
    const credit = val(l, 'BILLCREDITPERIOD').match(/\d+/);
    const row: Row = {
      name, tally_name: name,
      gstin: (val(l, 'PARTYGSTIN') || val(l, 'GSTIN')).toUpperCase(),
      state: val(mail, 'STATE') || val(l, 'LEDSTATENAME', 'STATENAME'),
      address: addrEls.map(txt).filter(Boolean).join(', '),
      pincode: val(mail, 'PINCODE') || val(l, 'PINCODE'),
      phone: val(l, 'LEDGERMOBILE', 'LEDGERPHONE'),
      email: val(l, 'EMAIL'),
      contact_person: val(l, 'LEDGERCONTACT'),
      credit_days: credit ? Number(credit[0]) : undefined,
    };
    if (typeof kind === 'string') parties.push(withKind(row, kind, ob));
    else pending.push({ group: kind.unknown || parent || '(no group)', row, ob });
  }
  const byGroup = new Map<string, number>();
  pending.forEach((p) => byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + 1));
  const unresolved = [...byGroup].map(([group, count]) => ({ group, count, guess: kindFrom(group, '') as PartyKind | '' }));

  const items: Row[] = [];
  for (const s of doc.getElementsByTagName('STOCKITEM')) {
    const name = nameOf(s);
    if (!name) continue;
    let gst: number | undefined;
    for (const rd of s.getElementsByTagName('RATEDETAILS.LIST')) {
      const head = val(rd, 'GSTRATEDUTYHEAD').toLowerCase();
      const r = parseNum(val(rd, 'GSTRATE'));
      if (r === undefined) continue;
      if (head.includes('igst') || head.includes('integrated')) gst = r;
      else if (gst === undefined && (head.includes('cgst') || head.includes('central'))) gst = r * 2;
    }
    const lastRate = (listTag: string) => { const l = s.getElementsByTagName(listTag); return l.length ? parseNum(val(l[l.length - 1], 'RATE')) : undefined; };
    items.push({
      name, tally_name: name, code: aliasOf(s) || undefined,
      category: val(s, 'PARENT').replace(/^\W*primary$/i, '') || undefined,
      unit: val(s, 'BASEUNITS') || undefined,
      hsn: (val(s, 'HSNCODE') || val(s, 'HSN')).replace(/\s/g, '') || undefined,
      gst_rate: gst,
      description: val(s, 'DESCRIPTION') || undefined,
      opening_qty: parseNum(val(s, 'OPENINGBALANCE')),
      purchase_rate: lastRate('STANDARDCOSTLIST.LIST') ?? parseNum(val(s, 'OPENINGRATE')),
      sale_rate: lastRate('STANDARDPRICELIST.LIST'),
    });
  }
  const company = txt(doc.getElementsByTagName('SVCURRENTCOMPANY')[0]);
  const counts = { customer: 0, supplier: 0, lender: 0 } as Record<string, number>;
  parties.forEach((p) => counts[p.kind as string]++);
  return { parties, items, ignored, groups: parentOf.size, company, counts, pending, unresolved };
}

/* ---------------- Excel ---------------- */

/** Reads the first sheet of an .xlsx file (TallyPrime "Excel" export, or any workbook). No library needed. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This Excel file could not be read. Save it as CSV and try again.');
  const entries = new Map<string, { method: number; size: number; offset: number }>();
  let p = dv.getUint32(eocd + 16, true);
  const count = dv.getUint16(eocd + 10, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    entries.set(dec.decode(b.subarray(p + 46, p + 46 + nl)), { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), offset: dv.getUint32(p + 42, true) });
    p += 46 + nl + el + cl;
  }
  const read = async (name: string): Promise<string | null> => {
    const e = entries.get(name);
    if (!e) return null;
    const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
    const data = b.slice(start, start + e.size);
    if (e.method === 0) return dec.decode(data);
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(stream).arrayBuffer());
  };
  const xml = (s: string) => new DOMParser().parseFromString(s, 'text/xml');
  const all = (d: Document | Element, tag: string) => [...d.getElementsByTagNameNS('*', tag)];

  // First sheet in workbook order
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = all(xml(wb), 'sheet')[0];
    const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = all(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  }
  const ssText = await read('xl/sharedStrings.xml');
  const shared = ssText ? all(xml(ssText), 'si').map((si) => all(si, 't').filter((t) => !t.parentElement || t.parentElement.localName !== 'rPh').map((t) => t.textContent ?? '').join('')) : [];
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('No worksheet found in this Excel file.');
  const colIdx = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const rows: string[][] = [];
  for (const r of all(xml(sheet), 'row')) {
    const out: string[] = [];
    let next = 0;
    for (const c of all(r, 'c')) {
      const ref = c.getAttribute('r');
      const i = ref ? colIdx(ref) : next;
      const t = c.getAttribute('t');
      const v = all(c, 'v')[0]?.textContent ?? '';
      out[i] = t === 's' ? (shared[Number(v)] ?? '') : t === 'inlineStr' ? all(c, 't').map((x) => x.textContent).join('') : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
      next = i + 1;
    }
    rows.push(Array.from(out, (x) => (x ?? '').trim()));
  }
  return rows.filter((r) => r.some(Boolean));
}

/** Excel 2003 XML ("XML Spreadsheet") and HTML tables saved as .xls, which older Tally and other software produce. */
export function readTableMarkup(text: string): string[][] | null {
  if (/<Workbook[^>]*urn:schemas-microsoft-com:office:spreadsheet/i.test(text)) {
    const d = new DOMParser().parseFromString(sanitizeXml(text), 'text/xml');
    const ws = d.getElementsByTagNameNS('*', 'Worksheet')[0];
    if (!ws) return null;
    return [...ws.getElementsByTagNameNS('*', 'Row')].map((r) => {
      const out: string[] = [];
      let i = 0;
      for (const c of r.getElementsByTagNameNS('*', 'Cell')) {
        const idx = c.getAttribute('ss:Index') ?? c.getAttributeNS('urn:schemas-microsoft-com:office:spreadsheet', 'Index');
        if (idx) i = Number(idx) - 1;
        out[i++] = (c.getElementsByTagNameNS('*', 'Data')[0]?.textContent ?? '').trim();
      }
      return Array.from(out, (x) => x ?? '');
    }).filter((r) => r.some(Boolean));
  }
  if (/<table[\s>]/i.test(text)) {
    const d = new DOMParser().parseFromString(text, 'text/html');
    return [...d.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())).filter((r) => r.some(Boolean));
  }
  return null;
}

/** Tally reports put the company name, address and period above the column headings: find the real header row. */
export function findHeaderRow(rows: string[][]): number {
  const syn = new Set<string>();
  for (const e of Object.values(FIELDS)) for (const [, , s] of e) (s as readonly string[]).forEach((x) => syn.add(x));
  for (let i = 0; i < Math.min(rows.length - 1, 25); i++) {
    if (rows[i].filter((c) => syn.has(norm(c))).length >= 2) return i;
  }
  return 0;
}

/* ---------------- CSV ---------------- */

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

export const FIELDS = {
  parties: [
    ['name', 'Name *', ['name', 'party name', 'ledger name', 'ledger', 'particulars', 'customer name', 'supplier name', 'party', 'company']],
    ['kind', 'Type / group', ['type', 'kind', 'group', 'under', 'ledger group', 'parent', 'category']],
    ['gstin', 'GSTIN', ['gstin', 'gstin/uin', 'gst no', 'gst no.', 'gst number', 'gstin no', 'gst']],
    ['state', 'State', ['state', 'state name']],
    ['address', 'Address', ['address', 'address 1', 'billing address']],
    ['city', 'City', ['city', 'town', 'district']],
    ['pincode', 'PIN code', ['pincode', 'pin code', 'pin', 'zip']],
    ['phone', 'Phone', ['phone', 'mobile', 'mobile no', 'phone no', 'contact no', 'telephone']],
    ['email', 'Email', ['email', 'e-mail', 'email id', 'mail']],
    ['contact_person', 'Contact person', ['contact person', 'contact', 'contact name']],
    ['credit_days', 'Credit days', ['credit days', 'credit period', 'credit period days']],
    ['opening_balance', 'Balance (single column)', ['opening balance', 'balance', 'closing balance', 'outstanding', 'amount', 'opening']],
    ['debit', 'Debit column', ['debit', 'dr', 'debit amount']],
    ['credit', 'Credit column', ['credit', 'cr', 'credit amount']],
    ['tally_name', 'Tally ledger name', ['tally name', 'tally ledger', 'alias']],
  ],
  items: [
    ['name', 'Item name *', ['name', 'item', 'item name', 'stock item', 'product', 'particulars', 'material']],
    ['code', 'Code / part no.', ['code', 'item code', 'part no', 'part no.', 'part number', 'sku', 'alias', 'cat no']],
    ['make', 'Make / brand', ['make', 'brand', 'manufacturer']],
    ['category', 'Category', ['category', 'group', 'stock group', 'under', 'type']],
    ['hsn', 'HSN / SAC', ['hsn', 'hsn/sac', 'hsn code', 'sac', 'hsn sac']],
    ['gst_rate', 'GST %', ['gst', 'gst %', 'gst rate', 'tax rate', 'igst', 'igst %', 'rate of tax', 'tax %']],
    ['unit', 'Unit', ['unit', 'uom', 'units', 'base unit', 'unit of measure']],
    ['sale_rate', 'Selling rate', ['sale rate', 'selling rate', 'selling price', 'sales rate', 'price', 'mrp', 'rate', 'list price']],
    ['purchase_rate', 'Purchase rate', ['purchase rate', 'cost', 'cost price', 'purchase price', 'buying price']],
    ['opening_qty', 'Stock / opening qty', ['opening qty', 'opening quantity', 'quantity', 'qty', 'stock', 'closing qty', 'closing quantity', 'closing stock']],
    ['reorder_level', 'Reorder level', ['reorder level', 'reorder', 'min stock', 'minimum stock']],
    ['description', 'Description', ['description', 'details', 'remarks']],
  ],
} as const;

export type Entity = keyof typeof FIELDS;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%/]+/g, ' ').trim();

/** Best guess of which CSV column feeds each field. */
export function guessMapping(entity: Entity, headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  const H = headers.map(norm);
  for (const [key, , syn] of FIELDS[entity]) {
    let idx = H.findIndex((h, i) => !used.has(i) && (syn as readonly string[]).includes(h));
    if (idx < 0) idx = H.findIndex((h, i) => !used.has(i) && (syn as readonly string[]).some((s) => s.length > 3 && h.includes(s)));
    if (idx >= 0) { map[key] = idx; used.add(idx); }
  }
  return map;
}

export function kindFrom(v: unknown, fallback: string): string {
  const s = String(v ?? '').toLowerCase();
  if (/debtor|customer|client|buyer/.test(s)) return 'customer';
  if (/creditor|supplier|vendor/.test(s)) return 'supplier';
  if (/loan|lender|od a\/c|occ|borrow/.test(s)) return 'lender';
  return fallback;
}

/** Applies a column mapping to CSV rows, producing rows for the import API. */
export function mapRows(entity: Entity, rows: string[][], mapping: Record<string, number>, defaultKind: string): Row[] {
  return rows.map((r) => {
    const get = (k: string) => (mapping[k] !== undefined && mapping[k] >= 0 ? r[mapping[k]] : undefined);
    if (entity === 'items') {
      const o: Row = {};
      for (const [k] of FIELDS.items) {
        const v = get(k);
        if (v === undefined || v === '') continue;
        o[k] = ['gst_rate', 'sale_rate', 'purchase_rate', 'opening_qty', 'reorder_level'].includes(k) ? parseNum(v) : v;
      }
      return o;
    }
    const kind = kindFrom(get('kind'), defaultKind);
    const o: Row = { kind };
    for (const k of ['name', 'gstin', 'state', 'address', 'city', 'pincode', 'phone', 'email', 'contact_person', 'tally_name']) { const v = get(k); if (v) o[k] = v; }
    const cd = parseNum(get('credit_days')); if (cd !== undefined) o.credit_days = cd;
    // Balances: single column (Dr/Cr aware) or separate debit/credit columns. Stored from the party's side.
    let debitView: number | undefined;
    const single = parseNum(get('opening_balance'));
    if (single !== undefined) debitView = single;
    const dr = parseNum(get('debit')), cr = parseNum(get('credit'));
    if (dr !== undefined || cr !== undefined) debitView = (dr ?? 0) - Math.abs(cr ?? 0);
    if (debitView !== undefined) o.opening_balance = kind === 'customer' ? debitView : (single !== undefined && !/dr|cr/i.test(String(get('opening_balance'))) ? single : -debitView);
    return o;
  });
}

export const TEMPLATES: Record<Entity, string[]> = {
  parties: ['Type', 'Name', 'GSTIN', 'State', 'Address', 'City', 'PIN code', 'Phone', 'Email', 'Contact person', 'Credit days', 'Opening balance', 'Tally name'],
  items: ['Item name', 'Code', 'Make', 'Category', 'HSN', 'GST %', 'Unit', 'Sale rate', 'Purchase rate', 'Opening qty', 'Reorder level', 'Description'],
};
