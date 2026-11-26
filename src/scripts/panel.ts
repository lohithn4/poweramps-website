/**
 * Panel requirement model shared by the builder, client portal and staff portal:
 * the config shape, electrical estimates, a summary renderer and a live SVG drawing.
 * Estimates are indicative. Our engineers confirm final ratings in the quotation.
 */
import { esc } from './ui';

export type AppId = 'motor' | 'water' | 'automation' | 'generator' | 'fire' | 'distribution' | 'other';
export type Starter = 'Suggested' | 'DOL' | 'Star-Delta' | 'Soft starter' | 'VFD';

export interface Motor { id: string; name: string; hp: number; qty: number; starter: Starter; standby: boolean }
export interface Feeder { id: string; name: string; amps: number; device: 'MCB' | 'MCCB' | 'Fuse switch'; poles: 'TPN' | 'TP' | 'SPN' | 'DP'; qty: number }

export interface PanelConfig {
  application: AppId | '';
  supply: { system: string; other: string; sources: string };
  motors: Motor[];
  feeders: Feeder[];
  generator: { sets: number; kva: number; mode: string };
  fire: { mainHp: number; jockeyHp: number; standbyMain: boolean; diesel: boolean; starter: string };
  options: {
    control: string; metering: string; protections: string[]; switchgear: string; drives: string;
    busbar: string; ip: string; mounting: string; location: string; entry: string; colour: string;
  };
  project: { name: string; site: string; quantity: number; requiredBy: string; notes: string; reference: string };
  /** Component choices from the configurator (PART_GROUPS), keyed by group id. */
  parts: Record<string, string | string[]>;
}

export const APPS: { id: AppId; title: string; text: string; icon: string; loads: 'motors' | 'feeders' | 'generator' | 'fire' | 'mixed' }[] = [
  { id: 'motor', title: 'Motor control', text: 'MCC & starter panels for pumps, fans, conveyors, compressors', icon: 'M', loads: 'motors' },
  { id: 'water', title: 'Water & wastewater', text: 'RO, STP, ETP & pressure booster pump panels', icon: 'W', loads: 'motors' },
  { id: 'automation', title: 'Automation', text: 'PLC, HMI & VFD panels for process control', icon: 'A', loads: 'motors' },
  { id: 'generator', title: 'Generator backup', text: 'AMF changeover & DG synchronization panels', icon: 'G', loads: 'generator' },
  { id: 'fire', title: 'Fire fighting', text: 'Main, jockey & diesel fire pump control panels', icon: 'F', loads: 'fire' },
  { id: 'distribution', title: 'Power distribution', text: 'PCC, main LT panels, DBs, UPS & tap-off panels', icon: 'D', loads: 'feeders' },
  { id: 'other', title: 'Something else / not sure', text: 'Describe it and we will design it for you', icon: '?', loads: 'mixed' },
];

export const HP_SIZES = [0.5, 1, 1.5, 2, 3, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300];
export const AMP_SIZES = [6, 10, 16, 20, 25, 32, 40, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600];
const STD_INCOMER = [16, 25, 32, 40, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300];
export const PROTECTIONS = ['Overload', 'Short circuit', 'Phase failure / reversal', 'Single phasing', 'Under / over voltage', 'Earth fault', 'Dry run (pumps)', 'Surge protection'];
export const KVA_SIZES = [15, 20, 25, 30, 40, 62.5, 82.5, 100, 125, 160, 200, 250, 320, 380, 500, 625, 750, 1010, 1250, 1500, 2000];

export const MOTOR_PRESETS: Record<string, string[]> = {
  motor: ['Pump', 'Fan', 'Blower', 'Compressor', 'Conveyor', 'Agitator', 'Cooling tower'],
  water: ['Raw water pump', 'High-pressure pump', 'Feed pump', 'Dosing pump', 'Air blower', 'Sludge pump', 'Transfer pump', 'Booster pump'],
  automation: ['Conveyor (VFD)', 'Fan (VFD)', 'Pump (VFD)', 'Mixer', 'Extruder', 'Crusher'],
  other: ['Motor', 'Pump', 'Fan'],
};
export const FEEDER_PRESETS = ['Lighting DB', 'Power DB', 'HVAC / AC', 'UPS', 'Lift', 'Pump room', 'Server room', 'Spare'];

let uid = 0;
export const newId = () => `${Date.now().toString(36)}${(uid++).toString(36)}`;

