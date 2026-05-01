# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (run once after clone)
npm run setup

# Start both client and server in development mode
npm run dev

# Run only the backend (port 3001)
npm run dev:server

# Run only the frontend (port 5173)
npm run dev:client

# Build the server
cd server && npm run build

# Build the client
cd client && npm run build
```

There are no test or lint commands configured.

## Architecture

Flow Tracker is a full-stack TypeScript monorepo: a React/Vite frontend (`client/`) proxied to an Express/PostgreSQL backend (`server/`). The two packages are wired together by a root `package.json` that runs them concurrently. In production the server also serves the compiled client from `client/dist/`.

**Backend** (`server/src/index.ts`, port 3001):
- PostgreSQL database via `pg` Pool, connection string from `DATABASE_URL` env var (Supabase in production). Schema is auto-created on startup via `initDB()`.
- File uploads go to Cloudflare R2 when `R2_*` env vars are set; otherwise falls back to local `uploads/` directory. `USE_R2` boolean toggles the path at startup.
- All API routes are defined inline in `index.ts` — no separate router files.
- JWT auth via `server/src/auth.ts` (`signToken`, `requireAuth` middleware). Tokens last 30 days; secret from `JWT_SECRET` env var (defaults to a dev placeholder). Every API route except `/api/auth/login` and `/api/auth/register` requires a valid Bearer token.

**Frontend** (`client/src/`, port 5173):
- Vite proxies `/api` and `/uploads` to `:3001` during development.
- Global state in `AppContext.tsx` via React Context + `useReducer`. Components call `useApp()`.
- Auth state in `AuthContext.tsx` via `useAuth()`. JWT stored in `localStorage` under `ft_token`/`ft_userId`/`ft_username`. A `ft:logout` custom event triggers forced logout on 401 responses from `api.ts`.
- The API layer is a thin fetch wrapper in `api.ts`; all server communication goes through it.

### Environment Variables

Required for production; dev falls back to localhost/disk:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `JWT_SECRET` | JWT signing secret |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | Public base URL for R2 assets |

### Data Model

Five PostgreSQL tables with cascade deletes:

```
users
flows (created_by → users) → modules (created_by → users) → scenarios → test_steps
```

- **users**: `id`, `username` (unique), `password_hash` (PBKDF2 SHA-512, `salt:hash`), `created_at`
- **flows**: `id`, `name`, `description`, `group_name` (sidebar grouping), `order_idx`, `created_by`
- **modules**: `id`, `flow_id`, `label`, `name`, `side` (eDS|HITS), `note`, `parallel_group` (null or shared string key for parallel execution), `order_idx`, `created_by`
- **scenarios**: `id`, `module_id`, `blid`, `description`, `order_idx` — scenarios hold no status themselves; status is derived from their steps
- **test_steps**: `id`, `scenario_id`, `description`, `expected`, `status` (untested|pass|fail), `issue_type` (blocker|major|minor|null), `date_tested`, `ado_ticket`, `evidence_url`, `evidence_image` (URL string or JSON array of URLs), `remarks`, `order_idx`

### Ownership Model

`created_by` on `flows` and `modules` governs write access. The server's `canEdit(owner, userId)` returns true if `owner` is null (legacy/unowned) or matches the requesting user. Mutations to modules, scenarios, and steps check the **flow's** owner (traversed via joins). `isOwner(createdBy)` in `AuthContext.tsx` mirrors this on the client.

### State Mutation Pattern

Every write method in `AppContext.tsx` follows this cycle: call `api.*()` → on success call `loadFlows(activeFlowId)` to refetch the full nested tree from the server. There is no optimistic update or partial state patch — the whole tree is always reloaded. The `expanded` set (which scenario rows are open) lives only in client state and is never persisted to the DB.

### API Routes

All defined inline in `server/src/index.ts`. All routes except auth require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register user → returns `{ token, userId, username }` |
| POST | `/api/auth/login` | Login → returns `{ token, userId, username }` |
| GET | `/api/auth/me` | Verify token → current user |
| GET | `/api/flows` | Full nested tree (flows + modules + scenarios + steps) |
| POST | `/api/flows` | Create flow |
| PUT | `/api/flows/:id` | Update flow name/description/group (owner only) |
| DELETE | `/api/flows/:id` | Delete flow (owner only, cascade) |
| POST | `/api/flows/:flowId/modules` | Add module (flow owner only) |
| PUT | `/api/modules/:id` | Update module fields or `order_idx` (flow owner only) |
| DELETE | `/api/modules/:id` | Delete module (flow owner only, cascade) |
| PUT | `/api/flows/:flowId/modules/reorder` | Swap adjacent modules (transaction, flow owner only) |
| POST | `/api/modules/:moduleId/scenarios` | Add scenario (flow owner only) |
| PUT | `/api/scenarios/:id` | Update scenario fields (flow owner only) |
| DELETE | `/api/scenarios/:id` | Delete scenario + evidence cleanup (flow owner only) |
| POST | `/api/scenarios/:scenarioId/steps` | Add test step (flow owner only) |
| PUT | `/api/steps/:id` | Update step fields (flow owner only) |
| DELETE | `/api/steps/:id` | Delete step + evidence cleanup (flow owner only) |
| POST | `/api/upload` | Multer upload to R2 or disk → returns `{ url }` |

### Key Frontend Components

| Component | Purpose |
|---|---|
| `Sidebar.tsx` | Flow list grouped by `group_name`, color-coded health dots, progress bars |
| `FlowDiagram.tsx` | SVG visualization of modules as nodes with status colors, gate indicators, parallel group brackets |
| `ScenariosView.tsx` | Tabular test execution view — scenarios expand to show/edit their steps inline |
| `BLIDDashboard.tsx` | BLID coverage metrics aggregated across the active flow |
| `DiagnosticsModal.tsx` | Runs `runDiagnostics()` against the active flow; surfaces errors/warnings (missing steps, untested steps, duplicate BLIDs, failed steps without issue type) |
| `LoginPage.tsx` | Login/register form, shown when `useAuth().user` is null |
| `ConfirmModal.tsx` | Generic confirmation dialog used for destructive actions |

`App.tsx` contains `AddModuleModal` with a `QUICK` array of 15 hardcoded module templates (label/name/side) for rapid creation, plus an inline SVG sprite (`<defs>`) for icons via `<use href="#i-*">`.

`client/src/_backup/` holds snapshot copies of major components — ignore when making changes.

### Business Logic (`utils.ts`)

- `modStatus(mod)` → `ModuleStatus`: `complete | blocked | major | minor | progress | pending | empty`. Derives status by aggregating all steps across all scenarios in the module. Blocked = any step fail with blocker; complete = all steps pass.
- `scenarioStatus(sc)` → `'pass' | 'fail' | 'untested'`: worst-case across all steps (any fail → fail; all pass → pass).
- `scenarioIssueType(sc)` → worst-case issue type across failed steps (blocker > major > minor).
- `modStats(mod)` → `{ pass, fail, untested, total }`: step-level counts.
- `flowStats(flow)` → `FlowStats`: aggregates pass/fail/untested counts, `blidPct` (unique BLIDs with ≥1 passing step ÷ total unique BLIDs), `execPct` (tested ÷ total).
- `isGated(flow, modIdx)`: returns `true` if any earlier module has a blocker step.
- `STATUS_META`: maps each `ModuleStatus` to `{ label, cls }` — CSS classes prefixed `st-` (e.g. `st-blocked`).
- `today()`: returns `"DD-Mon-YYYY"` (e.g. `"25-Apr-2026"`), auto-filled on first pass/fail.

### Evidence Image Helpers (`diagnosticsHelpers.ts`)

`evidence_image` on a test step is stored as either a bare URL string (legacy) or a JSON array of URLs. `parseImages(raw)` normalises either format to `string[]`; `serializeImages(urls)` writes back to JSON. Always go through these helpers when reading or writing evidence images.

### Export (`exportReport.ts`)

Two export functions, both triggered from `ScenariosView.tsx`:
- `exportReport(flow)`: generates a self-contained HTML file (inline styles, print-ready) and triggers a browser download.
- `exportExcel(flow)`: generates a three-sheet XLSX (Summary, Scenarios, Steps) via the `xlsx` library and triggers download.

### Flow Gating

A module is "gated" if any preceding module in the same flow has a step with `issue_type = 'blocker'`. `isGated()` implements this; the diagram and scenarios view visually block and warn about downstream modules.

### Design System

CSS design tokens in `client/src/index.css`:

```css
--bg: #f3f4f6          /* page background */
--panel: #ffffff        /* card/container */
--sidebar: #0b1b3b      /* dark sidebar */
--ink / --ink-2 / --ink-3   /* text hierarchy */
--ok: #16a34a           /* pass/green */
--bad: #dc2626          /* fail/blocker/red */
--warn: #d97706         /* issue/amber */
--blue: #1d4ed8         /* accent */
--sans: 'Inter'         /* body font */
--mono: 'JetBrains Mono'  /* code/stats font */
```
