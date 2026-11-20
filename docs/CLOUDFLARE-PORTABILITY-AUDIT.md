# Cloudflare portability audit — initial verified findings (2026-11-19)

Status: **HOLD for functional Cloudflare deployment**. This is an isolated work branch; do not merge into main or publish production.

## Verified source baseline
- Source branch: `staging/community-v1.3.1-rc`.
- Netlify publish directory: `public`; serverless functions: `netlify/functions` (`netlify.toml`).
- `package.json` depends on `@netlify/blobs@10.7.8`.
- `netlify/lib/common.mjs` imports `getStore` from `@netlify/blobs` and uses `process.env`, Node crypto, request-origin checks and IP-based rate limiting.
- `feedback.mjs` writes to Netlify Blobs store `customer-feedback`.
- `track-click.mjs` writes to `contact-click-events`, with `rate-guard` for abuse controls.
- `admin-feedback.mjs` reads `customer-feedback`; tests also reference `admin-clicks.mjs`.
- `netlify.toml` contains CSP, security headers, and admin no-store/noindex rules. Cloudflare does not consume this file as equivalent routing/header configuration.
- `tools/build-config.mjs` generates `netlify.toml` CSP hashes; changing inline scripts requires regenerating config.

## Critical portability constraints
1. **Do not publish `public` alone as a working app**: Netlify function endpoints would be missing.
2. **Do not point Cloudflare staging writes at the production Netlify Blobs store**. Protect real messages/click data from test writes.
3. **Do not assume Cloudflare KV/D1 is an automatic equivalent of Netlify Blobs**. Storage API, listing, consistency, credentials, migration and operational costs must be reviewed.
4. Implement a platform-neutral storage interface, and separate adapters for Netlify and Cloudflare. Preserve existing Netlify data and its read contract.
5. Implement Cloudflare request handlers compatible with existing `/.netlify/functions/*` client paths (or make frontend routes platform-neutral with an explicitly tested adapter).
6. Set secrets independently in each host, never in source control. `ADMIN_PASSWORD` should be >= 20 random characters and must not be printed in logs.
7. Verify Cloudflare equivalents for CSP and security headers, admin cache prevention, request-origin checks, client IP extraction, rate limiting, and proper error handling.
8. Never switch QR destinations or production domain as part of staging.

## Execution gates
- Gate 0: inventory all actual function endpoints and client calls; read complete docs/tests; snapshot release state.
- Gate 1: create shared interfaces and Cloudflare adapter with **isolated staging storage**, no production data writes.
- Gate 2: run automated backend, browser, community and smoke tests for both adapters; confirm no regression.
- Gate 3: deploy a staging-only Cloudflare hostname and manually verify feedback, admin login, clicks, and mobile UX.
- Gate 4: when Netlify deploy capacity returns, deploy verified code to existing Netlify site; validate QR and production data, keep rollback.

## Current action
Only this audit note and an isolated work branch were created. No hosting deployment, database migration, DNS change, production branch modification, or production-data write was performed.
