# Poweramps Technology: Panel Showcase Website

The product website for **Poweramps Technology Pvt. Ltd.**: a catalogue of electrical control and power distribution panels with specification sheets, enquiry forms and company information.

- **Website:** [Astro](https://astro.build), a static site that is fast and search-engine friendly
- **Content editor:** [Sveltia CMS](https://github.com/sveltia/sveltia-cms) at `/admin`
- **Hosting:** GitHub Pages (free), published automatically by GitHub Actions
- **Database:** none for the public site (every panel is a Markdown file). The client/staff portal stores private data in a Cloudflare D1 database, never in this repo.

---

## Adding or editing panels (no coding)

1. Open **`https://<your-site>/admin/`**
2. Click **Sign in with GitHub Access Token** and paste your token (see *One-time setup* below).
3. Go to **Panels** and click **New Panel**, or click an existing panel to edit it.
4. Fill in the name, category and summary, upload photos, then add ratings, specifications, features and applications.
5. Click **Save**. The live site updates in about 1–2 minutes.

Other items you can edit in the same place:

| Section | What it controls |
|---|---|
| **Panels** | Every product page and card |
| **Categories** | Product lines (Control & Automation, Fire Fighting, …) |
| **Site settings** | Company name, phone, WhatsApp, email, address, GST, IndiaMART link, whether prices show |

Tips:
- **Headline ratings** (max 4) appear on the product card and the metal "rating plate". Use the most important numbers, e.g. *Voltage: 415 V AC*.
- **Featured on home page** puts the panel in the home page grid. The first 6 featured panels are shown.
- **Sort order**: lower numbers appear first.
- **Draft** hides a panel without deleting it.
- Photos on a white or light background look best.

### One-time setup: GitHub access token for the editor
1. Go to GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Under **Repository access**, choose *Only select repositories* and pick this repo.
3. Under **Permissions → Repository permissions**, set **Contents: Read and write**.
4. Generate the token, copy it, and paste it into the `/admin` sign-in screen. The browser remembers it.

---

## Enquiries

Enquiries are handled according to what is filled in **Site settings**:

| Setting | What the "Send enquiry" button does |
|---|---|
| **Form endpoint** set (e.g. a free [Formspree](https://formspree.io) URL) | Emails the enquiry to you directly. **Recommended.** |
| Only **Email** set | Opens the visitor's email app with the message filled in |
| Only **WhatsApp** set | Opens WhatsApp with the message filled in |
| Nothing set | Copies the message and opens the IndiaMART enquiry page |

Phone, WhatsApp and email buttons appear across the site as soon as those fields are filled.

---

## SEO

- **Panel-type landing pages** (`/mcc-panel-manufacturer/`, `/amf-panel-manufacturer/` …) come from
  `src/data/panel-types.ts`: heading, intro, what we build, uses, FAQs and which catalogue panels to show.
  Add a type there and it appears in the footer, the catalogue's "Browse by type" row and the sitemap.
  Keep every claim true.
- `robots.txt` and the sitemap leave out `/portal/`, `/staff/` and `/admin/`; those pages also carry `noindex`.
- Structured data: LocalBusiness on every page, Product + BreadcrumbList on panel pages,
  Service + BreadcrumbList + FAQPage on panel-type pages.

## Developer notes

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # output in dist/
```

```
src/
  content/panels/*.md        ← one file per panel (front matter = specs)
  content/categories/*.json  ← product lines
  data/site.json             ← company & contact settings
  content.config.ts          ← content schema (validated at build)
  pages/                     ← home, /panels, /panels/[slug], /about, /contact
  pages/admin/config.yml.ts  ← generates the CMS config (repo detected automatically)
  components/, layouts/, styles/global.css
public/
  uploads/panels/            ← product photos (CMS uploads go here)
  admin/index.html           ← CMS app
.github/workflows/deploy.yml ← build & publish to GitHub Pages on every push to main
```

**Deployment:** in the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. Each push to `main` (including saves from `/admin`) rebuilds the site. The site URL and base path (`/<repo>/`) are detected automatically, so a custom domain also works with no code changes.

**Local CMS editing:** run `npm run dev`, open `http://localhost:4321/admin/` in Chrome or Edge, and choose **Work with Local Repository** to edit files on disk without a token.

---

## Client & staff portal (Phase 1)

- **Panel builder** at `/build/`: configure a panel online: application, loads (live ratings and drawing), then every component and make (incomer, breakers, busbar, meters, relays, PLC / HMI, VFD, sheet steel, form of separation, IP, add-ons, testing). Signed-in clients save panels to **My builds**, add as many as the project needs, and send one quote request or order for several panels; staff get one quotation line per panel.
- **Client portal** at `/portal/`: email-verified accounts (plus optional Google / Microsoft / LinkedIn sign-in), order tracking, quotation acceptance.
- **Staff portal** at `/staff/`: all requests, status updates (emailed to clients), quotations, internal notes, team management.
- **Backend**: Cloudflare Worker + D1 database in `worker/` (private data never goes into this repo). See `worker/wrangler.jsonc`.

Local development: `cd worker && npm run migrate:local && npm run dev` (API on :8787), then `npm run dev` in the root (site on :4321, uses `.env.development`).

## Accounts / mini-ERP (staff portal)

All private: stored in the Cloudflare D1 database, never in this repo. Staff menu at `/staff/`:

| Screen | What it does |
|---|---|
| **Accounts** | Receivables, overdue, payables, loans, this month's sales, collections and estimated GST |
| **Quotes & invoices** | BOQ → quotation → GST tax invoice (CGST+SGST or IGST chosen automatically), purchase bills; numbering per financial year (e.g. `PA/26-27/0001`); issued invoices are locked; print / PDF; email to client |
| **Payments** | Receipts (with TDS), supplier payments, loans received and repayments (interest split) |
| **Parties** | Customers, suppliers, lenders with live balance and ledger statement |
| **Items** | HSN, GST %, rates, opening stock; stock = opening + purchases − invoices |
| **GST & reports** | GSTR-1 (B2B, B2CL, B2CS, HSN B2B/B2C, documents issued) and GSTR-3B summary as CSV in GST offline tool columns; sales/purchase registers; receivable/payable ageing |
| **Tally** | Works with TallyPrime 3.0+ (3.x–6.x), TallyPrime 1.x/2.x, Tally.ERP 9 and older Tally 9 / 7.2: pick the version on the Tally page. Import (sync / add only / update only, with preview) from a Tally Masters XML export (Unicode or ASCII), Excel (.xlsx, Excel 2003 XML) or CSV; ledgers under groups missing from the file can be assigned a type. Export new parties/items/units and vouchers (sales, purchases, receipts, payments, loans) as Tally XML in that version's layout, then mark as sent |
| **Feedback** | Ratings sent automatically when an order is marked Delivered; 9–10 with consent can be published as testimonials (website updates daily, or immediately if `GITHUB_DISPATCH_TOKEN` is set on the worker) |
| **Settings** | Number formats, default terms, bank details, Tally ledger names (admins only) |

Clients see their quotations and invoices in `/portal/`, download PDFs and accept quotations online. E-invoicing (IRN) and direct GST filing need a paid GST Suvidha Provider and are not included.

## Reusing for another company

Everything company-specific lives in settings and content. See **[WHITE-LABEL.md](WHITE-LABEL.md)**.
