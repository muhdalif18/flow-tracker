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

# TypeScript check (no emit)
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

There are no test or lint commands configured.

## Architecture

Flow Tracker is a full-stack TypeScript monorepo: a React/Vite frontend (`client/`) proxied to an Express/PostgreSQL backend (`server/`). The two packages are wired together by a root `package.json` that runs them concurrently. In production the server also serves the compiled client from `client/dist/`.

**Backend** (`server/src/index.ts`, port 3001):
- PostgreSQL via `pg` Pool; connection string from `DATABASE_URL` (Supabase in prod). Schema auto-created on startup via `initDB()`, which also runs `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations and seeds the SuperAdmin account.
- File uploads go to Cloudflare R2 when `R2_*` env vars are set; otherwise falls back to local `uploads/` directory. `USE_R2` boolean toggles at startup.
- All API routes are defined inline in `index.ts` — no separate router files.
- JWT auth via `server/src/auth.ts` (`signToken`, `requireAuth` middleware). Tokens last 30 days, include `{ userId, username, role }`. Secret from `JWT_SECRET` env var. Every route except `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password` requires a valid Bearer token.
- `unhandledRejection` is caught at the top of `index.ts` to prevent crashes from nodemailer or other async errors.

**Frontend** (`client/src/`, port 5173):
- Vite proxies `/api` and `/uploads` to `:3001` during development.
- Global state in `AppContext.tsx` via React Context + `useReducer`. Components call `useApp()`.
- Auth state in `AuthContext.tsx` via `useAuth()`. JWT stored in `localStorage` under `ft_token` / `ft_userId` / `ft_username` / `ft_role`. Dispatches `ft:logout` custom event on 401 to force logout — **401 in `api.ts` triggers this globally, so admin-action endpoints that verify password must return `403` (not `401`) for wrong password** to avoid kicking the admin out.
- The API layer is a thin fetch wrapper in `api.ts`; all server communication goes through it. Public endpoints (login, forgot/reset password) pass `isPublic = true` to skip the 401 logout handler.

### Environment Variables

All live in `server/.env`. Required for production; dev falls back to localhost/disk:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `JWT_SECRET` | JWT signing secret |
| `ADMIN_EMAIL` | Email bound to the SuperAdmin account (used for password reset) |
| `EMAIL_USER` | Gmail address used to send reset emails |
| `EMAIL_PASS` | Gmail App Password (16-char, not regular password) |
| `APP_URL` | Production base URL for reset links (e.g. `https://your-app.com`) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | Public base URL for R2 assets |

### Data Model

Six PostgreSQL tables with cascade deletes:

```
users
password_reset_tokens (user_id → users)
flows (created_by → users) → modules (created_by → users) → scenarios → test_steps
```

- **users**: `id`, `username` (unique), `password_hash` (PBKDF2 SHA-512, `salt:hash`), `role` (`admin`|`tester`), `email`, `created_at`
- **password_reset_tokens**: `token` (PK), `user_id`, `expires_at`, `used` — 1-hour expiry, single-use
- **flows**: `id`, `name`, `description`, `group_name` (sidebar grouping), `order_idx`, `created_by`
- **modules**: `id`, `flow_id`, `label`, `name`, `side` (eDS|HITS), `note`, `parallel_group`, `order_idx`, `created_by`
- **scenarios**: `id`, `module_id`, `blid`, `description`, `order_idx` — status derived from steps
- **test_steps**: `id`, `scenario_id`, `description`, `expected`, `status` (untested|pass|fail), `issue_type` (blocker|major|minor|null), `date_tested`, `ado_ticket`, `evidence_url`, `evidence_image` (URL string or JSON array of URLs), `remarks`, `order_idx`

### Role & Ownership Model

- Two roles: `admin` and `tester`. The `SuperAdmin` account (username `SuperAdmin`, role `admin`) is seeded automatically in `initDB()` using the `ADMIN_EMAIL` env var.
- **No public self-registration** — accounts are created by the admin only via `POST /api/admin/users`.
- `canEdit(owner, userId, role)` in `index.ts`: returns `true` if `role === 'admin'` OR if `owner` is null/matches userId. Every mutation route passes `req.user!.role` as the third argument.
- `isOwner(createdBy)` in `AuthContext.tsx` mirrors this: returns `true` for admins or matching userId. Frontend `canEdit` checks use `isOwner(flow.created_by)`.
- Admin password reset: `POST /api/auth/forgot-password` → token stored in DB → email sent via nodemailer → link `APP_URL/?reset_token=xxx` → `POST /api/auth/reset-password` validates token and sets new password.
- Admin recovery URL (shown on login page only when `?admin_reset` is in the URL): `yourapp.com/?admin_reset`

### State Mutation Pattern

Every write method in `AppContext.tsx` follows: call `api.*()` → on success call `loadFlows(activeFlowId)` to refetch the full nested tree. No optimistic updates or partial patches. The `expanded` set (open scenario rows) lives only in client state.

### API Routes

