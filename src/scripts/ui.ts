/** Small DOM/format helpers shared by the portal pages. */

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export const inr = (n: number | null | undefined) =>
  n == null ? '—' : '₹ ' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export function fmtDate(s: string | null | undefined, withTime = false) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-IN', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

const TONE: Record<string, string> = {
  pending_verification: 'muted', new: 'blue', reviewing: 'amber', quoted: 'violet', accepted: 'green',
  in_design: 'blue', in_production: 'blue', testing: 'amber', ready: 'green', dispatched: 'green',
  delivered: 'done', on_hold: 'amber', cancelled: 'muted',
};
export const statusBadge = (status: string, labels: Record<string, string>) =>
  `<span class="badge badge--${TONE[status] ?? 'muted'}">${esc(labels[status] ?? status)}</span>`;

export const kindBadge = (kind: string) =>
  `<span class="badge badge--${kind === 'order' ? 'red' : 'outline'}">${kind === 'order' ? 'Order' : 'Quote'}</span>`;

/** Client-facing tracker stages. */
export const STAGES = ['new', 'reviewing', 'quoted', 'accepted', 'in_design', 'in_production', 'testing', 'dispatched', 'delivered'] as const;
export const STAGE_LABEL: Record<string, string> = {
  new: 'Received', reviewing: 'Review', quoted: 'Quoted', accepted: 'Confirmed', in_design: 'Design',
  in_production: 'Fabrication', testing: 'Testing', dispatched: 'Dispatched', delivered: 'Delivered',
};

export function tracker(status: string) {
  const map: Record<string, string> = { ready: 'testing', pending_verification: 'new' };
  const idx = STAGES.indexOf((map[status] ?? status) as any);
  return `<ol class="tracker${status === 'cancelled' ? ' tracker--off' : ''}">${STAGES.map((s, i) =>
    `<li class="${i < idx ? 'is-done' : i === idx ? 'is-current' : ''}"><span class="tracker__dot"></span><span class="tracker__label">${STAGE_LABEL[s]}</span></li>`,
  ).join('')}</ol>`;
}

export function toast(msg: string, tone: 'ok' | 'err' = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 300); }, 3600);
}

/** Wires a <form> to an async handler with busy state and inline error. */
export function bindForm(form: HTMLFormElement, handler: (data: Record<string, string>) => Promise<void>) {
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const err = form.querySelector<HTMLElement>('[data-error]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (err) err.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    btn?.setAttribute('disabled', '');
    btn?.classList.add('is-busy');
    try {
      await handler(data);
    } catch (ex: any) {
      if (ex?.message === 'redirecting') return;
      if (err) { err.textContent = ex?.message ?? 'Something went wrong'; err.hidden = false; }
      else toast(ex?.message ?? 'Something went wrong', 'err');
    } finally {
      btn?.removeAttribute('disabled');
      btn?.classList.remove('is-busy');
    }
  });
}

export const qs = (k: string) => new URLSearchParams(location.search).get(k);
