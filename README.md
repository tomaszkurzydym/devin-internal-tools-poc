# Internal Tools POC — KYC Review Queue

Engineering-owned internal-tools prototype for a fintech. **KYC Reviews** is the representative application; the shell, session, permission policy, audit trail and UI components are shared so future apps (Refunds, Feature Flags) can reuse them.

> **Synthetic data only.** Every applicant, ID and check result is fictional. No real customer systems are contacted.
>
> **Demo identity is a simulation.** The sign-in screen lets you pick a seeded user and creates a server-side session. It is *not* authentication and must be replaced with real SSO (OIDC/SAML) before any real deployment.

## Quick start

Requires Node.js 20+ (tested with Node 24.19 / npm 10.8).

```bash
npm install          # install dependencies
npm run db:reset     # create data/app.db and seed synthetic data (wipes any existing data)
npm run build        # typecheck + build the web UI into dist/web
npm start            # serve API + UI on http://localhost:3000
```

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Seed (only if DB empty; also happens automatically on first `npm start`) | `npm run seed` |
| Reset demo (drop all tables incl. sessions + audit, reseed) | `npm run db:reset` |
| Run (production build) | `npm run build && npm start` → http://localhost:3000 |
| Run (dev, hot reload) | `npm run dev:server` and in a 2nd terminal `npm run dev:web` → http://localhost:5173 |
| Tests | `npm test` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Build | `npm run build` |

Environment: `PORT` (default `3000`), `DB_PATH` (default `data/app.db`).

## Demo walkthrough

1. Open http://localhost:3000 and choose **Riley Reviewer**. The top bar shows the current user and role.
2. **KYC Reviews**: search for `Quinnfield` or `KYC-1001`, or combine the Status and Risk filters.
3. Open `KYC-1001` (pending). Opening it does not change anything. Click **Start review** to move it to *In review*.
4. Add a note, then click **Approve**. A confirmation banner appears and the decision is final.
5. Scroll to *Audit events for this application* (or **Audit Log**, filtered by `KYC-1001`) to see `kyc.review_started`, `kyc.note_added` and `kyc.approved`, each with the actor, a UTC timestamp and metadata.
6. Open another pending application, start a review, then **Reject…**. Submitting without a reason shows a validation error; enter a reason and confirm.
7. **Switch user** → **Vera Viewer**. Everything can be read, but there are no action controls ("Read-only" notice) and **Admin** is not in the navigation. Visiting `/admin` directly shows a 403 from the server.
8. **Switch user** → **Ada Admin** → **Admin** shows the seeded users and the permission matrix.
9. Refunds and Feature Flags appear in the navigation as **Coming soon**.

## Architecture

A single TypeScript package: an Express 5 API, a React 19 SPA (Vite) and SQLite via `better-sqlite3`. The server serves the built SPA, so there is one process and one port.

```
server/
  core/                 # shared platform: no KYC knowledge
    db.ts               # connection, schema, append-only triggers on audit_events
    session.ts          # demo sessions, loadSession, requireAuth, requirePermission, actor()
    permissions.ts      # central role -> permission policy + matrix
    audit.ts            # writeAuditEvent (call inside a transaction), list + read-only router
    http.ts             # HttpError, JSON-only mutations, error handler
  modules/kyc/          # KYC domain
    types.ts            # statuses, risk levels, audit action names
    repository.ts       # queries
    workflow.ts         # transition rules, validation, transactional mutations
    routes.ts           # HTTP layer: permission checks + calls into workflow
  scripts/              # seed data + seed/reset CLI
  app.ts / index.ts     # composition root
web/
  core/                 # api client, session context, nav registry, useApi
  components/           # AppShell, DataTable, FilterBar, StatusBadge, Form/TextAreaField/Button,
                        # Loading/Empty/Error/Notice states, AuditEventsTable
  modules/kyc/          # queue + detail pages
  pages/                # Audit Log, Admin, Coming soon, demo sign-in
tests/                  # vitest + supertest at the HTTP boundary
```

### Identity and permissions

- `POST /api/session {userId}` (demo only) creates a random 256-bit session id stored in the `sessions` table and set as an `httpOnly`, `SameSite=Strict` cookie (8h TTL).
- `loadSession` resolves the acting user on every `/api` request by joining `sessions` to `users`. The role and actor **always** come from these server-owned records. Any `role`, `actorId` or `userId` in a mutation body is ignored, and nothing is read from browser storage.
- `server/core/permissions.ts` is the single policy:

| Permission | viewer | reviewer | admin |
| --- | :-: | :-: | :-: |
| `kyc:read` (applications, notes) | ✔ | ✔ | ✔ |
| `audit:read` | ✔ | ✔ | ✔ |
| `kyc:review` (start, note, approve, reject) | | ✔ | ✔ |
| `admin:access` | | | ✔ |

- Every protected route declares `requirePermission(...)`. A missing or expired session gets **401**, and a missing permission gets **403**. The UI hides controls using `/api/session` permissions, but that is cosmetic only. `/admin` is routed for everyone on purpose, so the server makes the decision.
- Mutations must be `application/json` (otherwise 415). Together with `SameSite=Strict` this blocks simple cross-site form posts.

