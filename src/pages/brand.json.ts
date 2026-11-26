import type { APIRoute } from 'astro';
import site from '../data/site.json';

/**
 * Public brand settings, generated from site.json at build time.
 * The API (worker) reads this so emails, order references and branding
 * always match the website. Edit them once in /admin → Site settings.
 */
export const GET: APIRoute = ({ site: siteUrl }) => {
  const a = site.address;
  const body = {
    name: site.name,
    legalName: site.legalName,
    wordmark: site.brand.wordmark || site.name,
    wordmarkSub: site.brand.wordmarkSub,
    primary: site.brand.primary,
    accent: site.brand.accent,
    dark: site.brand.dark,
    refPrefix: (site.refPrefix || 'REQ').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'REQ',
    addressLine: [a.locality || a.line1, a.city, a.pincode].filter(Boolean).join(', '),
    gstin: site.gst,
    state: a.state,
    email: site.email,
    phone: site.phone,
    siteUrl: new URL(import.meta.env.BASE_URL, siteUrl).href.replace(/\/$/, ''),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json' } });
};
