# Cloudflare staging backend — implementation checkpoint

**Not deployable yet.** This folder provides the first isolated D1 schema and storage adapter; it is not connected to the Netlify endpoints or Cloudflare Pages Functions.

## Why D1 rather than KV?
The existing backend uses Netlify Blobs with strong-consistency reads for rate limits, messages and votes. Cloudflare KV is eventually consistent and is not a safe drop-in substitute for those semantics. D1 provides SQL transactions, but **the existing read/list/write-based voting and rate-limit algorithms are not atomic**: they must be refactored and tested before accepting real traffic. Do not represent the adapter as a complete concurrency-safe port.

## Next engineering tasks
1. Audit every store namespace and method used by `netlify/functions/community.mjs` and other handlers. Update the allowlist only after confirming usage.
2. Build Cloudflare Pages Functions routing for existing `/.netlify/functions/*` paths, using Cloudflare environment bindings and a separate Cloudflare runtime implementation. Do not import Node-only Netlify handlers directly.
3. Implement atomic D1 SQL for one-vote-per-user, reactions, reports and rate limits with unique constraints/transactions.
4. Set up a dedicated **staging-only** D1 database and bindings, with a strong admin secret and no production credentials. Do not share production Netlify Blobs.
5. Add `public/_headers` or equivalent Cloudflare headers generated from the CSP hash tool, plus `/admin` routing.
6. Run Node tests and live Cloudflare integration tests. Require passing security, moderation, admin, feedback, analytics, mobile and concurrency checks.
7. Keep Netlify production and QR unchanged. Do not merge into `main` until acceptance.

## Current adapter contract
`createD1Store(db, name)` exposes `set`, `setJSON`, `get`, `delete`, and async-iterable `list`. It intentionally has no production fallback and rejects unknown namespaces. It is **not** a full Netlify Blobs API implementation.
