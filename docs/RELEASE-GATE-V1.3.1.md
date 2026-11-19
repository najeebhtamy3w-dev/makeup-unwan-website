# MAKEUP HOUSE × UNWAN — V1.3.1 Release gate

**STATUS: HOLD — NOT APPROVED FOR PRODUCTION.**

## Completed in this candidate
- Preserved original V1.2.2 `public/index.html`, `public/admin.html`, existing Netlify functions and configuration from the uploaded source baseline, except for the previously staged homepage third-card integration.
- Added `masahatak.html`, `masahatak.js`, community moderation, and shared poll links on the same origin.
- Moderation before publication, administrator review, reports, and emoji reactions.
- Changed reaction/vote aggregation to append-only event keys, avoiding lost increments from read-modify-write counters.
- Best-effort duplicate prevention per hashed IP and user agent, without storing raw IP or publicly displaying names/phones.
- Rejected URL/contact-like text in public post and poll fields; no member-provided outbound links.
- Backend V1.2.2 acceptance tests and new community test run with local in-memory storage stand-in.

## Outstanding blockers before production approval
1. **No real Netlify staging integration test** has been performed. In-memory Blobs tests do not validate deployed storage, permissions, or simultaneous clients.
2. **No full browser regression test** in this environment: Playwright dependency/browser not installed. Run `npm ci`, `npm run install:browsers`, `npm test` on a network-enabled machine; fix failures.
3. **Duplicate protection is best effort**, not proof of unique humans: IP+user-agent can cause false positives on shared mobile networks and is spoofable. Need explicit anti-abuse and product policy before opening to the public.
4. **No expiry/retention policy or cleanup** for community posts, poll events, reports, and rate markers beyond existing rate-guard cleanup; needs operational policy and implementation.
5. **No independent penetration/security review**; no demonstrated load tests against real Netlify Blobs.
6. **No real Netlify deployment access** has been granted; production site was not changed.
7. Poll creation lacks an authenticated owner or edit/delete workflow. Public moderation reports are visible to admin but no report resolution workflow.
8. Review page uses existing administrator password mechanism; verify operational access controls and admin session handling before release.

## Rollback / V1.2.2
- Source-of-truth backup: `backup-v1.2.2-original.zip` in the parent deliverables directory (SHA-256 in `MANIFEST-SHA256.txt`).
- Before deployment: save Netlify site settings and environment variable names, current production deploy ID, and any current Blobs data; test restoring these in staging.
- Prefer Netlify **Deploys > prior known-good production deploy > Publish deploy** (confirm actual UI before executing). Re-deploy the original V1.2.2 source only if previous deploy is unavailable.
- Do not delete existing Netlify Blobs. A code rollback does not automatically undo data written by new functions.
- Verify home QR entry, both store cards, all WhatsApp/social/maps links, feedback, analytics, and admin login after rollback.

## Deploy gate
NO GO until every blocker above is resolved and a signed acceptance record identifies the precise commit/deploy ID and tests. Never upload this release candidate as if production-certified.
