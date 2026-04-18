// API Key Management Endpoint
// POST /api/keys — Generate a new API key
// GET /api/keys?key=sk-syco-XXXX — Check key status

const crypto = require('crypto');
const { kv } = require('@vercel/kv');

// XSS sanitization
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, function(c) {
    return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c];
  }).trim().slice(0, 500);
}

// Rate limiting for key creation
const rateLimits = new Map();
const RATE_LIMIT = 3;
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

// Generate API key
function generateKey() {
  return 'sk-syco-' + crypto.randomBytes(16).toString('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';

  // GET — Check key status
  if (req.method === 'GET') {
    const { key } = req.query || {};

    if (!key) {
      return res.status(400).json({
        error: 'Missing required parameter',
        usage: 'GET /api/keys?key=sk-syco-XXXX'
      });
    }

    const keyData = await kv.get('key:' + key);

    if (!keyData) {
      return res.status(200).json({
        valid: false,
        message: 'API key not found or expired'
      });
    }

    return res.status(200).json({
      valid: true,
      calls_remaining: keyData.rate_limit - keyData.calls_used,
      rate_limit: keyData.rate_limit,
      created_at: keyData.created_at
    });
  }

  // POST — Generate new key
  if (req.method === 'POST') {
    // Rate limit key creation
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Max 3 key creations/hour.' });
    }

    try {
      const { email } = req.body || {};
      const name = sanitize(req.body.name);
      const org = sanitize(req.body.organization);

      if (!email) {
        return res.status(400).json({
          error: 'Missing required field: email',
          required: { email: 'string' },
          optional: { name: 'string', organization: 'string' }
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const apiKey = generateKey();
      const now = new Date().toISOString();

      await kv.set('key:' + apiKey, {
        email,
        name: name || null,
        organization: org || null,
        created_at: now,
        rate_limit: 1000,
        calls_used: 0
      });

      return res.status(201).json({
        api_key: apiKey,
        created_at: now,
        rate_limit: 1000
      });
    } catch (err) {
      return res.status(500).json({ error: 'Key generation failed', detail: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
};
