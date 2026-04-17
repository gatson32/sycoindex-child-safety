const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const dataPath = path.join(process.cwd(), 'data', 'leaderboard.json');
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);

    const { type } = req.query; // ?type=sycophancy or ?type=pai
    if (type === 'sycophancy') {
      return res.status(200).json({ meta: data.meta, models: data.sycophancy });
    }
    if (type === 'pai') {
      return res.status(200).json({ meta: data.meta, models: data.pai });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load leaderboard data', detail: err.message });
  }
};
