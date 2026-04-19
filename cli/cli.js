#!/usr/bin/env node

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Colors ──────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function riskColor(risk) {
  if (risk === 'high') return c.red;
  if (risk === 'medium') return c.yellow;
  return c.green;
}

function scoreColor(score, max) {
  const pct = score / max;
  if (pct > 0.6) return c.red;
  if (pct > 0.3) return c.yellow;
  return c.green;
}

function honestyColor(pct) {
  if (pct >= 70) return c.green;
  if (pct >= 40) return c.yellow;
  return c.red;
}

function bar(value, max, width) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

function pad(str, len) {
  str = String(str);
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function padLeft(str, len) {
  str = String(str);
  return ' '.repeat(Math.max(0, len - str.length)) + str;
}

// ── API Call ────────────────────────────────────────────────────────────────
const API_URL = 'https://sycoindex.ai/api/score';

function callAPI(prompt, response) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ prompt, response, type: 'both' });
    const url = new URL(API_URL);
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (_e) {
          reject(new Error('Failed to parse API response: ' + body.substring(0, 200)));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

// ── Display ─────────────────────────────────────────────────────────────────
function displayResults(result) {
  const divider = c.dim + '─'.repeat(60) + c.reset;

  console.log('');
  console.log(c.bold + c.cyan + '  SycoIndex.ai — AI Safety Scoring Report' + c.reset);
  console.log(divider);

  // PAI Section
  if (result.pai) {
    const pai = result.pai;
    const rc = riskColor(pai.risk);
    const riskLabel = pai.risk.toUpperCase();

    console.log('');
    console.log(c.bold + '  PAI Composite Score' + c.reset);
    console.log('  ' + rc + c.bold + pai.composite.toFixed(2) + '/10' + c.reset + '  Risk: ' + rc + c.bold + riskLabel + c.reset);
    console.log('');

    const dimLabels = {
      emi: 'Emotional Manipulation',
      exl: 'Exclusivity Language ',
      bnd: 'Boundary Erosion     ',
      dep: 'Dependency Creation  ',
      aud: 'Adult Undermining    ',
    };

    console.log(c.bold + '  PAI Dimension Breakdown' + c.reset);
    for (const [key, label] of Object.entries(dimLabels)) {
      const val = pai.dimensions[key] || 0;
      const sc = scoreColor(val, 10);
      console.log(
        '  ' + pad(label, 24) +
        sc + padLeft(val.toFixed(2), 5) + c.reset +
        '  ' + sc + bar(val, 10, 20) + c.reset
      );
    }
  }

  // Sycophancy Section
  if (result.sycophancy) {
    const syc = result.sycophancy;
    const hc = honestyColor(syc.honesty);

    console.log('');
    console.log(divider);
    console.log('');
    console.log(c.bold + '  Sycophancy Analysis' + c.reset);
    console.log('  Honesty Score: ' + hc + c.bold + syc.honesty.toFixed(1) + '%' + c.reset);
    console.log('');

    const dimLabels = {
      ev: 'Emotional Validation ',
      me: 'Moral Endorsement    ',
      il: 'Indirect Language    ',
      ia: 'Indirect Action      ',
      fa: 'Framing Acceptance   ',
    };

    console.log(c.bold + '  Sycophancy Dimension Breakdown' + c.reset);
    for (const [key, label] of Object.entries(dimLabels)) {
      const val = syc.dimensions[key] || 0;
      const sc = scoreColor(val, 10);
      console.log(
        '  ' + pad(label, 24) +
        sc + padLeft(val.toFixed(1), 5) + c.reset +
        '  ' + sc + bar(val, 10, 20) + c.reset
      );
    }
  }

  console.log('');
  console.log(divider);
  console.log(c.dim + '  Scored at: ' + (result.scored_at || new Date().toISOString()) + c.reset);
  console.log(c.dim + '  Prompt: ' + (result.prompt_length || '?') + ' chars | Response: ' + (result.response_length || '?') + ' chars' + c.reset);
  console.log('');
}

// ── Help ────────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${c.bold}${c.cyan}sycoindex${c.reset} — CLI tool for SycoIndex.ai AI safety scoring

${c.bold}USAGE${c.reset}
  sycoindex score --prompt "..." --response "..."
  sycoindex score --file input.txt
  sycoindex score --prompt "..." --response "..." --json

${c.bold}COMMANDS${c.reset}
  score       Score a prompt/response pair for sycophancy and child safety risks

${c.bold}OPTIONS${c.reset}
  --prompt    The user prompt text
  --response  The AI response text
  --file      Path to a JSON file with { "prompt": "...", "response": "..." }
  --json      Output raw JSON instead of formatted table
  --help      Show this help message

${c.bold}EXAMPLES${c.reset}
  ${c.dim}# Score inline text${c.reset}
  sycoindex score --prompt "I'm 10 years old and lonely" --response "I'll be your best friend forever!"

  ${c.dim}# Score from file${c.reset}
  sycoindex score --file conversation.json

  ${c.dim}# Machine-readable output${c.reset}
  sycoindex score --prompt "..." --response "..." --json

${c.bold}API${c.reset}
  Calls ${c.cyan}https://sycoindex.ai/api/score${c.reset}
  No API key required for basic scoring.
`);
}

// ── Argument Parsing ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  const positional = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Boolean flags
      if (key === 'json' || key === 'help') {
        args[key] = true;
        i++;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i += 2;
      } else {
        args[key] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { args, positional };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const { args, positional } = parseArgs(argv);
  const command = positional[0];

  if (command !== 'score') {
    console.error(c.red + 'Unknown command: ' + command + c.reset);
    console.error('Run ' + c.cyan + 'sycoindex --help' + c.reset + ' for usage.');
    process.exit(1);
  }

  let prompt, response;

  // Load from file
  if (args.file) {
    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) {
      console.error(c.red + 'File not found: ' + filePath + c.reset);
      process.exit(1);
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      prompt = data.prompt;
      response = data.response;
    } catch (_e) {
      console.error(c.red + 'Failed to parse file. Expected JSON with { "prompt": "...", "response": "..." }' + c.reset);
      process.exit(1);
    }
  } else {
    prompt = args.prompt;
    response = args.response;
  }

  if (!prompt || !response) {
    console.error(c.red + 'Error: Both --prompt and --response are required (or use --file).' + c.reset);
    console.error('Run ' + c.cyan + 'sycoindex --help' + c.reset + ' for usage.');
    process.exit(1);
  }

  try {
    if (!args.json) {
      process.stdout.write(c.dim + '  Scoring...' + c.reset);
    }

    const result = await callAPI(prompt, response);

    if (result.error) {
      if (!args.json) process.stdout.write('\r' + ' '.repeat(30) + '\r');
      console.error(c.red + 'API Error: ' + result.error + c.reset);
      process.exit(1);
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Clear the "Scoring..." line
      process.stdout.write('\r' + ' '.repeat(30) + '\r');
      displayResults(result);
    }
  } catch (err) {
    if (!args.json) process.stdout.write('\r' + ' '.repeat(30) + '\r');
    console.error(c.red + 'Error: ' + err.message + c.reset);
    console.error(c.dim + 'Make sure you have internet access and https://sycoindex.ai is reachable.' + c.reset);
    process.exit(1);
  }
}

main();
