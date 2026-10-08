# Verification report

Environment: Ubuntu 22.04, Node 24.19.0, npm 10.8.3. Branch `devin/1791467045-kyc-internal-tools-poc`.

## Automated checks (all run, all passing at the final commit)

| Command | Result |
| --- | --- |
| `npm test` | 3 files, **49 tests passed** |
| `npm run lint` | 0 problems |
| `npm run typecheck` | no errors |
| `npm run build` | `tsc --noEmit` + Vite build succeeded |

Test coverage (`tests/`, vitest + supertest, in-memory SQLite seeded per test):

- `permissions.test.ts`:
  - Every viewer mutation returns 403, and status, notes and audit counts are unchanged.
  - Viewer has read access.
  - With no session, every protected endpoint returns 401.
  - A forged or expired cookie returns 401.
  - Reviewer and viewer get 403 on Admin; admin gets 200 plus the matrix.
  - A body `role`/`actorId`/`userId` is ignored, and the audit actor comes from the session.
  - Non-JSON mutations return 415.
- `workflow.test.ts`:
  - Opening the detail page is side-effect free.
  - Full pending → in_review → approved flow, with the shape and metadata of all three audit events checked.
  - Reject with reason, and the reason appears in the audit event.
  - 9 invalid transitions return 409 with no side effects.
  - Unknown ID returns 404.
  - Empty, whitespace-only, wrong-type or too-long notes return 400.
  - A missing or blank rejection reason returns 400.
  - Malformed JSON returns 400.
  - A repeated approve returns 409 and writes no second event.
  - A stale reject after approve returns 409, with the decision unchanged.
  - 3 concurrent decisions: exactly one 200 and one decision event.
  - A failed audit insert rolls back the status change.
  - The audit table rejects UPDATE/DELETE, and there are no write routes.
  - Audit results are newest first, and the ID/action filters work.
  - Queue search and status/risk filters combine.
- `review-fixes.test.ts`:
  - An invalid session switch keeps the current session.
  - `%`, `_` and `\` are searched literally.
  - Invalid audit `limit` values are ignored, and a valid limit is honoured.

## Browser verification (production build, `npm run build && npm start`, http://localhost:3000)

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Reviewer: top bar shows user and role; Refunds and Feature Flags show "Coming soon" | Pass |
| 2 | Search by name (`Quinnfield`) and by ID; Pending+High and In review+High filters combine | Pass (after fix, see below) |
| 3 | Opening KYC-1001 leaves it Pending with no audit events | Pass |
| 4 | KYC-1001: start review → note (empty/whitespace rejected; saved note shows author and time) → approve; final, no controls | Pass |
| 5 | Application audit shows approved / note_added / review_started newest first, actor Riley; Audit Log filters by ID and action | Pass |
| 6 | KYC-1003: reject with no reason gets a validation error; reject with reason shows the reason in details and in audit metadata | Pass |
| 7 | Viewer: reads queue, detail, notes and audit; "Read-only" with no controls; no Admin nav | Pass |
| 8 | Viewer direct `POST …/KYC-1002/start-review` from the browser returns 403 `Missing permission: kyc:review`; status unchanged after refresh | Pass |
| 9 | Reviewer and viewer `/admin` get a server 403 state; admin sees 3 users and the matrix | Pass |
| 10 | Refresh, then **server stop/restart without reset**: decisions, note, reason, audit and sessions persist | Pass |

### Issues found and fixed

| Issue | Source | Fix | Re-verified |
| --- | --- | --- | --- |
| "Clear filters" removed only one filter (sequential `setSearchParams` calls overwrote each other) | Browser test + Devin Review | `useUrlFilters.clear()` does a single navigation | Browser: queue + audit log |
| Fast typing in search dropped characters (input controlled by lagging URL state) | Browser test | Search input keeps local state, 250ms debounced commit | Browser: typed fast twice |
| Results for the previous filters shown while new ones load | Devin Review | `useApi` keys data by URL | Code review (not timing-instrumented) |
| Switching to an unknown user deleted the current session | Devin Review | Create the new session before deleting the old one | Automated test |
| `%`/`_` in search acted as LIKE wildcards | Devin Review | Escape + `ESCAPE '\'` | Automated test + browser (`%` gives the empty state) |
| Non-integer audit `limit` could reach SQL | Devin Review | Strict integer parsing | Automated test |
| Session cookie never `Secure` | Devin Review | `SECURE_COOKIES=true` env option (off by default for local HTTP) | Code review |

### Not verified / limitations

- No frontend unit tests. UI behaviour was verified manually in the browser.
- The stale-response race was not reproduced with instrumented network delays.
- `SECURE_COOKIES=true` was not exercised over real HTTPS.
