import { getCollection, type CollectionEntry } from 'astro:content';

export type Panel = CollectionEntry<'panels'>;
export type Category = CollectionEntry<'categories'>;

const byOrder = <T extends { data: { order: number; title: string } }>(a: T, b: T) =>
  a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);

export async function getPanels(): Promise<Panel[]> {
  const all = await getCollection('panels', ({ data }) => !data.draft);
  return all.sort(byOrder);
}

export async function getCategories(): Promise<Category[]> {
  return (await getCollection('categories')).sort(byOrder);
}

export async function getCategoryMap(): Promise<Map<string, Category>> {
  return new Map((await getCategories()).map((c) => [c.id, c]));
}
