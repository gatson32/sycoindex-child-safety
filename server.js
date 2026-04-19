// Sycoindex self-hosting server.
//
// Wraps the Vercel-style /api/*.js handlers in an Express app and serves the
// static site alongside. Use this for on-premise / behind-VPC deployments
// where Vercel isn't an option (enterprise customers, air-gapped evaluation
// environments, locked-down procurement).
//
// The API handlers themselves are UNCHANGED from the Vercel deployment. They
// use the (req, res) signature Vercel exposes, which is Express-compatible,
// so wrapping them is a matter of mounting each file at the expected route.
//
// Environment variables:
//   PORT                 (default 3000) — server port
//   KV_REST_API_URL      (optional)     — Upstash/Vercel KV endpoint. Without
//                                         it, rate limiting falls back to an
//                                         in-memory Map (per-process only).
//   KV_REST_API_TOKEN    (optional)     — KV auth token.
//   SYCOINDEX_LOG_LEVEL  (default 'info') — 'debug' | 'info' | 'warn' | 'error'
//
// Health check: GET /healthz returns 200 with { ok: true, version, uptime }.
// This is the endpoint Docker HEALTHCHECK hits.

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const LOG_LEVEL = (process.env.SYCOINDEX_LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_THRESHOLD = LOG_LEVELS[LOG_LEVEL] ?? 1;

function log(level, ...args) {
  if ((LOG_LEVELS[level] ?? 1) < LOG_THRESHOLD) return;
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}]`, ...args);
}

// ---------------------------------------------------------------------------
// Load version info for /healthz and startup banner.
// ---------------------------------------------------------------------------
let pkgVersion = 'unknown';
try {
  pkgVersion = require('./package.json').version;
} catch (_err) {
  // ignore — we'll just say 'unknown'
}

// ---------------------------------------------------------------------------
// Security headers — mirror the vercel.json site-wide header block so behavior
// matches between Vercel and self-hosted deployments.
// ---------------------------------------------------------------------------
function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  next();
}

// ---------------------------------------------------------------------------
// Discover /api handlers and mount them.
//
// Routing rules:
//   api/score.js         → POST /api/score
//   api/leaderboard.js   → GET  /api/leaderboard
//   api/badge/[slug].js  → GET  /api/badge/:slug
//
// The handler file itself decides which methods to accept — we mount with
// app.all(...) and let the handler return 405 for wrong-method requests,
// matching Vercel's convention exactly.
// ---------------------------------------------------------------------------
function mountApiHandlers(app) {
  const apiDir = path.join(ROOT, 'api');
  if (!fs.existsSync(apiDir)) {
    log('warn', 'no api/ directory found; skipping API mount');
    return 0;
  }

  let mountedCount = 0;

  function mount(filePath, relativeRoute) {
    let handler;
    try {
      handler = require(filePath);
    } catch (err) {
      log('error', `failed to load ${filePath}:`, err.message);
      return;
    }
    if (typeof handler !== 'function') {
      log('debug', `skipping ${filePath} — default export is not a function`);
      return;
    }
    const route = `/api${relativeRoute}`;
    app.all(route, async (req, res, next) => {
      try {
        await handler(req, res);
      } catch (err) {
        log('error', `handler error at ${route}:`, err);
        next(err);
      }
    });
    mountedCount += 1;
    log('debug', `mounted ${route} → ${path.relative(ROOT, filePath)}`);
  }

  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip private helpers (underscore-prefixed) — these are library modules
      // that API handlers import, not routes themselves.
      if (entry.name.startsWith('_')) continue;
      // Skip non-JS files (e.g. server.py is a separate Python beta server).
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, `${prefix}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      const base = entry.name.slice(0, -3); // strip .js
      // Vercel-style [slug] directory segment → :slug Express param.
      const routeBase = base.startsWith('[') && base.endsWith(']')
        ? `:${base.slice(1, -1)}`
        : base;
      mount(full, `${prefix}/${routeBase}`);
    }
  }

  walk(apiDir, '');
  return mountedCount;
}

// ---------------------------------------------------------------------------
// Build the app
// ---------------------------------------------------------------------------
const app = express();

// Trust X-Forwarded-For so rate-limit IP attribution works behind a reverse
// proxy (nginx, ALB, Cloud Run ingress, etc.). One hop is the safe default;
// operators running deeper proxy chains should set TRUST_PROXY_HOPS.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));

// Request logging (info level only — debug gets headers).
app.use((req, _res, next) => {
  log('info', `${req.method} ${req.url}`);
  if (LOG_THRESHOLD === 0) {
    log('debug', '  headers:', req.headers);
  }
  next();
});

// Health check — Docker HEALTHCHECK uses this. Must be cheap and dependency-free.
app.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    version: pkgVersion,
    uptime_seconds: Math.round(process.uptime()),
    kv: Boolean(process.env.KV_REST_API_URL),
  });
});

const apiRouteCount = mountApiHandlers(app);

// Static site — served AFTER /api routes so a file named 'score.html' can't
// shadow /api/score (it won't anyway since /api/* is already matched, but this
// ordering makes the rule obvious).
app.use(express.static(ROOT, {
  extensions: ['html'],
  // Don't serve hidden files, node_modules, preprint LaTeX sources, etc.
  setHeaders: (res, filePath) => {
    // Matches vercel.json conventions for the site.
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    } else if (/\.(css|js|svg|png|jpg|jpeg|webp|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// SPA-style fallback is NOT desired here — this is a multi-page static site,
// so a 404 on a missing file should be a real 404, not a redirect to index.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.url });
});

// Error handler — surfaces unexpected crashes without leaking stack traces.
// Four-argument signature is required by Express to register as an error
// handler, even though _req and _next are unused in this handler.
app.use((err, _req, res, _next) => {
  log('error', 'unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  log('info', `sycoindex self-hosted server ${pkgVersion}`);
  log('info', `listening on http://0.0.0.0:${PORT}`);
  log('info', `mounted ${apiRouteCount} /api/* routes`);
  log('info', `rate-limit backend: ${process.env.KV_REST_API_URL ? 'KV' : 'in-memory (single-process only)'}`);
});

// Graceful shutdown — important for Kubernetes / ECS deployments where the
// orchestrator sends SIGTERM and expects the container to drain connections.
function shutdown(signal) {
  log('info', `${signal} received, draining connections`);
  server.close(err => {
    if (err) {
      log('error', 'error during shutdown:', err);
      process.exit(1);
    }
    log('info', 'shutdown complete');
    process.exit(0);
  });
  // Hard exit after 25s so we never exceed Kubernetes's 30s default grace.
  setTimeout(() => {
    log('warn', 'shutdown timeout, forcing exit');
    process.exit(1);
  }, 25000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
