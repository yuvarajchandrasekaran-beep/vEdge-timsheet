# TimeSync

Enterprise Timesheet, Approval & Reporting Platform — built for Vivid Edge
Integration COE from `TimeSync_Functional_Technical_Specification.docx`
(v1.0, Sep 4 2026) and the attached UI mockups/logo.

This README is for the engineering/QA team picking this up. For end users,
see [`USER_MANUAL.md`](USER_MANUAL.md). For the data model, API conventions,
and what's real vs. stubbed, see [`SCHEMA_REFERENCE.md`](SCHEMA_REFERENCE.md).
For a one-page rundown of the servers/services involved, see
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md). For what shipped in each release,
see [`RELEASE_NOTES.md`](RELEASE_NOTES.md).

## 0. Database (SQLite)
How to create your own local DB:

cd backend
npx prisma db push      # creates a fresh dev.db from schema.prisma
npm run db:seed         # populates it with the same demo data yours has


## 1. What this is

A three-tier app matching the spec's architecture: a React + TypeScript SPA,
a Node.js + Express REST API enforcing all business rules and RBAC, and a
relational database via Prisma ORM. It implements every functional module in
spec Section 4 — user management with Excel bulk import, project/client/task
hierarchy with time restrictions, the weekly timesheet grid with a real-time
validation engine (plus Monthly/Fortnight period views over the same data),
single-level approval with delegation and escalation, in-app notifications
with a background reminder sweep, and a reporting module with PDF/Excel/CSV
export.

