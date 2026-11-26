/** Shared helpers for the staff ERP screens. */
import { api } from './api';
import { esc } from './ui';
import { inrFmt, STATES } from '../../shared/calc';

export const money = (n: number | null | undefined, dec = 2) => (n == null ? '—' : `₹ ${inrFmt(Number(n), dec)}`);
export const money0 = (n: number | null | undefined) => money(n, 0);

export const DOC_LABEL: Record<string, string> = { boq: 'BOQ', quotation: 'Quotation', invoice: 'Tax invoice', purchase: 'Purchase bill' };
export const DOC_PLURAL: Record<string, string> = { boq: 'BOQs', quotation: 'Quotations', invoice: 'Tax invoices', purchase: 'Purchase bills' };
export const PAY_LABEL: Record<string, string> = { receipt: 'Receipt', payment: 'Payment', loan_received: 'Loan received', loan_repayment: 'Loan repayment' };
export const KIND_LABEL: Record<string, string> = { customer: 'Customer', supplier: 'Supplier', lender: 'Lender' };

const DOC_TONE: Record<string, string> = { draft: 'muted', issued: 'blue', sent: 'violet', accepted: 'green', cancelled: 'muted' };
const DOC_STATUS: Record<string, string> = { draft: 'Draft', issued: 'Issued', sent: 'Sent', accepted: 'Accepted', cancelled: 'Cancelled' };
export const docBadge = (s: string) => `<span class="badge badge--${DOC_TONE[s] ?? 'muted'}">${DOC_STATUS[s] ?? esc(s)}</span>`;

/** Payment state of an invoice or purchase bill. */
export function payBadge(d: { type: string; status: string; total: number; paid: number; due_date?: string | null }) {
  if (!['invoice', 'purchase'].includes(d.type) || d.status === 'draft' || d.status === 'cancelled') return '';
  const due = d.total - (d.paid || 0);
  if (due <= 0.5) return '<span class="badge badge--done">Paid</span>';
  const overdue = d.due_date && d.due_date < new Date().toISOString().slice(0, 10);
  if (d.paid > 0) return `<span class="badge badge--amber">Part paid</span>${overdue ? ' <span class="badge badge--red">Overdue</span>' : ''}`;
  return overdue ? '<span class="badge badge--red">Overdue</span>' : '<span class="badge badge--outline">Unpaid</span>';
}

export const stateOptions = (selected = '') =>
  `<option value="">Select state</option>` + Object.entries(STATES).map(([c, n]) => `<option value="${c}"${c === selected ? ' selected' : ''}>${c} - ${esc(n)}</option>`).join('');

export function fmtD(d: string | null | undefined) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/* ---------------- dialogs ---------------- */

