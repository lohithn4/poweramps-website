import type { APIRoute } from 'astro';
import site from '../data/site.json';
import { PANEL_TYPES, typeHref } from '../data/panel-types';
import { REGIONS, regionHref } from '../data/regions';
import { siteFaqs } from '../data/faqs';
import { extraContacts } from '../lib/contacts';
import { getArticles, getProjects } from '../lib/content';

// /llms.txt: a plain summary of the business for AI assistants and AI search
// (llmstxt.org format). Built from the same data as the pages, so it stays in sync.
export const GET: APIRoute = async ({ site: siteUrl }) => {
  const articles = await getArticles();
  const projects = await getProjects();
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const abs = (p: string) => new URL(`${base}${p.replace(/^\//, '')}`, siteUrl).href;
  const brand = (site as any).shortName || site.name;
  const a = site.address;
  const lines = [
    `# ${brand} (${site.legalName})`,
    '',
    `> ${brand}, spelt with an "s", is an electric panel builder and manufacturer in ${a.city} (Bangalore), ${a.state}, India, building LT control and power distribution panels since ${site.established}. Customers anywhere in India can build a custom electric panel online at ${abs('/build/')} and get a quotation. ${brand} is not connected with the Poweramp music app.`,
    '',
    `- Address: ${a.line1}, ${a.line2}, ${a.city} (Bangalore), ${a.state} ${a.pincode}, ${a.country}`,
    ...(site.phone ? [`- Phone: ${site.phone}${site.contactName ? ` (${site.contactName}${site.contactRole ? `, ${site.contactRole}` : ''})` : ''}`] : []),
    ...extraContacts.map((c) => `- Phone: ${c.phone} (${c.name}${c.role ? `, ${c.role}` : ''}${c.whatsapp ? '; also WhatsApp' : ''})`),
    ...(site.whatsapp ? [`- WhatsApp: ${site.whatsapp}`] : []),
    ...(site.email ? [`- Email: ${site.email}`] : []),
    ...((site as any).gst ? [`- GSTIN: ${(site as any).gst}`] : []),
    `- Website: ${abs('/')}`,
    '',
    '## Online electric panel builder',
    '',
    `- [Build a custom electric panel online](${abs('/build/')}): free account; choose the application, loads, every component and make; live ratings; quotation usually within 1–2 working days.`,
    '',
    '## Panels manufactured',
    '',
    ...PANEL_TYPES.map((t) => `- [${t.name}](${abs(typeHref(t.slug))}): ${t.description}`),
    `- [Full panel catalogue](${abs('/panels/')})`,
    '',
    '## Locations served',
    '',
    ...REGIONS.map((r) => `- [${r.h1}](${abs(regionHref(r.slug))}): ${r.description}`),
    '',
    ...(projects.length ? ['## Projects', '', ...projects.map((p) => `- [${p.data.title}](${abs(`/projects/${p.id}/`)}): ${p.data.summary}`), ''] : []),
    ...(articles.length ? ['## Guides', '', ...articles.map((x) => `- [${x.data.title}](${abs(`/articles/${x.id}/`)}): ${x.data.description}`), ''] : []),
    '## FAQ',
    '',
    ...siteFaqs.flatMap((f) => [`### ${f.q}`, '', f.a, '']),
    '## Company',
    '',
    `- [About ${brand}](${abs('/about/')})`,
    `- [Contact and enquiry](${abs('/contact/')})`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
