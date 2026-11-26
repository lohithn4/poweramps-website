# Launching this platform for another company

This repository is a **white-label** product website + client/staff portal for panel manufacturers
and similar B2B engineering firms. Nothing company-specific is hard-coded: everything comes from
settings and content files, so a new company is a configuration exercise, not a code change.

## What is configurable, and where

| What | Where | Edited via |
|---|---|---|
| Company name, legal name, tagline, SEO title | `src/data/site.json` | `/admin` → Site settings |
| Logo text, optional logo image, **brand colours** (whole theme, favicon, emails) | `site.json` → `brand` | `/admin` → Site settings → Brand |
| Address, locality, map pin, phone, WhatsApp, email | `site.json` | `/admin` → Site settings |
| GSTIN, CIN, IEC, marketplace link | `site.json` | `/admin` → Site settings |
| Order reference prefix (e.g. `PA` → `PA-2026-0001`) | `site.json` → `refPrefix` | `/admin` → Site settings |
| Home hero wording, About page story | `site.json` → `hero`, `about` | `/admin` → Site settings |
| Industries ticker | `site.json` → `industries` | `/admin` → Site settings |
| Products / panels and photos | `src/content/panels/*.md`, `public/uploads/` | `/admin` → Panels |
| Product lines (+ client "need" and hero phrase) | `src/content/categories/*.json` | `/admin` → Categories |
| Clients & testimonials | `src/content/clients/*.json` | `/admin` → Clients |
| Brand files for print/social (`public/brand/logo.png` etc.) | `public/brand/` | replace files |
| **Deployment** (domains, database, email sender, OAuth IDs) | `worker/wrangler.jsonc` → "PER-COMPANY" block | edit file |

The API (Cloudflare Worker) reads the brand from `<site>/brand.json`, which is generated from
`site.json`, so emails, subjects and order references always match the website.
Changes reach emails within about 10 minutes of the site rebuilding.

## Checklist for a new company

1. **Copy the repo** (GitHub → *Use this template*, or fork) into the new company's account.
2. **Site settings**: edit `src/data/site.json` (or `/admin` once deployed): name, brand colours,
   address, map, GST, prefix, hero/about text.
3. **Content**: replace `src/content/panels`, `src/content/categories`, `src/content/clients`
   and `public/uploads/`. Delete what doesn't apply.
4. **Brand files**: replace `public/brand/logo.png`, `logo-white.png`, `logo-mark.svg`.
5. **GitHub Pages**: Settings → Pages → Source: *GitHub Actions*. Add the company's custom domain.
6. **API (Cloudflare)**, inside `worker/`:
   ```bash
   npx wrangler login
   npx wrangler d1 create <company>-portal        # copy the database_id into wrangler.jsonc
   # edit the PER-COMPANY block in wrangler.jsonc (name, routes, SITE_URL, API_URL, origins, cookie domain, EMAIL_FROM)
   npx wrangler d1 migrations apply <db-name> --remote
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put SETUP_TOKEN
   npx wrangler deploy
   ```
7. **Email**: verify the company's domain in Resend (adds DNS records) so emails come from `no-reply@<domain>`.
8. **First admin**: `POST https://api.<domain>/setup/admin` with `{ token, email, name, password }`
   (the SETUP_TOKEN secret). It only works while no admin exists.
9. **Social sign-in (optional)**: create OAuth apps (Google / Microsoft / LinkedIn) with redirect URI
   `https://api.<domain>/auth/oauth/<provider>/callback`, put the client IDs in `wrangler.jsonc`
   and the secrets with `wrangler secret put`.
10. Set `apiUrl` in site settings to `https://api.<domain>` and publish.

## What stays product-specific

The **panel builder** (motors, feeders, generators, fire pumps, electrical ratings) is designed for
electrical panel manufacturers. Other industries can reuse the portal, quotes, orders and tracking
as-is, but would need their own builder steps in `src/scripts/panel.ts` and `src/pages/build/`.
