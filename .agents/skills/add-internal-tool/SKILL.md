---
name: add-internal-tool
description: Add a new internal application (e.g. Disputes, Feature Flags) to this repo by reusing the shared session, permission, audit, transition, shell and UI primitives. Use when asked to build or extend an internal tool module here.
argument-hint: <application name and purpose>
---

# Add an internal tool to this repository

Use this skill when adding a new domain application (a "module") alongside `kyc` and `refunds`.
Do not use it for changes to the shared core alone, or for a non-internal-tools repo.

Reference implementations to read before writing code:
- **Refunds** (`server/modules/refunds/`, `web/modules/refunds/`): the smallest complete example (list, filter, detail, one transition).
- **KYC** (`server/modules/kyc/`, `web/modules/kyc/`): multiple transitions, required-text validation, notes (non-status mutation).
- **Feature Flags** (`server/modules/flags/`, `web/modules/flags/`): two reversible transitions (no final state), a required reason on every change, an admin-only mutation permission (`flags.toggle`), and an optimistic `expectedUpdatedAt` check. If any state can be re-entered (A → B → A), a `WHERE status = ?` guard alone lets stale requests through; also guard on the `updated_at` the client loaded, as `changeFlag` does.

Request: $ARGUMENTS

## 0. Gather inputs (ask the user for anything missing)

1. Purpose and users of the application.
2. Entity fields (and which are searchable / filterable).
3. Roles and actions: which of viewer / reviewer / admin may read and which may mutate.
4. Workflow transitions (`from` → `to`), which states are final, and any validation (e.g. a required reason).
5. Audit requirements: action names and metadata per mutation.

State your assumptions in the PR if the user does not specify something.

## 1. Mandatory conventions (do not deviate)

- **Identity** comes only from the server session: use `actor(req)` from `server/core/session.ts`. Never read actor/role from body, headers or browser storage.
- **Every protected route** has `requirePermission("<resource>.<action>")` (`server/core/session.ts`). UI checks (`useSession().can()` from `web/core/session.tsx`) are cosmetic only.
- **Permissions** are added only in `shared/permissions.ts` (`PERMISSIONS` + role arrays). Name them `<resource>.read` / `<resource>.<action>`. No policy engine, no per-module role logic.
- **Status changes** go through `guardedTransition` (`server/core/transition.ts`) with a conditional `UPDATE ... WHERE id = ? AND status = ?`. This gives one IMMEDIATE transaction, 409 on stale/repeated requests, and an audit event in the same transaction. See `markReviewed` in `server/modules/refunds/workflow.ts`.
- **Other mutations** (e.g. adding a note) must call `writeAuditEvent` (`server/core/audit.ts`) inside the same `db.transaction()` as the write and guard with a conditional statement. See `addNote` in `server/modules/kyc/workflow.ts`.
- **Audit is append-only**: never add update/delete routes or SQL for `audit_events`. Action names: `<module>.<past_tense_verb>`; entity type: snake_case singular (e.g. `refund_request`). Metadata should include `previousStatus`/`newStatus` for transitions.
- **Domain rules stay in the module**: transition table, validation, SQL, seed data, types. Do not add domain logic to `server/core/` or `web/components/`.
- **Synthetic data only**; no real PII, no external integrations (payments, providers, etc.) unless the user explicitly asks.
- **Search** uses `likeContains()` (`server/core/sql.ts`) with `ESCAPE '\'`; query parsing uses `oneOf()` / `queryString()` (`server/core/http.ts`).
- Mutating endpoints are JSON POSTs (the shared `requireJson` middleware returns 415 otherwise); frontend calls `api.post(url, {})`.

## 2. Server: files to create (copy the shape of `server/modules/refunds/`, not its content)

| File | Purpose | Example |
| --- | --- | --- |
| `types.ts` | statuses tuple, entity type constant, audit action names, record interface | `server/modules/refunds/types.ts` |
| `schema.ts` | idempotent `CREATE TABLE IF NOT EXISTS` DDL + tables in drop order | `server/modules/refunds/schema.ts` |
| `seed.ts` | synthetic rows, plus `writeAuditEvent` for seeded history so audit matches state; runs inside the caller's transaction | `server/modules/refunds/seed.ts` |
| `repository.ts` | row → object mapping, list with filters, get by id | `server/modules/refunds/repository.ts` |
| `workflow.ts` | `TRANSITIONS`, `availableActions`, validation, mutations via `guardedTransition` | `server/modules/refunds/workflow.ts`, `server/modules/flags/workflow.ts` (reason via `requiredText`) |
| `routes.ts` | Express router; `read`/`review` permission middleware; detail response includes `availableActions` | `server/modules/refunds/routes.ts` |
| `index.ts` | exports a `ServerModule` (`server/core/module.ts`) | `server/modules/refunds/index.ts` |

