# LendLoop

**Borrow what you need. Lend what you don't.**

A neighborhood tool-lending board: neighbors list tools, request to borrow
from each other, and get automated notifications and overdue reminders handled
by n8n.

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind
- **Auth**: Clerk
- **Data + backend logic**: Convex (queries, mutations, actions, HTTP routes)
- **Automation**: n8n (self-hosted via Docker)

## Features

- Public landing page with a read-only list of available tools — **name and
  category only, no owner details** — and a "Sign in to lend or borrow" button.
- Signed-in neighbors can list tools (name, category, condition, description),
  browse all tools with availability status, filter by category, request to
  borrow for a date range, approve/decline incoming requests, and mark loans
  as returned.
- Views: **Browse tools**, **My listings**, **Requests** (incoming + mine),
  and an **Admin** page.
- Roles (enforced in Convex functions, not just the UI):
  - `admin` — remove any listing, view all loans, mark users as
    **Trusted Lender**.
  - `user` — create/edit/delete only their own listings; act only on requests
    involving their own tools or their own borrowing.
- Automation activity per loan (bonus): each request card shows recent events
  such as "Reminder sent 2 days ago" and surfaces failed notifications.

## Repository layout

```
convex/            schema, functions, RBAC helpers, HMAC lib, HTTP routes
src/app/           public page, dashboard, listings, requests, admin, sign-in/up
src/components/    nav, providers, request form, loan activity feed
src/proxy.ts       Clerk middleware (Next.js 16 "proxy" convention)
n8n/workflows/     exported n8n workflow JSON (no secrets inside)
docker-compose.yml self-hosted n8n
```

## Local setup

### 1. Clerk

1. Create a Clerk application.
2. Create a **JWT template named `convex`** (Clerk → JWT Templates → New
   template → Convex). Note the **Issuer** URL.
3. Copy `.env.example` values into `.env.local`:
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
4. (Recommended) Add a Clerk webhook endpoint pointing to
   `https://<your-deployment>.convex.site/clerk-webhook` for `user.created` /
   `user.updated`, and set `CLERK_WEBHOOK_SECRET` in Convex. The app also
   upserts the user lazily on first sign-in, so the webhook is a belt-and-
   suspenders sync, not a hard requirement.

### 2. Convex

```bash
npx convex dev        # first run: creates/links a deployment
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set N8N_WEBHOOK_URL https://<n8n-public-url>/webhook/lendloop-notify
npx convex env set N8N_WEBHOOK_SECRET "$(openssl rand -hex 32)"
npx convex env set ADMIN_EMAILS you@example.com
# optional but recommended:
npx convex env set CLERK_WEBHOOK_SECRET whsec_...
```

Set `NEXT_PUBLIC_CONVEX_URL` in `.env.local` to the deployment URL.

> Note: `convex/_generated/` is committed so the repo typechecks out of the
> box; `npx convex dev` will regenerate it against your deployment.

### 3. n8n

```bash
cp .env.example .env   # fill in N8N_ENCRYPTION_KEY, LENDLOOP_WEBHOOK_SECRET,
                       # CONVEX_SITE_URL (…convex.site), N8N_WEBHOOK_PUBLIC_URL
docker compose up -d
```

Open http://localhost:5678 and import the three workflows from
`n8n/workflows/`:

| Workflow | Purpose |
| --- | --- |
| `LendLoop — Request notification` | Webhook called by Convex when a borrow request is created or changes status. Verifies the HMAC signature, rejects stale payloads, then notifies the relevant user (mock log — swap in email/Slack/Discord). |
| `LendLoop — Overdue reminders` | Runs daily at 09:00 UTC. Calls the signed Convex HTTP endpoint for overdue loans, sends each borrower a reminder (mock log), and writes the reminder back to Convex **idempotently** (dedupe key = loan + day). |
| `LendLoop — Error handler` | Error workflow: makes failed runs visible instead of failing silently. After importing, select it in each workflow's **Settings → Error workflow**. |

