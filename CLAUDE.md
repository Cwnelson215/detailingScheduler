# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A car-detailing booking site: a containerized **Next.js 14** (App Router) app that lets customers book a full-detail appointment and gives the owner an admin dashboard to manage services, hours, and bookings. The app source lives under `src/`.

It is deployed to the self-hosted **k3s** cluster (`bulbasaur`) via GitHub Actions → GHCR → `kubectl apply -k`. Manifests are raw YAML + kustomize under `k8s/`.

**Legacy AWS:** The repo also contains a Pulumi/AWS (ECS Fargate) infrastructure definition (`index.ts`, `Pulumi.yaml`, `Pulumi.dev.yaml`). These remain on disk but are **no longer the active deploy path** — k3s is. Don't reach for them unless you're specifically working on the old AWS stack.

## Commands

**App** (run inside `src/`):

```bash
npm install              # Install dependencies
npm run dev              # Run locally (http://localhost:3000) — uses embedded PGlite, no DB needed
npm run build            # Build for production (Next.js standalone)
npm start                # Start production server

npm run db:generate      # drizzle-kit: generate migration from schema changes
npm run db:migrate       # drizzle-kit: apply migrations
npm run db:seed          # Run migrations + seed default hours, admin password, services
npm run db:cleanup-services  # Deactivate legacy (non "Full Detail") services

npm run test             # vitest run — full suite (unit + DB-integration + API routes)
npm run test:watch       # vitest in watch mode
npm run typecheck        # tsc --noEmit (no separate lint step)
```

The repo-root `npm run dev` is just a convenience that does `cd src && npm run dev`.

**Infra (legacy Pulumi, in repo root — not the live deploy path):**

```bash
npm run preview          # pulumi preview
npm run up               # pulumi up
npm run destroy          # pulumi destroy
```

## Architecture

**App contract:** The container must (1) listen on the configured port (default 3000) and (2) expose `GET /health` returning HTTP 200 (`src/app/health/route.ts` returns `ok`). Both the k8s liveness and readiness probes hit `/health`.

**Deployment (k8s, active):** Defined under `k8s/` as a kustomize base + prod overlay:
- `k8s/base/deployment.yaml` — 1 replica, rolling update, container port 3000, runs non-root (UID/GID 1001, all caps dropped). DB connection env from the `db-creds` Secret; app config env from the `app-secrets` Secret (via `envFrom`); plus `DB_SSL_REJECT_UNAUTHORIZED=false` (the in-cluster Postgres serves a self-signed cert).
- `k8s/base/service.yaml` — ClusterIP, port 80 → container 3000.
- `k8s/base/ingress.yaml` — Traefik ingress for `detailing.cwnel.com`, TLS from the `detailing-tls` Secret.
- `k8s/base/certificate.yaml` — cert-manager `Certificate` for `detailing.cwnel.com`, issued by the `letsencrypt-prod` ClusterIssuer.
- `k8s/overlays/prod/kustomization.yaml` — sets namespace `detailing` and image `ghcr.io/cwnelson215/detailing`.

**Legacy infra (`index.ts`):** Pulumi definition of the old AWS stack (ECR repo `portfolio/detailing`, ECS Fargate task/service, ALB target group + host rule, security group, scheduled scaling). Kept for reference; superseded by `k8s/`.

## Database

Uses **Drizzle ORM**. The connection (`src/db/index.ts`) switches on `DB_HOST`:
- **Production** (`DB_HOST` set): a `pg` Pool against the shared Postgres cluster. TLS is on by default; set `DB_SSL_REJECT_UNAUTHORIZED=false` for the in-cluster CloudNativePG (self-signed cert), leave unset for managed providers (RDS/Neon/Supabase) with publicly-chained certs.
- **Local dev** (`DB_HOST` unset): an embedded **PGlite** Postgres at `./pglite-data` — no external database required.

**Schema** (`src/db/schema.ts`):

| Table | Purpose |
|---|---|
| `services` | Bookable services (name, description, durationMins, priceCents, isActive, sortOrder) |
| `bookings` | Customer bookings — FKs `services`; customer + vehicle details, appointment date, `dropoffWindow` (`morning`/`evening`) + the window's resolved start time (`appointmentTime`), status, notes |
| `business_hours` | Per-weekday schedule: `isOpen` flag plus two drop-off windows (morning/evening, each an enabled flag + start/end). Legacy `openTime`/`closeTime` columns remain but are unused. |
| `blocked_dates` | Dates the shop is unavailable |
| `admin_settings` | Key/value store (admin password hash, business name, etc.) |