See [`SCHEMA_REFERENCE.md` §10](SCHEMA_REFERENCE.md#10-whats-stubbed-vs-real--quick-index)
for the precise list of what's fully wired up versus what's a documented
extension point (SSO, real email delivery, Redis, S3, cross-department
approval-chain overrides).

## 2. Environment notes — read this first

The machine this was built on had **no Node.js, npm, or MySQL installed**.
Two adaptations follow from that, both fully reversible and swappable:

1. **A project-local Node.js runtime** lives at `.tools/node/` (not committed
   — see `.gitignore`). Nothing was installed system-wide. Use the wrapper
   script `./nrun.sh <command>` to run any `node`/`npm`/`npx` command with
   that runtime on `PATH`, e.g. `./nrun.sh npm install`. If your own machine
   already has Node 20+ on `PATH`, you can ignore `nrun.sh` entirely and just
   run `npm ...` directly — everything below shows the `nrun.sh` form for
   portability, drop the prefix if you don't need it.
2. **SQLite instead of MySQL** for local development. The spec's stated
   database requirement is MySQL; the schema was written to be
   MySQL-compatible from the start (plain relational tables, no
   SQLite-specific features) — switching providers is a two-line change. See
   [`SCHEMA_REFERENCE.md` §3](SCHEMA_REFERENCE.md#3-why-sqlite-and-how-to-move-to-mysql).

## 3. Repo layout

```
timsheet/
  .tools/node/            local Node.js runtime (gitignored)
  nrun.sh                 ./nrun.sh <cmd> — runs <cmd> with the local Node on PATH
  start.sh / stop.sh      start/stop both services (see §6); logs to logs/, gitignored
  backend/                Express + TypeScript + Prisma API (port 4000)
    prisma/schema.prisma  data model (see SCHEMA_REFERENCE.md)
    prisma/seed.ts        demo data (personas/projects/hours matching the mockup)
    src/routes/           one file per resource, each with @swagger annotations
    src/services/         validation engine, approval routing, reports, Excel import
    src/middleware/       auth, RBAC, upload, response normalization
    src/jobs/scheduler.ts reminder/escalation background sweep (node-cron)
  frontend/               React + TypeScript + Vite SPA (port 5173)
    src/pages/            one file per screen (Dashboard, Timesheets, Approvals, ...)
    src/components/       shared UI + per-feature modals
    src/hooks/             one file per resource — React Query hooks calling the API
    src/api/client.ts      axios instance, auth header injection, 401 handling
  README.md               this file
  USER_MANUAL.md          end-user guide
  SCHEMA_REFERENCE.md      data model, API conventions, extension points
  RELEASE_NOTES.md        version history, newest first
```

## 4. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, React Router, TanStack React Query, Tailwind CSS, Recharts |
| Backend | Node.js + Express + TypeScript, Zod validation, JWT auth (bcrypt password hashing) |
| ORM / DB | Prisma ORM over SQLite (dev) / MySQL 8 (production-ready swap) |
| Excel import/export | SheetJS (`xlsx`) |
| PDF export | `pdfkit` |
| API docs | `swagger-jsdoc` + `swagger-ui-express`, generated from route annotations |
| Background jobs | `node-cron` (reminder/escalation sweep) |

This follows the spec's Section 6.1 recommendation (React+TS / Node+Express /
MySQL) with Express in place of NestJS — a plain choice made for this build to
keep the codebase small and readable; the spec explicitly leaves the backend
framework "open for confirmation" (spec 12.2).

## 5. First-time setup

From the repo root:

```bash
# 1. Backend: install deps, create + seed the local database
cd backend
../nrun.sh npm install
../nrun.sh npx prisma generate
../nrun.sh npx prisma db push       # creates backend/prisma/dev.db
../nrun.sh npm run db:seed          # loads demo users/clients/projects/timesheets

# 2. Frontend: install deps (separate terminal / after backend is set up)
cd ../frontend
../nrun.sh npm install
```

## 6. Running it

**Easiest: the start/stop scripts** — from the repo root:

```bash
./start.sh   # starts both services in the background, waits until both respond, prints the URLs
./stop.sh    # stops both
```

`start.sh` is idempotent (safe to run again — it detects a service already
listening on its port and leaves it alone) and logs each service to
`logs/backend.log` / `logs/frontend.log`. `stop.sh` kills whatever is
actually listening on ports 4000/5173, so it works even if a service was
started some other way. Both scripts assume first-time setup (§5) has
already been run at least once (i.e. `node_modules` installed and the
database seeded) — they don't install dependencies or seed data themselves.

**Manual: two processes, two terminals** (useful when you want each
service's logs streaming directly in its own terminal, e.g. while actively
developing):

```bash
# Terminal 1 — API on http://localhost:4000
cd backend && ../nrun.sh npm run dev

# Terminal 2 — SPA on http://localhost:5173 (proxies /api to :4000)
cd frontend && ../nrun.sh npm run dev
```

Either way: open `http://localhost:5173` and log in with any seed account
(see §8). API docs (Swagger UI) are at `http://localhost:4000/api/docs`; the
raw OpenAPI JSON is at `http://localhost:4000/api/docs.json`. A basic
liveness check is at `http://localhost:4000/health`.

### Production-style build

```bash
cd backend && ../nrun.sh npm run build && ../nrun.sh npm start   # compiles to dist/, runs node dist/index.js
cd frontend && ../nrun.sh npm run build                          # outputs frontend/dist/ static assets
```

The frontend build is static output — serve it from any static host or a
reverse proxy in front of the API; there's no server-side rendering.

Frontend npm scripts: `npm run dev` (Vite dev server), `npm run build`
(`tsc -b && vite build` — type-checks as part of the build), `npm run preview`
(serve the production build locally), `npm run lint` (ESLint).

### Docker

Both apps have a multi-stage `Dockerfile` for container-based deployment
(see `TimeSync_GCP_Deployment_Infrastructure.pdf` for the full target cloud
architecture these are built for):

- `backend/Dockerfile` — builds and runs the compiled API on Node 20. The
  build stage rewrites the Prisma datasource from `sqlite` to `mysql` (only
  inside the image — `backend/prisma/schema.prisma` in the repo is
  untouched), since this container is meant to run against a real MySQL
  instance, not the local `dev.db` file. Listens on `8080`; needs
  `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` set as env vars (or, for a
  cloud deploy, mounted from a secrets manager — see the PDF §5).
- `frontend/Dockerfile` — builds the static Vite bundle, then serves it via
  nginx. `docker-entrypoint.sh` requires a `BACKEND_URL` env var at container
  start (e.g. `https://timesync-backend-xxxxx.a.run.app`) and substitutes it
  into `nginx.conf.template` so the container can reverse-proxy `/api/*` to
  the backend without a separate load balancer. Also listens on `8080`.

Build/run either one locally with the standard `docker build`/`docker run`
commands; there's no `docker-compose.yml` in the repo, so running both
together means starting each container and pointing the frontend one's
`BACKEND_URL` at the backend one's address.

## 7. Backend npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the API with hot reload (`tsx watch`) |
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the compiled build (`node dist/index.js`) |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:push` | Sync `schema.prisma` to the database (no migration history — fine for dev) |
| `npm run db:seed` | Re-run the demo data seed (idempotent — safe to run repeatedly) |
| `npm run db:reset` | **Destructive**: drops and recreates the database, then seeds. Prisma will prompt for explicit confirmation before running this against any database — never run it against anything but a disposable local dev database. |

> Why `tsx` instead of `ts-node`: this build uses TypeScript 7, which changed
> internal compiler APIs that `ts-node`/`ts-node-dev` (last updated for
> TypeScript 5) depend on — running either against TS7 throws
> `Cannot read properties of undefined (reading 'fileExists')`. `tsx` uses
> esbuild for transpilation instead of the TypeScript compiler API, so it
> isn't affected. `tsc` itself (used for `build`/`typecheck`) works fine on
> TS7 — only the ts-node family broke.

## 8. Demo accounts

Seeded by `backend/prisma/seed.ts`. Password for every account:
**`Password123!`**

| Email | Role | Name |
|---|---|---|
| bdasari@vivid-edge.com | Super Admin | Bhaskar Dasari |
| jeff.cockman@vivid-edge.com | Super Admin | Jeff Cockman |
| shibani.gandhi@vivid-edge.com | HR Admin | Shibani Gandhi |
| ramesh.natarajan@vivid-edge.com | Project Admin (approver) | Ramesh Natarajan |
| ramakrishna.avalur@vivid-edge.com | Individual User | Ramakrishna Avalur |
| ravi.angara@vivid-edge.com | Individual User | Ravi Angara |
| raghu.muniyappa@vivid-edge.com | Individual User | Raghu Muniyappa |
| steven.dsouza@vivid-edge.com | Individual User | Steven Dsouza |
| indira.chunduri@vivid-edge.com | Individual User | Indira Chunduri |
| krishna.sindhuja@vivid-edge.com | Individual User | Krishna Sindhuja |
| yuvaraj.chandrasekaran@vivid-edge.com | Individual User | Yuvaraj Chandrasekaran |

Log in as **Ramakrishna Avalur** to see a populated current-week timesheet.
Log in as **Ramesh Natarajan** to see a populated approval queue (approval is
single-level — Project Admin only, with Super Admin as a fallback; HR Admin
does not approve timesheets). The demo login screen's account-picker panel lists
all eleven (kept in sync with this table by hand — see
`frontend/src/data/demoAccounts.ts`, which is the one piece of user data not
sourced from the API).

Projects/clients: the original 5 (Vivid Edge ERP, FinOps Platform, Mobile App
Revamp, Data Migration, Internal Tools) plus 6 example client engagements
(Vodacom — Support, SaaS Project; Solstice — Demo Agent Development;
ServiceNow — BCM Agent, BIA Agent; Nucor Corp — DR), all administered by
Ramesh Natarajan with the individual users spread across them as team
members.

## 9. Environment variables

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Default (dev) | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Swap to a `mysql://...` DSN for production (see SCHEMA_REFERENCE §3) |
| `JWT_SECRET` | dev placeholder | **Rotate before any real deployment** |
| `JWT_EXPIRES_IN` | `8h` | |
| `PORT` | `4000` | |
| `CORS_ORIGIN` | `http://localhost:5173` | Set to the deployed frontend origin in production |

The frontend has no required environment variables in dev — Vite's dev server
proxies `/api/*` to `http://localhost:4000` (see `frontend/vite.config.ts`).
For a production build served separately from the API, configure the API base
URL at build time (see `frontend/src/api/client.ts`).

## 10. Known limitations / where to look before extending

This is covered in full in
[`SCHEMA_REFERENCE.md` §10](SCHEMA_REFERENCE.md#10-whats-stubbed-vs-real--quick-index),
but the short version: authentication, RBAC, the timesheet grid + validation
engine, single-level approval, Excel bulk import, and reporting/export are
fully functional end to end. SSO, real outbound email/Slack/Teams delivery, Redis,
and S3-backed file storage are documented extension points, not implemented —
none of the spec's core workflows depend on them, but they're needed before a
real production rollout (spec Sections 9–11).

## 11. Testing this build

There is no automated test suite yet (out of scope for this initial build).
To verify the core flows manually:

1. Log in as **Ramakrishna Avalur** → Timesheets → confirm the seeded week
   loads, edit an hour cell, confirm the autosave indicator updates, try
   entering a value that exceeds a project's hour cap (blocking) or logging
   >8h with no note (blocking at submit) to see the validation engine react.
2. Submit the week, then log in as **Ramesh Natarajan** → Approvals →
   approve or reject (rejection requires a comment) Ravi Angara's or Raghu
   Muniyappa's pending timesheet — this is the final decision, since approval
   is single-level.
3. As Shibani Gandhi or Bhaskar Dasari, go to Users → Bulk Upload, download the
   template, fill in a row or two (including one intentionally invalid row),
   upload it, and confirm the dry-run preview flags Valid/Warning/Error
   correctly before committing.
4. Go to Reports, generate the Project Utilization report, and export it as
   PDF, Excel, and CSV.

## 12. Attribution

Built from `TimeSync_Functional_Technical_Specification.docx` (Vivid Edge
Integration COE, Solution Architecture Team, v1.0, Sep 4 2026), the attached
nine-screen UI mockup, and the Vivid Edge Integration COE logo
(`frontend/public/brand/logo.svg`). Brand colors (`#1B4298` deep blue,
`#00AEEF` cyan) are sampled from the logo and used as the app's design tokens.