/** Opens a <dialog> with a form; resolves with the form values or null if cancelled. */
export function formDialog(opts: { title: string; body: string; submit?: string; wide?: boolean; onOpen?: (form: HTMLFormElement) => void; onSubmit: (data: Record<string, string>, form: HTMLFormElement) => Promise<unknown> }) {
  return new Promise<unknown>((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `edlg${opts.wide ? ' edlg--wide' : ''}`;
    dlg.innerHTML = `<form class="edlg__in pform" novalidate>
      <div class="edlg__h"><h2>${esc(opts.title)}</h2><button type="button" class="edlg__x" aria-label="Close" data-x>×</button></div>
      <div class="edlg__b">${opts.body}</div>
      <p class="form-error" data-error hidden></p>
      <div class="edlg__f"><button type="button" class="btn btn--ghost btn--sm" data-x>Cancel</button><button type="submit" class="btn btn--primary btn--sm">${esc(opts.submit ?? 'Save')}</button></div>
    </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form')!;
    const close = (v: unknown) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => close(null)));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector<HTMLElement>('[data-error]')!;
      const btn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
      err.hidden = true; btn.classList.add('is-busy'); btn.disabled = true;
      const data: Record<string, string> = {};
      new FormData(form).forEach((v, k) => { data[k] = String(v); });
      form.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) => { if (c.name) data[c.name] = c.checked ? '1' : ''; });
      try { close(await opts.onSubmit(data, form) ?? true); }
      catch (ex: any) { err.textContent = ex?.message ?? 'Something went wrong'; err.hidden = false; }
      finally { btn.classList.remove('is-busy'); btn.disabled = false; }
    });
    dlg.showModal();
    opts.onOpen?.(form);
    form.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select, textarea')?.focus();
  });
}

export const field = (label: string, input: string, hint = '') => `<label class="field"><span class="flabel">${label}</span>${input}${hint ? `<small class="fhint">${hint}</small>` : ''}</label>`;
export const inp = (name: string, value: unknown = '', attrs = '') => `<input class="input" name="${name}" value="${esc(value ?? '')}" ${attrs} />`;

/* ---------------- party & item forms ---------------- */

export function partyForm(p: any = {}, kind = 'customer') {
  const k = p.kind ?? kind;
  return `<div class="row2">
      ${field('Type', `<select class="input" name="kind">${['customer', 'supplier', 'lender'].map((x) => `<option value="${x}"${x === k ? ' selected' : ''}>${KIND_LABEL[x]}</option>`).join('')}</select>`)}
      ${field('Name *', inp('name', p.name, 'required maxlength="200"'))}
    </div>
    <div class="row2">
      ${field('GSTIN', inp('gstin', p.gstin, 'maxlength="15" style="text-transform:uppercase" placeholder="29ABCDE1234F1Z5"'), 'State is filled from the GSTIN')}
      ${field('State', `<select class="input" name="state_code">${stateOptions(p.state_code ?? '')}</select>`)}
    </div>
    ${field('Address', `<textarea class="input" name="address" rows="2">${esc(p.address ?? '')}</textarea>`)}
    <div class="row3">
      ${field('City', inp('city', p.city))}
      ${field('PIN code', inp('pincode', p.pincode, 'inputmode="numeric" maxlength="6"'))}
      ${field('Credit days', inp('credit_days', p.credit_days, 'type="number" min="0"'))}
    </div>
    <div class="row3">
      ${field('Contact person', inp('contact_person', p.contact_person))}
      ${field('Phone', inp('phone', p.phone, 'type="tel"'))}
      ${field('Email', inp('email', p.email, 'type="email"'))}
    </div>
    <div class="row2">
      ${field('Opening balance (₹)', inp('opening_balance', p.opening_balance ?? 0, 'type="number" step="0.01"'), 'Customer: amount they owe you. Supplier/lender: amount you owe them.')}
      ${field('Name in Tally', inp('tally_name', p.tally_name), 'Only if the ledger name in Tally is different')}
    </div>
    ${field('Notes', `<textarea class="input" name="notes" rows="2">${esc(p.notes ?? '')}</textarea>`)}`;
}

export function itemForm(i: any = {}) {
  return `<div class="row2">
      ${field('Item name *', inp('name', i.name, 'required maxlength="200"'))}
      ${field('Code / part no.', inp('code', i.code))}
    </div>
    <div class="row3">
      ${field('Make / brand', inp('make', i.make))}
      ${field('Category', inp('category', i.category, 'list="item-cats"'))}
      ${field('Unit', inp('unit', i.unit ?? 'Nos', 'list="item-units"'))}
    </div>
    <div class="row3">
      ${field('HSN / SAC', inp('hsn', i.hsn, 'inputmode="numeric" maxlength="8"'))}
      ${field('GST %', `<select class="input" name="gst_rate">${[0, 0.25, 3, 5, 12, 18, 28, 40].map((g) => `<option value="${g}"${Number(i.gst_rate ?? 18) === g ? ' selected' : ''}>${g}%</option>`).join('')}</select>`)}
      ${field('Service (no stock)', `<label class="switch" style="min-height:46px"><input type="checkbox" name="is_service" ${i.is_service ? 'checked' : ''}/> Yes</label>`)}
    </div>
    <div class="row3">
      ${field('Selling rate (₹)', inp('sale_rate', i.sale_rate ?? 0, 'type="number" step="0.01" min="0"'))}
      ${field('Purchase rate (₹)', inp('purchase_rate', i.purchase_rate ?? 0, 'type="number" step="0.01" min="0"'))}
      ${field('Opening stock', inp('opening_qty', i.opening_qty ?? 0, 'type="number" step="0.01"'))}
    </div>
    <div class="row2">
      ${field('Reorder level', inp('reorder_level', i.reorder_level ?? '', 'type="number" step="0.01" min="0"'), 'Warn when stock falls to this level')}
      ${field('Name in Tally', inp('tally_name', i.tally_name))}
    </div>
    ${field('Description', `<textarea class="input" name="description" rows="2">${esc(i.description ?? '')}</textarea>`)}
    <datalist id="item-units">${['Nos', 'Pcs', 'Set', 'Mtr', 'Kg', 'Ltr', 'Box', 'Lot', 'Job', 'Pair', 'Roll'].map((u) => `<option value="${u}">`).join('')}</datalist>`;
}

/** Converts dialog strings into the API shape (blank numbers become null/0). */
export function cleanParty(d: Record<string, string>) {
  return { ...d, gstin: d.gstin.toUpperCase().trim(), opening_balance: Number(d.opening_balance || 0), credit_days: d.credit_days === '' ? null : Number(d.credit_days) };
}
export function cleanItem(d: Record<string, string>) {
  return { ...d, is_service: d.is_service === '1', gst_rate: Number(d.gst_rate), sale_rate: Number(d.sale_rate || 0), purchase_rate: Number(d.purchase_rate || 0), opening_qty: Number(d.opening_qty || 0), reorder_level: d.reorder_level === '' ? null : Number(d.reorder_level) };
}

export async function newPartyDialog(kind = 'customer', p: any = {}) {
  return formDialog({
    title: p.id ? `Edit ${KIND_LABEL[p.kind]?.toLowerCase() ?? 'party'}` : `New ${KIND_LABEL[kind].toLowerCase()}`, wide: true, body: partyForm(p, kind),
    onOpen: (f) => {
      const g = f.elements.namedItem('gstin') as HTMLInputElement, st = f.elements.namedItem('state_code') as HTMLSelectElement;
      g.addEventListener('input', () => { const c = g.value.trim().slice(0, 2); if (/^\d\d$/.test(c) && st.querySelector(`option[value="${c}"]`)) st.value = c; });
    },
    onSubmit: async (d) => p.id ? (await api(`/erp/parties/${p.id}`, { method: 'PATCH', body: cleanParty(d) }), { id: p.id }) : api('/erp/parties', { body: cleanParty(d) }),
  }) as Promise<{ id: number } | null>;
}

export async function newItemDialog(i: any = {}) {
  return formDialog({
    title: i.id ? 'Edit item' : 'New item', wide: true, body: itemForm(i),
    onSubmit: async (d) => i.id ? (await api(`/erp/items/${i.id}`, { method: 'PATCH', body: cleanItem(d) }), { id: i.id }) : api('/erp/items', { body: cleanItem(d) }),
  }) as Promise<{ id: number } | null>;
}

/* ---------------- downloads ---------------- */

export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + content : content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function toCsv(headers: string[], rows: unknown[][]) {
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** dd-Mmm-yyyy, as the GST offline tool expects. */
export function gstDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}-${y}`;
}

export function rowLink(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,button,input,select')) return;
    if (e.ctrlKey || e.metaKey) window.open(tr.dataset.href!, '_blank'); else location.href = tr.dataset.href!;
  }));
}
