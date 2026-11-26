// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';

// SITE_URL and BASE_PATH are set automatically by the GitHub Pages workflow
// (.github/workflows/deploy.yml), so the same code works for
// https://<user>.github.io/<repo>/ and for a custom domain.
const site = process.env.SITE_URL || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';

// Leave the Clients page out of the sitemap until real clients are added in /admin.
const clientsDir = './src/content/clients';
const hasClients = fs.existsSync(clientsDir) && fs.readdirSync(clientsDir).some((f) => f.endsWith('.json'));

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  integrations: [sitemap({ filter: (page) => hasClients || !page.includes('/clients') })],
});
