const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Prefix an internal path with the site base (needed on GitHub Pages,
 * where the site lives under /<repo>/). External URLs pass through.
 */
export function url(path = '/'): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('mailto:') || path.startsWith('tel:') || path.startsWith('#')) {
    return path;
  }
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${clean}`;
}

export function isActive(current: string, href: string): boolean {
  const target = url(href).replace(/\/$/, '');
  const now = current.replace(/\/$/, '');
  return href === '/' ? now === (BASE || '') : now.startsWith(target);
}
