# Internal Tools POC — KYC Reviews and Refunds

Engineering-owned internal-tools prototype for a fintech. Two applications, **KYC Reviews** and a minimal **Refunds** review slice, are built on the same shared shell, session, permission policy, guarded-transition/audit infrastructure and UI components. New applications follow the repository skill [`add-internal-tool`](.agents/skills/add-internal-tool/SKILL.md); project rules for agents are in [`AGENTS.md`](AGENTS.md).

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

Environment: `PORT` (default `3000`), `DB_PATH` (default `data/app.db`), `SECURE_COOKIES=true` (set the `Secure` cookie flag; use behind HTTPS).

## Demo walkthrough

1. Open http://localhost:3000 and choose **Riley Reviewer**. The top bar shows the current user and role.
2. **KYC Reviews**: search for `Quinnfield` or `KYC-1001`, or combine the Status and Risk filters.
3. Open `KYC-1001` (pending). Opening it does not change anything. Click **Start review** to move it to *In review*.
4. Add a note, then click **Approve**. A confirmation banner appears and the decision is final.
5. Scroll to *Audit events for this application* (or **Audit Log**, filtered by `KYC-1001`) to see `kyc.review_started`, `kyc.note_added` and `kyc.approved`, each with the actor, a UTC timestamp and metadata.
6. Open another pending application, start a review, then **Reject…**. Submitting without a reason shows a validation error; enter a reason and confirm.
7. **Switch user** → **Vera Viewer**. Everything can be read, but there are no action controls ("Read-only" notice) and **Admin** is not in the navigation. Visiting `/admin` directly shows a 403 from the server.
8. **Switch user** → **Ada Admin** → **Admin** shows the seeded users and the permission matrix.
9. As **Riley Reviewer**, open **Refunds**: search `Whitlock` or `RF-2001`, filter by Status, open a pending request and click **Mark reviewed**. The request's audit event (`refunds.marked_reviewed`) appears on the detail page and in the shared **Audit Log** (filter by `RF-2001` or the action). As **Vera Viewer** the Refunds pages are read-only.
10. Feature Flags appears in the navigation as **Coming soon**.

## Architecture

A single TypeScript package: an Express 5 API, a React 19 SPA (Vite) and SQLite via `better-sqlite3`. The server serves the built SPA, so there is one process and one port.

```
shared/permissions.ts     # central policy: <resource>.<action> permissions, role mapping, matrix (server + web)
server/
  core/                   # shared platform: no domain knowledge
    db.ts                 # connection, core schema (users, sessions, audit_events), append-only triggers
    session.ts            # demo sessions, loadSession, requireAuth, requirePermission, actor()
    audit.ts              # writeAuditEvent (inside a transaction), list + read-only router
    transition.ts         # guardedTransition: conditional UPDATE + audit event in one IMMEDIATE tx, 409 otherwise
    module.ts             # ServerModule contract (schema, tables, router, seed, audit actions)
    http.ts / sql.ts      # HttpError helpers, JSON-only mutations, oneOf/queryString, likeContains
  modules/
    index.ts              # MODULES registry: the one place a new application is registered
    kyc/                  # KYC domain: types, schema, seed, repository, workflow, routes, index
    refunds/              # Refunds domain: same file layout, one transition
  database.ts             # opens the DB with all module schemas; reset helper
  scripts/                # demo users + seed/reset CLI (delegates domain data to modules)
  app.ts / index.ts       # composition root: mounts shared routers and every registered module
web/
  core/                   # api client, session context, nav registry, useApi, useUrlFilters, useAction
  components/             # AppShell, DataTable, FilterBar, StatusBadge, Form/TextAreaField/Button,
                          # Loading/Empty/Error/Notice states, AuditEventsTable
  modules/kyc/            # queue + detail pages
  modules/refunds/        # queue + detail pages
  pages/                  # Audit Log, Admin, Coming soon, demo sign-in
tests/                    # vitest + supertest at the HTTP boundary
.agents/skills/add-internal-tool/SKILL.md   # procedure for adding application #3+
```

### Identity and permissions

- `POST /api/session {userId}` (demo only) creates a random 256-bit session id stored in the `sessions` table and set as an `httpOnly`, `SameSite=Strict` cookie (8h TTL).
- `loadSession` resolves the acting user on every `/api` request by joining `sessions` to `users`. The role and actor **always** come from these server-owned records. Any `role`, `actorId` or `userId` in a mutation body is ignored, and nothing is read from browser storage.
- `shared/permissions.ts` is the single policy (`<resource>.<action>`), used by the server for enforcement and by the web app for UI hints:

| Permission | viewer | reviewer | admin |
| --- | :-: | :-: | :-: |
| `kyc.read` (applications, notes) | ✔ | ✔ | ✔ |
| `audit.read` | ✔ | ✔ | ✔ |
| `refunds.read` | ✔ | ✔ | ✔ |
| `kyc.review` (start, note, approve, reject) | | ✔ | ✔ |
| `refunds.review` (mark reviewed) | | ✔ | ✔ |
| `admin.access` | | | ✔ |