export function blankConfig(): PanelConfig {
  return {
    application: '',
    supply: { system: '415 V · 3-phase · 50 Hz', other: '', sources: 'Grid (EB) only' },
    motors: [],
    feeders: [],
    generator: { sets: 1, kva: 125, mode: 'AMF: automatic changeover' },
    fire: { mainHp: 25, jockeyHp: 5, standbyMain: false, diesel: false, starter: 'Star-Delta' },
    options: {
      control: 'Automatic', metering: 'Digital multifunction meter', protections: ['Overload', 'Short circuit', 'Phase failure / reversal', 'Single phasing'],
      switchgear: 'No preference', drives: 'No preference', busbar: 'Copper', ip: 'IP54', mounting: 'Floor standing', location: 'Indoor', entry: 'Bottom', colour: 'RAL 7035 (light grey)',
    },
    project: { name: '', site: '', quantity: 1, requiredBy: '', notes: '', reference: '' },
    parts: structuredClone(PART_DEFAULTS),
  };
}

/** Fills any missing fields so older or partial configs always render safely. */
export function normalize(raw: any): PanelConfig {
  const b = blankConfig();
  const c = raw && typeof raw === 'object' ? raw : {};
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    application: APPS.some((a) => a.id === c.application) ? c.application : '',
    supply: { ...b.supply, ...(c.supply ?? {}) },
    motors: (Array.isArray(c.motors) ? c.motors : []).map((m: any) => ({
      id: String(m?.id ?? newId()), name: String(m?.name ?? ''), hp: num(m?.hp, 5), qty: num(m?.qty, 1),
      starter: ['Suggested', 'DOL', 'Star-Delta', 'Soft starter', 'VFD'].includes(m?.starter) ? m.starter : 'Suggested', standby: !!m?.standby,
    })),
    feeders: (Array.isArray(c.feeders) ? c.feeders : []).map((f: any) => ({
      id: String(f?.id ?? newId()), name: String(f?.name ?? ''), amps: num(f?.amps, 63), qty: num(f?.qty, 1),
      device: ['MCB', 'MCCB', 'Fuse switch'].includes(f?.device) ? f.device : 'MCCB', poles: ['TPN', 'TP', 'SPN', 'DP'].includes(f?.poles) ? f.poles : 'TPN',
    })),
    generator: { ...b.generator, ...(c.generator ?? {}) },
    fire: { ...b.fire, ...(c.fire ?? {}) },
    options: { ...b.options, ...(c.options ?? {}), protections: Array.isArray(c.options?.protections) ? c.options.protections : b.options.protections },
    project: { ...b.project, ...(c.project ?? {}) },
    parts: { ...b.parts, ...(c.parts && typeof c.parts === 'object' ? c.parts : {}) },
  };
}

export const appOf = (id: string) => APPS.find((a) => a.id === id);
/* ---------------- component configurator ("choose every part", like a custom laptop) ---------------- */

export interface PartOption { v: string; d?: string; tag?: string }
export interface PartGroup {
  id: string; section: string; title: string; hint?: string;
  /** Where the choice is stored: a key in config.parts, or an existing options field. */
  path: string;
  multi?: boolean; cards?: boolean;
  options: PartOption[];
  /** Shown only when this returns true (e.g. PLC choices only for PLC control). */
  when?: (c: PanelConfig) => boolean;
}

const MAKES = ['No preference', 'L&T (Lauritz Knudsen)', 'Schneider Electric', 'Siemens', 'ABB', 'Legrand', 'C&S Electric'];
const hasMotors = (c: PanelConfig) => ['motors', 'mixed'].includes(appOf(c.application)?.loads ?? '') && c.motors.length > 0 || appOf(c.application)?.loads === 'fire';
const usesPlc = (c: PanelConfig) => c.options.control.includes('PLC');
const usesVfd = (c: PanelConfig) => usesPlc(c) || c.application === 'automation' || c.motors.some((m) => m.starter === 'VFD');
const hasMeter = (c: PanelConfig) => c.options.metering !== 'None';
const opt = (...vs: (string | PartOption)[]): PartOption[] => vs.map((v) => (typeof v === 'string' ? { v } : v));

export const PART_SECTIONS = ['Control & automation', 'Switchgear', 'Busbar', 'Metering & protection', 'Indication & operation', 'Enclosure', 'Accessories', 'Testing & documents'] as const;

