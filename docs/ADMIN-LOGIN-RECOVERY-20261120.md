# Admin login recovery and Cloudflare audit status (2026-11-20)

Branch: `fix/admin-login-ratelimit-and-errors` (built on PR #12 `fix/admin-independent-login-check`), target `develop`.

## Root causes found (proven in code and tests)

1. **Stale CSP hash blocked the whole admin script on Cloudflare.**
   `public/_headers` pinned `sha256-iXeQ…` for `admin.html`. That hash last matched at commit `633d203`.
   PR #9 (`edc4c32`), PR #10 (`6f2b1bf`) and PR #11 (`6d68a0c`) all edited the inline admin script
   without regenerating the hash. With `script-src 'self' 'sha256-…'`, the browser refuses to run the
   script, so the login button did nothing and **no password could ever work**, the correct one included.
   `cloudflare/tests/admin-ui-browser.test.mjs` serves the page with the real `_headers` CSP. With the
   old file, login never completes. With the regenerated file, it works.
   Fix: `tools/build-config.mjs` now generates **both** `netlify.toml` and `public/_headers`, and
   `--check` (now in CI) fails if either one is stale.

2. **Successful requests consumed the admin lockout budget.**
   `requireStagingAdmin` counted every authenticated call (login, inbox, clicks, community list, each
   refresh and moderation) in one window of 20 requests per 15 minutes per IP. Normal use produced
   `429`, which looked like a wrong password. Now only **failed** checks count (10 per 15 minutes per
   client). A correct password is never throttled until that limit is reached. The response carries
   `Retry-After`.

## Behaviour after the fix
| Situation | HTTP | `code` | What the owner sees |
|---|---|---|---|
| Correct password | 200 | – | Dashboard opens; messages, statistics and community load separately |
| Wrong password | 401 | `ADMIN_BAD_PASSWORD` | Wrong password, check upper/lower case |
| Too many wrong attempts | 429 | `ADMIN_LOCKED` | Temporary stop, wait about N minutes |
| Missing setting (DB / salt / password length) | 503 | `ADMIN_NOT_CONFIGURED` + `missing` | "Not a password problem" + name of the missing setting (never its value) |
| Database error during check | 503 | `ADMIN_CHECK_FAILED` | Server error |
| No network / DNS failure | – | – | Connection message (separate from 401/429/503) |
| Messages or statistics down | 503 on that route only | – | Login still succeeds; that section shows an error with a retry button |

One password still protects every admin route on the server, community moderation included.
No password, secret, database or production setting was changed.

## Not verifiable from the build session (owner action needed)
This session's network blocked `api.cloudflare.com` and `*.pages.dev`. The environment change that
would have allowed them needs approval from a computer; the phone app could not approve it.
So the following were **not verified** and nothing below is assumed:

- CP0: purpose, production branch, build settings, env vars, secrets presence, D1 bindings and last
  deployment of `makeup-unwan-dev`, `makeup-unwan-staging`, `makeup-unwan-website`, `makeup-unwan`.
- Whether any project other than `makeup-unwan-dev` builds from `develop`.
- Live login on `https://makeup-unwan-dev.pages.dev/admin.html`.
- DNS (`DNS_PROBE_FINISHED_NXDOMAIN` without VPN).

What the repository itself shows:
- `cloudflare/wrangler.toml` describes the staging check only: binding `STAGING_DB` -> `makeup-unwan-staging-test`
  (placeholder id). It does not configure the dev project; dev bindings live in the Cloudflare dashboard.
- `cloudflare/lib/environment-db.mjs`: `DEPLOYMENT_ENV=development` uses only `DEV_DB`,
  `staging` uses only `STAGING_DB`, and anything else gets no database (fail closed, tested).
- `docs/DEPLOYMENT-BRANCH-POLICY-V1.3.3.md`: the staging project's production branch is
  `work/cloudflare-portability-audit`, and `STAGING_DB` holds real user submissions.

### Owner checklist (Cloudflare dashboard, read only)
For each of the four projects, open Workers & Pages -> project -> Settings and note:
Production branch · Preview branches (all / none / custom) · Build output dir · Variables
(`DEPLOYMENT_ENV` value) · Secrets present (`ADMIN_PASSWORD`, `RATE_LIMIT_SALT`) · Bindings (D1 name).
**Stop before merging to `develop`** if any project other than `makeup-unwan-dev` has
`develop` as its production branch, or has preview deployments enabled for all branches while
bound to a real database.

### DNS without VPN
`DNS_PROBE_FINISHED_NXDOMAIN` is returned by the phone's DNS resolver before any request reaches
Cloudflare. HTML/JS changes cannot cause or fix it. Working with a VPN (which uses another resolver)
and failing without one points to the ISP/network resolver, not the site. To confirm from the
affected network:
`nslookup makeup-unwan-dev.pages.dev` (ISP default) vs `nslookup makeup-unwan-dev.pages.dev 1.1.1.1`,
then the same for the other three hostnames. If only the ISP resolver fails, the cause is outside
the project, and no change in this repository can fix it.
