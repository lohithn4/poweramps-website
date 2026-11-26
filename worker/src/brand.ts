import type { Env } from './lib';

/**
 * Company branding for emails and references. Single source of truth is the
 * website's /brand.json (generated from site.json, edited in /admin → Site settings),
 * so the API never needs code changes when the company details change.
 */
export interface Brand {
  name: string;
  legalName: string;
  wordmark: string;
  wordmarkSub: string;
  primary: string;
  accent: string;
  dark: string;
  refPrefix: string;
  addressLine: string;
  gstin: string;
  state: string;
  phone: string;
  email: string;
  siteUrl: string;
}

let cache: { at: number; brand: Brand } | null = null;
const TTL = 10 * 60 * 1000;
const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);

export async function getBrand(env: Env): Promise<Brand> {
  if (cache && Date.now() - cache.at < TTL) return cache.brand;
  const fallbackName = env.BRAND_NAME || new URL(env.SITE_URL).hostname;
  let data: Record<string, unknown> = {};
  try {
    const res = await fetch(`${env.SITE_URL}/brand.json`, { headers: { Accept: 'application/json' } });
    if (res.ok) data = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn('[brand] could not load brand.json, using fallbacks', String(e));
  }
  const s = (k: string, d: string) => (typeof data[k] === 'string' && data[k] ? String(data[k]) : d);
  const brand: Brand = {
    name: s('name', fallbackName),
    legalName: s('legalName', s('name', fallbackName)),
    wordmark: s('wordmark', s('name', fallbackName)).toUpperCase(),
    wordmarkSub: s('wordmarkSub', ''),
    primary: hex(data.primary, '#024998'),
    accent: hex(data.accent, '#cd030d'),
    dark: hex(data.dark, '#0c1a3d'),
    refPrefix: s('refPrefix', env.REF_PREFIX || 'REQ').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'REQ',
    addressLine: s('addressLine', ''),
    gstin: s('gstin', '').toUpperCase(),
    state: s('state', ''),
    phone: s('phone', ''),
    email: s('email', ''),
    siteUrl: env.SITE_URL,
  };
  // Only cache a successful load so a temporary outage self-heals.
  if (Object.keys(data).length) cache = { at: Date.now(), brand };
  return brand;
}