export const PART_GROUPS: PartGroup[] = [
  { id: 'control', section: 'Control & automation', title: 'How should it be controlled?', path: 'options.control', cards: true, options: [
    { v: 'Manual', d: 'Push buttons & selector switches' },
    { v: 'Automatic', d: 'Level / pressure / timer based' },
    { v: 'PLC + HMI', d: 'Programmable logic with touch screen' },
    { v: 'PLC + HMI + SCADA', d: 'Remote monitoring & data logging' },
  ] },
  { id: 'plc', section: 'Control & automation', title: 'PLC', path: 'parts.plc', when: usesPlc,
    options: opt('No preference', 'Siemens S7-1200', 'Schneider Modicon M221', 'Delta DVP', 'Allen-Bradley Micro800', 'Mitsubishi FX5U', 'Omron CP2E') },
  { id: 'hmi', section: 'Control & automation', title: 'HMI touch screen', path: 'parts.hmi', when: usesPlc, options: opt('4.3 inch', '7 inch', '10 inch', '15 inch') },
  { id: 'drives', section: 'Control & automation', title: 'VFD / drive make', path: 'options.drives', when: usesVfd,
    options: opt('No preference', 'ABB', 'Danfoss', 'Siemens', 'Schneider Electric', 'Delta', 'INVT', 'Yaskawa', 'Fuji') },

  { id: 'incomer_type', section: 'Switchgear', title: 'Main incomer', hint: 'Auto picks MCB, MCCB or ACB from the calculated current.', path: 'parts.incomer_type',
    options: opt({ v: 'Auto (recommended)', tag: 'Recommended' }, 'MCCB', 'ACB', 'Switch disconnector fuse (SDF)', 'MCB', 'Changeover switch') },
  { id: 'switchgear', section: 'Switchgear', title: 'Breakers & contactors make', path: 'options.switchgear', options: opt(...MAKES) },
  { id: 'incomer_poles', section: 'Switchgear', title: 'Incomer poles', path: 'parts.incomer_poles', when: (c) => !c.supply.system.startsWith('230'), options: opt('4 pole (TPN)', '3 pole (TP)') },
  { id: 'release', section: 'Switchgear', title: 'Breaker release', path: 'parts.release', when: (c) => compute(c).incomerAmps >= 100,
    options: opt({ v: 'Thermal-magnetic', d: 'Fixed protection, economical' }, { v: 'Microprocessor', d: 'Adjustable settings, better selectivity' }) },
  { id: 'overload', section: 'Switchgear', title: 'Motor overload protection', path: 'parts.overload', when: hasMotors,
    options: opt({ v: 'Thermal overload relay', tag: 'Standard' }, 'Motor protection circuit breaker (MPCB)', 'Electronic motor protection relay') },

  { id: 'busbar', section: 'Busbar', title: 'Busbar material', path: 'options.busbar', options: opt('Copper', 'Aluminium') },
  { id: 'busbar_sleeve', section: 'Busbar', title: 'Busbar finish', path: 'parts.busbar_sleeve', options: opt('Heat-shrink sleeved, colour coded', 'Bare with phase markings') },

  { id: 'metering', section: 'Metering & protection', title: 'Metering', path: 'options.metering', options: opt('Digital multifunction meter', 'Digital meter with Modbus', 'Analog meters (A, V)', 'None') },
  { id: 'meter_make', section: 'Metering & protection', title: 'Meter make', path: 'parts.meter_make', when: hasMeter, options: opt('No preference', 'Schneider (Conzerv)', 'Secure (Elite)', 'L&T', 'Siemens', 'Rishabh') },
  { id: 'cts', section: 'Metering & protection', title: 'Current transformers', path: 'parts.cts', when: hasMeter, options: opt('Resin cast, class 1', 'Class 0.5 (energy accounting)') },
  { id: 'protections', section: 'Metering & protection', title: 'Protection required', path: 'options.protections', multi: true, options: opt(...PROTECTIONS) },
  { id: 'relay_make', section: 'Metering & protection', title: 'Protection relay make', path: 'parts.relay_make', options: opt('No preference', 'Minilec', 'L&T', 'Schneider Electric', 'Siemens', 'Selec') },

  { id: 'indication', section: 'Indication & operation', title: 'Indication & controls on the door', path: 'parts.indication', multi: true,
    options: opt('R-Y-B phase indication lamps', 'ON / OFF / TRIP lamps per feeder', 'Run / trip lamps per motor', 'Auto / manual selector per motor', 'Emergency stop push button', 'Hooter with accept / reset') },
  { id: 'lamp_make', section: 'Indication & operation', title: 'Lamps & push buttons make', path: 'parts.lamp_make', options: opt('No preference', 'Teknic', 'L&T', 'Schneider Electric', 'Siemens', 'Salzer') },

  { id: 'sheet', section: 'Enclosure', title: 'Sheet steel', path: 'parts.sheet', cards: true, options: [
    { v: 'CRCA 1.6 mm', d: 'Standard for indoor panels' }, { v: 'CRCA 2.0 mm', d: 'Heavy duty, large panels' },
    { v: 'Galvanised (GI)', d: 'Better corrosion resistance' }, { v: 'Stainless steel 304', d: 'Food, pharma, coastal sites' },
  ] },
  { id: 'form', section: 'Enclosure', title: 'Form of separation', path: 'parts.form', cards: true, options: [
    { v: 'Form 1', d: 'Single compartment' }, { v: 'Form 2', d: 'Busbars separated' },
    { v: 'Form 3b', d: 'Each feeder in its own compartment' }, { v: 'Form 4', d: 'Fully compartmentalised, cables too' },
  ] },
  { id: 'ip', section: 'Enclosure', title: 'Enclosure protection (IP)', path: 'options.ip', options: opt('IP42', 'IP54', 'IP55', 'IP65') },
  { id: 'mounting', section: 'Enclosure', title: 'Mounting', path: 'options.mounting', options: opt('Floor standing', 'Wall mounted') },
  { id: 'location', section: 'Enclosure', title: 'Installed', path: 'options.location', options: opt('Indoor', 'Outdoor') },
  { id: 'entry', section: 'Enclosure', title: 'Cable entry', path: 'options.entry', options: opt('Bottom', 'Top', 'Top & bottom') },
  { id: 'colour', section: 'Enclosure', title: 'Colour', path: 'options.colour', options: opt('RAL 7035 (light grey)', 'RAL 7032 (pebble grey)', 'RAL 9002 (off-white)', 'RAL 3000 (red, fire panels)', 'Other: mention in notes') },

  { id: 'accessories', section: 'Accessories', title: 'Add-ons', path: 'parts.accessories', multi: true,
    options: opt('Panel lighting with door switch', 'Space heater with thermostat', 'Cooling fans with filters', 'Surge protection device (SPD)', '20% spare feeders', 'Copper earth bar', 'Canopy for outdoor use', 'Base frame / plinth', 'Danger board & rubber mat') },
  { id: 'testing', section: 'Testing & documents', title: 'Testing & documents', path: 'parts.testing', multi: true,
    options: opt('GA & wiring drawings for approval', 'Routine test certificates', 'Factory acceptance test (FAT) with you', 'Installation & commissioning at site', 'Operation & maintenance manual') },
];

