/** Browser client for the portal API (Cloudflare Worker). URL comes from PUBLIC_API_URL or site.json → apiUrl. */
export const API_URL: string = ((import.meta.env.PUBLIC_API_URL as string | undefined) || document.documentElement.dataset.api || '').replace(/\/$/, '');
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const sitePath = (p: string) => `${BASE}${p.startsWith('/') ? p : `/${p}`}`;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export interface Me {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  company: string | null;
  role: 'client' | 'staff' | 'admin';
  verified: boolean;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Please check your connection and try again.', 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed', data.code);
  return data as T;
}

const FLAG = 'portal_signed_in';
const ROLE = 'portal_role';
/** Remembers (per browser) that someone is signed in, and their role, so the static header can show the account menu. */
export const markSignedIn = (on: boolean, role?: string) => {
  try {
    if (on) { localStorage.setItem(FLAG, '1'); if (role) localStorage.setItem(ROLE, role); }
    else { localStorage.removeItem(FLAG); localStorage.removeItem(ROLE); }
  } catch {}
};
export const looksSignedIn = () => {
  try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
};

let meCache: Promise<Me | null> | null = null;
export function getMe(force = false): Promise<Me | null> {
  if (!meCache || force) {
    meCache = api<{ user: Me | null }>('/auth/me')
      .then((r) => { markSignedIn(!!r.user, r.user?.role); return r.user; })
      .catch((e) => { if (e.status !== 0) markSignedIn(false); throw e; });
  }
  return meCache;
}

/** Redirects to login if not signed in (or lacking the role). Resolves with the user. */
export async function requireAuth(role?: 'staff'): Promise<Me> {
  const me = await getMe();
  const here = location.pathname.replace(BASE, '') + location.search;
  if (!me) {
    location.href = sitePath(`/portal/login/?next=${encodeURIComponent(here)}`);
    throw new ApiError(401, 'redirecting');
  }
  if (role === 'staff' && me.role === 'client') {
    location.href = sitePath('/portal/');
    throw new ApiError(403, 'redirecting');
  }
  return me;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch {}
  markSignedIn(false);
  location.href = sitePath('/');
}

export const homeFor = (me: Me) => (me.role === 'client' ? '/portal/' : '/staff/');