**Seeding** (`src/db/seed.ts`, run via `npm run db:seed`): runs migrations, then — only if `services` is empty — seeds default business hours, a default admin password hash, the business name, and the three service tiers:

| Service | Duration | Price |
|---|---|---|
| Full Detail – Sedan | 300 min | $150.00 |
| Full Detail – SUV | 330 min | $180.00 |
| Full Detail – Truck/Van | 360 min | $210.00 |

Older service tiers were **deactivated, not deleted** (`npm run db:cleanup-services` sets `isActive=false` for non "Full Detail" rows) because `bookings.serviceId` references `services` — deleting them would orphan historical bookings.

## Availability (drop-off windows)

Customers don't pick an arbitrary time — they pick one of two fixed **drop-off windows** (morning/evening) on an **admin-opened date** (`src/lib/availability.ts`):
- **Allowlist + per-date windows.** Every date is unavailable until the admin opens it (a row in `available_dates`). Each opened date carries its **own** morning/evening windows, **seeded** from the weekday template (`business_hours`) when it's opened (`POST /api/schedule/available-dates`), then **editable per date** (`PUT /api/schedule/available-dates`). The per-date columns on `available_dates` — not the weekday template — are **authoritative** for customer-facing availability. `business_hours` (still admin-editable per weekday via `PUT /api/schedule/hours`) only provides the defaults applied at open time. Both editors live in the Schedule manager (`src/components/admin/schedule-manager.tsx` + `available-dates-calendar.tsx`, sharing `window-row.tsx`).
- `getWindowOptions(date)` → `WindowOption[]` (`{ key, label, startTime, endTime, available }`) reads the date's own window columns; backs `GET /api/availability?date=` and the booking/reschedule pickers (`src/components/window-picker.tsx`). `getAvailableDatesInRange` backs the customer calendar's date graying.
- **One car per window.** Each `(date, dropoffWindow)` holds at most one non-cancelled booking, enforced by `isWindowAvailable` inside the per-day advisory-lock transaction (the authoritative check on create + reschedule) and backstopped by a partial unique index `bookings_date_window_active_idx`.
- The customer sends only `dropoffWindow`; the server resolves the window's **start time** from the date's `available_dates` row and stores it in `bookings.appointmentTime` (so display/email code keeps rendering a concrete time). The explicit `bookings.dropoffWindow` column keeps the one-per-window check correct even if an admin later edits the window times. Window/time presentation helpers live in `src/lib/format.ts` (`formatTime`, `windowLabel`, `dropoffSummary`, `windowRange`).

## Admin / Auth

The `/admin` dashboard is guarded by **NextAuth** (`src/lib/auth.ts`) using a single-credential (password-only) provider. The password is bcrypt-compared against the `admin_password_hash` row in `admin_settings`. Sign-in page is `/admin/login`; sessions are JWT (24h). The seeded default password is `admin123` (change it). Password changes go through `POST /api/admin/password`. Requires `NEXTAUTH_SECRET` and `NEXTAUTH_URL` in production.

## Job IDs & Customer Chat

Every booking has a short, unguessable **Job ID** (`bookings.jobId`, Crockford base32, 8 chars; generated in `src/lib/job-id.ts`, shown on the confirmation page and in emails). Customers self-serve without an account:

- **Lookup** (`/lookup` → `POST /api/bookings/lookup`): Job ID **+ the email on the booking** (two factors, timing-safe compare, rate-limited, single generic failure to avoid enumeration). On success it sets an httpOnly, **booking-scoped** signed cookie (`cust_session`, HMAC via `src/lib/customer-session.ts`, 2h). That cookie — not an admin login — authorizes the customer area.
- **Customer area** (`/booking/[jobId]`, cookie-gated): reschedule / cancel / edit contact+vehicle via `POST /api/bookings/[jobId]/manage` (reuses the advisory-lock + `isWindowAvailable` reschedule path), plus a live chat. Customer mutations are **POST** because `middleware.ts` reserves `PATCH`/`DELETE` on `/api/bookings/*` for admins.
- **Chat** is two-way and **encrypted at rest** (AES-256-GCM, `src/lib/crypto.ts`, key `MESSAGE_ENCRYPTION_KEY`). Messages live in `booking_messages` (ciphertext/iv/authTag). Real-time delivery is **SSE** (`src/lib/sse.ts`) over an **in-process** pub/sub (`src/lib/chat-bus.ts`) — single-replica only; swap for Redis pub/sub if ever scaled. The owner reads/replies on the admin **Messages** board (`/admin/messages`), gets an email when a customer messages (reply-to the customer), and customer-facing replies email the customer (best-effort, env-gated).

