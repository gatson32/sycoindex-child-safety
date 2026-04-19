# Self-hosting Sycoindex

This guide covers running Sycoindex inside your own infrastructure — on-prem, in a private VPC, or in an air-gapped evaluation environment. It's aimed at enterprise operators who can't use our hosted deployment at `sycoindex.ai` for procurement, compliance, or data-residency reasons.

The container serves the same static site and the same `/api/*` handlers as the hosted deployment, from the same source tree. There is no separate "enterprise" fork — you run exactly what we run.

## TL;DR

```bash
docker build -t sycoindex:latest .
docker run --rm -p 3000:3000 sycoindex:latest
# open http://localhost:3000
```

The container listens on port 3000 in HTTP. Terminate TLS upstream (nginx, ALB, Cloud Run, Fly, Caddy, etc.) — the container deliberately doesn't handle certs so you can apply your own cert-management pipeline.

## What's in the image

- **Static site.** All pages served by `sycoindex.ai` — leaderboard, methodology, dashboard preview, extension page, etc.
- **API handlers.** All endpoints under `/api/*`:
  - `POST /api/score` — score a prompt/response pair for PAI + sycophancy
  - `GET /api/leaderboard` — full leaderboard JSON
  - `GET /api/model?slug=...` — per-model details
  - `GET /api/verify?hash=...` — audit-chain verification
  - `POST /api/submit` — model submission
  - `POST /api/waitlist`, `POST /api/keys` — enterprise intake (requires KV)
  - `GET /api/badge/:slug` — SVG badge for shields.io-style embedding
- **Health check.** `GET /healthz` returns `200 { ok, version, uptime_seconds, kv }`. Used by the image's `HEALTHCHECK` and by orchestrator readiness probes.

**Not included in the Docker image** (see `.dockerignore`):
- `cli/` — the CLI is published separately as `sycoindex` on npm.
- `preprint/` — LaTeX sources and figure generator for the research paper.
- `test/`, `eslint.config.js` — dev tooling.
- `api/server.py` — a separate Python beta server, not used by the Node runtime.

## Configuration (environment variables)

