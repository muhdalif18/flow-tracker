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

Flow Tracker is a full-stack TypeScript monorepo: a React/Vite frontend (`client/`) proxied to an Express/SQLite backend (`server/`). The two packages are wired together by a root `package.json` that runs them concurrently.

**Backend** (`server/src/index.ts`, port 3001):
- SQLite database at `data/tracker.db` (relative to repo root) via `better-sqlite3` (synchronous, no ORM). WAL mode + foreign keys enabled.
- File uploads stored under `uploads/` (repo root), served as static files. Filenames are UUID-prefixed on save; max 10 MB.
- All API routes are defined inline in `index.ts` — no separate router files.

**Frontend** (`client/src/`, port 5173):
- Vite proxies `/api` and `/uploads` to `:3001` during development.
- All global state lives in `AppContext.tsx` using a React Context + `useReducer` pattern. Components call `useApp()` to read state and dispatch actions.
- The API layer is a thin fetch wrapper in `api.ts`; all server communication goes through it.

### Data Model

Three SQLite tables with cascade deletes:

```
flows → modules → scenarios
```

- **flows**: Top-level test initiatives (`id`, `name`, `description`, `order_idx`)
- **modules**: Test modules within a flow (`flow_id`, `label`, `name`, `side` eDS|HITS, `note`, `order_idx`)
- **scenarios**: Individual test cases (`module_id`, `blid`, `description`, `expected`, `status` untested|pass|fail, `issue_type` blocker|major|minor|null, `date_tested`, `ado_ticket`, `evidence_url`, `evidence_image`, `remarks`, `order_idx`)

### State Mutation Pattern

Every write method in `AppContext.tsx` follows this cycle: call `api.*()` → on success call `loadFlows(activeFlowId)` to refetch the full nested tree from the server. There is no optimistic update or partial state patch — the whole tree is always reloaded. The `expanded` set (which scenario rows are open) lives only in client state and is never persisted to the DB.

### API Routes

All defined inline in `server/src/index.ts`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/flows` | Full nested tree (flows + modules + scenarios) |
| POST | `/api/flows` | Create flow |
| DELETE | `/api/flows/:id` | Delete flow (cascade) |
| POST | `/api/flows/:flowId/modules` | Add module |
| PUT | `/api/modules/:id` | Update module fields or `order_idx` |
| DELETE | `/api/modules/:id` | Delete module (cascade) |
| PUT | `/api/flows/:flowId/modules/reorder` | Swap adjacent modules (transaction) |
| POST | `/api/modules/:moduleId/scenarios` | Add scenario |
| PUT | `/api/scenarios/:id` | Update scenario fields |
| DELETE | `/api/scenarios/:id` | Delete scenario + remove evidence image file |
| POST | `/api/upload` | Multer file upload → returns `{ url }` |

### Key Frontend Components

| Component | Purpose |
|---|---|
| `Sidebar.tsx` | Flow list with color-coded health dots and progress bars |
| `FlowDiagram.tsx` | SVG visualization of modules as nodes with status colors and gate indicators |
| `ScenariosView.tsx` | Tabular test execution view with inline editing, screenshot upload, status marking |
| `BLIDDashboard.tsx` | BLID coverage metrics aggregated across the active flow |

`App.tsx` contains an `AddModuleModal` with a `QUICK` array of 8 hardcoded module templates (label/name/side) for rapid module creation, plus an inline SVG sprite (`<defs>`) for icons referenced via `<use href="#i-*">`.

### Business Logic (`utils.ts`)

- `modStatus(mod)` → `ModuleStatus`: `complete | blocked | major | minor | progress | pending | empty`. Blocked = any fail with blocker; major/minor = fail with that issue type; progress = some pass, not all; complete = all pass.
- `flowStats(flow)` → `FlowStats`: aggregates pass/fail/untested counts, `blidPct` (unique BLIDs with ≥1 pass ÷ total unique BLIDs), `execPct` (tested ÷ total).
- `isGated(flow, modIdx)`: returns `true` if any earlier module resolves to `blocked`.
- `STATUS_META`: maps each `ModuleStatus` to `{ label, cls }` — CSS classes are prefixed `st-` (e.g. `st-blocked`).
- `today()`: returns formatted date string `"DD-Mon-YYYY"` (e.g. `"25-Apr-2026"`), auto-filled on first pass/fail.

### Flow Gating

A module is "gated" if any preceding module in the same flow has a scenario with `issue_type = 'blocker'`. The `isGated()` utility implements this check; the diagram and scenarios view use it to visually block and warn about downstream modules.

### Design System

CSS design tokens are defined in `client/src/index.css`. Key variables:

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