**`MESSAGE_ENCRYPTION_KEY`**: 32-byte base64 key (`openssl rand -base64 32`). Set in production via the `app-secrets` Secret; unset locally derives an insecure dev key (zero-config dev/test). **Rotating it makes prior ciphertext undecryptable** (no key-versioning) — decrypt is wrapped in try/catch so a bad/rotated row degrades to a placeholder instead of crashing the thread. It is **not** end-to-end: the server holds the key to render messages in admin and include snippets in emails.

## Email

Booking emails are sent via **Resend** (`resend` package; logic in `src/lib/email.ts`). On each booking, `src/app/api/bookings/route.ts` fires two emails through `Promise.allSettled`, so an email failure never blocks the booking from being saved:

- `sendBookingConfirmation` → the customer (Reply-To set to `EMAIL_REPLY_TO`, falling back to `EMAIL_FROM`). Includes booking #, service, price, date/time, duration, and vehicle.
- `sendOwnerNotification` → the business inbox `BOOKING_NOTIFY_EMAIL` (Reply-To set to the customer, so the owner can reply directly). Includes the above plus customer name/email/phone.

Each send **skips gracefully** (logs only, no error) when its env var is unset, so missing config never breaks bookings.

**Env vars** (all documented in `src/.env.example`):

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key. Unset ⇒ all sending skipped. |
| `EMAIL_FROM` | Verified sender, e.g. `Nelson Detailing <booking@detailing.cwnel.com>`. Unset ⇒ falls back to `onboarding@resend.dev` for local testing. |
| `EMAIL_REPLY_TO` | Reply-To for the customer email, e.g. `bookings@cwnel.com`. Unset ⇒ replies go to `EMAIL_FROM`. |
| `BOOKING_NOTIFY_EMAIL` | Business inbox notified of every new booking. Unset ⇒ owner notification skipped. |

**Mail domains:** sending is from the **`detailing.cwnel.com`** subdomain (verified in Resend via DNS records on Cloudflare — keeps sending reputation isolated). Inbound mail uses **Cloudflare Email Routing**: `bookings@cwnel.com` forwards to the business Gmail, which is why customer replies are pointed there via `EMAIL_REPLY_TO`. Resend only sends; it has no inbox.

In production these values come from the k8s `app-secrets` Secret, created by `.github/workflows/deploy.yml` from GitHub repo secrets of the same name. Locally, put them in `src/.env.local`.

## Testing

Vitest (`src/vitest.config.ts`, node env). Tests are co-located with source (`**/*.test.ts`):
- **Unit:** `lib/time`, `lib/utils`, `lib/rate-limit`, `lib/validations` (Zod schemas), `lib/email` (formatters exercised through the public `send*` functions with `resend` + `getBusinessInfo` mocked).
- **DB-integration / API routes:** run against an **in-memory PGlite** stood up by `src/test/setup.ts` (a Vitest `setupFiles`), which seeds `globalThis.__pgliteDb` before `@/db` is imported and runs `runMigrations()`. `src/test/fixtures.ts` has `resetDb`/`seedService`/`seedBooking`/`blockDate`/`futureDateForWeekday`. Route tests (`app/api/bookings/**`) call the exported handlers with a `NextRequest` and mock `@/lib/email`, `@/lib/rate-limit`, and `next-auth`'s `getServerSession`.

Run `npm run test` + `npm run typecheck` from `src/` before pushing.

## Deployment & CI/CD

`.github/workflows/deploy.yml` runs on push to `main` (and manual dispatch); the `test` job also runs on **pull requests**.

**`test` job (the gate):** `npm ci` → `npm run typecheck` (`tsc --noEmit`) → `npm run test` (Vitest), all in `src/`. The `deploy` job has `needs: test` and `if: github.event_name != 'pull_request'`, so a red build never deploys and PRs run tests without touching the cluster. The `deploy` job then:

1. **Build & push** the image with Buildx to GHCR — `ghcr.io/cwnelson215/detailing:<sha>` and `:latest` (GHA layer cache).
2. **Connect to the tailnet** via `tailscale/github-action` (`TS_AUTHKEY` secret) and configure `kubectl` from the base64-encoded `KUBECONFIG` secret.
3. **Create/update `app-secrets`** in the `detailing` namespace from repo secrets (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `BOOKING_NOTIFY_EMAIL`, `SITE_URL`, `CRON_SECRET`, `MESSAGE_ENCRYPTION_KEY`) via `kubectl create secret … --dry-run=client -o yaml | kubectl apply -f -`.
4. **Set the image tag** in the prod overlay (`kustomize edit set image`) and **apply** with `kubectl apply -k k8s/overlays/prod`.
5. **Wait** for `kubectl rollout status deployment/detailing -n detailing`.

