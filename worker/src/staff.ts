import { Env, User, HttpError, json, readJson, str, email as emailField, requireAdmin, requireStaff, issueToken } from './lib';
import { sendMail, esc } from './email';
import { getBrand } from './brand';

export async function listUsers(req: Request, env: Env) {
  await requireStaff(req, env);
  const role = new URL(req.url).searchParams.get('role');
  const where = role === 'client' ? "WHERE role = 'client'" : "WHERE role IN ('staff', 'admin')";
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.phone, u.company, u.role, u.active, u.email_verified_at, u.created_at,
            (SELECT COUNT(*) FROM requests r WHERE r.user_id = u.id) AS requests
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT 500`,
  ).all();
  return json({ users: results });
}

/** Admin invites a staff member: account is created and they get a link to set their password. */
export async function inviteStaff(req: Request, env: Env) {
  const admin = await requireAdmin(req, env);
  const b = await readJson(req);
  const email = emailField(b.email);
  const name = str(b.name, 'Name', { required: true, max: 100 });
  const role = b.role === 'admin' ? 'admin' : 'staff';
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
  let id: number;
  if (existing) {
    id = existing.id;
    await env.DB.prepare("UPDATE users SET role = ?, active = 1, email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?").bind(role, id).run();
  } else {
    const r = await env.DB.prepare("INSERT INTO users (email, name, role, email_verified_at) VALUES (?, ?, ?, datetime('now'))").bind(email, name, role).run();
    id = Number(r.meta.last_row_id);
  }
  const token = await issueToken(env, 'reset_password', { userId: id }, 3 * 86400);
  const brand = await getBrand(env);
  await sendMail(env, {
    to: email,
    subject: `You have been added to the ${brand.name} staff portal`,
    heading: `Welcome to the team, ${name.split(' ')[0]}`,
    body: `<p>${admin.name} has given you <strong>${role}</strong> access to the ${esc(brand.name)} staff portal, where you can manage quote requests, orders and status updates.</p><p>Set your password to get started. You can also sign in with Google if this is a Google account.</p>`,
    cta: { label: 'Set my password', url: `${env.SITE_URL}/portal/reset/?token=${token}` },
    footnote: 'This link expires in 3 days.',
  });
  return json({ ok: true }, 201);
}

export async function updateUser(req: Request, env: Env, id: number) {
  const admin = await requireAdmin(req, env);
  const b = await readJson(req);
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  if (!target) throw new HttpError(404, 'User not found');
  if (target.id === admin.id) throw new HttpError(400, 'You cannot change your own role or access');
  const role = ['client', 'staff', 'admin'].includes(String(b.role)) ? String(b.role) : target.role;
  const active = b.active === false ? 0 : b.active === true ? 1 : target.active;
  await env.DB.prepare('UPDATE users SET role = ?, active = ? WHERE id = ?').bind(role, active, id).run();
  if (!active) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  return json({ ok: true });
}
