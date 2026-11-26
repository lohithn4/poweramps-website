import { api, getMe, sitePath, type Me } from './api';
import { $, $$, esc, toast } from './ui';
const BRAND = document.documentElement.dataset.brand || 'us';
import {
  APPS, HP_SIZES, AMP_SIZES, MOTOR_PRESETS, FEEDER_PRESETS, blankConfig, appOf, compute, summaryHTML, panelSVG,
  motorAmps, suggestedStarter, newId, normalize, type PanelConfig, type Motor, type Feeder,
} from './panel';

const KEY = 'builder_draft_v1';
const STEPS = 6;
const root = $('[data-builder]');
const form = $<HTMLFormElement>('[data-form]', root);

interface Draft { step: number; maxStep: number; config: PanelConfig; contact: { name: string; email: string; phone: string; company: string } }
const blankDraft = (): Draft => ({ step: 0, maxStep: 0, config: blankConfig(), contact: { name: '', email: '', phone: '', company: '' } });

function load(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (d?.config) return { ...blankDraft(), ...d, config: normalize(d.config) };
  } catch {}
  return blankDraft();
}
let draft = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch {} };
let me: Me | null = null;

/* ---------- path helpers for name="a.b" bindings ---------- */
const getPath = (obj: any, path: string) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj: any, path: string, val: unknown) {
  const ks = path.split('.');
  const last = ks.pop()!;
  ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = val;
}
const target = (name: string) => (name.startsWith('contact.') ? draft : draft.config);
const keyOf = (name: string) => name;

/* ---------- inputs <-> state ---------- */
function fillInputs() {
  for (const el of $$<HTMLInputElement>('input[name], select[name], textarea[name]', form)) {
    const name = el.name;
    if (name === 'submitKind') continue;
    const val = getPath(target(name), keyOf(name));
    if (el.type === 'radio') el.checked = String(val) === el.value;
    else if (el.type === 'checkbox') el.checked = Array.isArray(val) ? val.includes(el.value) : !!val;
    else el.value = val ?? '';
  }
}

form.addEventListener('input', onField);
form.addEventListener('change', onField);
function onField(e: Event) {
  const el = e.target as HTMLInputElement;
  if (!el.name || el.closest('[data-motor-list],[data-feeder-list]')) return;
  if (el.name === 'submitKind') { updateSubmitLabel(); return; }
  const name = el.name;
  let val: unknown;
  if (el.type === 'checkbox') {
    const group = $$<HTMLInputElement>(`input[type=checkbox][name="${name}"]`, form);
    val = group.length > 1 ? group.filter((g) => g.checked).map((g) => g.value) : el.checked;
  } else if (el.type === 'radio') {
    if (!el.checked) return;
    val = el.value;
  } else val = el.hasAttribute('data-num') ? Number(el.value) || 0 : el.value;
  setPath(target(name), keyOf(name), val);
  if (name === 'application') onAppChange();
  save();
  refresh();
}

function onAppChange() {
  const c = draft.config;
  const app = appOf(c.application);
  if ((app?.loads === 'motors') && !c.motors.length) {
    const p = MOTOR_PRESETS[c.application] ?? MOTOR_PRESETS.motor;
    c.motors = [mkMotor(p[0], 7.5), mkMotor(p[1], 15)];
  }
  if (app?.loads === 'feeders' && !c.feeders.length) {
    c.feeders = [mkFeeder('Lighting DB', 63, 'MCCB'), mkFeeder('Power DB', 125, 'MCCB'), mkFeeder('HVAC / AC', 200, 'MCCB')];
  }
  if (c.application === 'automation') c.options.control = 'PLC + HMI';
  if (c.application === 'fire') { c.options.colour = 'RAL 3000 (red, fire panels)'; c.options.control = 'Automatic'; }
  renderLists();
  fillInputs();
  // move on automatically after choosing an application on step 1
  if (draft.step === 0) setTimeout(() => go(1), 250);
}

