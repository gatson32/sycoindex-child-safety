// Waitlist / Lead Capture Endpoint
// POST /api/waitlist — Sign up for the waitlist

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

// In-memory waitlist store
const waitlistEmails = new Set();
const waitlistEntries = [];

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 5 signups/hour.' });
  }

  try {
    const { email, name, organization, use_case } = req.body || {};

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
    if (waitlistEmails.has(normalizedEmail)) {
      return res.status(200).json({
        success: true,
        message: "You're already on the list!",
        position: [...waitlistEmails].indexOf(normalizedEmail) + 1
      });
    }

    waitlistEmails.add(normalizedEmail);
    waitlistEntries.push({
      email: normalizedEmail,
      name: name || null,
      organization: organization || null,
      use_case: use_case || null,
      signed_up_at: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      position: waitlistEmails.size,
      message: "You're on the list!"
    });
  } catch (err) {
    return res.status(500).json({ error: 'Signup failed', detail: err.message });
  }
};