export const PART_DEFAULTS: Record<string, string | string[]> = {
  plc: 'No preference', hmi: '7 inch', incomer_type: 'Auto (recommended)', incomer_poles: '4 pole (TPN)', release: 'Thermal-magnetic',
  overload: 'Thermal overload relay', busbar_sleeve: 'Heat-shrink sleeved, colour coded', meter_make: 'No preference', cts: 'Resin cast, class 1',
  relay_make: 'No preference', indication: ['R-Y-B phase indication lamps', 'ON / OFF / TRIP lamps per feeder', 'Run / trip lamps per motor'],
  lamp_make: 'No preference', sheet: 'CRCA 1.6 mm', form: 'Form 1', accessories: ['Panel lighting with door switch', 'Copper earth bar'],
  testing: ['GA & wiring drawings for approval', 'Routine test certificates'],
};

/** Component choices that apply to this panel, for summaries, quotations and emails. */
export function chosenParts(c: PanelConfig): { section: string; title: string; value: string }[] {
  const out: { section: string; title: string; value: string }[] = [];
  for (const g of PART_GROUPS) {
    if (g.when && !g.when(c)) continue;
    const v = g.path.split('.').reduce<any>((o, k) => o?.[k], c);
    const text = Array.isArray(v) ? v.join(', ') : String(v ?? '');
    if (text) out.push({ section: g.section, title: g.title, value: text });
  }
  return out;
}

const volts = (c: PanelConfig) => (c.supply.system.startsWith('230') ? 230 : c.supply.system.startsWith('440') ? 440 : 415);
const threePhase = (c: PanelConfig) => !c.supply.system.startsWith('230');

export function suggestedStarter(hp: number, c?: PanelConfig): Exclude<Starter, 'Suggested'> {
  if (c?.application === 'automation') return 'VFD';
  if (hp <= 7.5) return 'DOL';
  if (hp <= 50) return 'Star-Delta';
  return 'Soft starter';
}
export const starterOf = (m: Motor, c: PanelConfig) => (m.starter === 'Suggested' ? suggestedStarter(m.hp, c) : m.starter);

export function motorAmps(hp: number, c: PanelConfig) {
  const kw = hp * 0.746;
  const v = volts(c);
  const a = threePhase(c) ? (kw * 1000) / (Math.sqrt(3) * v * 0.85 * 0.88) : (kw * 1000) / (v * 0.85 * 0.88);
  return Math.round(a * 10) / 10;
}

export interface Summary {
  title: string;
  connectedKw: number;
  runningAmps: number;
  incomerAmps: number;
  incomerDevice: string;
  loadCount: number;
  lines: [string, string][];
}

