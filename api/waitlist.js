// Waitlist / Lead Capture Endpoint
// POST /api/waitlist — Sign up for the waitlist

const { kv } = require('@vercel/kv');

// XSS sanitization
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, function(c) {
    return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c];
  }).trim().slice(0, 500);
}

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW = 3600000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimits.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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
  if (!checkRateLimit(ip)) {
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

    await kv.set('waitlist:' + normalizedEmail, {
      email: normalizedEmail,
      name: name || null,
      organization: org || null,
      use_case: useCase || null,
      signed_up_at: new Date().toISOString()
    });

    const allKeys = await kv.keys('waitlist:*');
    return res.status(201).json({
      success: true,
      position: allKeys.length,
      message: "You're on the list!"
    });
  } catch (err) {
    return res.status(500).json({ error: 'Signup failed', detail: err.message });
  }
};
