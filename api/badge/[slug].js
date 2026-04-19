const fs = require('fs');
const path = require('path');

/**
 * Vercel serverless function that generates shields.io-style SVG badges
 * for AI model safety scores from the SycoIndex leaderboard.
 *
 * Dynamic route: /api/badge/:slug
 * Query params:
 *   - type: sycophancy | pai | both (default: both)
 *   - style: flat | flat-square | for-the-badge (default: flat)
 */

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getColor(type, entry) {
  if (type === 'sycophancy') {
    const h = entry.honesty;
    if (h >= 80) return '#4c1';
    if (h >= 50) return '#dfb317';
    return '#e05d44';
  }
  if (type === 'pai') {
    const r = (entry.risk || '').toLowerCase();
    if (r === 'low') return '#4c1';
    if (r === 'medium') return '#dfb317';
    return '#e05d44';
  }
  return '#9f9f9f';
}

function measureText(text, fontSize) {
  // Approximate character width for Verdana/DejaVu Sans at given size
  const avgCharWidth = fontSize * 0.62;
  return Math.ceil(text.length * avgCharWidth);
}

function buildSvg(label, message, messageColor, style) {
  const isForTheBadge = style === 'for-the-badge';
  const fontSize = isForTheBadge ? 12 : 11;
  const verticalPadding = isForTheBadge ? 10 : 7;
  const horizontalPadding = isForTheBadge ? 12 : 8;

  const displayLabel = isForTheBadge ? label.toUpperCase() : label;
  const displayMessage = isForTheBadge ? message.toUpperCase() : message;

  const labelWidth = measureText(displayLabel, fontSize) + horizontalPadding * 2;
  const messageWidth = measureText(displayMessage, fontSize) + horizontalPadding * 2;
  const totalWidth = Math.max(labelWidth + messageWidth, 120);
  const adjustedLabelWidth = Math.round(totalWidth * (labelWidth / (labelWidth + messageWidth)));
  const adjustedMessageWidth = totalWidth - adjustedLabelWidth;
  const height = fontSize + verticalPadding * 2;

  const labelColor = '#555';

  let borderRadius;
  if (style === 'flat-square') {
    borderRadius = 0;
  } else {
    borderRadius = 3;
  }

  const labelTextX = adjustedLabelWidth / 2;
  const messageTextX = adjustedLabelWidth + adjustedMessageWidth / 2;
  const textY = height / 2 + fontSize * 0.35;

  const fontFamily = 'Verdana,Geneva,DejaVu Sans,sans-serif';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="${borderRadius}" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${adjustedLabelWidth}" height="${height}" fill="${labelColor}"/>
    <rect x="${adjustedLabelWidth}" width="${adjustedMessageWidth}" height="${height}" fill="${escapeXml(messageColor)}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${fontFamily}" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text x="${labelTextX}" y="${textY + 1}" fill="#010101" fill-opacity=".3">${escapeXml(displayLabel)}</text>
    <text x="${labelTextX}" y="${textY}">${escapeXml(displayLabel)}</text>
    <text x="${messageTextX}" y="${textY + 1}" fill="#010101" fill-opacity=".3">${escapeXml(displayMessage)}</text>
    <text x="${messageTextX}" y="${textY}">${escapeXml(displayMessage)}</text>
  </g>
</svg>`;

  return svg;
}

function notFoundBadge(style) {
  return buildSvg('sycoindex', 'model not found', '#9f9f9f', style);
}

module.exports = (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(405).send(buildSvg('sycoindex', 'method not allowed', '#e05d44', 'flat'));
    return;
  }

  const slug = req.query.slug;
  const type = req.query.type || 'both';
  const style = req.query.style || 'flat';

  // Validate params
  const validTypes = ['sycophancy', 'pai', 'both'];
  const validStyles = ['flat', 'flat-square', 'for-the-badge'];

  if (!validTypes.includes(type)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(400).send(buildSvg('sycoindex', 'invalid type', '#e05d44', style));
    return;
  }

  if (!validStyles.includes(style)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(400).send(buildSvg('sycoindex', 'invalid style', '#e05d44', 'flat'));
    return;
  }

  // Read leaderboard data
  let data;
  try {
    const filePath = path.join(process.cwd(), 'data', 'leaderboard.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(raw);
  } catch (_err) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(500).send(buildSvg('sycoindex', 'data error', '#e05d44', style));
    return;
  }

  // Look up model by slug
  const sycoEntry = (data.sycophancy || []).find((m) => m.slug === slug);
  const paiEntry = (data.pai || []).find((m) => m.slug === slug);

  // Check if the requested data exists
  if (type === 'sycophancy' && !sycoEntry) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(404).send(notFoundBadge(style));
    return;
  }

  if (type === 'pai' && !paiEntry) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(404).send(notFoundBadge(style));
    return;
  }

  if (type === 'both' && !sycoEntry && !paiEntry) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(404).send(notFoundBadge(style));
    return;
  }

  // Build message text and determine color
  let message = '';
  let color = '#4c1';

  if (type === 'sycophancy') {
    message = `${sycoEntry.honesty}% honest`;
    color = getColor('sycophancy', sycoEntry);
  } else if (type === 'pai') {
    message = `${paiEntry.composite} ${paiEntry.risk}`;
    color = getColor('pai', paiEntry);
  } else {
    // both
    const parts = [];
    if (sycoEntry) {
      parts.push(`${sycoEntry.honesty}%`);
    }
    if (paiEntry) {
      parts.push(`${paiEntry.composite} ${paiEntry.risk}`);
    }
    message = parts.join(' | ');

    // For combined badge, pick the worst color
    if (sycoEntry && paiEntry) {
      const sycoColor = getColor('sycophancy', sycoEntry);
      const paiColor = getColor('pai', paiEntry);
      // Priority: red > yellow > green
      const colorPriority = { '#e05d44': 3, '#dfb317': 2, '#4c1': 1 };
      color = (colorPriority[sycoColor] || 0) >= (colorPriority[paiColor] || 0)
        ? sycoColor
        : paiColor;
    } else if (sycoEntry) {
      color = getColor('sycophancy', sycoEntry);
    } else {
      color = getColor('pai', paiEntry);
    }
  }

  const svg = buildSvg('sycoindex', message, color, style);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  res.status(200).send(svg);
};
