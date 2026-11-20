# Deployment and branch policy — V1.3.3

## Current verified baseline
- Stable snapshot: `release/v1.3.3-stable` at `9a8c778cefb189c26abaed994fcd0a792d4b2699`.
- Existing Cloudflare Pages Production branch: `work/cloudflare-portability-audit` (do not switch without a controlled migration).
- Existing Pages environment is labeled `staging` and uses D1 binding `STAGING_DB` -> `makeup-unwan-staging-test`. It currently contains user submissions; **treat as real data**. Do not wipe, reset, or reuse as test storage.
- `main` is legacy and must not become the Pages Production branch until code has been synchronized and verified.

## New development workflow
1. Create `feature/<name>` from `develop`.
2. Commit code and tests on the feature branch; use a pull request targeting `develop`.
3. Deploy `develop` only to a separate Cloudflare Pages project with a separate D1 database and secrets. Do not use the current project's `STAGING_DB` for test writes.
4. Test public create/list/reactions/report, error handling, rate limits, and administrative takedown before promoting.
5. Promote reviewed commits to the stable production branch with a reviewed pull request; record the deployed commit SHA and validate the Pages deployment.
6. Never copy production user data into public preview environments without a privacy review.

## Before migration to main
- Back up the current D1 data and validate restore.
- Provision separate production and staging D1 databases.
- Confirm Pages bindings and secrets for each environment, including admin moderation access.
- Confirm all current community submissions are retained and visible.
- Synchronize the old `main` branch carefully, then switch the production branch only after a tested release and rollback plan.
- Protect production branches and require checks where repository settings permit.

**Current state:** only GitHub branches are separated. Separate Cloudflare Pages projects/databases and the production branch switch are NOT completed.
