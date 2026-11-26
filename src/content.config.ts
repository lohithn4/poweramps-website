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

export const collections = { categories, panels, clients };
