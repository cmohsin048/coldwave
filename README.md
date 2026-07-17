# ColdWave

Deliverability-first **cold email marketing platform**. Lead generation
(Apollo), AI campaign design (OpenAI), a pre-send spam engine, mailbox warmup,
compliant sending from your own connected mailboxes, and analytics — multi-tenant,
built with Next.js 15.

> **Why not Postmark for sending?** Postmark (and SendGrid, Mailgun shared pools,
> etc.) prohibit unsolicited/cold email in their Terms of Service and suspend
> accounts for it. ColdWave sends campaigns through **each org's own connected
> mailboxes** (Google Workspace / Microsoft 365 / any SMTP+IMAP host) with domain
> pools, rotation, per-mailbox rate limits, and warmup — the approach real
> cold-email tools use. A transactional ESP is only needed for system mail
> (password resets, receipts).

## Stack

- **Next.js 15** (App Router, Server Actions, Route Handlers) + **TypeScript**
- **Tailwind** + **shadcn/ui**
- **Postgres (Neon)** + **Drizzle ORM**
- **BullMQ** + **Redis** for queues / cron
- **NextAuth (Auth.js)** credentials auth, multi-tenant, org-scoped rows
- **Zod** validation, **AES-256-GCM** encryption for mailbox credentials
- **Apollo.io** (leads), **OpenAI** (AI designer), **Stripe** (metered billing)

## Modules

| Module | Where |
| --- | --- |
| Lead generation (Apollo search, enrich, verify, dedupe, CSV) | `src/modules/apollo`, `src/modules/leads`, `/leads` |
| AI campaign + funnel designer (structured output) | `src/modules/ai`, `/designer` |
| Spintax + merge fields | `src/modules/spintax` |
| Visual sequence builder (React Flow) | `/campaigns/[id]` |
| Spam score engine (SpamAssassin, triggers, ratios, DNS auth, DNSBL) | `src/modules/spam`, `/deliverability` |
| Sending (SMTP transport, rotation, rate limiter, tracking) | `src/modules/sending` |
| Compliance (CAN-SPAM footer, RFC 8058 one-click unsubscribe) | `src/modules/compliance` |
| Auto warmup (peer-to-peer, IMAP bots, ramp) | `src/modules/warmup`, `/warmup` |
| Reply detection + unified inbox (AI replies) | `src/modules/warmup/imap.ts`, `/inbox` |
| Analytics (Recharts) | `src/modules/analytics`, `/analytics` |
| Billing (Stripe metered) | `src/modules/billing` |
| Queues / cron | `src/queues`, `src/workers` |

## Getting started

### 1. Install

```bash
npm install
```

### 2. Local infrastructure (Postgres, Redis, SpamAssassin)

```bash
docker compose up -d
```

Or point `DATABASE_URL` at a Neon database and `REDIS_URL` at a managed Redis.

### 3. Environment

```bash
cp .env.example .env
# generate secrets:
#   AUTH_SECRET     -> openssl rand -base64 32
#   ENCRYPTION_KEY  -> openssl rand -base64 32   (must decode to 32 bytes)
# set APOLLO_API_KEY (you have this) and OPENAI_API_KEY
```

With the docker-compose defaults:

```
DATABASE_URL=postgresql://coldwave:coldwave@localhost:5432/coldwave
REDIS_URL=redis://localhost:6379
SPAMASSASSIN_HOST=127.0.0.1
SPAMASSASSIN_PORT=783
```

### 4. Database

```bash
npm run db:push     # create tables from the Drizzle schema
npm run db:seed     # optional: demo login  (demo@coldwave.test / password123)
```

### 5. Run

```bash
npm run dev         # Next.js app on http://localhost:3000
npm run worker      # BullMQ workers (campaign ticks, warmup, reply sync, billing)
```

The **worker process is required** for campaigns to actually send, for warmup to
run, and for reply detection. Keep it running alongside the app.

## How sending works

1. Connect mailboxes at **/mailboxes** (SMTP + IMAP; credentials encrypted at rest).
2. Enable **warmup** at **/warmup** and let mailboxes ramp for ~2 weeks.
3. Generate leads at **/leads** (Apollo) — enriched, verified, deduped.
4. Design a sequence at **/designer** or **/campaigns/[id]** (React Flow).
5. Enroll a lead list and **launch**. The campaign worker:
   - picks a mailbox from the pool (rotation + per-mailbox hourly/daily limits),
   - renders spintax + merge fields per recipient,
   - appends the CAN-SPAM footer + RFC 8058 `List-Unsubscribe` headers,
   - runs the **pre-send spam check** (blocks if score ≥ threshold),
   - sends, injects open/click tracking, records the message + usage,
   - waits a randomized 30–180s, then advances the enrollment.
6. Replies are detected over IMAP, pausing the lead's sequence; drafts are
   suggested in the **/inbox**.

## Compliance

- **CAN-SPAM**: physical postal address (set per-org in Settings) + working
  unsubscribe in every campaign email.
- **RFC 8058** one-click unsubscribe (`List-Unsubscribe` + `-Post` headers →
  `/api/unsubscribe`).
- **GDPR / 24h opt-out**: unsubscribes, bounces, and complaints write to the
  suppression list immediately and are honored on every send.

## Security

- Mailbox credentials / OAuth tokens encrypted with **AES-256-GCM**
  (`ENCRYPTION_KEY`), never stored in plaintext.
- All data is **org-scoped**; every query is filtered by `orgId` via
  `requireOrgContext()` (application-level row isolation).
- All external API calls are wrapped with **retry + exponential backoff**.
- All Server Action inputs validated with **Zod**.

## Production notes

- Run `npm run db:generate` to produce SQL migrations, then `npm run db:migrate`.
- Deploy the app (Vercel/Node) and run `npm run worker` as a long-lived process
  (a container / VM / Railway service) — it can't run on serverless.
- Configure a Stripe meter named `email_sent` and `lead_enriched`, plus the
  webhook at `/api/webhooks/stripe`.
- SpamAssassin runs as a sidecar; if it's unreachable the engine degrades to
  heuristic + DNS checks only.
docker compose up -d
npm run dev
npm run worker
docker compose stop