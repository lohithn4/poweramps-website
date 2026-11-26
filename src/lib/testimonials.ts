/**
 * Testimonials approved in the staff portal (9–10 ratings, client consent).
 * Fetched from the API once per build; the site rebuilds daily and on every content change.
 * Returns [] if the API is not configured or unreachable, so the build never fails because of it.
 */
import site from '../data/site.json';

export interface DbTestimonial {
  id: number; rating: number; quote: string; person: string; role: string | null;
  company: string | null; city: string | null; project: string | null; published_at: string;
}

/** Same shape as a client entry's data, so the Testimonial card can render both. */
export interface CardData { name: string; person?: string; role?: string; city?: string; quote?: string; project?: string; logo?: string }

let cache: Promise<DbTestimonial[]> | null = null;

export function getTestimonials(): Promise<DbTestimonial[]> {
  if (!cache) cache = (async () => {
    const api = String(import.meta.env.PUBLIC_API_URL || site.apiUrl || '').replace(/\/$/, '');
    if (!api) return [];
    try {
      const res = await fetch(`${api}/public/testimonials`, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = (await res.json()) as { testimonials?: DbTestimonial[] };
      return (data.testimonials ?? []).filter((t) => t.quote);
    } catch (e) {
      console.warn('[testimonials] could not load from API:', String(e));
      return [];
    }
  })();
  return cache;
}

export const toCard = (t: DbTestimonial): CardData => ({
  name: t.company || t.person,
  person: t.company ? t.person : undefined,
  role: t.role ?? undefined,
  city: t.city ?? undefined,
  quote: t.quote,
  project: t.project ?? undefined,
});
