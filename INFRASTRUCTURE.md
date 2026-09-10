# Infrastructure

Quick-reference for what actually runs this app locally. For setup/run
commands see [`README.md`](README.md); for the data model see
[`SCHEMA_REFERENCE.md`](SCHEMA_REFERENCE.md).

## Services

| Service | Tech | Port | Notes |
|---|---|---|---|
| Frontend (SPA) | React 18 + TypeScript, Vite | 5173 | Static single-page app; dev server proxies `/api` to the backend |
| Backend (API) | Node.js 20 + Express + TypeScript | 4000 | REST API — JWT auth, Zod request validation, RBAC |
| Database | SQLite (local dev) / MySQL 8 (prod-ready swap) | n/a (file: `backend/prisma/dev.db`) | Accessed via Prisma ORM (`backend/prisma/schema.prisma`) |
| Background jobs | `node-cron`, in-process (no separate worker) | — | Daily reminder/escalation sweep at 08:00, runs inside the API process |

There is no separate job queue, cache, or session store — the backend is a
single stateless Express process; the "server" side of this app is just
that one process plus its SQLite/MySQL database.

## Not used (documented extension points, not wired up)

| Would replace | Status |
|---|---|
| Redis (sessions / cache / rate-limit) | Not implemented — JWT verification is stateless, no session store needed yet |
| S3 / object storage | Not implemented — Excel import files are processed in-memory (`multer.memoryStorage()`) and not persisted |
| SMTP / transactional email provider | Not implemented — reminders write real in-app notifications; "sending" email is a `console.log` placeholder |
| SSO (Azure AD / Okta / Google Workspace) | Not implemented — password login only |

See [`SCHEMA_REFERENCE.md` §10](SCHEMA_REFERENCE.md#10-whats-stubbed-vs-real--quick-index) for the full stubbed-vs-real index.

## Local dev runtime

- Project-local Node.js **v20.18.1** lives at `.tools/node/` (gitignored) —
  nothing is installed system-wide. Run any `node`/`npm`/`npx` command via
  `./nrun.sh <command>`.
- `./start.sh` / `./stop.sh` at the repo root start/stop both services in
  the background (logs to `logs/`).

## Config — `backend/.env`

| Var | Purpose | Local default |
|---|---|---|
| `DATABASE_URL` | Prisma datasource connection string | `file:./dev.db` (SQLite) |
| `JWT_SECRET` | Signs/verifies access tokens | dev placeholder — rotate before any real deploy |
| `JWT_EXPIRES_IN` | Access token lifetime | `8h` |
| `PORT` | API listen port | `4000` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |

There's no separate frontend `.env` — the SPA calls the API at a base URL
baked in at build time (dev: proxied by Vite; see `frontend/vite.config.ts`).

## Key libraries in the API layer

| Purpose | Library |
|---|---|
| ORM / DB access | Prisma |
| Excel import/export | `xlsx` (SheetJS) |
| PDF export | `pdfkit` |
| API docs | `swagger-jsdoc` + `swagger-ui-express` |
| Password hashing | `bcryptjs` |
| Auth tokens | `jsonwebtoken` |
| Scheduled jobs | `node-cron` |

## URLs (local dev)

| What | URL |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:4000 |
| API docs (Swagger UI) | http://localhost:4000/api/docs |
| Health check | http://localhost:4000/health |