| Variable              | Default                                | Purpose |
|-----------------------|----------------------------------------|---------|
| `PORT`                | `3000`                                 | Server bind port. |
| `KV_REST_API_URL`     | *(unset)*                              | Upstash/Vercel KV endpoint for durable rate limiting. |
| `KV_REST_API_TOKEN`   | *(unset)*                              | KV auth token. |
| `SYCOINDEX_LOG_LEVEL` | `info`                                 | `debug` \| `info` \| `warn` \| `error`. |
| `TRUST_PROXY_HOPS`    | `1`                                    | Express `trust proxy` setting — increase if you have multiple reverse-proxy hops in front of the container. Affects rate-limit IP attribution. |
| `RESEND_API_KEY`      | *(unset)*                              | [Resend](https://resend.com) key for submission + waitlist notifications. If unset, `/api/submit` and `/api/waitlist` still succeed but don't send email. |
| `RESEND_FROM`         | `SycoIndex <noreply@sycoindex.ai>`     | From address for outgoing mail. Must be on a domain verified in your Resend account (SPF + DKIM). |
| `ADMIN_EMAIL`         | `chris@sycoindex.org`                  | Destination for internal admin notifications on each submission/signup. |

### Rate limiting

Rate limiting is on by default: **100 requests/hour/IP** on scoring endpoints, lower caps on write endpoints.

- **With KV configured** (production): counters live in Upstash/Vercel KV and are shared across container replicas. Atomic `INCR` + `EXPIRE` — no race conditions under load.
- **Without KV** (quick-start / dev): falls back to an in-memory `Map`, scoped to a single process. This is fine for one-box deploys but **will double-count** if you run multiple replicas behind a load balancer. The startup log makes the active backend explicit:
  ```
  [info] rate-limit backend: KV
  [info] rate-limit backend: in-memory (single-process only)
  ```

The `kv` field in `/healthz` also reports this, so your readiness probe can refuse to promote a multi-replica deploy that lost its KV connection.

## Running with KV (production)

```bash
docker run -d --restart=always \
    -p 3000:3000 \
    -e KV_REST_API_URL=https://YOUR-KV.upstash.io \
    -e KV_REST_API_TOKEN=YOUR_TOKEN \
    --name sycoindex \
    sycoindex:latest
```

Any Upstash-compatible KV works (Upstash itself, Vercel KV, AWS MemoryDB w/ REST proxy). The code lazy-loads `@vercel/kv`, so if you prefer a self-hosted Redis you can drop in a thin REST shim or modify `api/_rate-limit.js` to use a different client — no other code paths care.

## Email notifications (optional)

`/api/submit` and `/api/waitlist` can send transactional email via [Resend](https://resend.com) — both a notification to `ADMIN_EMAIL` and a confirmation to the user. Email is entirely optional: if `RESEND_API_KEY` is absent, both endpoints still return success and the submission is still recorded (to KV for waitlist, to `data/submissions.json` for submit when the filesystem is writable).

```bash
docker run -d --restart=always \
    -p 3000:3000 \
    -e KV_REST_API_URL=... -e KV_REST_API_TOKEN=... \
    -e RESEND_API_KEY=re_... \
    -e RESEND_FROM="YourCo <noreply@yourco.com>" \
    -e ADMIN_EMAIL=alerts@yourco.com \
    sycoindex:latest
```

**Domain requirements.** Resend requires the From domain to be verified (SPF + DKIM records). See [resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction). If you don't own a verified domain, send from Resend's shared `onboarding@resend.dev` during testing.

**Swapping providers.** The email layer is an 80-line helper in `api/_resend.js` that wraps a single `POST https://api.resend.com/emails` call. To use SendGrid, Postmark, AWS SES, or an internal SMTP relay, replace the body of `sendEmail()` — the function signature (`{to, subject, text, html, replyTo}`) stays stable and nothing else in the codebase changes.

## Reverse proxy / TLS

Minimal nginx snippet:

```nginx
upstream sycoindex {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name sycoindex.internal.example.com;

    ssl_certificate     /etc/ssl/sycoindex.crt;
    ssl_certificate_key /etc/ssl/sycoindex.key;

    client_max_body_size 1m;   # /api/score accepts up to 1 MB

    location / {
        proxy_pass http://sycoindex;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If you chain multiple proxies, bump `TRUST_PROXY_HOPS` in the container environment so `X-Forwarded-For` is parsed correctly (otherwise all traffic rate-limits under the proxy's IP).

## Kubernetes

The container ships with a clean `SIGTERM` handler: Express stops accepting new connections, drains in-flight requests, and exits within ~25 seconds (below Kubernetes's 30s default grace period).

Minimal `Deployment` snippet:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sycoindex
spec:
  replicas: 2
  selector:
    matchLabels: { app: sycoindex }
  template:
    metadata:
      labels: { app: sycoindex }
    spec:
      containers:
      - name: sycoindex
        image: sycoindex:latest
        ports: [{ containerPort: 3000 }]
        env:
        - { name: KV_REST_API_URL, valueFrom: { secretKeyRef: { name: sycoindex-kv, key: url } } }
        - { name: KV_REST_API_TOKEN, valueFrom: { secretKeyRef: { name: sycoindex-kv, key: token } } }
        resources:
          requests: { cpu: "50m",  memory: "96Mi" }
          limits:   { cpu: "500m", memory: "256Mi" }
        readinessProbe:
          httpGet: { path: /healthz, port: 3000 }
          initialDelaySeconds: 5
        livenessProbe:
          httpGet: { path: /healthz, port: 3000 }
          periodSeconds: 30
```

Run at least 2 replicas **only with KV configured** — in-memory fallback will give wrong rate-limit counts across replicas.

## Updating

`docker pull` (or rebuild) + rolling restart. Scoring logic and leaderboard data are baked into the image, so promoting a new build is a single deploy. There's no runtime config drift.

If you prefer leaderboard data to be updateable without a rebuild, mount `data/leaderboard.json` as a read-only ConfigMap / volume over `/app/data/leaderboard.json`. The `api/leaderboard.js` handler reads the file fresh on each request, so a mount swap takes effect immediately without a restart.

## What you're *not* getting in self-hosted mode

- **Judge-ensemble scoring.** `/api/score` runs the lightweight on-box text-analysis scorer — useful for CI, PR gates, and synthetic monitoring. The full five-lab LLM judge pipeline that produces the published leaderboard numbers lives server-side at sycoindex.ai and is not in the container. The response body is explicit about this:
  > `"note": "Scores generated by text analysis engine. For 5-judge ensemble scoring with full audit chain, use the certified assessment endpoint (Enterprise plan)."`
- **Audit-chain storage.** The SHA-256 verification endpoint (`/api/verify`) works against a small baked-in fixture for smoke testing. Full audit-chain storage is an Enterprise-plan add-on.
- **API key issuance.** `POST /api/keys` will accept requests but those keys only unlock rate-limit tiers in your own container — they can't be used against the hosted sycoindex.ai API. Buy enterprise keys from us if you want hosted access.

If any of the above matter for your deployment, reach out at `chris@sycoindex.org` — we work with enterprise customers on bespoke judge-pipeline deployments with proper contract terms.
