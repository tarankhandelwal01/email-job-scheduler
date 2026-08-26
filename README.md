# Email Job Scheduler

A fault-tolerant, distributed email scheduling system built for the ReachInbox / Outbox Labs Software Development Intern assignment: schedules bulk email sends through BullMQ, persists state in Postgres so no job is ever lost on restart, enforces distributed per-sender rate limits through Redis, and exposes a Next.js dashboard with real Google OAuth.

## Architecture at a glance

```
                    ┌──────────┐
                    │   User   │
                    └────┬─────┘
                         │ HTTPS
                         ▼
                ┌─────────────────┐
                │  Next.js        │   Google OAuth, compose,
                │  Dashboard      │   live scheduled/sent status
                └────────┬────────┘
                         │ REST (JSON)
                         ▼
                ┌─────────────────┐
                │  Express API    │   Validation, idempotency,
                │                 │   bulk DB + queue writes
                └────────┬────────┘   — never talks to SMTP itself
             durable     │     enqueue
             state       │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌────────────────────┐          ┌─────────────────────┐
│     PostgreSQL      │          │    Redis + BullMQ    │
│  source of truth     │          │    delayed jobs      │
│                      │          │    rate-limit         │
│                      │          │    counters (atomic)  │
└──────────┬───────────┘          └──────────┬────────────┘
           ▲                                 │
           │ reconcile on boot               │ delayed jobs
           │ (rebuilds jobs even             │
           │ after a full Redis wipe)        ▼
           │                       ┌─────────────────────┐
           └───────────────────────┤      Worker(s)       │  atomic claim,
                                    │                      │  sender selection,
                                    └──────────┬────────────┘  retry / backoff
                                               │ SMTP
                                               ▼
                                    ┌─────────────────────┐
                                    │    Ethereal SMTP     │  Sender A, Sender B, ...
                                    └──────────┬────────────┘
                                               │
                                               ▼
                                           Recipient
```

**Why each piece exists, not just what it is:**
- **Next.js dashboard** — the spec requires real Google OAuth and live visibility into scheduled/sent state, not a CLI or Postman-only demo.
- **Express API** — a thin validation/persistence layer that hands off to the queue and returns. It never calls SMTP directly, so a slow or failing API request can never block a send that's already scheduled.
- **PostgreSQL** — the single source of truth. Every other piece of state (Redis, BullMQ) is disposable and gets rebuilt from here — this is literally what makes the restart-persistence guarantee possible, verified against a full Redis wipe, not just a process restart.
- **Redis** — does two independent jobs, not one: BullMQ's delayed-job queue (the actual scheduler, replacing cron) and the atomic per-sender rate-limit counters, both safely shared across however many worker processes exist.
- **Worker(s)** — the *only* process that talks to SMTP, and deliberately a separate process from the API. That separation is what makes "the server restarts" a real, testable scenario rather than a hand-wave — the worker can crash and recover independently while the API keeps serving requests.
- **Ethereal SMTP** — isolated behind one module (`mailer.ts`); swapping it for a real provider (SES, SendGrid) later touches nothing else in the system.

## Tech Stack
- **Backend**: TypeScript, Express, BullMQ + Redis, PostgreSQL + Prisma, Nodemailer + Ethereal
- **Frontend**: Next.js (App Router), TypeScript, Tailwind, NextAuth v5 (Google OAuth)
- **Infra**: Docker Compose (Redis + Postgres)

## Prerequisites
- Node.js 20+ (developed on v22)
- Docker Desktop (for Redis + Postgres), or local installs of both
- A Google Cloud project for OAuth credentials (steps below)

## Setup

### 1. Start infrastructure
```
docker compose up -d
```
Starts Redis (AOF persistence) on `6379` and Postgres on `5432` (db `scheduler`, user/pass `scheduler`/`scheduler`).

### 2. Backend environment
```
cd backend
cp .env.example .env
npm install
```

### 3. Generate Ethereal test accounts
```
npm run ethereal:create -- 2
```
Calls Nodemailer's `createTestAccount()` against Ethereal's API and prints a ready-to-paste `ETHEREAL_SENDERS` value — paste it into `backend/.env`. Multiple senders are required by the spec; run with a higher count for more.

### 4. Run the database migration
```
npm run prisma:migrate
```

