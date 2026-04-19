# syntax=docker/dockerfile:1.7
#
# Sycoindex self-hosting image.
#
# Builds a slim Node.js Alpine container that serves:
#   - the static site (HTML, CSS, JS, images) from /
#   - the Vercel-style handlers under /api/*
#   - a /healthz endpoint for orchestrator health checks
#
# Usage (quick start):
#   docker build -t sycoindex:latest .
#   docker run --rm -p 3000:3000 sycoindex:latest
#
# Usage (with durable rate limiting via Upstash / Vercel KV):
#   docker run --rm -p 3000:3000 \
#       -e KV_REST_API_URL=https://YOUR-KV.upstash.io \
#       -e KV_REST_API_TOKEN=YOUR_TOKEN \
#       sycoindex:latest
#
# The image exposes :3000. Terminate TLS upstream (nginx, ALB, Cloud Run,
# Fly proxy, etc.) — we deliberately don't handle TLS inside the container so
# enterprise operators can apply their own cert-management pipeline.

# ---------------------------------------------------------------------------
# Stage 1: deps — install production dependencies in isolation.
# Using `npm ci` with a package-lock.json produces a deterministic install;
# a separate stage keeps the layer cacheable across source-only changes.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Only copy the files needed for `npm ci` so the layer cache doesn't bust on
# unrelated source changes.
COPY package.json package-lock.json* ./

# --omit=dev skips test/lint deps; --ignore-scripts avoids running prepare
# hooks that might assume a full repo (e.g. the CLI's prepublishOnly).
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2: runtime — slim image with only what's needed to run.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# tini is a tiny init so SIGTERM propagates to node instead of getting eaten
# by PID 1 shell quirks. Cheap (~250 KB) and resolves a long-standing Docker
# + Node signal-handling papercut.
RUN apk add --no-cache tini

WORKDIR /app

# Create a dedicated non-root user. node:alpine ships with a `node` user at
# uid 1000, which we reuse rather than creating a new one.
ENV NODE_ENV=production \
    PORT=3000 \
    SYCOINDEX_LOG_LEVEL=info

# Copy production node_modules from the deps stage.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy application source. `.dockerignore` filters out tests, preprint sources,
# CLI package, and other files not needed at runtime.
COPY --chown=node:node . .

# Drop privileges. Running as non-root is required by many enterprise
# container-security policies (and is just good hygiene).
USER node

EXPOSE 3000

# Health check hits the cheap, dependency-free /healthz endpoint.
# Interval/timeout/retries chosen to fail a broken container within ~40s
# without spamming logs on a healthy one.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/healthz || exit 1

# Use tini as PID 1 so SIGTERM/SIGINT reach Node for graceful shutdown.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
