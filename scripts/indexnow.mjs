// Tell Bing / Yandex / Seznam (IndexNow) that the site's public pages changed, so they recrawl now.
// Usage: node scripts/indexnow.mjs https://poweramps.in
// The key file public/<key>.txt is published at the site root, which proves we own the domain.
import fs from 'node:fs';

const site = (process.argv[2] || process.env.SITE_URL || '').replace(/\/$/, '');
if (!site) { console.error('Usage: node scripts/indexnow.mjs <site-url>'); process.exit(1); }
const keyFile = fs.readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('No IndexNow key file in public/'); process.exit(1); }
const key = keyFile.slice(0, -4);

const xml = await (await fetch(`${site}/sitemap-0.xml`)).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) { console.error('Sitemap had no URLs'); process.exit(1); }

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${keyFile}`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
// 200/202 = accepted. 403 = key file not live yet. Never fail the deploy over this.