Activate the first two workflows. Because Convex (cloud) must reach n8n,
expose n8n with a tunnel (`ngrok http 5678`) and set `N8N_WEBHOOK_PUBLIC_URL`
and Convex's `N8N_WEBHOOK_URL` to the tunnel's
`/webhook/lendloop-notify` URL.

### 4. Run the app

```bash
npm install
npm run dev
```

Sign up with an email listed in `ADMIN_EMAILS` to get the admin role.

## Architecture

```
Browser ──Clerk JWT──▶ Next.js ──▶ Convex (queries/mutations, RBAC server-side)
                                        │ scheduler → internal action
                                        ▼ HMAC-signed, retried ×3
                                      n8n webhook ──▶ notify user
                                        ▲
n8n cron ──HMAC-signed POST──▶ Convex HTTP routes (/n8n/overdue-loans,
                               /n8n/record-reminder) ──▶ idempotent write-back
Clerk webhook ──svix-verified──▶ /clerk-webhook ──▶ user upsert
```

## Security & data-minimization decisions

- **Authorization lives in Convex, never in the UI.** Every privileged
  function resolves the caller via `ctx.auth.getUserIdentity()` and checks
  ownership/role server-side (`convex/lib/auth.ts`). The UI hides buttons,
  but the backend rejects the calls anyway.
- **Public data minimization.** `tools.listPublic` returns only
  `{ _id, name, category }` — owner identity, condition, and description
  never leave the function for anonymous visitors.
- **Signed automation in both directions.** Convex → n8n payloads and
  n8n → Convex calls are JSON envelopes `{ body, signature }` where
  `signature = HMAC-SHA256(shared_secret, body)` and `body` embeds a
  timestamp. Verification uses `crypto.subtle.verify` (Convex) and
  `crypto.timingSafeEqual` (n8n); envelopes older than 5 minutes are
  rejected as replay protection.
- **Secrets stay out of code.** The shared secret lives in Convex env vars
  and n8n environment/credentials only; the exported workflow JSON reads
  `$env.LENDLOOP_WEBHOOK_SECRET` and contains no secrets.
- **Idempotent write-backs.** Reminder records use the dedupe key
  `reminder:<loanId>:<date>`, so n8n retries (or a re-run on the same day)
  never create duplicate records or double-count reminders.
- **Failures are loud.** Outbound notifications retry 3× with backoff; a
  final failure writes a `notification_failed` event onto the loan (visible
  in the UI). n8n HTTP nodes retry 3×, and the error workflow catches
  anything else.
- **Minimal notification payloads.** n8n receives only the recipient's
  email/name, tool name, dates, and status — never both parties' full
  records.
- **Soft deletes.** Removing a listing sets `isRemoved` so loan history and
  the audit trail (`automationEvents`) stay intact.
- **Webhook verification.** The Clerk webhook is verified with the svix
  signing secret before any user row is written.

## What I would change for production

- **Real notification channels** with per-user preferences (email via a
  transactional provider, Slack/Discord), and unsubscribe/quiet hours.
- **Rate limiting** on the public HTTP routes (and possibly on borrow
  requests per user) to blunt abuse; the HMAC check already rejects
  unauthenticated calls, but not floods.
- **Structured audit log** with retention policy (who approved/declined/
  removed what, when) in a dedicated table, plus alerting on admin actions.
- **Secrets management**: move the shared secret to a managed secret store
  (AWS Secrets Manager / Doppler), rotate it, and prefer asymmetric
  signatures if more parties integrate.
- **E2E + contract tests**: run the n8n workflow against a staging Convex
  deployment in CI; add Convex unit tests for the RBAC matrix
  (owner/borrower/admin × each mutation).
- **Observability**: Sentry/Datadog for the Next.js app, Convex log drains,
  and n8n execution metrics with alerts on repeated error-workflow hits.
- **Data lifecycle**: retention/deletion jobs for old loans and events
  (GDPR-style erasure for a real user base), and pagination on the admin
  "all loans/users" views.
- **HA n8n**: queue mode with Postgres + workers instead of the single
  container, and a dead-letter view for reminder failures.