- Every protected route declares `requirePermission(...)`. A missing or expired session gets **401**, and a missing permission gets **403**. The UI hides controls using `/api/session` permissions, but that is cosmetic only. `/admin` is routed for everyone on purpose, so the server makes the decision.
- Mutations must be `application/json` (otherwise 415). Together with `SameSite=Strict` this blocks simple cross-site form posts.

### Refunds workflow

`pending → reviewed` via `POST /api/refunds/requests/:id/mark-reviewed` (`refunds.review`). It uses `guardedTransition`, so a repeated or stale request returns **409** and writes no audit event; success writes `refunds.marked_reviewed` (entity `refund_request`) in the same transaction. `reviewed` is final. There is no refund approval, payment execution or provider integration. 18 synthetic requests (`RF-2001`…`RF-2018`) are seeded; `npm start` adds them to an existing database whose Refunds table is empty, without touching KYC data.

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
- `GET /api/audit-events?entityId=&action=&entityType=` returns events newest first (`audit.read`).

## Shared primitives: evidence of reuse

| Shared primitive | Location | KYC uses it for | Refunds uses it for | A third application adds |
| --- | --- | --- | --- | --- |
| Session / current user | `server/core/session.ts` (`actor`, `requireAuth`), `web/core/session.tsx` (`useSession`) | actor ID on every mutation and note author | `reviewed_by` and audit actor | nothing |
| Server-side authorization | `shared/permissions.ts`, `requirePermission` in `server/core/session.ts` | `kyc.read`, `kyc.review` on every route | `refunds.read`, `refunds.review` on every route | its `<resource>.<action>` entries in `shared/permissions.ts`; `requirePermission` on each route |
| Guarded transition + transactional audit | `server/core/transition.ts`, `server/core/audit.ts` | start review / approve / reject (notes use `writeAuditEvent` directly in a transaction) | mark reviewed | its conditional `UPDATE` SQL, transition table and audit action names |
| Module registration | `server/core/module.ts`, `server/modules/index.ts`, `server/database.ts`, `server/scripts/seedData.ts` | schema, seed, router mount, audit actions | same | a `ServerModule` in `server/modules/<name>/index.ts` and one `MODULES` entry |
| Audit display | `/api/audit-events`, `web/pages/AuditLogPage.tsx`, `web/components/AuditEventsTable.tsx` | Audit Log + per-application events | Audit Log + per-request events | nothing (its actions appear in the filter automatically) |
| Shell and navigation | `web/components/AppShell.tsx`, `web/core/nav.ts`, `web/App.tsx` | nav entry + 2 routes | nav entry + 2 routes | one nav entry and its routes |
| Table, filters, URL state, fetching | `DataTable`, `FilterBar`, `useUrlFilters`, `useApi`, `qs`; search via `likeContains` | queue with search + status + risk | queue with search + status | columns and filter options |
| Mutation feedback and states | `web/core/useAction.ts`, `States.tsx`, `Form.tsx`, `StatusBadge.tsx` | detail actions, validation errors, 409 reload | Mark reviewed with feedback, 409 reload | status colours in `TONES` if new statuses |

**Refunds code that is necessarily domain-specific** (`server/modules/refunds/`, `web/modules/refunds/`): the `refund_requests` schema and synthetic seed, row mapping and filters, the `pending → reviewed` transition table and its SQL, the audit action name and metadata, amount formatting, and the page layouts/columns. Refunds deliberately has **no** payment execution, provider integration or approval step; a real refunds tool would add amount rules, maker-checker approval and an outbox for provider calls, none of which the shared core attempts to model.

**Shared infrastructure that needed no change for Refunds**: session handling, `requirePermission`, `writeAuditEvent`, the audit API and append-only triggers, `AppShell`, `DataTable`, `FilterBar`, `useUrlFilters`, `useApi`, States/Form components and `AuditEventsTable`.

**Shared code that did change** (to remove KYC coupling, once): permission names moved to `shared/permissions.ts` with `resource.action` naming (the frontend no longer duplicates the list); KYC tables and seed moved out of `server/core/db.ts` and the seed script into `server/modules/kyc/`; the KYC conditional-update + audit logic was extracted into `guardedTransition`; the KYC detail page's mutation/feedback logic was extracted into `useAction`; the Audit Log's hard-coded KYC action list was replaced by module-declared actions. KYC behaviour is unchanged and its existing tests pass (one test line changed for the permission rename).

**Diff size for this change** (`git diff --numstat` against the previous `main`, added/removed lines): shared infrastructure +199/−170 (much of it code moved out of core), domain code +581/−78 (Refunds ≈ 222 server + 174 web lines; the rest is KYC schema/seed relocation and refactors onto shared helpers), tests +113/−3, docs/skill +149/−5. No generated files are committed. Refunds is a much smaller scope than KYC (one transition, no notes or validation), so these numbers do not show that an equivalent application would be proportionally cheaper.

## Prototype limitations

- Demo identity selector instead of real authentication. There is no MFA and no user provisioning, and users and roles are seeded.
- SQLite, a single process and a local file DB. No migrations framework (the schema is created idempotently on start).
- Audit storage is append-only only at the application and trigger level. It is not WORM or tamper-evident.
- No rate limiting, no CSRF token (relies on SameSite=Strict plus JSON-only), no HTTPS (set `SECURE_COOKIES=true` behind TLS), and no security headers or CSP.
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
