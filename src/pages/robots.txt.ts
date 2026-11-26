import type { APIRoute } from 'astro';

// Search engines: crawl the public site, skip private areas, and here is the sitemap.
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const sitemap = new URL(`${base}sitemap-index.xml`, site).href;
  const body = [
    'User-agent: *',
    'Allow: /',
    `Disallow: ${base}portal/`,
    `Disallow: ${base}staff/`,
    `Disallow: ${base}admin/`,
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
