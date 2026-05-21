# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A containerized web application deployed on the portfolio platform. Infrastructure is defined with Pulumi (TypeScript) and references shared AWS resources (VPC, ALB, ECS cluster, RDS) from the platform stack via `pulumi.StackReference`.

## Commands

```bash
# Application
npm install           # Install dependencies
npm run dev           # Run locally (http://localhost:3000)
npm run build         # Build for production
npm start             # Start production server

# Infrastructure (Pulumi)
npm run preview       # Preview infra changes
npm run up            # Deploy infra
npm run destroy       # Tear down infra
```

## Architecture

**App contract:** The container must (1) listen on the configured port (default 3000) and (2) expose `GET /health` returning HTTP 200.

**Infrastructure (`index.ts`):** Defines app-specific AWS resources:
- ECR repository (`portfolio/detailing`) with lifecycle policy (keep last 10 images)
- Security group allowing traffic from the shared ALB
- ALB target group + host-based listener rule (`detailing.cwnel.com`)
- ECS Fargate task definition + service (Fargate Spot by default)

All shared resources (VPC, ALB, ECS cluster, Route53, ACM, CloudWatch log group, RDS) come from the platform stack and are imported via `pulumi.StackReference`.

## Email

Booking emails are sent via **Resend** (`resend` package; logic in `src/lib/email.ts`). On each booking, `src/app/api/bookings/route.ts` fires two emails through `Promise.allSettled`, so an email failure never blocks the booking from being saved:

- `sendBookingConfirmation` → the customer (sets Reply-To to `EMAIL_REPLY_TO`)
- `sendOwnerNotification` → the business inbox `BOOKING_NOTIFY_EMAIL` (Reply-To set to the customer, so the owner can reply directly)

Each send **skips gracefully** (logs only, no error) when its env var is unset, so missing config never breaks bookings.

**Env vars** (all documented in `src/.env.example`):

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key. Unset ⇒ all sending skipped. |
| `EMAIL_FROM` | Verified sender, e.g. `Nelson Detailing <bookings@detailing.cwnel.com>`. |
| `EMAIL_REPLY_TO` | Reply-To for the customer email, e.g. `bookings@cwnel.com`. |
| `BOOKING_NOTIFY_EMAIL` | Business inbox notified of every new booking. |

**Mail domains:** sending is from the **`detailing.cwnel.com`** subdomain (verified in Resend via DNS records on Cloudflare — keeps sending reputation isolated). Inbound mail uses **Cloudflare Email Routing**: `bookings@cwnel.com` forwards to the business Gmail, which is why customer replies are pointed there via `EMAIL_REPLY_TO`. Resend only sends; it has no inbox.

In production these values come from the k8s `app-secrets` Secret, created by `.github/workflows/deploy.yml` from GitHub repo secrets of the same name. Locally, put them in `src/.env.local`.

## Key Files

- `src/` — Application source code
- `index.ts` — Pulumi infrastructure definition
- `Pulumi.yaml` — Project metadata
- `Pulumi.dev.yaml` — Environment config (appName, subdomain, platformStack, cpu, memory, etc.)
- `Dockerfile` — Container build definition
- `.github/workflows/deploy.yml` — CI/CD pipeline

## Conventions

- **Naming:** Resources prefixed with `appName`. All tagged with Project, App, ManagedBy.
- **Config:** Environment-specific values in `Pulumi.{stack}.yaml`. Secrets via `pulumi config set --secret`.
- **Logs:** CloudWatch at `/ecs/portfolio-dev/detailing`, 14-day retention.
- **Platform stack reference:** `cwnelson/portfolio-platform/dev`
- **Health check:** `GET /health` must return HTTP 200 — this is used by both the ALB target group and the ECS container health check.
