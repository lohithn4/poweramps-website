import { Env, HttpError, json, withCors, preflight, assertSafeMutation } from './lib';
import * as auth from './auth';
import * as requests from './requests';
import * as staff from './staff';
import * as settings from './settings';
import * as masters from './masters';
import * as docs from './docs';
import * as payments from './payments';
import * as reports from './reports';
import * as tally from './tally';
import * as feedback from './feedback';
import * as builds from './builds';

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
  r('GET', '/builds', builds.listBuilds),
  r('POST', '/builds', builds.createBuild),
  r('GET', '/builds/:id', builds.getBuild),
  r('PATCH', '/builds/:id', builds.updateBuild),
  r('DELETE', '/builds/:id', builds.deleteBuild),
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

  // Feedback & testimonials
  r('POST', '/feedback/lookup', feedback.lookupFeedback),
  r('POST', '/feedback', feedback.submitFeedback),
  r('GET', '/public/testimonials', feedback.publicTestimonials),
  r('GET', '/staff/feedback', feedback.listFeedback),
  r('PATCH', '/staff/feedback/:id', feedback.reviewFeedback),

  // Client documents (quotations & invoices)
  r('GET', '/docs/mine', docs.myDocs),
  r('GET', '/docs/:id', docs.getDoc),
  r('POST', '/docs/:id/accept', docs.acceptDoc),

  // ERP (staff)
  r('GET', '/erp/settings', settings.readSettings),
  r('PATCH', '/erp/settings', settings.saveSettings),
  r('GET', '/erp/summary', payments.summary),
  r('GET', '/erp/items', masters.listItems),
  r('POST', '/erp/items', masters.createItem),
  r('PATCH', '/erp/items/:id', masters.updateItem),
  r('GET', '/erp/parties', masters.listParties),
  r('POST', '/erp/parties', masters.createParty),
  r('GET', '/erp/parties/:id', masters.getParty),
  r('PATCH', '/erp/parties/:id', masters.updateParty),
  r('GET', '/erp/docs', docs.listDocs),
  r('POST', '/erp/docs', docs.createDoc),
  r('GET', '/erp/docs/:id', docs.getDoc),
  r('PATCH', '/erp/docs/:id', docs.updateDoc),
  r('DELETE', '/erp/docs/:id', docs.deleteDoc),
  r('POST', '/erp/docs/:id/issue', docs.issueDoc),
  r('POST', '/erp/docs/:id/cancel', docs.cancelDoc),
  r('POST', '/erp/docs/:id/convert', docs.convertDoc),
  r('POST', '/erp/docs/:id/send', docs.sendDoc),
  r('GET', '/erp/payments', payments.listPayments),
  r('POST', '/erp/payments', payments.createPayment),
  r('POST', '/erp/payments/:id/cancel', payments.cancelPayment),
  r('GET', '/erp/reports/gst', reports.gstReport),
  r('GET', '/erp/reports/register', reports.register),
  r('GET', '/erp/reports/outstanding', reports.outstanding),
  r('POST', '/erp/import', tally.importData),
  r('GET', '/erp/import/history', tally.importHistory),
  r('POST', '/erp/purge', tally.purgeUnused),
  r('GET', '/erp/tally/export', tally.tallyExport),
  r('POST', '/erp/tally/mark', tally.tallyMark),
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