**Secret layers:** `app-secrets` is managed by this workflow. `db-creds` (DB host/port/database/username/password) is **platform-provisioned** once when the per-app Postgres DB/role is created — CI does not touch it. TLS material is managed by cert-manager.

## Key Files

- `src/app/` — App Router pages + API routes: `api/bookings`, `api/services`, `api/availability`, `api/schedule/*`, `api/admin/*`, `api/auth/[...nextauth]`, `health`, `booking`, `confirmation`, `admin`
- `src/db/` — `schema.ts`, `index.ts` (connection), `migrate.ts`, `seed.ts`, `deactivate-legacy-services.ts`
- `src/lib/` — `email.ts`, `auth.ts`, `availability.ts`, `validations.ts`, `business-info.ts`
- `src/test/` — `setup.ts` (in-memory PGlite Vitest setup) + `fixtures.ts` (DB seed helpers)
- `src/components/` — booking form, calendar/time-slot pickers, admin components, UI primitives
- `src/.env.example` — documented environment variables
- `Dockerfile` — multi-stage `node:20-alpine`, Next.js standalone, non-root, EXPOSE 3000
- `k8s/base/`, `k8s/overlays/prod/` — kustomize manifests (active deploy)
- `.github/workflows/deploy.yml` — CI/CD pipeline
- **Legacy (AWS/Pulumi, unused by CI):** `index.ts`, `Pulumi.yaml`, `Pulumi.dev.yaml`

## Conventions

- **Local dev needs no external services:** PGlite stands in for Postgres and missing email/auth env vars degrade gracefully.
- **Namespace:** `detailing`. **Image:** `ghcr.io/cwnelson215/detailing`.
- **Secrets:** `app-secrets` (created by the deploy workflow from GitHub repo secrets) and `db-creds` (platform-provisioned). Set repo secrets via the GitHub UI/CLI.
- **TLS:** cert-manager `Certificate` issued by the `letsencrypt-prod` ClusterIssuer; served on `detailing.cwnel.com` through Traefik.
- **Public edge path (as of 2026-06-07):** Public `detailing.cwnel.com` does **not** hit Traefik directly. DNS is `CNAME → h.b.nel.family → 66.118.47.137`, an **nginx reverse proxy** (separate `nel.family` infra, managed off-box) that proxies upstream to bulbasaur Traefik. Since bulbasaur ufw denies WAN and only allows `tailscale0`, that proxy must reach Traefik (`100.78.86.4:443`) over Tailscale. **A site-wide 504 = the nginx proxy's upstream is down**, even when the cluster is healthy. Confirm the cluster directly with `curl -k --resolve detailing.cwnel.com:443:100.78.86.4 https://detailing.cwnel.com/health` (Traefik serves the valid LE cert there; the public path serves a self-signed minica `*.cwnel.com` cert).
- **Health checks:** `GET /health` is static and must return HTTP 200 — the k8s **liveness** probe. `GET /ready` pings Postgres (`select 1`) and is the **readiness** probe (503 when the DB is unreachable, so a DB blip marks the pod NotReady without restart-looping it). Both wired in `k8s/base/deployment.yaml`.
- **DB migrations:** edit `src/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.
- **Logging:** request-path failures log structured JSON lines via `src/lib/logger.ts` (`logger.info/warn/error`). Prefer it over raw `console.*` in route handlers/boundaries; keep context PII-light (log identifiers, not message bodies). Startup/migration scripts still use `console`.

## Deferred hardening (TODO — not yet done)

Identified in a hardening review and intentionally deferred (the Core pass —
structured logger, error boundaries, `/ready` probe, constant-time cron compare —
is done):

- **Admin bookings pagination** — the admin bookings server component and `GET /api/bookings` fetch all rows; add LIMIT/OFFSET (or cursor) + paging UI as booking volume grows.
- **Audit trail** — no `audit_events` table; sensitive admin actions (password change, booking status changes, business-info edits, cancellations) are unrecorded.
- **Persistent rate limiting** — `src/lib/rate-limit.ts` is in-memory and resets on pod restart/deploy; move to a Postgres-backed store (no Redis in-cluster) if the brute-force-window-on-deploy gap matters.
