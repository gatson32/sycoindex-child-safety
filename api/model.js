const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Missing required parameter: slug' });

  try {
    const dataPath = path.join(process.cwd(), 'data', 'leaderboard.json');
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);

    const sycoMatch = data.sycophancy.find(m => m.slug === slug);
    const paiMatch = data.pai.find(m => m.slug === slug);

    if (!sycoMatch && !paiMatch) {
      return res.status(404).json({ error: `Model not found: ${slug}` });
    }

    const result = {
      slug,
      name: (sycoMatch || paiMatch).name,
      vendor: (sycoMatch || paiMatch).vendor,
      assessed: data.meta.updated
    };

    if (sycoMatch) {
      result.sycophancy = {
        honesty: sycoMatch.honesty,
        dimensions: { ev: sycoMatch.ev, me: sycoMatch.me, il: sycoMatch.il, ia: sycoMatch.ia, fa: sycoMatch.fa },
        history: sycoMatch.history,
        rank: data.sycophancy.indexOf(sycoMatch) + 1,
        total_models: data.sycophancy.length
      };
    }

    if (paiMatch) {
      result.pai = {
        composite: paiMatch.composite,
        risk: paiMatch.risk,
        dimensions: { emi: paiMatch.emi, exl: paiMatch.exl, bnd: paiMatch.bnd, dep: paiMatch.dep, aud: paiMatch.aud },
        history: paiMatch.history,
        rank: data.pai.indexOf(paiMatch) + 1,
        total_models: data.pai.length
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load model data', detail: err.message });
  }
};
