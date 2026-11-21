# Production readiness — V1.2.2

**HOLD** pending a genuine lockfile, clean npm ci, full Playwright run and Netlify verification. No new staging site or Git branch is required to complete the offline/CI checks. If deploying directly to production, preserve the previous deploy and plan a rollback; first live verification would affect the real site.

1. On a network-connected computer: `npm install` (generates `package-lock.json`), then `npm ci`.
2. `npm run install:browsers` and `npm test`; require zero failures.
3. `npm run check:config` (rebuild via `npm run build:config` only after embedded scripts change).
4. Verify existing `ADMIN_PASSWORD` in Netlify environment (>=20 random characters recommended). Never place it in source or Git.
5. Keep current live Netlify deploy as rollback target before touching `main`.
6. After production deploy, execute `node tools/smoke-test.mjs <site-url> <password> --concurrent 100` only with suitable test settings and after reviewing lockout implications. Prefer a low-impact manual check first.
7. Verify messages, contact destinations, CSP, blocked source URLs, and daily click counts in real Netlify.

Existing docs/DEPLOYMENT-GUIDE-V1.2.1.md and ROLLBACK-GUIDE-V1.2.1.md remain applicable with this readiness note taking precedence.
