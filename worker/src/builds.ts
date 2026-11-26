import { Env, HttpError, json, readJson, str, requireUser } from './lib';

/**
 * "My builds": panels a signed-in client has configured and saved. Several builds can be
 * sent together as one quote request / order (see createRequest → panels).
 */

const MAX_BUILDS = 200;

interface BuildRow {
  id: number; user_id: number; name: string; title: string; quantity: number;
  config: string; summary: string | null; request_id: number | null; created_at: string; updated_at: string;
}

function fields(b: Record<string, any>) {
  if (typeof b.config !== 'object' || b.config === null || Array.isArray(b.config)) throw new HttpError(400, 'Panel configuration is missing');
  const config = JSON.stringify(b.config);
  if (config.length > 100_000) throw new HttpError(400, 'This panel is too large to save');
  const title = str(b.title, 'Title', { required: true, max: 200 });
  return {
    name: str(b.name, 'Name', { max: 120 }) || title,
    title,
    quantity: Math.min(999, Math.max(1, parseInt(b.quantity, 10) || 1)),
    config,
    summary: b.summary && typeof b.summary === 'object' ? JSON.stringify(b.summary) : null,
  };
}

const out = (r: BuildRow & { request_ref?: string | null; request_status?: string | null }) => ({
  ...r, config: JSON.parse(r.config), summary: r.summary ? JSON.parse(r.summary) : null,
});

async function own(env: Env, userId: number, id: number) {
  const r = await env.DB.prepare('SELECT * FROM builds WHERE id = ? AND user_id = ?').bind(id, userId).first<BuildRow>();
  if (!r) throw new HttpError(404, 'Saved panel not found');
  return r;
}

export async function listBuilds(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `SELECT b.*, r.ref AS request_ref, r.status AS request_status FROM builds b LEFT JOIN requests r ON r.id = b.request_id
      WHERE b.user_id = ? ORDER BY b.request_id IS NOT NULL, b.updated_at DESC LIMIT ${MAX_BUILDS}`,
  ).bind(u.id).all<BuildRow>();
  return json({ builds: results.map(out) });
}

export async function getBuild(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  return json({ build: out(await own(env, u.id, id)) });
}

export async function createBuild(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const f = fields(await readJson(req, 150_000));
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM builds WHERE user_id = ?').bind(u.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_BUILDS) throw new HttpError(400, `You can keep up to ${MAX_BUILDS} saved panels. Delete some old ones first.`);
  const r = await env.DB.prepare('INSERT INTO builds (user_id, name, title, quantity, config, summary) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(u.id, f.name, f.title, f.quantity, f.config, f.summary).run();
  return json({ ok: true, id: Number(r.meta.last_row_id) }, 201);
}

export async function updateBuild(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  const cur = await own(env, u.id, id);
  if (cur.request_id) throw new HttpError(409, 'This panel was already sent to us. Save it as a new panel to make changes.');
  const f = fields(await readJson(req, 150_000));
  await env.DB.prepare("UPDATE builds SET name = ?, title = ?, quantity = ?, config = ?, summary = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(f.name, f.title, f.quantity, f.config, f.summary, id).run();
  return json({ ok: true, id });
}

export async function deleteBuild(req: Request, env: Env, id: number) {
  const u = await requireUser(req, env);
  await own(env, u.id, id);
  await env.DB.prepare('DELETE FROM builds WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

/** Panels attached to a new request: validated, plus the client's build ids to link. */
export function readPanels(raw: unknown): { name: string; title: string; quantity: number; config: unknown; summary: unknown; build_id: number | null }[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, 'Add at least one panel');
  if (raw.length > 25) throw new HttpError(400, 'Please send at most 25 different panels in one request');
  return raw.map((p: any, i) => {
    if (typeof p?.config !== 'object' || p.config === null) throw new HttpError(400, `Panel ${i + 1} has no configuration`);
    const title = str(p.title, `Panel ${i + 1} title`, { required: true, max: 200 });
    return {
      name: str(p.name, `Panel ${i + 1} name`, { max: 120 }) || title,
      title,
      quantity: Math.min(999, Math.max(1, parseInt(p.quantity, 10) || 1)),
      config: p.config,
      summary: p.summary && typeof p.summary === 'object' ? p.summary : null,
      build_id: Number.isInteger(p.build_id) ? p.build_id : null,
    };
  });
}
