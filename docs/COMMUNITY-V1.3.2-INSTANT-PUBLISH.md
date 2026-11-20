# Community V1.3.2 — Instant publishing with post-moderation

Status: APPROVED REQUIREMENTS — IMPLEMENTATION PENDING CLOUDFLARE ROUTE INSPECTION.

## Non-negotiable
- Preserve V1.3.1 production branch and deployment.
- New valid posts become publicly visible immediately after server-side validation and successful durable write.
- Reject all external links, shortened URLs, bare domains, obfuscated URLs, phone numbers, email addresses, contact handles and HTML. Validate on server, not only client. Use Unicode normalization, remove zero-width separators, and test bypasses. Reject uncertain link-like strings rather than silently stripping.
- Preserve anonymous posting, consent and per-client rate limiting. Prevent duplicate submissions. Display all user text using textContent, never innerHTML.
- Reports remain available; admin can hide/unhide a post using authenticated, server-enforced authorization. Keep moderation audit trail and do not leak admin secret to client.
- Previously pending posts must NOT be bulk auto-published. Review or migrate individually.
- Keep existing reactions and voting behavior.
- Update UI labels to 'نشر المشاركة' and success 'نُشرت مشاركتك' only after successful API response.
- Add tests: immediate appearance, link rejection (http/https/www/bare domains/shorteners/Unicode obfuscation), contact rejection, rate limiting, admin hide and restore, public exclusion of hidden posts, anonymous consent, regression for polls/reactions, fail-closed if DB unavailable.
- Deploy only to isolated preview and verify real Cloudflare Pages Functions + D1 binding before any production promotion.

## Important repository observation
On the inspected branch, public/masahatak.js calls /.netlify/functions/community and netlify/functions/community.mjs uses Netlify Blobs, while the deployed Cloudflare endpoint is not yet located in the inspected repository. Do not assume changes to the Netlify handler would affect the Cloudflare site.
