# Poweramps Technology: Panel Showcase Website

The product website for **Poweramps Technology Pvt. Ltd.**: a catalogue of electrical control and power distribution panels with specification sheets, enquiry forms and company information.

- **Website:** [Astro](https://astro.build), a static site that is fast and search-engine friendly
- **Content editor:** [Sveltia CMS](https://github.com/sveltia/sveltia-cms) at `/admin`
- **Hosting:** GitHub Pages (free), published automatically by GitHub Actions
- **Database:** none. Every panel is a Markdown file in this repo.

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
