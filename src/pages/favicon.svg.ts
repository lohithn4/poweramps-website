import type { APIRoute } from 'astro';
import site from '../data/site.json';

/** Favicon generated from the brand colours in site.json. */
export const GET: APIRoute = () => {
  const p = site.brand.primary || '#024998';
  const a = site.brand.accent || '#cd030d';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" shape-rendering="crispEdges"><rect width="18.5" height="18.5" fill="${p}"/><rect x="21.5" width="18.5" height="18.5" fill="${a}"/><rect y="21.5" width="18.5" height="18.5" fill="${a}"/><rect x="21.5" y="21.5" width="18.5" height="18.5" fill="${p}"/></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
