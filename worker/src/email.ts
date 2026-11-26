import { Env, isDev } from './lib';
import { getBrand, type Brand } from './brand';

interface Mail {
  to: string | string[];
  subject: string;
  heading: string;
  body: string; // simple HTML paragraphs
  cta?: { label: string; url: string };
  footnote?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export { esc };

function render(m: Mail, b: Brand): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#0d1626">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e3e6eb;border-radius:12px;overflow:hidden">
      <tr><td style="background:${b.dark};padding:18px 28px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:10px"><table role="presentation" cellpadding="0" cellspacing="2"><tr><td width="11" height="11" bgcolor="${b.primary}"></td><td width="11" height="11" bgcolor="${b.accent}"></td></tr><tr><td width="11" height="11" bgcolor="${b.accent}"></td><td width="11" height="11" bgcolor="${b.primary}"></td></tr></table></td>
          <td style="color:#fff;font-weight:700;font-size:18px;letter-spacing:.5px">${esc(b.wordmark)}${b.wordmarkSub ? `<div style="font-size:9px;letter-spacing:1.5px;color:#c3cbe0;font-weight:600">${esc(b.wordmarkSub)}</div>` : ''}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${esc(m.heading)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#344054">${m.body}</div>
        ${m.cta ? `<p style="margin:26px 0 8px"><a href="${m.cta.url}" style="display:inline-block;background:${b.accent};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${esc(m.cta.label)}</a></p>
        <p style="font-size:12px;color:#667085;word-break:break-all">Or open this link: ${m.cta.url}</p>` : ''}
        ${m.footnote ? `<p style="margin-top:22px;font-size:13px;color:#667085">${m.footnote}</p>` : ''}
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e3e6eb;font-size:12px;color:#667085">
        ${esc(b.legalName)}${b.addressLine ? ` · ${esc(b.addressLine)}` : ''} · <a href="${b.siteUrl}" style="color:${b.primary}">${b.siteUrl.replace(/^https?:\/\//, '')}</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** Sends via Resend. In dev (or without an API key) the email is logged instead. */
export async function sendMail(env: Env, m: Mail): Promise<void> {
  const to = (Array.isArray(m.to) ? m.to : [m.to]).filter(Boolean);
  if (!to.length) return;
  if (!env.RESEND_API_KEY) {
    console.log(`[mail:dev] to=${to.join(',')} subject="${m.subject}" link=${m.cta?.url ?? '-'}`);
    return;
  }
  const brand = await getBrand(env);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject: m.subject, html: render(m, brand) }),
  });
  if (!res.ok) {
    console.error('[mail] send failed', res.status, await res.text());
    if (isDev(env)) return;
  }
}

export const staffRecipients = (env: Env) =>
  (env.STAFF_NOTIFY_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
