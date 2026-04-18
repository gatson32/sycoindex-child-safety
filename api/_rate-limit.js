// Shared rate limiter for API endpoints.
//
// Primary backend: Vercel KV (Upstash Redis), via @vercel/kv.
// Fallback backend: in-memory Map, used when KV env vars are absent
// (local dev, preview deploys without KV, or transient KV errors).
//
// Files prefixed with `_` are not routed by Vercel but are bundled
// with the serverless functions that require() them.

let kvClient = null;
let kvAvailable = null; // null = not yet checked, true/false = cached

function getKv() {
  if (kvAvailable === false) return null;
  if (kvClient) return kvClient;

  // @vercel/kv reads KV_REST_API_URL / KV_REST_API_TOKEN from env.
  // If either is missing, calling kv methods will throw.
  const hasEnv =
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  if (!hasEnv) {
    kvAvailable = false;
    return null;
  }

  try {
    // Require lazily so local dev without the package still works.
    const mod = require('@vercel/kv');
    kvClient = mod.kv;
    kvAvailable = true;
    return kvClient;
  } catch (_err) {
    kvAvailable = false;
    return null;
  }
}

// In-memory fallback store. Resets on cold start, which is why we
// prefer KV in production, but it keeps local dev working.
const memoryStore = new Map();

function memoryCheck(ip, limit, windowMs) {
  const now = Date.now();
  const entry = memoryStore.get(ip);
  if (!entry || now - entry.start > windowMs) {
    memoryStore.set(ip, { start: now, count: 1 });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

/**
 * Check and increment a rate-limit counter for the given IP.
 *
 * @param {Object} opts
 * @param {string} opts.ip              IP address (or other identifier)
 * @param {string} opts.scope           Logical bucket, e.g. 'score', 'submit'
 * @param {number} opts.limit           Max requests per window
 * @param {number} opts.windowMs        Window length in milliseconds
 * @returns {Promise<{allowed: boolean, remaining: number, backend: string}>}
 */
async function checkRateLimit({ ip, scope, limit, windowMs }) {
  const kv = getKv();

  if (!kv) {
    const result = memoryCheck(ip, limit, windowMs);
    return { ...result, backend: 'memory' };
  }

  const key = `rl:${scope}:${ip}`;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  try {
    // INCR is atomic; first hit returns 1, subsequent hits increment.
    const count = await kv.incr(key);
    if (count === 1) {
      // First request in this window — set TTL so the key expires.
      await kv.expire(key, ttlSeconds);
    }
    if (count > limit) {
      return { allowed: false, remaining: 0, backend: 'kv' };
    }
    return { allowed: true, remaining: limit - count, backend: 'kv' };
  } catch (_err) {
    // KV hiccup — degrade to in-memory so we never hard-fail a request
    // just because Redis is briefly unreachable.
    const result = memoryCheck(ip, limit, windowMs);
    return { ...result, backend: 'memory-fallback' };
  }
}

module.exports = { checkRateLimit };
