// Shared Resend email helper for /api/submit and /api/waitlist.
//
// Uses the Resend REST API directly via fetch (no SDK dependency) so we
// keep the serverless function cold-start small and avoid version drift.
//
// Env vars:
//   RESEND_API_KEY  — Resend account key (re_...). If unset, sendEmail()
//                     degrades to a no-op and returns { ok: false,
//                     skipped: 'RESEND_API_KEY not configured' }.
//                     This keeps local dev, CI tests, and preview deploys
//                     working without forcing every contributor to have a
//                     key.
//   RESEND_FROM     — The From address. Must be on a domain verified in
//                     Resend. Defaults to 'SycoIndex <noreply@sycoindex.ai>'.
//   ADMIN_EMAIL     — Destination for internal notifications (submissions,
//                     waitlist signups). Defaults to 'chris@sycoindex.org'.
//
// Files prefixed with `_` are not routed by Vercel but are bundled with
// the serverless functions that require() them.

'use strict';

const RESEND_API = 'https://api.resend.com/emails';

/**
 * Send an email via Resend.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to        Recipient email(s).
 * @param {string} opts.subject            Subject line.
 * @param {string} [opts.text]             Plain-text body.
 * @param {string} [opts.html]             HTML body. At least one of text/html required.
 * @param {string} [opts.replyTo]          Optional Reply-To header.
 * @param {string} [opts.from]             Override default From address.
 * @returns {Promise<{ok: boolean, id?: string, skipped?: string, error?: string}>}
 */
async function sendEmail(opts) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, skipped: 'RESEND_API_KEY not configured' };
  }

  if (!opts || !opts.to || !opts.subject || (!opts.text && !opts.html)) {
    return { ok: false, error: 'sendEmail requires { to, subject, text|html }' };
  }

  const from = opts.from || process.env.RESEND_FROM || 'SycoIndex <noreply@sycoindex.ai>';

  const body = {
    from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
  };
  if (opts.text) body.text = opts.text;
  if (opts.html) body.html = opts.html;
  if (opts.replyTo) body.reply_to = opts.replyTo;

  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 8000);
    const resp = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(timeout);

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: `Resend ${resp.status}: ${data.message || 'unknown error'}` };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Resend request timed out' : err.message };
  }
}

/**
 * Get the configured admin email, for notification destinations.
 */
function getAdminEmail() {
  return process.env.ADMIN_EMAIL || 'chris@sycoindex.org';
}

/**
 * Escape HTML special chars for safe inclusion in email HTML bodies.
 * Submission/waitlist inputs are already sanitized at the API layer, but
 * belt-and-suspenders protection for email HTML rendering.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

module.exports = { sendEmail, getAdminEmail, escapeHtml };