const mkMotor = (name: string, hp: number): Motor => ({ id: newId(), name, hp, qty: 1, starter: 'Suggested', standby: false });
const mkFeeder = (name: string, amps: number, device: Feeder['device'] = amps <= 63 ? 'MCB' : 'MCCB'): Feeder => ({ id: newId(), name, amps, device, poles: 'TPN', qty: 1 });

/* ---------- motor & feeder rows ---------- */
const hpOptions = (sel: number) => HP_SIZES.map((h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${h} HP · ${(h * 0.746).toFixed(h < 1 ? 2 : 1)} kW</option>`).join('');
const ampOptions = (sel: number) => AMP_SIZES.map((a) => `<option value="${a}"${a === sel ? ' selected' : ''}>${a} A</option>`).join('');

function motorRow(m: Motor) {
  const c = draft.config;
  const sug = suggestedStarter(m.hp, c);
  const opts = ['Suggested', 'DOL', 'Star-Delta', 'Soft starter', 'VFD'].map((s) => `<option value="${s}"${s === m.starter ? ' selected' : ''}>${s === 'Suggested' ? `Auto (${sug})` : s}</option>`).join('');
  return `<div class="lrow" data-id="${m.id}">
    <input class="input" data-k="name" value="${esc(m.name)}" placeholder="e.g. Raw water pump" aria-label="Load name">
    <div class="lrow__rating"><select class="input" data-k="hp" aria-label="Motor rating">${hpOptions(m.hp)}</select><small data-amps>~${motorAmps(m.hp, c)} A</small></div>
    <div class="stepper"><button type="button" data-act="dec" aria-label="Fewer">−</button><input class="input" data-k="qty" type="number" min="1" max="99" value="${m.qty}" aria-label="Quantity"><button type="button" data-act="inc" aria-label="More">+</button></div>
    <div class="lrow__starter"><select class="input" data-k="starter" aria-label="Starter">${opts}</select><label class="lrow__sb"><input type="checkbox" data-k="standby"${m.standby ? ' checked' : ''}> Standby</label></div>
    <button type="button" class="lrow__del" data-act="del" aria-label="Remove">×</button>
  </div>`;
}
function feederRow(f: Feeder) {
  const dev = ['MCB', 'MCCB', 'Fuse switch'].map((d) => `<option${d === f.device ? ' selected' : ''}>${d}</option>`).join('');
  const poles = ['TPN', 'TP', 'SPN', 'DP'].map((d) => `<option${d === f.poles ? ' selected' : ''}>${d}</option>`).join('');
  return `<div class="lrow lrow--f" data-id="${f.id}">
    <input class="input" data-k="name" value="${esc(f.name)}" placeholder="e.g. Lighting DB" aria-label="Feeder name">
    <select class="input" data-k="amps" aria-label="Rating">${ampOptions(f.amps)}</select>
    <div class="stepper"><button type="button" data-act="dec" aria-label="Fewer">−</button><input class="input" data-k="qty" type="number" min="1" max="99" value="${f.qty}" aria-label="Quantity"><button type="button" data-act="inc" aria-label="More">+</button></div>
    <div class="lrow__dev"><select class="input" data-k="device" aria-label="Device">${dev}</select><select class="input" data-k="poles" aria-label="Poles">${poles}</select></div>
    <button type="button" class="lrow__del" data-act="del" aria-label="Remove">×</button>
  </div>`;
}

function renderLists() {
  const c = draft.config;
  $('[data-motor-list]', root).innerHTML = c.motors.map(motorRow).join('') || '<p class="lempty">No motors yet. Use Quick add or "Add motor / pump".</p>';
  $('[data-feeder-list]', root).innerHTML = c.feeders.map(feederRow).join('') || '<p class="lempty">No feeders yet.</p>';
  const mp = MOTOR_PRESETS[c.application] ?? MOTOR_PRESETS.motor;
  $('[data-motor-chips]', root).innerHTML = mp.map((p) => `<button type="button" class="qchip" data-chip-motor="${esc(p)}">+ ${esc(p)}</button>`).join('');
  $('[data-feeder-chips]', root).innerHTML = FEEDER_PRESETS.map((p) => `<button type="button" class="qchip" data-chip-feeder="${esc(p)}">+ ${esc(p)}</button>`).join('');
}

function listHandler(listSel: string, kind: 'motors' | 'feeders') {
  const list = $(listSel, root);
  const find = (el: Element) => {
    const id = el.closest<HTMLElement>('.lrow')?.dataset.id;
    return (draft.config[kind] as any[]).find((x) => x.id === id);
  };
  list.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    const item = find(el);
    if (!item || !el.dataset.k) return;
    const k = el.dataset.k;
    item[k] = el.type === 'checkbox' ? el.checked : ['hp', 'amps', 'qty'].includes(k) ? Math.max(k === 'qty' ? 1 : 0, Number(el.value) || 0) : el.value;
    if (k === 'hp' && kind === 'motors') {
      const row = el.closest('.lrow')!;
      row.querySelector('[data-amps]')!.textContent = `~${motorAmps(item.hp, draft.config)} A`;
      (row.querySelector('[data-k=starter] option[value=Suggested]') as HTMLOptionElement).textContent = `Auto (${suggestedStarter(item.hp, draft.config)})`;
    }
    if (k === 'amps' && kind === 'feeders') {
      item.device = item.amps <= 63 ? 'MCB' : 'MCCB';
      (el.closest('.lrow')!.querySelector('[data-k=device]') as HTMLSelectElement).value = item.device;
    }
    save(); refresh();
  });
  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (!btn) return;
    const item = find(btn);
    if (!item) return;
    if (btn.dataset.act === 'del') (draft.config as any)[kind] = (draft.config[kind] as any[]).filter((x) => x !== item);
    else item.qty = Math.max(1, Math.min(99, item.qty + (btn.dataset.act === 'inc' ? 1 : -1)));
    renderLists(); save(); refresh();
  });
}
listHandler('[data-motor-list]', 'motors');
listHandler('[data-feeder-list]', 'feeders');

root.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const chipM = t.closest<HTMLElement>('[data-chip-motor]');
  const chipF = t.closest<HTMLElement>('[data-chip-feeder]');
  const add = t.closest<HTMLElement>('[data-add]');
  if (chipM) draft.config.motors.push(mkMotor(chipM.dataset.chipMotor!, 5));
  else if (chipF) draft.config.feeders.push(mkFeeder(chipF.dataset.chipFeeder!, 63));
  else if (add) add.dataset.add === 'motor' ? draft.config.motors.push(mkMotor('', 5)) : draft.config.feeders.push(mkFeeder('', 63));
  else return;
  renderLists(); save(); refresh();
  const rows = $$('.lrow input[data-k=name]', $(add?.dataset.add === 'feeder' || chipF ? '[data-feeder-list]' : '[data-motor-list]', root));
  if (add) rows.at(-1)?.focus();
});

/* ---------- steps ---------- */
function validate(step: number): string | null {
  const c = draft.config;
  const app = appOf(c.application);
  if (step === 0 && !app) return 'Please choose what the panel is for.';
  if (step === 1 && c.supply.system === 'Other' && !c.supply.other.trim()) return 'Please describe the supply system.';
  if (step === 2) {
    if (app?.loads === 'motors' && !c.motors.length) return 'Add at least one motor or pump.';
    if (app?.loads === 'feeders' && !c.feeders.length) return 'Add at least one outgoing feeder.';
    if (app?.loads === 'generator' && (c.generator.sets < 1 || !c.generator.kva)) return 'Enter the number and rating of DG sets.';
  }
  if (step === 4 && (c.project.quantity < 1 || c.project.quantity > 999)) return 'Quantity must be between 1 and 999.';
  return null;
}

function go(step: number) {
  for (let s = draft.step; s < step; s++) {
    const err = validate(s);
    if (err) { toast(err, 'err'); step = s; break; }
  }
  draft.step = Math.max(0, Math.min(STEPS - 1, step));
  draft.maxStep = Math.max(draft.maxStep, draft.step);
  save();
  showStep();
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showStep() {
  $$('.bstep', form).forEach((s) => (s.hidden = Number(s.dataset.step) !== draft.step));
  $$<HTMLButtonElement>('[data-goto]', root).forEach((b) => {
    const i = Number(b.dataset.goto);
    b.classList.toggle('is-current', i === draft.step);
    b.classList.toggle('is-done', i < draft.step || (i <= draft.maxStep && i !== draft.step && validate(i) === null && i < draft.maxStep));
    b.disabled = i > draft.maxStep + 1;
  });
  $('[data-prev]', root).style.visibility = draft.step === 0 ? 'hidden' : 'visible';
  const last = draft.step === STEPS - 1;
  ($('[data-next]', root) as HTMLButtonElement).hidden = last;
  ($('[data-submit]', root) as HTMLButtonElement).hidden = !last;
  $('[data-step-mobile]', root).textContent = `Step ${draft.step + 1} of ${STEPS} · ${$$('[data-goto]', root)[draft.step].textContent?.replace(/^\d+/, '').trim()}`;
  $('[data-step-bar]', root).style.width = `${((draft.step + 1) / STEPS) * 100}%`;
  if (last) renderReview();
}

$('[data-next]', root).addEventListener('click', () => go(draft.step + 1));
$('[data-prev]', root).addEventListener('click', () => go(draft.step - 1));
$$<HTMLButtonElement>('[data-goto]', root).forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.goto))));
$('[data-reset]', root).addEventListener('click', () => {
  if (!confirm('Clear everything and start a new panel?')) return;
  draft = blankDraft(); save(); renderLists(); fillInputs(); refresh(); showStep();
});

/* ---------- live side panel & conditional fields ---------- */
function refresh() {
  const c = draft.config;
  const app = appOf(c.application);
  const s = compute(c);
  $('[data-sum-title]', root).textContent = app ? s.title : 'Choose an application to begin';
  $('[data-svg]', root).innerHTML = panelSVG(c, s);
  $('[data-kpi="kw"]', root).textContent = s.connectedKw ? `${s.connectedKw} kW` : '—';
  $('[data-kpi="amps"]', root).textContent = s.runningAmps ? `${s.runningAmps} A` : '—';
  $('[data-kpi="inc"]', root).textContent = s.incomerAmps ? `${s.incomerAmps} A ${s.incomerDevice}` : '—';
  $('[data-kpi="loads"]', root).textContent = s.loadCount ? String(s.loadCount) : '—';

  const show = (k: string, on: boolean) => { const el = root.querySelector<HTMLElement>(`[data-loads="${k}"]`); if (el) el.hidden = !on; };
  show('motors', app?.loads === 'motors' || app?.loads === 'mixed');
  show('feeders', app?.loads === 'feeders' || app?.loads === 'mixed' || app?.loads === 'generator');
  show('generator', app?.loads === 'generator');
  show('fire', app?.loads === 'fire');
  const titles: Record<string, [string, string]> = {
    motors: ['Motors & pumps', 'Add each motor the panel will start and protect. Ratings and starters are suggested automatically.'],
    feeders: ['Outgoing feeders', 'List each outgoing circuit the panel will supply, with its rating.'],
    generator: ['Generators', 'Tell us about the DG sets. Optionally add the outgoing load feeders below.'],
    fire: ['Fire pumps', 'Select your pump ratings. We follow standard fire-fighting panel practice.'],
    mixed: ['Your loads', 'Add any motors and/or outgoing feeders. Describe anything else in the notes.'],
  };
  const t = titles[app?.loads ?? 'mixed'];
  $('[data-loads-title]', root).textContent = t[0];
  $('[data-loads-hint]', root).textContent = t[1];
  $('[data-feeder-title]', root).textContent = app?.loads === 'generator' ? 'Load feeders (optional)' : 'Outgoing feeders';

  for (const el of $$<HTMLElement>('[data-show-if]', form)) {
    const cond = el.dataset.showIf!;
    if (cond === 'drives') el.hidden = !(c.options.control.includes('PLC') || c.motors.some((m) => m.starter === 'VFD') || c.application === 'automation');
    else { const [p, v] = cond.split('='); el.hidden = getPath(c, p) !== v; }
  }
}

/* ---------- review & submit ---------- */
function renderReview() {
  const c = draft.config;
  const s = compute(c);
  const sections = [['Application & supply', 1], ['Loads', 2], ['Features', 3], ['Project', 4]] as const;
  $('[data-review]', root).innerHTML = `
    <div class="review__head"><div><span class="mono">Your panel</span><h3>${esc(s.title)}</h3></div>
      <div class="review__edit">${sections.map(([l, i]) => `<button type="button" class="qchip" data-edit="${i}">Edit ${l.toLowerCase()}</button>`).join('')}</div></div>
    <div class="review__svg">${panelSVG(c, s)}</div>
    ${summaryHTML(c, s)}`;
  $$<HTMLButtonElement>('[data-edit]', root).forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.edit))));
  ($('[data-contact-anon]', root) as HTMLElement).hidden = !!me;
  const meBox = $('[data-contact-me]', root) as HTMLElement;
  meBox.hidden = !me;
  if (me) meBox.innerHTML = `<p>Submitting as <strong>${esc(me.name)}</strong> (${esc(me.email)})${me.company ? ` · ${esc(me.company)}` : ''}. You can track this request in <a href="${sitePath('/portal/')}">your portal</a>.</p>`;
  ($('[data-login-link]', root) as HTMLAnchorElement).href = sitePath(`/portal/login/?next=${encodeURIComponent('/build/?resume=1')}`);
  updateSubmitLabel();
}

const kind = () => ($<HTMLInputElement>('input[name=submitKind]:checked', form)?.value ?? 'quote') as 'quote' | 'order';
function updateSubmitLabel() {
  const btn = $('[data-submit]', root);
  btn.innerHTML = kind() === 'order'
    ? (me ? 'Review & place order' : 'Sign in to place order') + ' →'
    : 'Review & send quote request →';
}

const dlg = $<HTMLDialogElement>('[data-confirm]');
const chk = $<HTMLInputElement>('[data-confirm-check]');
const ok = $<HTMLButtonElement>('[data-confirm-ok]');
chk.addEventListener('change', () => (ok.disabled = !chk.checked));
$('[data-confirm-cancel]').addEventListener('click', () => dlg.close());

$('[data-submit]', root).addEventListener('click', () => {
  const err = $('[data-submit-error]', root);
  err.hidden = true;
  const k = kind();
  if (k === 'order' && !me) {
    save();
    location.href = sitePath(`/portal/login/?next=${encodeURIComponent('/build/?resume=1&kind=order')}&reason=order`);
    return;
  }
  if (!me) {
    const ct = draft.contact;
    const missing = !ct.name.trim() ? 'your name' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ct.email) ? 'a valid email' : !ct.phone.trim() ? 'your phone number' : '';
    if (missing) { err.textContent = `Please enter ${missing} so we can send your quotation.`; err.hidden = false; return; }
  }
  const s = compute(draft.config);
  $('[data-confirm-title]').textContent = k === 'order' ? 'Confirm your order' : 'Send quote request?';
  $('[data-confirm-panel]').textContent = s.title;
  const p = draft.config.project;
  $('[data-confirm-list]').innerHTML = [
    `Quantity: ${p.quantity} panel${p.quantity > 1 ? 's' : ''}`,
    p.site && `Site: ${esc(p.site)}`,
    p.requiredBy && `Required by: ${esc(p.requiredBy)}`,
    s.incomerAmps && `Suggested incomer: ${s.incomerAmps} A ${s.incomerDevice} (to be confirmed by our engineers)`,
    `Contact: ${esc(me ? me.email : draft.contact.email)}`,
  ].filter(Boolean).map((l) => `<li>${l}</li>`).join('');
  $('[data-confirm-label]').textContent = k === 'order'
    ? `I confirm these requirements are correct and want ${BRAND} to proceed with this order. Final price, taxes and delivery will be confirmed in the order acknowledgement.`
    : 'I confirm these requirements are correct. Please send me a quotation.';
  ok.textContent = k === 'order' ? 'Place order' : 'Send request';
  chk.checked = false; ok.disabled = true;
  dlg.showModal();
});

ok.addEventListener('click', async () => {
  ok.disabled = true;
  ok.classList.add('is-busy');
  const k = kind();
  const c = draft.config;
  const s = compute(c);
  try {
    const res = await api<{ ref: string; id?: number; needsConfirmation?: boolean }>('/requests', {
      body: {
        kind: k, title: s.title, config: c, summary: s,
        quantity: c.project.quantity, site_location: c.project.site, required_by: c.project.requiredBy, notes: c.project.notes,
        contact: me ? { phone: me.phone, company: me.company } : draft.contact,
      },
    });
    dlg.close();
    showDone(k, res);
    draft = blankDraft(); save();
  } catch (e: any) {
    dlg.close();
    if (e.code === 'unauthenticated') { location.href = sitePath(`/portal/login/?next=${encodeURIComponent('/build/?resume=1&kind=order')}`); return; }
    const err = $('[data-submit-error]', root);
    err.textContent = e.message; err.hidden = false;
  } finally {
    ok.classList.remove('is-busy');
  }
});

function showDone(k: 'quote' | 'order', res: { ref: string; id?: number; needsConfirmation?: boolean }) {
  form.hidden = true;
  ($('[data-side]', root) as HTMLElement).hidden = true;
  ($('.bsteps', root) as HTMLElement).hidden = true;
  const done = $('[data-done]', root);
  done.hidden = false;
  $('[data-done-ref]', root).textContent = `Reference: ${res.ref}`;
  if (res.needsConfirmation) {
    $('[data-done-title]', root).textContent = 'Almost done: check your email';
    $('[data-done-text]', root).innerHTML = `We've sent a confirmation link to <strong>${esc(draft.contact.email)}</strong>. Click it to confirm your request, and our engineers will start on your quotation.`;
    $('[data-done-actions]', root).innerHTML = `<a class="btn btn--red" href="${sitePath(`/portal/register/?email=${encodeURIComponent(draft.contact.email)}`)}">Create an account to track it</a><a class="btn btn--ghost" href="${sitePath('/panels')}">Browse panels</a>`;
  } else {
    $('[data-done-title]', root).textContent = k === 'order' ? 'Order placed. Thank you!' : 'Quote request sent';
    $('[data-done-text]', root).textContent = k === 'order'
      ? 'Our team will review your order and send the order acknowledgement with final price and delivery date. You can track every stage in your portal.'
      : 'Our engineers will review your requirement and send your quotation, usually within 1–2 working days. You can track it in your portal.';
    $('[data-done-actions]', root).innerHTML = `<a class="btn btn--red" href="${sitePath(`/portal/request/?id=${res.id}`)}">Track this ${k}</a><a class="btn btn--ghost" href="${sitePath('/build/')}">Build another panel</a>`;
  }
  done.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- init ---------- */
const params = new URLSearchParams(location.search);
const appParam = params.get('app');
if (appParam && APPS.some((a) => a.id === appParam) && draft.step === 0 && !draft.config.application) {
  draft.config.application = appParam as PanelConfig['application'];
  if (params.get('ref')) draft.config.project.reference = params.get('ref')!;
  onAppChangeSilently();
  draft.step = 1; draft.maxStep = 1;
}
function onAppChangeSilently() {
  const s = draft.step; draft.step = -1; onAppChange(); draft.step = s;
}
if (params.get('resume')) { draft.step = STEPS - 1; draft.maxStep = STEPS - 1; }

renderLists();
fillInputs();
if (params.get('kind') === 'order') ($<HTMLInputElement>('input[name=submitKind][value=order]', form)).checked = true;
refresh();
showStep();
save();

getMe().then((u) => { me = u; if (draft.step === STEPS - 1) renderReview(); }).catch(() => { me = null; });