All defined inline in `server/src/index.ts`. All routes except the three public auth routes require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Login → `{ token, userId, username, role }` |
| POST | `/api/auth/forgot-password` | Send reset email to admin's bound email |
| POST | `/api/auth/reset-password` | Validate token + set new password |
| PUT | `/api/auth/change-password` | Authenticated user changes own password (requires current password) |
| GET | `/api/auth/me` | Verify token → current user + role |
| GET | `/api/admin/users` | List all users (admin only) |
| POST | `/api/admin/users` | Create tester account (admin only) |
| PUT | `/api/admin/users/:id/password` | Reset any user's password (admin only) |
| PUT | `/api/admin/users/:id/delete` | Delete user — requires `adminPassword` in body, returns 403 on wrong password (not 401) |
| GET | `/api/flows` | Full nested tree (flows + modules + scenarios + steps) |
| POST | `/api/flows` | Create flow |
| PUT | `/api/flows/:id` | Update flow name/group (owner or admin) |
| DELETE | `/api/flows/:id` | Delete flow cascade (owner or admin) |
| POST | `/api/flows/:flowId/modules` | Add module |
| PUT | `/api/modules/:id` | Update module fields or `order_idx` |
| DELETE | `/api/modules/:id` | Delete module cascade |
| PUT | `/api/flows/:flowId/modules/reorder` | Swap adjacent modules (transaction) |
| POST | `/api/modules/:moduleId/scenarios` | Add scenario |
| PUT | `/api/scenarios/:id` | Update scenario fields |
| DELETE | `/api/scenarios/:id` | Delete scenario + evidence cleanup |
| PUT | `/api/modules/:moduleId/scenarios/reorder` | Reorder scenarios by newIndex (full reindex transaction) |
| POST | `/api/scenarios/:scenarioId/steps` | Add test step |
| PUT | `/api/steps/:id` | Update step fields |
| DELETE | `/api/steps/:id` | Delete step + evidence cleanup |
| POST | `/api/steps/:stepId/copy` | Copy step (description + expected only) to `targetScenarioId` |
| POST | `/api/upload` | Multer upload to R2 or disk → `{ url }` |

### Key Frontend Components

| Component | Purpose |
|---|---|
| `Sidebar.tsx` | Flow list grouped by `group_name`; "Change password" link in footer triggers `ChangePasswordModal` |
| `FlowDiagram.tsx` | SVG visualization of modules with status colours, gate indicators, parallel group brackets |
| `ScenariosView.tsx` | Main test execution view — scenarios draggable to reorder, expand to show/edit steps inline |
| `BLIDDashboard.tsx` | BLID coverage metrics aggregated across the active flow |
| `DiagnosticsModal.tsx` | Runs `runDiagnostics()` — surfaces missing steps, untested steps, duplicate BLIDs, failed steps without issue type |
| `LoginPage.tsx` | Login-only (no register). "Forgot password?" visible to all; admin reset link shown only when `?admin_reset` is in the URL |
| `ResetPasswordPage.tsx` | Shown when `?reset_token=xxx` is in the URL; handles the email reset link |
| `AdminPanel.tsx` | User management modal (admin only): create/delete tester accounts, reset passwords. Delete requires typing exact username + admin password. |
| `ChangePasswordModal.tsx` | Any logged-in user can change their own password (requires current password) |
| `ConfirmModal.tsx` | Generic confirmation dialog via `useConfirm()` hook |

`App.tsx` contains `AddModuleModal` with a `QUICK` array of 15 hardcoded module templates, plus an inline SVG sprite for icons via `<use href="#i-*">`. `AdminPanel` is rendered here and toggled by `isAdmin` from `useAuth()`.

`client/src/_backup/` — ignore when making changes.

### Business Logic (`utils.ts`)

- `modStatus(mod)` → `complete | blocked | major | minor | progress | pending | empty`
- `scenarioStatus(sc)` → `'pass' | 'fail' | 'untested'`: worst-case across all steps
- `scenarioIssueType(sc)` → worst-case issue type across failed steps (blocker > major > minor)
- `modStats(mod)` → `{ pass, fail, untested, total }`: step-level counts
- `flowStats(flow)` → aggregates counts + `blidPct` + `execPct`
- `isGated(flow, modIdx)`: true if any earlier module has a blocker step
- `STATUS_META`: maps `ModuleStatus` → `{ label, cls }` with CSS classes prefixed `st-`
- `today()`: returns `"DD-Mon-YYYY"`, auto-filled on first pass/fail mark

### Evidence Image Helpers (`diagnosticsHelpers.ts`)

`evidence_image` on a step is stored as a bare URL string (legacy) or JSON array of URLs. Always use `parseImages(raw)` to read and `serializeImages(urls)` to write.

### Step Features

- **Copy step**: Each step has a Copy button. `CopyStepModal` (inside `ScenariosView.tsx`) lets the user pick any scenario from the active flow. Only `description` and `expected` are copied — no execution data.
- **Paste screenshot**: `onPaste` on the step body div captures clipboard images. A visible "Ctrl+V to paste" zone also provides a focusable paste target.

### Scenario Drag Reorder

Scenario rows are `draggable`. `ModuleCard` tracks `dragFromIdx` / `dragOverIdx`. On drop, `useConfirm()` shows: *"Move '[description]' from position X to position Y?"*. Confirmed moves call `moveScenario(moduleId, scenarioId, newIndex)` → `PUT /api/modules/:moduleId/scenarios/reorder` which does a full reindex of all `order_idx` values in a transaction.

### Export (`exportReport.ts`)

- `exportReport(flow)`: self-contained HTML file download (inline styles, print-ready)
- `exportExcel(flow)`: three-sheet XLSX (Summary, Scenarios, Steps) via `xlsx` library

### Flow Gating

A module is "gated" if any preceding module in the same flow has a step with `issue_type = 'blocker'`. `isGated()` implements this; diagram and scenario views visually block downstream modules.

### Design System

CSS design tokens in `client/src/index.css`:

```css
--bg: #f3f4f6          /* page background */
--panel: #ffffff        /* card/container */
--sidebar: #0b1b3b      /* dark sidebar */
--ink / --ink-2 / --ink-3 / --ink-4   /* text hierarchy */
--ok: #16a34a           /* pass/green */
--bad: #dc2626          /* fail/blocker/red */
--warn: #d97706         /* issue/amber */
--blue-2: #1d4ed8       /* primary accent */
--sans: 'Inter'         /* body font */
--mono: 'JetBrains Mono'  /* code/stats font */
```
