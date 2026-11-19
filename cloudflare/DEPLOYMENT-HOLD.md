# Cloudflare Pages staging: deployment HOLD

Current state: Cloudflare storage foundation, atomic event primitives, fixed-window limiter, a staging-only D1 health route, and a **fail-closed** guard for unported legacy Netlify API URLs. Staging community endpoints now include public list, pending submissions, poll creation and retrieval, voting, reactions and reports. Staging admin listing and moderation are now implemented with rate-limited password checks and conditional updates, but are NOT validated on real D1. Remaining backends are NOT ported. This is NOT a working replacement backend.

Cloudflare Pages reads Pages Functions from repository-root `functions/` and static files from `public/`. Do not confuse this with `cloudflare/functions/`, which is not a Pages Functions route directory.

## Safe build settings (when authorized after tests)
- GitHub repository: `najeebhtamy3w-dev/makeup-unwan-website`
- Branch: `work/cloudflare-portability-audit` for engineering tests only
- Framework preset: None
- Build command: leave empty (static `public/` output)
- Build output directory: `public`
- Set `DEPLOYMENT_ENV=staging`\n- Set secrets `RATE_LIMIT_SALT` (at least 32 characters) and `ADMIN_PASSWORD` (at least 20 characters), unique to staging. Never reuse Netlify production secrets.
- Bind `STAGING_DB` to a **new, empty, dedicated** Cloudflare D1 database.
- Apply `cloudflare/schema.sql` and `cloudflare/schema-community.sql` to that staging database before testing.
- No Netlify production credentials, production data, or production domain.
- Never publish this as a working customer-facing replacement: legacy API paths intentionally return 503.

## Blocking items
1. Verify community admin moderation on real D1; complete route compatibility for feedback, tracking, admin statistics, admin inbox.
2. Port and validate request authentication, CSRF, IP identification and rate limiting.
3. Verify atomic uniqueness and state transitions in real D1 under concurrency. The existing SQLite and JavaScript mock tests do not prove D1 behavior.
4. Generate Cloudflare security headers matching `netlify.toml` CSP; check admin no-cache/noindex.
5. Add regression and integration tests, verify in a live staging deployment.
6. Only then consider an acceptance decision. Keep Netlify and QR unchanged.
