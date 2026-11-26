import { getCollection, type CollectionEntry } from 'astro:content';

export type Client = CollectionEntry<'clients'>;

// Skip the lookup (and Astro's "empty collection" warning) until a client file exists.
const hasFiles = Object.keys(import.meta.glob('../content/clients/*.json')).length > 0;

export async function getClients(): Promise<Client[]> {
  if (!hasFiles) return [];
  const all = await getCollection('clients', ({ data }) => data.published);
  return all.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}

export const initials = (name: string) =>
  name
    .replace(/\b(pvt|ltd|private|limited|llp|inc|co)\b\.?/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
