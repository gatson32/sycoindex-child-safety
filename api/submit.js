const fs = require('fs');
const path = require('path');
const { checkRateLimit } = require('./_rate-limit');
const { sendEmail, getAdminEmail, escapeHtml } = require('./_resend');

// XSS sanitization
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, function(c) {
    return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c];
  }).trim().slice(0, 500);
}

// Rate limit: 5 submissions/hour/IP, KV-backed with in-memory fallback.
const RATE_LIMIT = 5;
const RATE_WINDOW = 3600000;

// ── Email bodies ────────────────────────────────────────────────────────────
function buildAdminEmail(sub) {
  const text =
    `New model submission on sycoindex.ai\n\n` +
    `Model:     ${sub.model_name}\n` +
    `Vendor:    ${sub.vendor}\n` +
    `Endpoint:  ${sub.api_endpoint}\n` +
    `Contact:   ${sub.contact_email}\n` +
    `Submitted: ${sub.submitted_at}\n` +
    `Submitter IP: ${sub.ip}\n\n` +
    (sub.notes ? `Notes:\n${sub.notes}\n\n` : '') +
    `Submission ID: ${sub.id}\n`;

  const html =
    `<h2>New model submission on sycoindex.ai</h2>` +
    `<table style="border-collapse:collapse;font-family:-apple-system,sans-serif;">` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>Model</b></td><td>${escapeHtml(sub.model_name)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>Vendor</b></td><td>${escapeHtml(sub.vendor)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>Endpoint</b></td><td><code>${escapeHtml(sub.api_endpoint)}</code></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>Contact</b></td><td><a href="mailto:${escapeHtml(sub.contact_email)}">${escapeHtml(sub.contact_email)}</a></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>Submitted</b></td><td>${escapeHtml(sub.submitted_at)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>IP</b></td><td>${escapeHtml(sub.ip)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>ID</b></td><td>${sub.id}</td></tr>` +
    `</table>` +
    (sub.notes ? `<p style="margin-top:16px;"><b>Notes:</b><br>${escapeHtml(sub.notes).replace(/\n/g, '<br>')}</p>` : '');

  return { text, html };
}

function buildConfirmationEmail(sub) {
  const text =
    `Hi${sub.contact_email ? '' : ' there'},\n\n` +
    `Thanks for submitting ${sub.model_name} (${sub.vendor}) to SycoIndex.\n\n` +
    `We'll run it through our PAI and sycophancy evaluation pipeline within 48 hours.\n` +
    `You'll hear back at ${sub.contact_email} with the scored results and a link to the model's page on the leaderboard.\n\n` +
    `Submission ID: ${sub.id}\n\n` +
    `— The SycoIndex team\nhttps://sycoindex.ai\n`;

  const html =
    `<div style="font-family:-apple-system,sans-serif;max-width:560px;">` +
    `<p>Hi,</p>` +
    `<p>Thanks for submitting <b>${escapeHtml(sub.model_name)}</b> (${escapeHtml(sub.vendor)}) to SycoIndex.</p>` +
    `<p>We'll run it through our PAI and sycophancy evaluation pipeline within 48 hours. You'll hear back at <code>${escapeHtml(sub.contact_email)}</code> with the scored results and a link to the model's page on the leaderboard.</p>` +
    `<p style="color:#666;font-size:13px;">Submission ID: <code>${sub.id}</code></p>` +
    `<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">` +
    `<p style="color:#666;font-size:13px;">— The SycoIndex team · <a href="https://sycoindex.ai">sycoindex.ai</a></p>` +
    `</div>`;

  return { text, html };
}

// ── Handler ─────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const rl = await checkRateLimit({ ip, scope: 'submit', limit: RATE_LIMIT, windowMs: RATE_WINDOW });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 5 submissions per hour.' });
  }

  try {
    const model_name = sanitize(req.body.model_name);
    const vendor = sanitize(req.body.vendor);
    const api_endpoint = sanitize(req.body.api_endpoint);
    const contact_email = sanitize(req.body.contact_email);
    const notes = sanitize(req.body.notes);

    // Validate required fields exist and are strings
    const required = { model_name, vendor, api_endpoint, contact_email };
    for (const [field, value] of Object.entries(required)) {
      if (!value || typeof value !== 'string' || !value.trim()) {
        return res.status(400).json({
          error: `Missing or invalid required field: ${field}`,
          required: ['model_name', 'vendor', 'api_endpoint', 'contact_email']
        });
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contact_email)) {
      return res.status(400).json({ error: 'Invalid email format for contact_email.' });
    }

    // Build submission record
    const timestamp = Date.now();
    const submission = {
      id: timestamp,
      model_name: model_name.trim(),
      vendor: vendor.trim(),
      api_endpoint: api_endpoint.trim(),
      contact_email: contact_email.trim(),
      notes: (notes && typeof notes === 'string') ? notes.trim() : '',
      submitted_at: new Date(timestamp).toISOString(),
      ip: ip
    };

    // Best-effort local persistence (works on self-hosted / writable FS; on
    // Vercel serverless the FS is read-only and this will silently fail —
    // email is the durable notification path in that case).
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      const filePath = path.join(dataDir, 'submissions.json');

      let submissions = [];
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        submissions = JSON.parse(raw);
        if (!Array.isArray(submissions)) submissions = [];
      }

      submissions.push(submission);

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(submissions, null, 2), 'utf8');
    } catch (fsErr) {
      // Read-only filesystem (Vercel) or permission error — log and continue;
      // email is the authoritative delivery mechanism on hosted deployments.
      console.warn('[submit] local persistence skipped:', fsErr.message);
    }

    // Send notification emails (best-effort; submission is still considered
    // received even if email fails, and the response reflects what happened).
    const adminBody = buildAdminEmail(submission);
    const confirmBody = buildConfirmationEmail(submission);

    const [adminResult, confirmResult] = await Promise.all([
      sendEmail({
        to: getAdminEmail(),
        subject: `[SycoIndex] New submission: ${submission.model_name} (${submission.vendor})`,
        text: adminBody.text,
        html: adminBody.html,
        replyTo: submission.contact_email,
      }),
      sendEmail({
        to: submission.contact_email,
        subject: `We received your SycoIndex submission: ${submission.model_name}`,
        text: confirmBody.text,
        html: confirmBody.html,
      }),
    ]);

    if (!adminResult.ok && !adminResult.skipped) {
      console.warn('[submit] admin email failed:', adminResult.error);
    }
    if (!confirmResult.ok && !confirmResult.skipped) {
      console.warn('[submit] confirmation email failed:', confirmResult.error);
    }

    return res.status(200).json({
      success: true,
      message: 'Submission received. Your model will be queued for PAI scoring. Results within 48 hours.',
      id: timestamp,
      email_sent: adminResult.ok === true,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Submission failed', detail: err.message });
  }
};
