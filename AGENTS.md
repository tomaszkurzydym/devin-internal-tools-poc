# AGENTS.md

Internal-tools prototype (synthetic data only): TypeScript, Express 5 API, React 19 + Vite SPA, SQLite (`better-sqlite3`). Applications are modules under `server/modules/<name>/` and `web/modules/<name>/` built on shared primitives in `server/core/`, `shared/`, `web/core/` and `web/components/`.

## Setup and commands

Node is installed via NVM; run `source ~/.nvm/nvm.sh` in each new shell.

```bash
npm install
npm test            # vitest + supertest (server)
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + vite build to dist/web
npm run build && PORT=3000 npm start   # serves API + built SPA; seeds empty/missing data
npm run dev:server & npm run dev:web   # dev mode (Vite on :5173 proxies /api)
npm run seed        # seed only if empty
npm run db:reset    # DESTRUCTIVE: wipes data/app.db (incl. audit log) and reseeds
```

Run tests, lint, typecheck and build before every commit/PR. Do not run `npm run db:reset` during persistence checks.

## Project rules

- Actor and role come only from the server session (`server/core/session.ts`); every protected route uses `requirePermission`. UI permission checks are cosmetic.
- Permissions (`<resource>.<action>`) and role mapping live only in `shared/permissions.ts`.
- Every successful mutation writes an audit event in the same transaction (`guardedTransition` in `server/core/transition.ts` or `writeAuditEvent` in `server/core/audit.ts`). The audit log is append-only: no update/delete code paths.
- Keep domain schema, validation, transitions and seed data inside the module; keep `server/core`, `shared` and `web/components` domain-free.
- The demo identity selector is a local simulation; do not present it as authentication.
- No real PII or external integrations.

## Adding a new internal tool

Use the repository skill `.agents/skills/add-internal-tool/SKILL.md` (invoke with `@skills:add-internal-tool <app>`). It lists the exact files, registration points and required verification.
