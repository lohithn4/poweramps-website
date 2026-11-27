import type { APIRoute } from 'astro';
import site from '../../data/site.json';
import { getArticles } from '../../lib/content';

// RSS feed of the articles (lets feed readers and some search tools pick up new guides).
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site: siteUrl }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const abs = (p: string) => new URL(`${base}${p.replace(/^\//, '')}`, siteUrl).href;
  const brand = (site as any).shortName || site.name;
  const items = (await getArticles())
    .map((a) => `    <item>
      <title>${esc(a.data.title)}</title>
      <link>${abs(`/articles/${a.id}/`)}</link>
      <guid>${abs(`/articles/${a.id}/`)}</guid>
      <pubDate>${a.data.date.toUTCString()}</pubDate>
      <description>${esc(a.data.description)}</description>
    </item>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(`${brand} electrical panel guides`)}</title>
    <link>${abs('/articles/')}</link>
    <atom:link href="${abs('/articles/rss.xml')}" rel="self" type="application/rss+xml" />
    <description>${esc(`Guides on electrical panels from ${site.legalName}, ${site.address.city}.`)}</description>
    <language>en-IN</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