Then register it: add the module to `MODULES` in `server/modules/index.ts`. That single entry mounts the router at `apiPath`, applies the schema (`server/database.ts`), seeds it (`server/scripts/seedData.ts`, including into an existing database whose module tables are empty), and adds its audit actions to the Audit Log filter.

Add permissions in `shared/permissions.ts`; the Admin page matrix picks them up automatically.

Error helpers: `notFound`, `conflict`, `validationError` from `server/core/http.ts` (404 / 409 / 400 with field details). Required, trimmed, length-limited text (reasons, notes): `requiredText(field, value, label, max)` from the same file.

## 3. Web: files to create

| File | Reuses | Example |
| --- | --- | --- |
| `web/modules/<name>/types.ts` | mirror of server response types and status tuple | `web/modules/refunds/types.ts` |
| `<Name>QueuePage.tsx` | `PageHeader`, `FilterBar`, `DataTable`, `StatusBadge`, `useUrlFilters`, `useApi`, `qs`, `Loading`/`ErrorState` | `web/modules/refunds/RefundsQueuePage.tsx` |
| `<Name>DetailPage.tsx` | `useAction` (busy/feedback/409 reload), `Notice`, `Button`/`Form`/`TextAreaField`, `AuditEventsTable` filtered by `entityType`+`entityId` | `web/modules/refunds/RefundDetailPage.tsx`, `web/modules/kyc/KycDetailPage.tsx` (form + validation) |

Register navigation in `web/core/nav.ts` (`permission: "<resource>.read"`) and routes in `web/App.tsx`. If the app replaces a "Coming soon" nav entry, drop `comingSoon: true` and its `ComingSoonPage` route. Add new status colours to `TONES` in `web/components/StatusBadge.tsx` if needed. Show a read-only notice when `!can("<resource>.<action>")` (`const { can } = useSession()`).

## 4. Choices that depend on the application

- Number of statuses and which are final; whether there are non-status mutations (notes, comments).
- Required inputs per action (use `requiredText` from `server/core/http.ts`; send them as JSON body fields and mirror the limit in `TextAreaField maxLength`).
- Which fields are searchable vs. select filters.
- Whether reviewer and admin share a permission (current default) or admin-only actions exist (add a separate permission and grant it only in the `admin` array, as `flags.toggle` does; do not branch on role names in code). The Admin matrix is served by `GET /api/admin/overview` (assert it in tests).
- Whether to add an admin-only page. Admin is read-only today.

## 5. Required verification (all must actually be run; report anything not run)

Commands (Node via NVM):

```bash
source ~/.nvm/nvm.sh
npm test && npm run lint && npm run typecheck && npm run build
```

Add `tests/<name>.test.ts` modelled on `tests/refunds.test.ts`, using `setup()`/`loginAs()`/`auditCount()` from `tests/helpers.ts`. Minimum cases:
1. Viewer mutation denied by the server (403), with no state change and no audit event.
2. Reviewer (and admin) mutation permitted.
3. Successful mutation persisted with exactly one audit event visible through `/api/audit-events`.
4. Repeated/invalid transition returns 409 without a duplicate audit event.
5. Unauthenticated request returns 401; unknown record returns 404.

Existing tests (`tests/permissions.test.ts`, `tests/workflow.test.ts`, `tests/review-fixes.test.ts`, `tests/refunds.test.ts`) must still pass; do not weaken them to make a new module fit.

Browser check (`npm run build && PORT=3000 npm start`, demo users on the sign-in page):
- Reviewer: list, search, filter, open detail, perform each action, see success feedback and the audit event on the detail page and in the shared Audit Log.
- Viewer: read access, no action buttons, read-only notice.
- Repeat an action in a second tab (or via request) to confirm a 409 message.
- Restart the server and confirm persistence. Do not run `npm run db:reset` during persistence checks (it wipes `data/app.db`); `npm start` seeds missing module data automatically.
- Existing modules (KYC Reviews, Audit Log, Admin) still work.

## 6. Documentation to update

- `README.md`: intro paragraph, demo walkthrough step, architecture tree, permission table, a `### <Name> workflow` section, the audit action list, and limitations.
- `VERIFICATION.md`: a new top section with commands run, browser checks and what was not verified.
- This skill: fix anything that was missing or wrong while you followed it.

## 7. Final handover

Include in the PR description:
- What the new module does and explicitly does not do.
- New permissions and role mapping.
- Transition table and audit actions.
- Which shared primitives were reused; any change to shared code and why (keep shared changes minimal and generic).
- Commands run and their results; browser checks performed; anything not verified.
- Open product questions (assumptions made in step 0).
