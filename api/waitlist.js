// Waitlist / Lead Capture Endpoint
// POST /api/waitlist — Sign up for the waitlist

const { kv } = require('@vercel/kv');
const { checkRateLimit } = require('./_rate-limit');
const { sendEmail, getAdminEmail, escapeHtml } = require('./_resend');

// XSS sanitization
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, function(c) {
    return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c];
  }).trim().slice(0, 500);
}

// Rate limit: 5 signups/hour/IP, KV-backed with in-memory fallback.
const RATE_LIMIT = 5;
const RATE_WINDOW = 3600000;

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Email bodies ────────────────────────────────────────────────────────────
function buildAdminEmail(entry, position) {
  const text =
    `New waitlist signup (#${position}) on sycoindex.ai\n\n` +
    `Email:        ${entry.email}\n` +
    (entry.name ? `Name:         ${entry.name}\n` : '') +
    (entry.organization ? `Organization: ${entry.organization}\n` : '') +
    (entry.use_case ? `Use case:     ${entry.use_case}\n` : '') +
    `Signed up:    ${entry.signed_up_at}\n` +
    `Position:     #${position}\n`;

  const html =
    `<h2>New waitlist signup <span style="color:#666;font-weight:normal;">(#${position})</span></h2>` +
    `<table style="border-collapse:collapse;font-family:-apple-system,sans-serif;">` +
    `<tr><td style="padding:4px 12px 4px 0;"><b>Email</b></td><td><a href="mailto:${escapeHtml(entry.email)}">${escapeHtml(entry.email)}</a></td></tr>` +
    (entry.name ? `<tr><td style="padding:4px 12px 4px 0;"><b>Name</b></td><td>${escapeHtml(entry.name)}</td></tr>` : '') +
    (entry.organization ? `<tr><td style="padding:4px 12px 4px 0;"><b>Organization</b></td><td>${escapeHtml(entry.organization)}</td></tr>` : '') +
    (entry.use_case ? `<tr><td style="padding:4px 12px 4px 0;"><b>Use case</b></td><td>${escapeHtml(entry.use_case)}</td></tr>` : '') +
    `<tr><td style="padding:4px 12px 4px 0;"><b>Signed up</b></td><td>${escapeHtml(entry.signed_up_at)}</td></tr>` +
    `</table>`;

  return { text, html };
}

function buildConfirmationEmail(entry, position) {
  const text =
    `Hi${entry.name ? ' ' + entry.name : ''},\n\n` +
    `You're on the SycoIndex waitlist — you're #${position} in line.\n\n` +
    `We'll email you as soon as we're ready to onboard you. In the meantime:\n` +
    `  • Browse the live leaderboard: https://sycoindex.ai\n` +
    `  • Read the methodology:        https://sycoindex.ai/methodology.html\n` +
    `  • Try the scoring API (free):  https://sycoindex.ai/api-docs.html\n\n` +
    `— The SycoIndex team\nhttps://sycoindex.ai\n`;

  const html =
    `<div style="font-family:-apple-system,sans-serif;max-width:560px;">` +
    `<p>Hi${entry.name ? ' ' + escapeHtml(entry.name) : ''},</p>` +
    `<p>You're on the SycoIndex waitlist — you're <b>#${position}</b> in line.</p>` +
    `<p>We'll email you as soon as we're ready to onboard you. In the meantime:</p>` +
    `<ul>` +
    `<li>Browse the live <a href="https://sycoindex.ai">leaderboard</a></li>` +
    `<li>Read the <a href="https://sycoindex.ai/methodology.html">methodology</a></li>` +
    `<li>Try the <a href="https://sycoindex.ai/api-docs.html">scoring API</a> (free tier, no key needed)</li>` +
    `</ul>` +
    `<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">` +
    `<p style="color:#666;font-size:13px;">— The SycoIndex team · <a href="https://sycoindex.ai">sycoindex.ai</a></p>` +
    `</div>`;

  return { text, html };
}

// ── Handler ─────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const rl = await checkRateLimit({ ip, scope: 'waitlist', limit: RATE_LIMIT, windowMs: RATE_WINDOW });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 5 signups/hour.' });
  }

  try {
    const { email } = req.body || {};
    const name = sanitize(req.body.name);
    const org = sanitize(req.body.organization);
    const useCase = sanitize(req.body.use_case);

    if (!email) {
      return res.status(400).json({
        error: 'Missing required field: email',
        required: { email: 'string' },
        optional: { name: 'string', organization: 'string', use_case: 'string' }
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Deduplicate
    const existing = await kv.get('waitlist:' + normalizedEmail);
    if (existing) {
      const allKeys = await kv.keys('waitlist:*');
      const position = allKeys.indexOf('waitlist:' + normalizedEmail) + 1;
      return res.status(200).json({
        success: true,
        message: "You're already on the list!",
        position: position || 1
      });
    }

    const entry = {
      email: normalizedEmail,
      name: name || null,
      organization: org || null,
      use_case: useCase || null,
      signed_up_at: new Date().toISOString()
    };

    await kv.set('waitlist:' + normalizedEmail, entry);

    const allKeys = await kv.keys('waitlist:*');
    const position = allKeys.length;

    // Send notification emails (best-effort — a signup is still successful
    // even if email delivery fails downstream).
    const adminBody = buildAdminEmail(entry, position);
    const confirmBody = buildConfirmationEmail(entry, position);

    const [adminResult, confirmResult] = await Promise.all([
      sendEmail({
        to: getAdminEmail(),
        subject: `[SycoIndex] Waitlist signup #${position}: ${entry.email}`,
        text: adminBody.text,
        html: adminBody.html,
        replyTo: entry.email,
      }),
      sendEmail({
        to: entry.email,
        subject: `You're on the SycoIndex waitlist — #${position}`,
        text: confirmBody.text,
        html: confirmBody.html,
      }),
    ]);

    if (!adminResult.ok && !adminResult.skipped) {
      console.warn('[waitlist] admin email failed:', adminResult.error);
    }
    if (!confirmResult.ok && !confirmResult.skipped) {
      console.warn('[waitlist] confirmation email failed:', confirmResult.error);
    }

    return res.status(201).json({
      success: true,
      position,
      message: "You're on the list!",
      email_sent: confirmResult.ok === true,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Signup failed', detail: err.message });
  }
};