export function compute(c: PanelConfig): Summary {
  const app = appOf(c.application);
  const v = volts(c);
  const k3 = threePhase(c) ? Math.sqrt(3) * v : v;
  let connectedKw = 0;
  let running = 0;
  let loadCount = 0;
  const lines: [string, string][] = [];

  const usesMotors = app?.loads === 'motors' || app?.loads === 'mixed';
  const usesFeeders = app?.loads === 'feeders' || app?.loads === 'mixed' || app?.loads === 'generator';

  if (usesMotors) {
    for (const m of c.motors) {
      const kw = m.hp * 0.746 * m.qty;
      connectedKw += kw;
      loadCount += m.qty;
      if (!m.standby) running += motorAmps(m.hp, c) * m.qty;
    }
  }
  if (usesFeeders) {
    let f = 0;
    for (const d of c.feeders) { f += d.amps * d.qty; loadCount += d.qty; }
    running += f * 0.7; // typical diversity for distribution feeders
    connectedKw += (f * 0.7 * k3 * 0.9) / 1000;
  }
  if (app?.loads === 'fire') {
    const f = c.fire;
    connectedKw += (f.mainHp * (f.standbyMain ? 2 : 1) + f.jockeyHp) * 0.746;
    running += motorAmps(f.mainHp, c) + motorAmps(f.jockeyHp, c);
    loadCount = 2 + (f.standbyMain ? 1 : 0) + (f.diesel ? 1 : 0);
  }
  let genAmps = 0;
  if (app?.loads === 'generator') {
    const g = c.generator;
    genAmps = (g.sets * g.kva * 1000) / (Math.sqrt(3) * v);
    running = Math.max(running, genAmps);
    lines.push(['Generators', `${g.sets} × ${g.kva} kVA (${Math.round(g.sets * g.kva)} kVA total)`]);
  }

  const need = running * 1.25;
  const incomerAmps = need > 0 ? STD_INCOMER.find((s) => s >= need) ?? 6300 : 0;
  const incomerDevice = !incomerAmps ? '—' : incomerAmps <= 32 ? 'MCB' : incomerAmps <= 630 ? 'MCCB' : 'ACB';

  const nMotors = c.motors.reduce((s, m) => s + m.qty, 0);
  const nFeeders = c.feeders.reduce((s, f) => s + f.qty, 0);
  const sys = c.supply.system === 'Other' ? c.supply.other || 'custom supply' : c.supply.system.split(' · ').slice(0, 2).join(' ');
  let title = 'Custom electrical panel';
  switch (c.application) {
    case 'motor': title = `MCC panel · ${nMotors} motor${nMotors === 1 ? '' : 's'}`; break;
    case 'water': title = `Water treatment pump panel · ${nMotors} pump${nMotors === 1 ? '' : 's'}`; break;
    case 'automation': title = `PLC / VFD automation panel · ${nMotors} drive${nMotors === 1 ? '' : 's'}`; break;
    case 'generator': title = `${c.generator.mode.startsWith('Sync') ? 'DG synchronization' : 'AMF'} panel · ${c.generator.sets} × ${c.generator.kva} kVA`; break;
    case 'fire': title = `Fire pump control panel · ${c.fire.mainHp} HP main + ${c.fire.jockeyHp} HP jockey`; break;
    case 'distribution': title = `Power distribution panel · ${nFeeders} feeder${nFeeders === 1 ? '' : 's'}`; break;
  }
  if (c.application) title += ` · ${sys}`;
  if (incomerAmps) title += ` · ${incomerAmps} A incomer`;

  return {
    title,
    connectedKw: Math.round(connectedKw * 10) / 10,
    runningAmps: Math.round(running),
    incomerAmps,
    incomerDevice,
    loadCount,
    lines,
  };
}

/* ---------------- summary (review / portal / staff) ---------------- */

const row = (k: string, v: string) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '');

