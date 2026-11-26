import { Env, HttpError, json, withCors, preflight, assertSafeMutation } from './lib';
import * as auth from './auth';
import * as requests from './requests';
import * as staff from './staff';

type Handler = (req: Request, env: Env, id: number) => Promise<Response> | Response;
interface Route { method: string; pattern: RegExp; handler: Handler; mutation?: boolean }

const r = (method: string, path: string, handler: Handler): Route => ({
  method,
  pattern: new RegExp('^' + path.replace(/:id/g, '(\\d+)').replace(/:provider/g, '([a-z]+)') + '/?$'),
  handler,
  mutation: method !== 'GET',
});

const routes: Route[] = [
  r('GET', '/health', () => json({ ok: true, service: 'portal-api' })),

  // Auth
  r('POST', '/auth/register', auth.register),
  r('POST', '/auth/verify', auth.verifyEmail),
  r('POST', '/auth/resend', auth.resendVerification),
  r('POST', '/auth/login', auth.login),
  r('POST', '/auth/logout', auth.logout),
  r('GET', '/auth/me', auth.me),
  r('PATCH', '/auth/me', auth.updateMe),
  r('POST', '/auth/forgot', auth.forgotPassword),
  r('POST', '/auth/reset', auth.resetPassword),
  r('POST', '/auth/password', auth.changePassword),
  r('GET', '/auth/providers', auth.listProviders),
  r('POST', '/setup/admin', auth.setupAdmin),

  // Requests (quotes & orders)
  r('POST', '/requests', requests.createRequest),
  r('POST', '/requests/confirm', requests.confirmRequest),
  r('GET', '/requests', requests.listRequests),
  r('GET', '/requests/:id', requests.getRequest),
  r('PATCH', '/requests/:id', requests.updateRequest),
  r('POST', '/requests/:id/quote', requests.sendQuote),
  r('POST', '/requests/:id/accept', requests.acceptQuote),
  r('POST', '/requests/:id/cancel', requests.cancelRequest),

  // Staff administration
  r('GET', '/staff/users', staff.listUsers),
  r('POST', '/staff/users', staff.inviteStaff),
  r('PATCH', '/staff/users/:id', staff.updateUser),
];

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return preflight(req, env);
    const url = new URL(req.url);
    let res: Response;
    try {
      // Social sign-in uses top-level browser navigation (GET redirects), not fetch.
      const oauth = url.pathname.match(/^\/auth\/oauth\/([a-z]+)\/(start|callback|mock)\/?$/);
      if (oauth && req.method === 'GET') {
        const [, provider, step] = oauth;
        return step === 'start' ? await auth.oauthStart(req, env, provider)
          : step === 'callback' ? await auth.oauthCallback(req, env, provider)
          : auth.oauthDevMock(req, env);
      }

      const route = routes.find((rt) => rt.method === req.method && rt.pattern.test(url.pathname));
      if (!route) {
        const pathExists = routes.some((rt) => rt.pattern.test(url.pathname));
        throw new HttpError(pathExists ? 405 : 404, pathExists ? 'Method not allowed' : 'Not found');
      }
      if (route.mutation) assertSafeMutation(req, env);
      const m = url.pathname.match(route.pattern);
      res = await route.handler(req, env, m && m[1] ? Number(m[1]) : 0);
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message, code: e.code }, e.status);
      else {
        console.error(e);
        res = json({ error: 'Something went wrong on our side. Please try again.' }, 500);
      }
    }
    return withCors(res, req, env);
  },
} satisfies ExportedHandler<Env>;
