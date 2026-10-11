# Security

This document records the security status of PixlBank: how to report a
vulnerability, how the app protects its data, what was reviewed and fixed, and
the risks that are still open. Keep it up to date whenever a finding is fixed or
a new one is accepted.

PixlBank holds **confidential financial data**: who owes whom, how much, payment
history, receipt images (often bank screenshots with names and account numbers)
and contact details. Every decision below starts from that.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private
reporting instead: *Security → Report a vulnerability* on this repository. Include
the affected endpoint or file, steps to reproduce and the version (image tag or
commit) you tested.

Only the latest published image (`ghcr.io/pixlgalaxy/pixlbank:latest`) and the
`main` branch receive security fixes.

## Current status

| | |
| --- | --- |
| Last review | 2026-10-11 |
| Scope | Backend (`backend/src`, every route), frontend, `nginx.conf`, `Dockerfile`, `entrypoint.sh`, CI workflows |
| Dependency audit | `npm audit` (prod and dev): **0 known vulnerabilities** in backend and frontend |
| Open critical / high findings | **None** |
| Open medium findings | None |
| Accepted low risks | 8 (see [Open findings and accepted risks](#open-findings-and-accepted-risks)) |

## Security model

| Role | Can do |
| --- | --- |
| Anonymous | `GET /api/health`, `GET /api/config` (app name, theme, language and two receipt settings — nothing confidential), `POST /api/auth/login` |
| Debtor (`user`) | Read **only their own** loans, payments, receipts and score; report payments on their own active loans; manage their own account |
| Lender (`admin`, exactly one, from `.env`) | Everything: debtors, loans, payment review, settings, logs, IP bans |

- Another debtor's data is answered with **404**, never 403, so ids don't reveal
  whether a record exists.
- The AI never decides anything. It only adds an advisory confidence score to a
  receipt. Every reported payment stays *pending* until the lender approves or
  rejects it.

## Controls in place

### Authentication and sessions
- Passwords are hashed with **argon2id** and never stored or logged in plain text.
  The last applied `ADMIN_PASSWORD` is kept only as an argon2 hash, so the app can
  tell when it changes.
- Passwords must be 8–256 characters. Anything longer is refused before argon2 runs.
- Session tokens are 32 random bytes. The database stores only their SHA-256, and
  the cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when `COOKIE_SECURE=true`.
- Changing a password, deactivating an account or changing a password from
  `.env` deletes every session of that account.
- Expired sessions are pruned at boot and every hour.
- A login with an unknown username still verifies against a dummy argon2 hash, so
  response time doesn't reveal which accounts exist.

### Brute force and abuse
- **Login:** 10 attempts per 15 min, per IP **and** per account. Both limits are
  configurable and both must pass.
- **Change password:** the same budget, per account and sharing the IP counter,
  so a stolen session can't guess the current password.
- **Receipt uploads:** 10 per hour per IP, since each one runs the vision model.
- **Permanent IP bans** in Admin Panel → IP Access.
- `req.ip` trusts only the bundled nginx (loopback) unless `TRUST_PROXY` lists
  more. `X-Forwarded-For` can't be spoofed to dodge the limits.

### Authorization
- `requireAuth` runs on every route except the three anonymous ones, and
  `requireAdmin` on every lender-only route. Both are verified per route by the
  audit script below.
- Avatars: a debtor can fetch only their own and the lender's.

### File uploads (receipts, avatars)
- The file type is decided by **magic bytes** (`backend/src/image-sniff.ts`),
  never by the browser's `Content-Type` or the file name.
  - Receipts accept PNG, JPEG and WebP.
  - Avatars also accept GIF.
  - HTML, SVG, PDF or anything renamed to `.png` is refused with **400**.
- Receipts are capped at **10 MB** and avatars at 5 MB. nginx caps request bodies at 12 MB.
- Stored names are server-generated (`<uuid>.<ext>`), so client names never reach the filesystem.
- Files are served by the API only after an ownership check, with the detected
  type, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` and
  `Content-Security-Policy: default-src 'none'; …; sandbox`. A file opened directly
  can't run anything.
- The frontend pre-checks type and size for a friendly error. The server is the authority.

### Browser protections
- **CSP** on every page (`nginx.conf`):
  - `default-src 'self'; script-src 'self'` with no inline scripts (the theme bootstrap lives in `/theme-init.js`).
  - `object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`.
  - `img-src` also allows `data:` and `blob:` only for the avatar cropper and the receipt preview.
- `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: same-origin`, and a `Permissions-Policy` that disables camera,
  microphone and geolocation.
- **CSRF:** `SameSite=Lax` cookie, plus every state-changing request with
  `Sec-Fetch-Site: cross-site|same-site` is refused (403). The only exception is
  an origin explicitly listed in `CORS_ORIGINS`.
- **CORS:** off by default (same-origin only). `CORS_ORIGINS` takes exact origins.
  `*` and malformed entries are ignored with a warning.
- React escapes all rendered data. There is no `dangerouslySetInnerHTML`, `eval` or `innerHTML`.

### Confidentiality of responses
- Every `/api` response carries `Cache-Control: no-store`, so no proxy or shared
  cache keeps financial data.
- Receipts use `private` caching only, so they stay in the viewer's own browser.
- Debtor responses strip the AI score, the model's notes and what it read; a
  debtor sees only a color flag.
- The SMTP password and MaxMind key are write-only: the settings API returns only
  whether they are set.
- Errors return translated messages, never stack traces or file paths.
  Malformed JSON answers 400, an oversized body 413.

### Server and container
- The API listens on `127.0.0.1` inside the container. Only the bundled nginx reaches it.
- Every SQL query uses bound parameters. The single interpolated identifier
  (`assertUniqueUser`) comes from a closed `'email' | 'username'` union.
- Control characters are stripped from every log line (no log forging).
- Money is stored as integer cents, so there are no float rounding errors.

## Fixed in the 2026-10-11 review

| Severity | Issue | Fix |
| --- | --- | --- |
| Medium | **Upload type trusted the browser.** Receipts and avatars were validated by the client's `Content-Type`, so an HTML/SVG file declared as `image/png` would have been stored and later served. | Magic-byte detection decides the type; mismatches are refused (400) and partial files deleted. Uploads are served with a sandboxing CSP. |
| Medium | **Password change had no rate limit.** A stolen session could brute-force the current password through `POST /auth/change-password`. | Per-account limit plus the shared per-IP login budget (429). |
| Medium | **Debtors could fetch any user's avatar** by id. | Debtors get only their own avatar and the lender's; others answer 404. |
| Low | **No Content-Security-Policy** on the web app. | Strict CSP in `nginx.conf`; the inline theme script moved to `/theme-init.js`. |
| Low | **API responses were cacheable** by intermediaries. | `Cache-Control: no-store` on every `/api` response; receipts `private`. |
| Low | **Unbounded password length** let a single request make argon2 hash ~1 MB. | 256-character cap on login, change password and user create/update. |
| Low | **Malformed/oversized JSON returned 500** and was logged as a server error. | Answered 400 / 413. |
| Low | **AI decisions without a human.** Receipts could be auto-approved or auto-rejected by the model (and a crafted image could steer it). | The AI is advisory only: a 0–100 score capped by deterministic checks; the lender always decides. |

## Verification

Run against a real backend (temporary database, built code) and the production
frontend build served with the exact headers from `nginx.conf`:

| Check | Result |
| --- | --- |
| Every protected route without a session (42 routes) | 401 ✅ |
| Debtor against lender-only routes (14) | 403 ✅ |
| Debtor against another debtor's loan, receipt, avatar, payment report | 404 ✅ |
| HTML-as-PNG, SVG, SVG-as-PNG, PDF-as-JPEG, GIF receipt, 11 MB PNG | refused ✅ |
| Real PNG declared as JPEG | accepted, stored as PNG ✅ |
| Path traversal in ids (`..%2F..%2F.env`) | 404 ✅ |
| Malformed JSON / 2 MB body / 5000-char password | 400 / 413 / 401 in ~1 ms ✅ |
| Response headers (no-store, receipt CSP/nosniff) | ✅ |
| Property test: 5000 random loans (schedule sums, integer cents, no negatives, increasing dates; allocation: paid + remaining = total, interest + principal = paid, pending/rejected never counted) | ✅ |
| 14 screens (lender and debtor) in Chrome under the production CSP, including the `blob:` receipt preview and the `data:` avatar cropper | 0 CSP violations, 0 page errors ✅ |
| `npm audit` backend + frontend | 0 vulnerabilities ✅ |

## Open findings and accepted risks

| Severity | Risk | Why it's accepted / mitigation |
| --- | --- | --- |
| Low | **The container runs nginx and Node as root.** | The API binds to loopback only and runs no shell commands from input. The admin panel's "restart frontend" signals the nginx master, which a non-root Node process couldn't do. Revisit if that feature is dropped. |
| Low | **HTTPS is not terminated by the app**, and there is no HSTS. | Deployer's responsibility: put PixlBank behind a TLS reverse proxy (with HSTS), set `COOKIE_SECURE=true` and `TRUST_PROXY`. |
| Low | **The SMTP password is stored in clear text** in the SQLite database. | It's needed to authenticate to the mail server. It's never returned by the API. Protect the `data/` volume (permissions, encrypted backups). |
| Low | **Receipt images are kept as uploaded**, including metadata such as EXIF/GPS, and are not re-encoded. | They're served only to their owner and the lender, under a sandboxing CSP. Re-encoding would need an image library in the image. |
| Low | **Prompt injection through the receipt image** could push the AI score up (e.g. text in the image addressed to the model). | The score is capped by deterministic date/amount checks and is advisory. A human approves every payment. |
| Low | **Admin-configurable outbound URLs** (Ollama URL, SMTP host) let the lender make the server connect anywhere. | Lender-only. Same trust level as server access. |
| Low | **Ollama has no authentication of its own.** | Keep it on the LAN or a private Docker network. Never expose port 11434 to the internet. |
| Low | **Rate-limit counters are in memory** and reset on restart. There is no 2FA. | Single-process self-hosted app. Permanent IP bans persist. 2FA is a possible future addition. |

## Deployment checklist

- [ ] Strong, unique `ADMIN_PASSWORD` (8–256 characters). Change it from the web after the first login.
- [ ] Serve over **HTTPS** through a reverse proxy with HSTS. Set `COOKIE_SECURE=true`.
- [ ] Set `TRUST_PROXY` to your proxy so rate limits and bans see real client IPs.
- [ ] Leave `CORS_ORIGINS` empty unless another site really must call the API.
- [ ] Keep Ollama reachable only from the PixlBank host (LAN or private network).
- [ ] Restrict access to `data/` (database, receipts, avatars) and back it up encrypted.
- [ ] Keep the image updated. Dependabot and the publish workflow handle this
      (see `.github/DEPENDABOT.md`).