export function summaryHTML(c: PanelConfig, s: Summary = compute(c)) {
  const app = appOf(c.application);
  const parts: string[] = [];
  parts.push(`<div class="sum-block"><h4>Estimated ratings <small>indicative · confirmed by our engineers</small></h4>
    <div class="sum-kpis">
      <div><span>Connected load</span><strong>${s.connectedKw || '—'} kW</strong></div>
      <div><span>Running current</span><strong>${s.runningAmps || '—'} A</strong></div>
      <div><span>Suggested incomer</span><strong>${s.incomerAmps ? `${s.incomerAmps} A ${s.incomerDevice}` : '—'}</strong></div>
      <div><span>Busbar</span><strong>${s.incomerAmps ? `${s.incomerAmps} A ${c.options.busbar}` : '—'}</strong></div>
    </div></div>`);

  parts.push(`<div class="sum-block"><h4>Application & supply</h4><table class="sum-table">
    ${row('Application', app?.title ?? '')}
    ${row('Supply', c.supply.system === 'Other' ? c.supply.other : c.supply.system)}
    ${row('Power sources', c.supply.sources)}
  </table></div>`);

  if ((app?.loads === 'motors' || app?.loads === 'mixed') && c.motors.length) {
    parts.push(`<div class="sum-block"><h4>Motors (${c.motors.reduce((n, m) => n + m.qty, 0)})</h4><table class="sum-table sum-table--grid">
      <thead><tr><th>Load</th><th>Rating</th><th>Qty</th><th>Starter</th><th>Duty</th></tr></thead><tbody>
      ${c.motors.map((m) => `<tr><td>${esc(m.name || 'Motor')}</td><td>${m.hp} HP · ${(m.hp * 0.746).toFixed(1)} kW · ~${motorAmps(m.hp, c)} A</td><td>${m.qty}</td><td>${esc(starterOf(m, c))}</td><td>${m.standby ? 'Standby' : 'Duty'}</td></tr>`).join('')}
      </tbody></table></div>`);
  }
  if ((app?.loads === 'feeders' || app?.loads === 'mixed' || app?.loads === 'generator') && c.feeders.length) {
    parts.push(`<div class="sum-block"><h4>Outgoing feeders (${c.feeders.reduce((n, f) => n + f.qty, 0)})</h4><table class="sum-table sum-table--grid">
      <thead><tr><th>Feeder</th><th>Rating</th><th>Device</th><th>Poles</th><th>Qty</th></tr></thead><tbody>
      ${c.feeders.map((f) => `<tr><td>${esc(f.name || 'Feeder')}</td><td>${f.amps} A</td><td>${esc(f.device)}</td><td>${esc(f.poles)}</td><td>${f.qty}</td></tr>`).join('')}
      </tbody></table></div>`);
  }
  if (app?.loads === 'generator') {
    parts.push(`<div class="sum-block"><h4>Generator</h4><table class="sum-table">
      ${row('Scheme', c.generator.mode)}${row('DG sets', `${c.generator.sets} × ${c.generator.kva} kVA`)}</table></div>`);
  }
  if (app?.loads === 'fire') {
    const f = c.fire;
    parts.push(`<div class="sum-block"><h4>Fire pumps</h4><table class="sum-table">
      ${row('Main electric pump', `${f.mainHp} HP${f.standbyMain ? ' + standby' : ''} · ${f.starter}`)}
      ${row('Jockey pump', `${f.jockeyHp} HP · DOL`)}
      ${row('Diesel engine pump', f.diesel ? 'Yes: engine controller included' : 'No')}</table></div>`);
  }
  const chosen = chosenParts(c);
  for (const section of PART_SECTIONS) {
    const rows = chosen.filter((p) => p.section === section);
    if (rows.length) parts.push(`<div class="sum-block"><h4>${esc(section)}</h4><table class="sum-table">${rows.map((p) => row(p.title, p.value)).join('')}</table></div>`);
  }
  const p = c.project;
  parts.push(`<div class="sum-block"><h4>Project</h4><table class="sum-table">
    ${row('Project', p.name)}${row('Site location', p.site)}${row('Quantity', String(p.quantity))}${row('Required by', p.requiredBy)}${row('Based on', p.reference)}${row('Notes', p.notes)}
  </table></div>`);
  return parts.join('');
}

/** A request with several panels: one collapsible section per panel (drawing + full summary). */
export function panelsHTML(panels: { name: string; title: string; quantity: number; config: unknown }[]) {
  const total = panels.reduce((n, p) => n + (p.quantity || 1), 0);
  return `<p class="pnl-intro">${panels.length} different panels in this request, ${total} in total.</p>` + panels.map((p, i) => {
    const c = normalize(p.config);
    const s = compute(c);
    return `<details class="pnl"${i === 0 ? ' open' : ''}>
      <summary><span class="pnl__n">Panel ${i + 1}</span><span class="pnl__t"><strong>${esc(p.name || s.title)}</strong><small>${esc(s.title)}</small></span><span class="pnl__q">× ${p.quantity || 1}</span></summary>
      <div class="pnl__body"><div class="req-svg">${panelSVG(c, s)}</div>${summaryHTML(c, s)}</div>
    </details>`;
  }).join('');
}

/* ---------------- live panel drawing ---------------- */

interface Mod { label: string; sub: string; kind: 'motor' | 'feeder' | 'gen' | 'fire' | 'plc' }

