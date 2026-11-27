import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const spec = z.object({
  label: z.string(),
  value: z.string(),
});

/** Product categories, e.g. "Control & Automation". Edited in /admin → Categories. */
const categories = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/categories' }),
  schema: z.object({
    title: z.string(),
    code: z.string().max(4), // short tag shown on cards, e.g. "CA"
    order: z.number().default(99),
    need: z.string().optional(), // client-facing headline, e.g. "Run, protect & automate motors"
    benefit: z.string().optional(), // short phrase for the hero: "Panels that keep your …"
    description: z.string(),
  }),
});

/** One file per panel. Edited in /admin → Panels. */
const panels = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/panels' }),
  schema: z.object({
    title: z.string(),
    category: reference('categories'),
    summary: z.string(),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    image: z.string(),
    gallery: z.array(z.string()).default([]),
    // Up to 4 headline ratings shown on cards and the rating plate.
    highlights: z.array(spec).max(4).default([]),
    specs: z.array(spec).default([]),
    features: z.array(z.string()).default([]),
    applications: z.array(z.string()).default([]),
    price: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

/** Real clients & testimonials. Edited in /admin → Clients. Hidden on the site until at least one is published. */
const clients = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/clients' }),
  schema: z.object({
    name: z.string(), // company name
    logo: z.string().optional(),
    industry: z.string().optional(),
    city: z.string().optional(),
    project: z.string().optional(), // what we supplied, e.g. "MCC & VFD panels for STP"
    quote: z.string().optional(),
    person: z.string().optional(),
    role: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    published: z.boolean().default(true),
  }),
});

const faq = z.object({ q: z.string(), a: z.string() });

/**
 * Articles / guides. Edited in /admin → Articles. Written for buyers and engineers
 * searching for panel topics; each links to the relevant panel pages and the builder.
 */
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(), // one or two sentences: card text and Google snippet
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default('Poweramps engineering team'),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    topics: z.array(z.string()).default([]), // panel-type slugs from src/data/panel-types.ts, e.g. "mcc-panel"
    faqs: z.array(faq).default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

/**
 * Case studies of real projects. Edited in /admin → Projects. The Projects pages,
 * menu link and home section appear only once at least one is published.
 */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(), // e.g. "MCC and VFD panels for a 2 MLD sewage treatment plant"
    summary: z.string(),
    client: z.string().optional(), // name only with the client's permission; otherwise leave empty
    clientType: z.string().optional(), // shown when the client is not named, e.g. "Pharmaceutical plant"
    industry: z.string().optional(),
    city: z.string(),
    state: z.string().default('Karnataka'),
    year: z.number().int().optional(),
    topics: z.array(z.string()).default([]), // panel-type slugs supplied on this project
    image: z.string(),
    gallery: z.array(z.string()).default([]),
    highlights: z.array(spec).max(4).default([]), // e.g. Busbar / 2500 A
    quote: z.string().optional(),
    person: z.string().optional(),
    role: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    draft: z.boolean().default(false),
  }),
});

export const collections = { categories, panels, clients, articles, projects };
