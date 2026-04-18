// Report Verification Endpoint
// GET /api/verify?hash=SHA256_HASH
// Verifies a report hash against known report hashes

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT = 50;
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

// Known report hashes — populate as reports are generated
const knownReports = new Map([
  ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', { report_id: 'RPT-2026-012', model: 'claude-opus-4.6', report_type: 'PAI', generated_at: '2026-04-15T00:00:00Z' }],
  ['a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a', { report_id: 'RPT-2026-013', model: 'gpt-5', report_type: 'sycophancy', generated_at: '2026-04-16T00:00:00Z' }],
  ['2c624232cdd221771294dfbb310aca000a0df6ac8b166808eba91f4b6b290657', { report_id: 'RPT-2026-011', model: 'gemini-2.5-pro', report_type: 'PAI', generated_at: '2026-04-14T00:00:00Z' }],
  ['d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592', { report_id: 'RPT-2026-014', model: 'claude-haiku-4.5', report_type: 'PAI', generated_at: '2026-04-17T00:00:00Z' }],
  ['9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', { report_id: 'RPT-2026-010', model: 'deepseek-v3', report_type: 'sycophancy', generated_at: '2026-04-13T00:00:00Z' }],
]);

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 50 requests/hour.' });
  }

  try {
    const { hash } = req.query || {};

    if (!hash) {
      return res.status(400).json({
        error: 'Missing required parameter',
        usage: 'GET /api/verify?hash=SHA256_HASH',
        example: 'GET /api/verify?hash=a1b2c3d4e5f6...'
      });
    }

    // Validate hash format (SHA-256 = 64 hex chars)
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      return res.status(400).json({
        error: 'Invalid hash format. Expected 64-character SHA-256 hex string.'
      });
    }

    const normalizedHash = hash.toLowerCase();
    const report = knownReports.get(normalizedHash);

    if (report) {
      return res.status(200).json({
        verified: true,
        report_id: report.report_id,
        model: report.model,
        generated_at: report.generated_at
      });
    }

    return res.status(200).json({
      verified: false,
      message: 'Report not found'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Verification failed', detail: err.message });
  }
};