### KYC workflow

```
pending ──start review──▶ in_review ──approve──▶ approved (final)
   │                        │
   └── add note ◀───────────┴──reject (reason required)──▶ rejected (final)
```

- `GET` detail is read-only and never changes status.
- Notes: non-empty after trimming, ≤ 2000 chars, allowed only while `pending` or `in_review`.
- Rejection reason: required, non-empty, ≤ 2000 chars.
- No reopen, no decision edits and no admin override.
- Each mutation runs in `db.transaction(...).immediate()` and uses a **conditional update** (`UPDATE … WHERE id = ? AND status = <expected>`). If 0 rows change, the request gets **409** and the transaction rolls back. A repeated or stale approve/reject therefore cannot overwrite a final decision or create a second decision audit event. Notes use a conditional `INSERT … SELECT … WHERE status IN (...)`.
- Validation errors return **400** with field details. Unknown applications return **404**.

### Audit trail

- `writeAuditEvent` runs inside the same transaction as the mutation, so the change and its audit event commit or roll back together (covered by a test that forces the audit insert to fail).
- Fields: `id` (`evt_<uuid>`), `actor_id` (from the session), `action`, `entity_type`, `entity_id`, `occurred_at` (server UTC ISO-8601) and `metadata` JSON (`previousStatus`/`newStatus`, `noteId`, `reason`).
- Actions: `kyc.review_started`, `kyc.note_added`, `kyc.approved`, `kyc.rejected`. Seeded history is marked `metadata.seeded = true`.
- Append-only through the application: there are no write, edit or delete endpoints or UI, and SQLite triggers abort `UPDATE`/`DELETE` on `audit_events`. This is **not** tamper-proof storage: anyone with file access to the DB can change it.
- `GET /api/audit-events?entityId=&action=&entityType=` returns events newest first (`audit:read`).

## Reusing the foundation: a Refunds module

Already available to Refunds without changes:

- **Shell and navigation**: change the `Refunds` entry in `web/core/nav.ts` from `comingSoon` to a `permission`, and add routes in `web/App.tsx`.
- **Session and current user**: `actor(req)` on the server, `useSession()` on the client.
- **Permissions**: add `refunds:read` and `refunds:issue` (and maybe `refunds:approve_high_value`) to `PERMISSIONS` and `ROLE_PERMISSIONS`. The Admin matrix picks them up automatically. Guard routes with `requirePermission("refunds:issue")`.
- **Audit**: call `writeAuditEvent(db, { action: "refund.issued", entityType: "refund", ... })` inside the refund transaction. The Audit Log page, its filters and `AuditEventsTable` work unchanged.
- **UI components**: `DataTable`, `FilterBar`, `StatusBadge`, `TextAreaField`/`Button`/`Form`, and the Loading/Empty/Error/Notice states.
- **Infra patterns**: `HttpError`/`validationError`/`conflict`, JSON-only mutations, transaction plus conditional update.

Still Refunds-specific (`server/modules/refunds/`):

- Data model: refund amount and currency (integer minor units), original transaction reference, payment method, idempotency key.
- Rules: refund ≤ the remaining refundable amount, partial refunds, currency checks, a time window since the original payment, and reason codes.
- Approval policy: amount thresholds, four-eyes or maker-checker (the requester cannot approve their own refund), and per-role limits.
- Integration with a payments provider: idempotent external calls, an outbox or retry pattern, reconciliation, and failure states such as `failed` or `reversed`. The DB transaction cannot cover the external call.
- Domain audit metadata: amounts, provider reference, approval chain.

## Prototype limitations

- Demo identity selector instead of real authentication. There is no MFA and no user provisioning, and users and roles are seeded.
- SQLite, a single process and a local file DB. No migrations framework (the schema is created idempotently on start).
- Audit storage is append-only only at the application and trigger level. It is not WORM or tamper-evident.
- No rate limiting, no CSRF token (relies on SameSite=Strict plus JSON-only), no HTTPS (set `secureCookies` behind TLS), and no security headers or CSP.
- Admin is read-only, and there is no user or role management.
- No pagination (audit queries default to 200 rows, max 500), and search is a simple `LIKE`.
- No reopen or override flows, no assignment or claiming of reviews, and no SLA timers.
- The UI is functional, not polished. There are no frontend unit tests, only server-boundary tests and manual browser verification.

## Production follow-ups

1. Replace demo sign-in with SSO (OIDC) and map IdP groups to roles. Add session rotation, idle timeout and logout everywhere.
2. Move to Postgres with versioned migrations, and keep transactional conditional updates or optimistic versioning.
3. Ship audit events to immutable or tamper-evident storage (WORM bucket, hash chaining, or a SIEM). Define retention and access reviews.
4. Add maker-checker for high-risk decisions, review assignment, reopen-by-exception with an audit trail, and a reason taxonomy.
5. Add CSRF tokens, security headers (helmet), rate limiting, structured logging, metrics and error tracking.
6. Add pagination and server-side sorting, frontend tests (Playwright) and CI.
7. Integrate real verification providers behind adapters, with PII minimisation, field-level encryption and data-retention policies.

## Verification report

See [VERIFICATION.md](./VERIFICATION.md).