function modules(c: PanelConfig): Mod[] {
  const app = appOf(c.application);
  const out: Mod[] = [];
  if (app?.loads === 'motors' || app?.loads === 'mixed') {
    let n = 1;
    for (const m of c.motors) for (let i = 0; i < m.qty; i++) out.push({ label: `M${n++}`, sub: `${m.hp}HP ${starterOf(m, c).replace('Star-Delta', 'S/D').replace('Soft starter', 'SS')}`, kind: 'motor' });
  }
  if (app?.loads === 'generator') for (let i = 1; i <= c.generator.sets; i++) out.push({ label: `DG${i}`, sub: `${c.generator.kva}kVA`, kind: 'gen' });
  if (app?.loads === 'fire') {
    out.push({ label: 'MAIN', sub: `${c.fire.mainHp}HP`, kind: 'fire' });
    if (c.fire.standbyMain) out.push({ label: 'STBY', sub: `${c.fire.mainHp}HP`, kind: 'fire' });
    out.push({ label: 'JOCKEY', sub: `${c.fire.jockeyHp}HP`, kind: 'fire' });
    if (c.fire.diesel) out.push({ label: 'DIESEL', sub: 'ENGINE', kind: 'fire' });
  }
  if (app?.loads === 'feeders' || app?.loads === 'mixed' || app?.loads === 'generator') {
    let n = 1;
    for (const f of c.feeders) for (let i = 0; i < f.qty; i++) out.push({ label: `F${n++}`, sub: `${f.amps}A ${f.device}`, kind: 'feeder' });
  }
  return out;
}

