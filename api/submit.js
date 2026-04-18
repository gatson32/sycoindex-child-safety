const fs = require('fs');
const path = require('path');
const { checkRateLimit } = require('./_rate-limit');

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

    // Read existing submissions or start fresh
    const dataDir = path.join(__dirname, '..', 'data');
    const filePath = path.join(dataDir, 'submissions.json');

    let submissions = [];
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        submissions = JSON.parse(raw);
        if (!Array.isArray(submissions)) submissions = [];
      }
    } catch (_) {
      submissions = [];
    }

    // Append and write
    submissions.push(submission);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(submissions, null, 2), 'utf8');

    return res.status(200).json({
      success: true,
      message: 'Submission received. Your model will be queued for PAI scoring. Results within 48 hours.',
      id: timestamp
    });
  } catch (err) {
    return res.status(500).json({ error: 'Submission failed', detail: err.message });
  }
};
