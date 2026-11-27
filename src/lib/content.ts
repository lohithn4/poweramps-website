import { getCollection, type CollectionEntry } from 'astro:content';
import { typeBySlug, typeHref, type PanelType } from '../data/panel-types';

export type Article = CollectionEntry<'articles'>;
export type Project = CollectionEntry<'projects'>;

// Skip the lookup (and Astro's "empty collection" warning) until a file exists.
const hasArticles = Object.keys(import.meta.glob('../content/articles/*.md')).length > 0;
const hasProjects = Object.keys(import.meta.glob('../content/projects/*.md')).length > 0;

/** Published articles, newest first. */
export async function getArticles(): Promise<Article[]> {
  if (!hasArticles) return [];
  const all = await getCollection('articles', ({ data }) => !data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Published case studies: featured first, then sort order, then newest year. */
export async function getProjects(): Promise<Project[]> {
  if (!hasProjects) return [];
  const all = await getCollection('projects', ({ data }) => !data.draft);
  return all.sort(
    (a, b) => Number(b.data.featured) - Number(a.data.featured) || a.data.order - b.data.order || (b.data.year ?? 0) - (a.data.year ?? 0),
  );
}

/** Panel types an article or project is about (unknown slugs are ignored). */
export const topicTypes = (topics: string[]): PanelType[] =>
  topics.map((s) => typeBySlug.get(s)).filter((t): t is PanelType => !!t);

export const topicLinks = (topics: string[]) => topicTypes(topics).map((t) => ({ href: typeHref(t.slug), label: t.short, name: t.name }));

/** Who the project was for: the client's name if they agreed to be named, else the type of client. */
export const projectFor = (p: Project['data']) => p.client || p.clientType || p.industry || '';

export const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** Rough reading time for a markdown body. */
export const readMinutes = (body = '') => Math.max(2, Math.round(body.split(/\s+/).filter(Boolean).length / 200));