### 5. Google OAuth credentials (for the frontend)
1. [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. **APIs & Services → OAuth consent screen** → External → fill in app name + your email.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Web application → Authorized redirect URI:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
4. Copy the **Client ID** and **Client Secret**.

### 6. Frontend environment
```
cd frontend
cp .env.example .env.local
```
Fill in `frontend/.env.local`:
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<any random string — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
GOOGLE_CLIENT_ID=<from step 5>
GOOGLE_CLIENT_SECRET=<from step 5>
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```
```
npm install
```

### 7. Run everything
Four processes, each in its own terminal — the API and worker are deliberately separate so the worker can be killed/restarted independently, which is what makes the restart-persistence guarantee meaningful:
```
docker compose up -d          # infra (if not already running)
cd backend && npm run dev     # Express API on :4000
cd backend && npm run worker  # BullMQ worker
cd frontend && npm run dev    # Next.js on :3000
```
Open `http://localhost:3000`.

## API Reference

**`POST /api/campaigns`**
```json
{
  "subject": "Hello",
  "body": "This is a test.",
  "recipients": ["a@example.com", "b@example.com"],
  "startTime": "2026-08-26T15:00:00Z",
  "delayMs": 2000,
  "hourlyLimit": 200,
  "attachments": [{ "filename": "resume.pdf", "contentType": "application/pdf", "contentBase64": "..." }]
}
```
`attachments` is optional, max 10 files. Optional header `Idempotency-Key: <uuid>` — replaying the same key returns the original campaign instead of scheduling everything twice. Response:
```json
{ "campaignId": "...", "scheduled": 2, "rejected": [{ "address": "bad", "reason": "invalid" }] }
```

**`GET /api/emails?status=SCHEDULED|SENDING|SENT|FAILED|UNKNOWN`** — powers both dashboard tables. Each row includes `sender` (the Ethereal account used — `null` until dispatch) and `previewUrl` (the real Ethereal message link, once sent).

**`POST /api/emails/:id/retry`** — re-queues a `FAILED` or `UNKNOWN` email.

**`POST /api/emails/:id/cancel`** — cancels a still-`SCHEDULED` email (removes its BullMQ job, marks it `FAILED` with `error: "Canceled by user"`). Only valid while `SCHEDULED` — once a worker claims a row it's too late to safely pull back.

**`GET /health`** — plain liveness check, `{"ok":true}`.

## Architecture

### How scheduling works
Each recipient becomes its own `Email` row in Postgres (status `SCHEDULED`) with `scheduledTime = startTime + index * delayMs`. Each row also becomes a **BullMQ delayed job** (`jobId = email.id`, `delay = scheduledTime - now`). No cron anywhere — BullMQ's delayed-job mechanism (Redis sorted sets under the hood) is the entire scheduler. Bulk creation uses `queue.addBulk()`, so scheduling 1000+ emails for the same time is one batched Redis round trip, not a loop of single adds.

### How persistence on restart is handled
Postgres is the source of truth; Redis/BullMQ is disposable execution state. On worker boot, `reconcile()` (`src/reconcile.ts`):
1. Takes a short Redis lock so multiple booting instances can't reconcile concurrently (released on completion, not just left to expire — otherwise two restarts within 60s would have the second one silently no-op).
2. Finds every `SCHEDULED` email and re-adds any missing BullMQ job (same `jobId`, so already-present jobs are untouched).
3. Sweeps rows stuck in `SENDING` with no live job — evidence of a crash mid-send — and resolves each based on whether `dispatchedAt` was set.

Verified live: scheduling 2 emails, running `redis-cli FLUSHALL` (a total Redis wipe, not just a process restart), then restarting the worker produced `Reconcile: 2 scheduled checked, 2 re-enqueued` and both sent correctly, with no duplicates.

### Idempotency — three independent layers
| Layer | Failure it prevents | Mechanism |
|---|---|---|
| API request | Double-click, or a retry after a dropped/slow response | `Idempotency-Key` header + unique constraint on `Campaign.idempotencyKey` — the frontend mints one key per compose session and reuses it across retries of that same attempt |
| Queue job | The same email getting enqueued twice (e.g. `reconcile()` re-running) | `jobId = email.id` — BullMQ treats re-adding an existing id as a no-op |
| Send | A crash-recovered job re-sending an email that already went out | Atomic claim (`UPDATE ... WHERE status='SCHEDULED'`) plus the crash state machine below |

### Crash / delivery state machine
```
SCHEDULED --(atomic claim)--> SENDING --(dispatchedAt set)--> [SMTP call] --> SENT
                                  |                                |
                          (crash before dispatch)          (crash after dispatch)
                                  |                                |
                                  v                                v
                             SCHEDULED                         UNKNOWN
                       (safe to retry — nothing      (delivery unverifiable —
                            was ever sent)             resolved via manual /retry)
```
The atomic claim is a conditional `UPDATE ... WHERE status = 'SCHEDULED'` (Prisma `updateMany`), so under worker concurrency only one worker can ever win a given row. `dispatchedAt` is written immediately before the SMTP call — its presence or absence is what makes a crash classifiable afterwards.

This is an intentional **at-most-once** design: a worker that crashes after SMTP has already accepted the email cannot know whether delivery happened, so instead of guessing, it's marked `UNKNOWN` and left for a human to resolve. For cold outreach specifically, a duplicate send is worse than a missed one — that asymmetry is why this was chosen over blind at-least-once retries.

SMTP errors are classified (`src/smtpErrors.ts`): a permanent rejection (5xx, bad envelope) throws `UnrecoverableError` and goes straight to `FAILED` with no retries; a transient error (timeout, connection reset, provider throttling like a `429`) reverts the row to `SCHEDULED` and rethrows, letting BullMQ's native `attempts: 5` + exponential backoff handle retrying. BullMQ's own failed-job set (mirrored by `status=FAILED` in Postgres) serves as the dead-letter queue — a second dedicated DLQ queue would be redundant. On the last allowed attempt, the row is marked `FAILED` directly rather than reverted to `SCHEDULED` (which would strand it with no job left to ever revisit it) — a `worker.on('failed', ...)` handler is a second, authoritative backstop for this in case the in-flight attempt-count prediction is ever wrong.

**App-level rate limiting and SMTP-provider throttling are handled independently, on purpose.** `pickAvailableSender` (before the SMTP call) only ever reads Redis counters; `isPermanent`/the retry classifier (after the SMTP call) only ever reads the SMTP error code. Neither influences the other — a `429` from Ethereal doesn't cause the worker to "hop" to a different sender to dodge the throttle, it just retries the same job with backoff like any other transient error.

### How rate limiting & concurrency are implemented
**Redis-backed, distributed, per-sender-hourly.** When one sender reaches its quota, jobs automatically route to another sender with available capacity; only once *every* sender is exhausted do jobs stay scheduled for the next window. Enforced per-sender rather than as one global/per-tenant number because the limit belongs to the resource being protected — the sending mailbox — and a customer with more connected mailboxes legitimately has more sending capacity, the same way the real ReachInbox/Zapmail product this is modeled on works.

- **Concurrency**: `WORKER_CONCURRENCY` (env) — how many jobs one worker processes in parallel. Safety comes from the atomic claim, not from limiting concurrency itself.
- **Min delay between sends**: `MIN_DELAY_BETWEEN_SENDS_MS` (default `2000` — **2 seconds between individual sends**), enforced via BullMQ's `limiter: { max: 1, duration }`. A system-wide floor, independent of the per-campaign `delayMs`.
- **Hourly cap, per sender**: `MAX_EMAILS_PER_HOUR_PER_SENDER` (env) is the system ceiling. Enforced with a Redis key `email-rate:<sender>:<UTC-hour>`, incremented via one atomic Lua script (check-and-increment in a single round trip — an in-memory counter would undercount across workers, and a separate `GET` then `INCR` would race). The sender is chosen **at dispatch time**, not schedule time, so a batch never gets stuck behind one capped sender while others sit idle.
- **On limit reached**: the job is deferred with `job.moveToDelayed(nextHourBoundary, token)` + `DelayedError` — never dropped, never marked failed. The DB's `scheduledTime` is updated to match, so the dashboard reflects the real deferred time instead of the stale original one. `nextHourBoundary()` snaps to the top of the *next calendar hour*, not "now + 1 hour" — this is what makes the deferral correct even across a mid-window restart (e.g. rate-limited at 2:05, worker restarts at 2:30 — still correctly lands on 3:00, not 3:30).
- **`delayMs` vs `MIN_DELAY_BETWEEN_SENDS_MS`**: not the same knob. `delayMs` (compose UI: "Delay between emails") spreads a campaign's `scheduledTime`s apart; the env floor is a hard minimum the worker enforces regardless of what any campaign requests.
- **`hourlyLimit` (compose UI: "Hourly limit per sender")**: can *tighten* the effective cap for a campaign's own sends (`min(campaignLimit, envLimit)`), never loosen it past the system ceiling. The Redis counter stays keyed by `sender + hour`, not per-campaign, matching the spec's framing of this as a per-sender limit.

## Edge cases considered
| Scenario | Behavior |
|---|---|
| Duplicate email in the same CSV/paste | Deduped case-insensitively on the frontend before upload, and again on the backend as defense-in-depth; reported back as `reason: "duplicate"`, distinct from `"invalid"` |
| Malformed email address | Rejected before ever creating a DB row or job; never gets a chance to "send" |
| 1000+ / 10,000+ recipients in one request | `MAX_RECIPIENTS_PER_CAMPAIGN` (default 10,000) rejects outright rather than silently truncating; `express.json({ limit: "15mb" })` backs that up as a request-size guard (default is 100kb) |
| A genuinely huge campaign (100k+) | Documented as out of scope for synchronous JSON — the direction would be CSV → object storage → async import job streaming in bounded, batched chunks |
| Large or multiple attachments | Three-layer guard: 5MB per file, 8MB combined (client-side), 15MB total request (server-side, catches anything the client-side checks miss) |
| Worker restart mid-campaign | `reconcile()` rebuilds missing jobs from Postgres; verified against a full Redis wipe, not just a process restart |
| Rate limit hit exactly as the worker restarts | `nextHourBoundary()` is computed fresh at check time from the calendar clock, not from "restart time + 1h" — restart timing can't push a deferred send to the wrong hour |
| SMTP provider throttling (e.g. Ethereal `429`) vs the app's own 200/hour limit | Handled as two independent concerns — provider throttling is a transient SMTP error (retried with backoff); the app limit is a pre-send Redis check. Confirmed under a real 300-email burst test |
| Worker crashes mid-send | `dispatchedAt` distinguishes "crashed before SMTP" (safe to retry) from "crashed after SMTP" (`UNKNOWN`, at-most-once) |
| Last retry attempt also fails | Marked `FAILED` directly rather than reverted to `SCHEDULED`, so it doesn't strand with no job left to revisit it |
| A permanently failed send retried automatically forever | Never happens — permanent SMTP errors (5xx) skip retries entirely via `UnrecoverableError` |
| Same request submitted twice (double-click, retry-after-timeout) | Idempotency key, generated once per compose attempt and reused across retries of that attempt |
| Multiple API/worker instances running rate limiting concurrently | Redis Lua script makes the check-and-increment atomic; no in-memory state anywhere in the rate-limit path |

## Troubleshooting
- **`EPERM` renaming `query_engine-windows.dll.node` during `prisma generate`/`migrate`**: Windows file lock, usually because the API or worker process is still running and holding the Prisma Client's native binary open — stop both fully before migrating. If it persists with both stopped, check Task Manager for a lingering `node.exe`, or (if the project lives in a OneDrive-synced folder) pause OneDrive syncing temporarily — cloud sync clients can transiently lock native binaries the instant they change.
- **Frontend shows `Failed to fetch`**: the backend API isn't running or isn't reachable — check `http://localhost:4000/health` directly in a browser.
- **Google OAuth `invalid_client`**: usually a stale Next.js dev server that started before `.env.local` existed — restart `npm run dev` in `frontend/`.

## Features implemented
**Backend**: scheduler (BullMQ delayed jobs, no cron), persistence across restart (verified against a full Redis wipe), per-sender hourly rate limiting (Redis-atomic), configurable concurrency + min-delay, three-layer idempotency, SMTP error classification, crash-safe state machine (`SCHEDULED → SENDING → SENT/FAILED/UNKNOWN`), manual retry + cancel endpoints, file attachments, recipient-count and request-size caps, startup connectivity diagnostics, crash-proof error handling (no request can take down the process), bulk enqueue for high-volume scheduling.

**Frontend**: real Google OAuth (NextAuth), dashboard with Scheduled/Sent tabs and live counts, Compose with CSV-to-chips recipient parsing + duplicate/invalid feedback, real file attachments, a working rich-text editor, Send Later with same-day and next-day quick picks plus a custom picker, per-row cancel and Ethereal preview links, a persistent failure/unknown-outcome banner, loading and empty states throughout.

## Assumptions, shortcuts, trade-offs,future scope
- At-most-once delivery on the post-dispatch crash window is documented, not solved — fully solving it would need a two-phase-commit-style protocol that SMTP doesn't support.
- No jitter on BullMQ's retry backoff — deliberately used the native `backoff: { type: "exponential" }` rather than registering a custom backoff strategy, to avoid depending on a more version-fragile part of BullMQ's API for a 48-hour build. Worth adding first if this went to real production scale.
- Recipient validation is a regex + in-request dedup, not a full RFC 5322 parser or MX-record check.
- No multi-tenant auth on the API itself (single implicit tenant) — Google OAuth is scoped to the frontend dashboard per the spec. This is also why rate limiting stays per-sender rather than per-tenant: a genuine per-tenant quota needs real caller identity on every API request, which doesn't exist server-side yet. A production multi-tenant deployment would additionally enforce a tenant-level quota on top of the per-sender SMTP quota that's already here.
- No Nginx/reverse proxy in front of the API — not needed at this scale. In production it would sit at the edge only (TLS termination, load-balancing multiple API instances, basic abuse rate-limiting) — it wouldn't touch the email pipeline itself, since the per-sender hourly limit is a business rule that has to stay in Redis regardless of how many API instances sit behind it, and the real bottleneck is the worker→SMTP hop, which scales by adding more BullMQ workers, not more Nginx.
- Failure visibility is dashboard-side only: a persistent banner (client-side diff on the existing 10s poll) surfaces failed/unknown counts, but there's no push notification. Future: replace polling with Redis Pub/Sub → SSE for real-time worker-to-client status events at larger scale.