export function panelSVG(c: PanelConfig, s: Summary = compute(c)): string {
  const mods = modules(c);
  const plc = c.options.control.includes('PLC');
  const shown = mods.slice(0, 28);
  const rows = 4;
  const cols = Math.max(1, Math.ceil(shown.length / rows));
  const colW = 96, incW = 120, plcW = plc ? 104 : 0;
  const H = 330, top = c.options.location === 'Outdoor' ? 26 : 10;
  const W = incW + plcW + cols * colW;
  const wall = c.options.mounting === 'Wall mounted';
  const body = '#dfe2e6', edge = '#9aa3ad', door = '#eceef1';
  const lamp = (x: number, y: number, col: string) => `<circle cx="${x}" cy="${y}" r="4.2" fill="${col}" stroke="#555" stroke-width=".6"/>`;
  const knob = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="8" fill="#2b2f36"/><rect x="${x - 1.6}" y="${y - 8}" width="3.2" height="9" fill="#d71920" rx="1"/>`;
  let g = '';

  // incomer column
  g += `<rect x="0" y="${top}" width="${incW}" height="${H}" fill="${door}" stroke="${edge}"/>`;
  g += `<text x="${incW / 2}" y="${top + 20}" class="t-h">INCOMER</text>`;
  if (c.options.metering !== 'None') {
    g += `<rect x="${incW / 2 - 26}" y="${top + 32}" width="52" height="38" rx="3" fill="#1e2a3a"/><text x="${incW / 2}" y="${top + 56}" class="t-lcd">${s.incomerAmps ? s.runningAmps + 'A' : '---'}</text>`;
  }
  g += `${lamp(incW / 2 - 20, top + 90, '#e53935')}${lamp(incW / 2, top + 90, '#fdd835')}${lamp(incW / 2 + 20, top + 90, '#1e88e5')}`;
  g += `<rect x="${incW / 2 - 30}" y="${top + 112}" width="60" height="74" rx="4" fill="#2b2f36"/><rect x="${incW / 2 - 8}" y="${top + 132}" width="16" height="30" rx="2" fill="#d71920"/>`;
  g += `<text x="${incW / 2}" y="${top + 206}" class="t-s">${s.incomerAmps ? `${s.incomerAmps}A ${s.incomerDevice}` : 'MCCB'}</text>`;
  g += `<rect x="12" y="${top + 228}" width="${incW - 24}" height="${H - 244}" fill="none" stroke="${edge}" stroke-dasharray="3 3"/><text x="${incW / 2}" y="${top + 248}" class="t-s">BUSBAR</text><text x="${incW / 2}" y="${top + 262}" class="t-s">${esc(c.options.busbar.toUpperCase())}</text>`;

  // PLC column
  if (plc) {
    const x = incW;
    g += `<rect x="${x}" y="${top}" width="${plcW}" height="${H}" fill="${door}" stroke="${edge}"/>`;
    g += `<text x="${x + plcW / 2}" y="${top + 20}" class="t-h">PLC / HMI</text>`;
    g += `<rect x="${x + 14}" y="${top + 34}" width="${plcW - 28}" height="58" rx="4" fill="#0f2a4a"/><rect x="${x + 20}" y="${top + 40}" width="${plcW - 40}" height="44" fill="#2f6fd6" opacity=".55"/>`;
    g += `<rect x="${x + 22}" y="${top + 48}" width="20" height="6" fill="#9be7a0"/><rect x="${x + 22}" y="${top + 60}" width="34" height="6" fill="#fff" opacity=".7"/>`;
    for (let i = 0; i < 3; i++) g += `<rect x="${x + 18 + i * 24}" y="${top + 110}" width="18" height="12" rx="2" fill="${['#43a047', '#e53935', '#fdd835'][i]}"/>`;
    g += `<text x="${x + plcW / 2}" y="${top + 150}" class="t-s">${c.options.control.includes('SCADA') ? 'SCADA READY' : 'AUTO / MAN'}</text>`;
    g += knob(x + plcW / 2, top + 178);
  }

  // feeder modules
  const mh = (H - 30) / rows;
  shown.forEach((m, i) => {
    const col = Math.floor(i / rows), r = i % rows;
    const x = incW + plcW + col * colW, y = top + 30 + r * mh;
    const fill = m.kind === 'fire' ? '#f6d4d4' : m.kind === 'gen' ? '#dbe6f6' : door;
    g += `<rect x="${x + 4}" y="${y + 3}" width="${colW - 8}" height="${mh - 6}" rx="3" fill="${fill}" stroke="${edge}"/>`;
    g += knob(x + 24, y + mh / 2);
    g += `${lamp(x + 50, y + 16, '#43a047')}${lamp(x + 64, y + 16, '#e53935')}${lamp(x + 78, y + 16, '#fbc02d')}`;
    g += `<rect x="${x + 40}" y="${y + mh / 2 - 2}" width="${colW - 50}" height="16" rx="2" fill="#1b3478"/><text x="${x + 40 + (colW - 50) / 2}" y="${y + mh / 2 + 9.5}" class="t-tag">${esc(m.label)}</text>`;
    g += `<text x="${x + colW / 2 + 12}" y="${y + mh - 12}" class="t-s">${esc(m.sub)}</text>`;
  });
  for (let col = 0; col < cols; col++) {
    const x = incW + plcW + col * colW;
    g += `<rect x="${x}" y="${top}" width="${colW}" height="${H}" fill="none" stroke="${edge}"/>`;
    if (col === 0) g += `<text x="${incW + plcW + (cols * colW) / 2}" y="${top + 20}" class="t-h">${mods.length ? 'OUTGOING' : 'ADD LOADS'}</text>`;
  }
  if (!mods.length) g += `<text x="${incW + plcW + colW / 2}" y="${top + H / 2}" class="t-s">—</text>`;
  if (mods.length > shown.length) g += `<text x="${W - 8}" y="${top + H - 8}" class="t-s" text-anchor="end">+${mods.length - shown.length} more</text>`;

  // frame, canopy, plinth, nameplate
  g = `<rect x="-6" y="${top - 6}" width="${W + 12}" height="${H + 12}" rx="4" fill="${body}" stroke="${edge}" stroke-width="1.5"/>` + g;
  if (c.options.location === 'Outdoor') g = `<path d="M-14 ${top - 6} L${W / 2} 2 L${W + 14} ${top - 6} Z" fill="#c7ccd2" stroke="${edge}"/>` + g;
  if (!wall) g += `<rect x="-6" y="${top + H + 6}" width="${W + 12}" height="16" fill="#2b2f36"/>`;
  g += `<rect x="${incW / 2 - 34}" y="${top + 2}" width="68" height="4" fill="var(--brand-accent, #cd030d)"/>`;

  const totalH = top + H + (wall ? 12 : 26);
  return `<svg class="panel-svg" viewBox="-16 0 ${W + 32} ${totalH + 26}" role="img" aria-label="Panel layout preview">
    <style>.t-h{font:600 10px var(--font-mono,monospace);fill:#344054;text-anchor:middle;letter-spacing:.08em}.t-s{font:500 9px var(--font-mono,monospace);fill:#475467;text-anchor:middle}.t-tag{font:700 9px var(--font-mono,monospace);fill:#fff;text-anchor:middle}.t-lcd{font:700 13px var(--font-mono,monospace);fill:#7CFC9A;text-anchor:middle}</style>
    ${g}
    <text x="${W / 2}" y="${totalH + 18}" class="t-s">${esc(c.options.ip)} · ${esc(c.options.mounting.toUpperCase())} · ${esc(c.options.location.toUpperCase())}</text>
  </svg>`;
}
