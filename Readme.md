# PixlBank

Self-hosted personal lending tracker. You (the lender) lend money to people you know; PixlBank keeps the schedule,
interest, payments and receipts, verifies receipts with a local vision model (Ollama), and emails reminders.

## Accounts

| Role | Who | Sees |
|---|---|---|
| **Admin** (exactly one) | The lender, defined in `.env` | Home dashboard, **User Manager**, **Admin Panel**, Settings |
| **User** (debtor) | Created by the admin | Home (their own debts), My Account, Settings |

- The admin account is created on first boot from `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
  After that, change the password from **Settings → My Account**. Editing `ADMIN_PASSWORD` in `.env` re-applies it
  on the next start (also the way to recover the account); left unchanged, it never overrides the web password.
- Debtors are created from **User Manager → New debtor** (or Admin Panel → Accounts). Every account created there is a debtor.

## Features

**Lender**
- Home dashboard: lent, collected, interest earned, still to collect, overdue, payments awaiting review, and all loans.
- User Manager: one card per debtor (what they owe, % paid, interest earned, overdue/pending flags) → debtor page with
  their loans, schedules, payments, receipts, and charts (returns per month split into principal vs. interest, and
  repayment progress vs. schedule).
- Loans: amount, **currency per loan**, interest rate **annual or monthly**, method **fixed installments (French)
  or simple interest**, frequency **weekly / biweekly / monthly**, number of installments, dates. Live schedule preview.
- Register payments by hand, approve/reject reported payments, re-run the AI check, send a reminder now.

**Debtor**
- Home: what they owe, what they've paid, % paid, next due date and amount, schedule and payment history.
- **Report a payment** with a photo/screenshot of the receipt. The image is always kept as a record.

**Receipt check (Ollama) — advisory only**
- Every reported payment stays **Under review** until the lender approves (✓) or rejects (✗) it. The AI never decides.
- In the background, a multimodal model (e.g. `gemma3:12b`) reads the amount and date off the receipt and gives a
  **0-100% confidence**. PixlBank caps that score when the rules fail (not a receipt, dated more than *N* days ago or in
  the future, amount differs from what the debtor entered), so a mismatching receipt shows up bright red for the lender.
- The lender sees the receipt thumbnail, the score, what the model read and its note. The debtor only sees a color flag
  (green / amber / red) and the lender's decision. Sending a report returns immediately — no "processing" screen.

**Payment score (A–E)**
- Each debtor gets a grade from how they pay: +4 per installment paid on time, 0 if 1-7 days late, −4 if 8-30, −8 if
  more; overdue unpaid installments drag it down daily (up to −15 each); −5 per receipt the lender rejects; +8 per loan
  fully paid. Everyone starts at C. Shown with a 30-day trend and an E→A scale bar.
- Debtors see theirs on Home and in My Account; the lender sees it on each debtor's card and page.

**Email (SMTP)**
- Reminders N days before a due date, on the due date, and once when overdue (daily, from a configurable hour).
- "Received" and approved/rejected emails for debtors; for you, every report with its AI score (a ⚠ alert when it's low).
  Test button and send log in settings.

## Run with Docker

```bash
cp .env.example .env      # set ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD, TZ, LANGUAGE...
docker compose up -d --build
```

Open `http://localhost:8080` (or `PORT_HTTP`). Then in **Admin Panel → Settings**:
1. **Email (SMTP)**: server, port, user, password, sender → *Send test*.
2. **Receipt verification (Ollama)**: URL (e.g. `http://host.docker.internal:11434`) → *Test* → model.
3. **General**: public URL so emails link back to the app.

Everything lives in `./data` (SQLite database, avatars, receipts) — back that folder up.

## Development

```bash
# terminal 1 — API on :4000, reads ../.env
cd backend && npm install && npm run dev
# terminal 2 — UI on :5173, proxies /backend to :4000
cd frontend && npm install && npm run dev
```

## Layout

```
backend/    Express + SQLite API (loans, payments, receipts, mail, reminders, admin) — also owns locales/ (en, es)
frontend/   React + Vite + Tailwind UI
data/       Runtime data (git-ignored)
.env        Configuration (git-ignored) — see .env.example
Dockerfile, docker-compose.yml, nginx.conf, entrypoint.sh
```
