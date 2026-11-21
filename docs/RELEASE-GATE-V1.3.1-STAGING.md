# V1.3.1 staging release gate

Status: HOLD — NOT FOR PRODUCTION.

The source ZIP `makeup_unwan_v1_3_1_release_candidate.zip` has been reviewed locally. This branch is a safe staging workspace; the ZIP source has NOT yet been committed to this branch.

## Local checks
- Backend: 39 checks passed with in-memory Blobs stub.
- Local smoke: passed.
- Full `npm test`: FAILED / incomplete because Playwright module was not installed; browser regression has not passed.

## Required before preview deployment
1. Commit the full verified release candidate source (not ZIP alone), compare against V1.2.2.
2. Run `npm ci`, install Chromium, run complete tests and fix failures.
3. Test Netlify Deploy Preview with real Blobs and concurrent devices.
4. Complete retention/deletion, moderation reports, poll ownership and anti-abuse policy.
5. Review access controls, secrets and security, then record a deploy ID and rollback ID.
6. Obtain explicit production approval before merging to main.

No production changes are authorized by this staging note.
