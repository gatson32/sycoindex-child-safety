const fs = require('fs');
const path = require('path');

// Simple rate limiting using in-memory store (resets on cold start)
const rateLimits = new Map();
const RATE_LIMIT = 5; // submissions per hour per IP
const RATE_WINDOW = 3600000; // 1 hour in ms

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

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 5 submissions per hour.' });
  }

  try {
    const { model_name, vendor, api_endpoint, contact_email, notes } = req.body || {};

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
