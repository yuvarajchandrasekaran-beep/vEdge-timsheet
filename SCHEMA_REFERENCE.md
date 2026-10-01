# TimeSync — Schema & API Reference

Audience: engineers extending TimeSync, or anyone doing solution design for a
future phase. This is the living technical reference for the data model and
API surface; it supersedes the prose descriptions in the original functional
spec wherever the two differ (this document reflects what's actually built).

Source of truth for the data model is
[`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) — this document
explains and cross-references it, but if the two ever disagree, the schema
file wins. Source of truth for the API is the generated OpenAPI spec served at
`/api/docs` (Swagger UI) and `/api/docs.json` (raw spec) — every route carries
a `@swagger` JSDoc block in `backend/src/routes/*.ts`, so the docs cannot drift
out of sync with the implementation.

---

## 1. Entity-relationship overview

```mermaid
erDiagram
    ROLE ||--o{ USER : has
    DEPARTMENT ||--o{ USER : has
    USER ||--o{ USER : manages
    CLIENT ||--o{ PROJECT : has
    PROJECT ||--o{ PROJECT_TASK : has
    PROJECT ||--o{ PROJECT_MEMBER : has
    USER ||--o{ PROJECT_MEMBER : "assigned via"
    USER ||--o{ PROJECT : "administers"
    USER ||--o{ TIMESHEET : owns
    TIMESHEET ||--o{ TIMESHEET_ENTRY : contains
    PROJECT_TASK ||--o{ TIMESHEET_ENTRY : "logged against"
    TIMESHEET ||--o{ APPROVAL : "acted on by"
    USER ||--o{ APPROVAL : "acts as approver"
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ AUDIT_LOG : "acted as"
    USER ||--o{ IMPORT_BATCH : uploads
    USER ||--o{ DELEGATION : "delegates from"
    USER ||--o{ DELEGATION : "delegates to"
    DEPARTMENT ||--o{ HOLIDAY : scopes
```

## 2. Tables

All tables below are defined in `schema.prisma`. Column names shown are the
Prisma field names (camelCase); the underlying SQLite/MySQL column names are
identical since no `@map` overrides are used on fields (only table names are
mapped via `@@map`, to `snake_case` plural table names).

### `roles`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| name | String, unique | One of `SUPER_ADMIN`, `HR_ADMIN`, `PROJECT_ADMIN`, `INDIVIDUAL_USER` |

### `departments`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| name | String | Display name |
| code | String, unique | Short code, e.g. `ENG` |

### `users`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| employeeId | String, unique | e.g. `VE-1001` |
| name | String | |
| email | String, unique | Login identifier |
| passwordHash | String | bcrypt, 10 rounds |
| roleId | FK → roles | |
| departmentId | FK → departments, nullable | |
| jobTitle | String, nullable | |
| managerId | FK → users, nullable | Self-referencing; org-chart metadata, **not** used for approval routing — see §5 |
| status | String | `Active` \| `Inactive` |
| startDate | DateTime, nullable | |
| timezone | String | Default `Asia/Kolkata` |
| location | String, nullable | |
| createdAt / updatedAt | DateTime | |

### `clients`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| name | String, unique | |
| status | String | `ACTIVE` \| `INACTIVE` |

Clients are managed from the frontend's **Projects → Clients** tab (list +
"New Client" create modal, backed by `GET /clients` / `POST /clients`) —
there's no dedicated top-level "Clients" nav item; it lives as a tab
alongside Projects since a client only ever matters in the context of
picking one for a project. There is no `PATCH`/`DELETE /clients/:id` yet — a
client, once created, can't be edited or deactivated from the UI (only its
`status` default of `ACTIVE` at creation time can be overridden). Adding
those endpoints plus an edit action on the Clients tab is a natural next
increment if that's needed.

### `projects`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| clientId | FK → clients | |
| code | String, unique | e.g. `ERP-01` |
| name | String | |
| description | String, nullable | |
| startDate / endDate | DateTime | `endDate` nullable = open-ended |
| status | String | `ACTIVE` \| `ON_HOLD` \| `ARCHIVED` \| `COMPLETED` |
| billingType | String | `T_AND_M` \| `FIXED` \| `MANAGED_SERVICES` — the contract type |
| sendTimesheetToClient | Boolean, default false | Unlocks the "Send timesheet to client" flow (see `client_timesheet_sends` below) |
| clientContactEmail | String, nullable | Default recipient offered on the client-send review page — editable per send |

There is **no `budgetHours` column and no `projectAdminId` column** on this
table:

- **Budget hours are rolled up bottoms-up** from `project_tasks.estimatedHours`
  (summed by `utils/projectHours.ts`'s `sumEstimatedHours`, exposed as the
  computed `budgetHours` field on every project API response) rather than
  entered top-down on the project. Billable/non-billable is likewise no
  longer a project-level flag — it's `project_tasks.billable`, since a
  project can mix billable and non-billable work.
- **A project can have more than one admin.** There's no singular
  `projectAdminId` FK; instead, admins are `project_members` rows with
  `roleOnProject = "Project Admin"` (see below) — zero or more per project,
  enforced to be at least one by the API (`POST /projects` requires
  `adminIds`, and `DELETE /projects/:id/members/:userId` refuses to remove
  the last remaining admin).

> The original spec's prose (Section 4.2.1) lists a 5th project status,
> "Planning". It was dropped in favor of the 4-value set above to match the
> project form actually shipped in the frontend, which doesn't surface a
> Planning option; "Closed" was renamed to `ARCHIVED` for the same reason.
> Re-adding Planning is a matter of adding it back to both
> `constants/enums.ts`'s `PROJECT_STATUS` and the frontend's `ProjectStatus`
> type + status dropdown (`ProjectsPage.tsx`, `ProjectDetailModal.tsx`).

**Deleting a project** (`DELETE /projects/:id`, Super Admin only) cascades:
it deletes every `TimesheetEntry` logged against the project's tasks, every
`Approval` on any timesheet that had such an entry, the project's
`ProjectTask` and `ProjectMember` rows, and finally the project itself — in
that order, because SQLite enforces the FK from `TimesheetEntry.projectTaskId`
and `Approval.timesheetId`, so deleting a task or timesheet with surviving
children fails with an unhelpful 500 (this was an actual reported bug: "delete
project isn't working," root-caused to exactly this — the original handler
deleted tasks before clearing the entries that referenced them). This is a
real hard delete of historical time and approval data, which is a meaningful
product tradeoff: it makes the delete button always work, at the cost of
being able to destroy compliance-relevant history with one click and no
soft-delete/undo. For a project that has ever had real time logged against
it, set its status to `ARCHIVED` instead (read-only for new entries, stays in
reports) — reserve delete for projects created by mistake. Hardening this for
a real deployment likely means either blocking delete outright once any
`TimesheetEntry` exists (return 409 with a clear message) or introducing a
soft-delete (`deletedAt` column) instead of a hard cascade.

### `project_tasks` (sub-tasks / sub-projects)
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| projectId | FK → projects | |
| name | String | |
| startDate / endDate | DateTime, nullable | Independent of the parent project's window (spec 4.2.1) |
| estimatedHours | Float, nullable | Rolls up into the parent project's computed `budgetHours` — see `projects` above |
| billable | Boolean, default `true` | Billable/non-billable is a per-task flag, not a project-level one |
| active | Boolean | Independent inactive flag, checked by the validation engine |

Tasks can be created inline while creating a project (`POST /projects`'s
`tasks[]`) or added later from a project's **Tasks** tab
(`POST /projects/:id/tasks`) — both accept `billable` and `estimatedHours`.

### `project_members` (assignment, admin role + time restrictions)
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| projectId | FK → projects | |
| userId | FK → users | |
| roleOnProject | String | `Project Admin` \| `Member` — a project may have several `Project Admin` rows |
| maxHoursPerDay | Float, nullable | Enforced by the validation engine |
| maxHoursPerWeek | Float, nullable | Enforced by the validation engine |
| isFavorite | Boolean | Pins the row to the top of the weekly grid's type-ahead |
| — | unique(projectId, userId) | A user has at most one membership row per project |

This is also how project admins are modeled — **not** a singular FK on
`projects`. `POST /projects` takes `adminIds: number[]` (any user, not just
users with the `PROJECT_ADMIN` role — searched via the frontend's
`UserMultiSelectTypeahead`) and creates one `Project Admin` row per id;
`POST /projects/:id/members` with `roleOnProject: "Project Admin"` adds one
later. `utils/scope.ts`'s `assertProjectScope` and the approval routing (§5)
both check this table rather than a scalar field.

### `timesheets` (one per user per week)
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| userId | FK → users | |
| weekStartDate | DateTime | Always a UTC-midnight Monday — see §6 "Dates are UTC-normalized" |
| status | String | `DRAFT` \| `SUBMITTED` \| `APPROVED` \| `REJECTED` \| `RECALLED` |
| weekNotes | String, nullable | Free-text "notes for the week" — also doubles as the Monthly/Fortnight views' period-level comments box, written to every week in the period |
| submittedAt | DateTime, nullable | |
| — | unique(userId, weekStartDate) | |

The Monthly and Fortnight *views* are a frontend-only aggregation — there is
no separate "period" table. A calendar month or fortnight is just several of
these weekly rows rendered together; `POST /timesheets/submit-batch` submits
several at once, but each is still approved independently (§5).

### `timesheet_entries` (one row per project/task per day)
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| timesheetId | FK → timesheets | |
| projectTaskId | FK → project_tasks | |
| entryDate | DateTime | UTC-midnight calendar date |
| hours | Float | |
| notes | String, nullable | |
| — | unique(timesheetId, projectTaskId, entryDate) | One cell per (task, day) per timesheet |

### `approvals` (append-only trail; one row per action)
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| timesheetId | FK → timesheets | |
| level | Int | Always `1` now — vestigial column kept for existing history rows from before approval was simplified to a single level |
| approverId | FK → users | |
| action | String | `APPROVED` \| `REJECTED` |
| comment | String, nullable | Required by the API on reject, optional on approve |
| actedAt | DateTime | |

Note this table is never updated or deleted in normal operation — a rejection
followed by resubmission and re-approval produces multiple rows, giving a
complete history (spec 7.1's "one row per level acted on... without
overwriting history").

### `delegations`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| fromUserId / toUserId | FK → users | |
| startDate / endDate | DateTime | |
| active | Boolean | |

Managed via `routes/delegations.ts` (`POST/GET /delegations`, `DELETE
/delegations/{id}` — soft-deletes by setting `active=false`, so revoked
delegations stay in the history). A delegate must already hold the Project
Admin or Super Admin role, since that's what `doApprove`/`doReject` require
regardless of `approverIds` membership.

`services/approvalRouting.ts#resolveApprover` reads this table and folds in
anyone with an **active** delegation (`active=true`, today between
`startDate` and `endDate`) from one of a timesheet's real approvers — added
to `approverIds`, not swapped in, so the original approver can still act too.
That same `approverIds` set is what both the Pending-tab query and
`doApprove`/`doReject`'s authorization check use, so a delegate automatically
sees delegated timesheets in their own Approvals inbox and can act on them —
no separate "acting on someone else's behalf" UI or impersonation needed.

### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| userId | FK → users | |
| type | String | e.g. `SubmissionReminder`, `PendingApproval`, `EscalationAlert`, `Rejection`, `FinalApproval` |
| title / message | String | |
| payload | String, nullable | JSON-encoded extra context (e.g. `{ timesheetId }`) |
| readAt | DateTime, nullable | |
| createdAt | DateTime | |

### `notification_rules`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| scope | String | `Global` \| `Department` \| `Project` |
| scopeId | Int, nullable | |
| type | String | Trigger type, or `ScheduledReport:<reportKey>` for report schedules |
| cadenceConfig | String | JSON-encoded, shape depends on `type` |

**Extension point:** `jobs/scheduler.ts`'s daily sweep currently uses hardcoded
cadence/threshold constants rather than reading `notification_rules` — the
table exists and is CRUD-able via `/settings/notification-rules`, but the
scheduler doesn't consult it yet. Wiring that up is required before Section
4.5.2's "configure cadence... globally or per department" is fully real.

### `audit_logs` (immutable)
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| actorId | FK → users, nullable | Null = system-initiated |
| entityType | String | e.g. `User`, `Project`, `Timesheet` |
| entityId | Int, nullable | |
| action | String | e.g. `Create`, `Update`, `Approve`, `Reject`, `BulkImport` |
| beforeState / afterState | String, nullable | JSON-encoded snapshots |
| createdAt | DateTime | |

### `import_batches`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| type | String | `Users` \| `Projects` |
| uploadedById | FK → users | |
| fileName | String | |
| totalRows / successRows / errorRows | Int | |
| errorReport | String, nullable | JSON array of `{ row, errors[] }` |
| createdAt | DateTime | |

### `holidays`
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| name | String | |
| date | DateTime | |
| departmentId | FK → departments, nullable | Null = org-wide |

Maintained from `/holidays` (HR Admin & Super Admin only; everyone else gets
read access, since `validateWeekSubmission` needs it to warn on holiday
entries for any user). `services/usFederalHolidays.ts`'s
`computeUsFederalHolidays(year)` computes the 11 US federal holidays for a
given year — including the standard weekend-observance shift (Saturday →
preceding Friday, Sunday → following Monday) — and `POST
/holidays/sync-federal` upserts whatever's missing for that year. The seed
script calls this for the current and next year so a fresh clone has holiday
warnings working immediately.

### `client_timesheet_sends` (append-only send history)
| Column | Type | Notes |
|---|---|---|
| id | Int PK | |
| projectId | FK → projects | |
| sentById | FK → users | |
| recipientEmail | String | Asked again at send time, pre-filled from `projects.clientContactEmail` |
| periodStart / periodEnd | DateTime | The reviewed date range |
| entryIds | String | Comma-separated `timesheet_entries.id` list — the exact entries sent, used to regenerate the file on download |
| entryCount | Int | |
| totalHours | Float | |
| fileName | String | |
| createdAt | DateTime | |

Written by `POST /projects/:id/client-send` (Project Admin of that project,
or Super Admin). There's no live email provider wired up in this build (see
README "Swap points") — "sending" is a logged placeholder, same pattern as
`notify.ts`, but the row above and the file itself are real: `GET
/client-sends/:id/download` regenerates the exact `.xlsx` from the recorded
`entryIds` on demand rather than storing the file's bytes.

### `organization_settings` / `approval_chain_configs`
Singleton-ish configuration tables backing `/settings/organization` and
`/settings/branding`. `approval_chain_configs` still exists (kept for its
historical rows) but is no longer written to or read by
`services/approvalRouting.ts` — approval is now a fixed single level (Project
Admin, with Super Admin as a standing fallback; see §5), not a configurable
chain. `GET /settings/approval-chains` is a read-only endpoint describing
that fixed model for the Settings screen.

---

## 3. Why SQLite, and how to move to MySQL

The spec's stated requirement is MySQL. This build runs on SQLite locally
because the target machine had no MySQL server and the goal was a
zero-install developer experience (see README "Environment notes"). The
schema was written to be MySQL-compatible from day one:

1. In `backend/prisma/schema.prisma`, change `datasource db { provider =
   "sqlite" }` to `provider = "mysql"`.
2. Point `DATABASE_URL` at a real MySQL 8 instance, e.g.
   `mysql://user:password@host:3306/timesync`.
3. Run `npx prisma db push` (or set up `prisma migrate` for versioned
   migrations, recommended once there's a real environment to promote
   through).
4. Optional cleanup once on MySQL: the enum-like `String` columns (`role.name`,
   `timesheet.status`, `project.status`, `project.billingType`,
   `project_members.roleOnProject`, `approval.action`, `user.status`) can be
   promoted to native Prisma `enum`
   types, since SQLite doesn't support them but MySQL does. This is cosmetic —
   application code already treats these as closed sets via
   `src/constants/enums.ts`.

No application code depends on SQLite-specific behavior.

---

## 4. Auth & RBAC

- JWT access token (`Authorization: Bearer <token>`), 8h expiry, signed with
  `JWT_SECRET`. Payload is a flat `{ id, employeeId, name, email, role,
  departmentId }` — see `middleware/auth.ts`.
- No refresh-token rotation is implemented (spec 6.1 mentions "access/refresh
  tokens"); the current build re-authenticates by logging in again after
  expiry. Adding a refresh-token table/endpoint is a straightforward addition
  when session length becomes a real product requirement.
- Every route declares its allowed roles via `requireRole(...)` — enforced
  server-side, never inferred from the frontend, per spec 9.1.
- Project-level scoping: a `PROJECT_ADMIN` can only mutate projects/tasks/
  members where they hold a `project_members` row with
  `roleOnProject = "Project Admin"` — enforced in `utils/scope.ts`'s
  `assertProjectScope`, used by every project/task/member write route. A
  project can have several such admins.
- SSO (Azure AD / Okta / Google Workspace) is **not implemented** — spec 11
  calls this out as needing a final provider decision before it can be built;
  the auth module is isolated enough (`routes/auth.ts` + `middleware/auth.ts`)
  that adding an OAuth/SAML strategy alongside password login doesn't require
  touching the rest of the app. Don't confuse this with **Sign in with
  Google** (`POST /auth/google`, `google-auth-library`), which *is*
  implemented — it's a per-user alternate credential that verifies a Google
  ID token and links to an existing TimeSync account by matching email, not
  directory-level SSO: it doesn't provision accounts, sync roles, or accept
  every Google Workspace user, and it's inert unless `GOOGLE_CLIENT_ID` (and
  the frontend's `VITE_GOOGLE_CLIENT_ID`) is configured.

## 5. Approval routing (as actually implemented)

Approval is single-level: every timesheet is reviewed and approved by a
**Project Admin**, full stop — there is no second/final tier, and HR Admin
has no approval role at all. `services/approvalRouting.ts`'s
`resolveApprover` computes the approver set per timesheet rather than reading
a fixed org chart:

- The approver set = the admin(s) — plural; a project can have several — of
  the project referenced by the most entries on the timesheet (if a week
  spans several projects with different admins, this "most-frequent project"
  pick is a simplification worth revisiting). Any one of that project's
  admins may act; `resolveApprover` returns `approverIds: number[]` rather
  than a single id.
- **Self-approval**: if the submitting user *is* one of the resolved admins
  for their winning project (i.e., a Project Admin submitting their own time
  on a project they administer), the timesheet is auto-approved at submit
  time (comment: "Auto-approved: submitter is a Project Admin for all logged
  projects.") — see `performSubmit` in `routes/timesheets.ts`. Note this
  fires even if the project has *other* co-admins too — "the Project Admin
  is alone entering time" is interpreted here as "the submitter is one of
  the project's admins," not "the submitter is literally the only person who
  has ever logged time on it." A stricter reading is a small change to
  `resolveApprover`'s `selfAdministered` calculation if the looser one turns
  out to be wrong in practice.
- **Super Admin** can always act as a fallback approver on any timesheet
  (`doApprove`/`doReject` in `routes/approvals.ts` special-case the
  `SUPER_ADMIN` role), and is who `jobs/scheduler.ts`'s reminder sweep
  escalates to when a timesheet has no resolvable Project Admin or has been
  pending too long.
- `manager_id` on `users` is **not** used for approval routing — it's
  descriptive org-chart data only, surfaced in the user profile.

`approval_chain_configs` still exists as a table (kept for its historical
rows) and `GET /settings/approval-chains` still exists as a read-only
endpoint describing this fixed model, but there is no more `PUT` — nothing
about the approval chain is configurable anymore; it's intentionally fixed
to "Project Admin, with Super Admin as a standing fallback."

## 6. Validation engine

`services/timesheetValidation.ts` implements spec 4.3.2 exactly: for a set of
`{ projectTaskId, entryDate, hours, notes }` inputs, it returns per-entry
issues tagged `blocking` or `warning`:

| Code | Severity | Rule |
|---|---|---|
| `NOT_ASSIGNED` | blocking | User has no `project_members` row for the task's project |
| `PROJECT_CLOSED` | blocking | Project status is `Closed`/`Completed` |
| `TASK_INACTIVE` | blocking | `project_tasks.active` is false |
| `OUTSIDE_PROJECT_WINDOW` | blocking | Entry date outside `project.startDate`/`endDate` |
| `OUTSIDE_TASK_WINDOW` | blocking | Entry date outside the task's own window (independent of the project's) |
| `NOTE_REQUIRED` | blocking | Hours > 8 on one entry with no note |
| `DAILY_CAP_EXCEEDED` / `WEEKLY_CAP_EXCEEDED` | blocking | Exceeds `project_members.maxHoursPerDay` / `maxHoursPerWeek` |
| `HIGH_DAILY_TOTAL` | warning | Cross-project daily total > 12h (confirm-to-proceed, non-blocking) |

`PUT /timesheets/me/{weekStart}` (autosave) persists every entry **except**
ones with a blocking issue, and returns `rejectedEntries` so the UI can show
which cells didn't save and why. `POST /timesheets/{id}/submit` re-validates
the full week and refuses to submit (400, `VALIDATION_BLOCKED`) if any
blocking issue remains — matching spec 4.3.2's "Blocking at submit" row for
the missing-note case.

**Submit-time-only checks** (`validateWeekSubmission`, `hasRequiredComment` /
`commentRequiredIssue`) run in addition to the table above, but deliberately
*not* on the autosave PUT — they'd otherwise block drafting mid-week before
the whole picture is in:

| Code | Severity | Rule |
|---|---|---|
| `WEEKLY_MAX_EXCEEDED` | blocking | Week total > `WEEKLY_HOUR_POLICY.MAX_HOURS` (70h) — cannot submit until fixed |
| `WEEKLY_HIGH_TOTAL` | warning | Week total > `WEEKLY_HOUR_POLICY.WARNING_THRESHOLD` (50h) — "double check before submitting," can still submit |
| `HOLIDAY_ENTRY` | warning | Any submitted entry falls on a `holidays` row — "is this legit," can still submit |
| `COMMENT_REQUIRED` | blocking | No entry has a note AND no week has `weekNotes` set, anywhere in the submission |

Under or over the 40h standard week is deliberately **not** flagged either
way — see `constants/enums.ts`'s `WEEKLY_HOUR_POLICY`.

`COMMENT_REQUIRED` is evaluated once across the **whole submission batch**,
not per week: `POST /timesheets/submit-batch` (used by the Monthly/Fortnight
views to submit several weeks together) unions every week's entries and
`weekNotes` before checking, so one comment anywhere in the batch satisfies
it for every week in that batch. A single-week `POST
/timesheets/{id}/submit` checks only that week's own entries/notes. All
other submit-time checks (weekly max/high-total, holiday) are still
evaluated per week even inside a batch submit.

**Dates are UTC-normalized.** Every date-only value (`weekStartDate`,
`entryDate`, import file dates) is stored and compared as UTC midnight. Do not
introduce `new Date()` + local `getHours`/`setHours`/`getDate`/`setDate`
arithmetic when computing "today" or "this week" server-side — mixing a
locally-zeroed "now" against UTC-midnight-stored dates silently produces
off-by-one-day mismatches on any server not running in UTC (this was an actual
bug caught during this build — see `routes/dashboard.ts`'s and
`jobs/scheduler.ts`'s `mondayOf()` for the correct pattern, using
`Date.UTC(...)` and `getUTCDay`/`setUTCDate`).

## 7. Reports

`services/reports.ts` implements the six standard reports from spec 4.6.1
(`timesheet-summary`, `project-utilization`, `approval-compliance`,
`missing-timesheets`, `overtime`, `audit-trail`) plus a seventh,
`client-audit` (added post-spec — see below), as plain functions returning
row arrays, filtered by `dateFrom/dateTo/clientId/projectId/departmentId/
userId/status`. `routes/reports.ts` serves the same data as JSON
(`GET /reports/{key}`) or as a file (`GET /reports/{key}/export?format=`):

`GET /reports/{key}` returns project-utilization-shaped data
(`getUtilizationOverview`) only for `reportKey === "project-utilization"`,
since that's the one report with dedicated donut/trend charts. Every other
report key returns its real rows directly from `getReportData` — the same
rows the export produces — and `ReportsPage.tsx` renders them with a
`GenericReportTable` whose columns are derived from the row data itself
(`humanizeHeader`/`formatReportCell` in `frontend/src/utils/format.ts`,
mirroring `services/pdfTable.ts`'s header overrides so the labels match
between the on-screen table and the PDF/Excel/CSV export exactly).
`client-audit` (below) is the one exception — it has its own dedicated
on-screen shape (`getClientAuditReport`) rather than going through either of
these paths.

**`client-audit`** — a client-submittable "proof of hours" report, added on
request rather than from the original spec. It requires `clientId` (both
`GET /reports/client-audit` and its `/export` return 400 without one — there
is no "all clients" mode, unlike every other report key). Two different
functions back it, deliberately not sharing one row shape:
- `getClientAuditReport` (`services/reports.ts`) — powers the on-screen
  preview via `GET /reports/client-audit`, which branches away from the
  logic above (both the chart-shaped and generic-table paths) before either
  is reached. Returns a real hierarchical
  structure (`ClientAuditReport` in `frontend/src/types/index.ts`): client →
  projects → resources, with hours and entry counts aggregated per resource
  per project. Rendered by `ClientAuditSection` in `ReportsPage.tsx`.
- The `"client-audit"` case in `getReportData` — powers `/export` only.
  Returns one row per individual `TimesheetEntry` (client, project,
  projectCode, employeeId, employee, role, task, date, hours,
  timesheetStatus, notes), sorted by project then employee then date. This is
  intentionally more granular than the on-screen aggregation: an "audit
  trail" export needs to trace back to individual logged entries, not just
  resource totals, so exporting the same aggregated shape the screen shows
  would be a regression if someone later "simplifies" this to reuse one
  function for both.

Both respect the Project Admin auto-scoping in `routes/reports.ts` (a
Project Admin owning exactly one project gets `filters.projectId` set
automatically) — a Project Admin who manages projects across multiple
clients still must pick one client explicitly, same as everyone else.

- `csv` — hand-rolled (`services/excel.ts#rowsToCsv`), no dependency needed.
- `xlsx` — via SheetJS (`services/excel.ts#buildWorkbookFromRows`), real
  spreadsheet data (spec 4.6.3: "not just an image").
- `pdf` — via `pdfkit`, rendered by `services/pdfTable.ts#renderPdfTable`: a
  proper bordered table with a colored, humanized header row (`employeeId` →
  "Employee ID", etc. — see `HEADER_OVERRIDES`), zebra-striped rows,
  word-wrapped cells with dynamically computed row heights, column widths
  measured from actual glyph widths so a column is never narrower than its
  widest single word (avoids mid-word wrapping), and pagination with a
  repeating header row (first 500 rows, with a footer note if truncated).
  Dates are formatted via `formatDateTime` (e.g. "Sep 10, 2026, 11:48 PM")
  rather than a raw `Date.toString()` dump. Every export also carries the
  Vivid Edge logo (`routes/reports.ts`, rasterized once at
  `backend/assets/vivid-edge-logo.png` from `frontend/public/brand/logo.svg`
  since `pdfkit` can't embed SVG directly) — this is the same generator for
  all seven report keys, including Client Audit, which is the one report
  built specifically to be handed or emailed to an external client.

Scheduled delivery (`POST /reports/{key}/schedule`) records the schedule as a
`notification_rules` row but does not (and cannot, without an email provider —
see README "Swap points") actually dispatch anything on a timer yet.

## 9. Response normalization (`middleware/stringifyIds.ts`)

The frontend's TypeScript types declare every entity id (and FK reference,
e.g. `projectId`, `userId`) as `string` and every calendar-date field as a
bare `"YYYY-MM-DD"` string — deliberate choices so ids round-trip cleanly
through `<select>` values and dates don't carry a spurious time-of-day.
Prisma stores ids as autoincrement integers and calendar dates as full
`DateTime` columns. Rather than converting both in every route's serializer,
one Express middleware wraps `res.json` and walks the response once:

- Any **number** under a key literally named `id` or ending in `Id` is
  stringified (`5` → `"5"`).
- Any **`Date` instance** under a key ending in `Date` (or named exactly
  `date`) is formatted as a UTC-based `"YYYY-MM-DD"` string, not the default
  full ISO-with-time-and-`Z`. This one matters more than it looks: the
  frontend renders dates via `date-fns`'s `format()`, which uses the
  *browser's local* timezone. A full timestamp like
  `"2026-01-01T00:00:00.000Z"` formatted in a timezone behind UTC (US
  Central, say) displays as `"Dec 31, 2025"` — one day early. This was an
  actual bug caught during integration testing (project start/end dates on
  the Projects screen). Fields that really are instants —
  `createdAt`/`updatedAt`/`submittedAt`/`actedAt` — are untouched and keep
  full timestamps, which is correct for them.

Both rules key off naming convention only (`*Id` / `*Date` / `date`), so any
new field must follow that convention to get normalized automatically — or
be normalized by hand in its route if it deliberately doesn't.

## 10. What's stubbed vs. real — quick index

| Capability | Status |
|---|---|
| Auth, RBAC, project-scoped permissions | Real |
| Weekly grid autosave, validation engine, submit/recall | Real |
| Single-level approval, bulk-approve, reject-with-comment, audit trail | Real |
| Excel bulk import (users & projects), dry-run/preview/partial-commit | Real |
| Reports (6 standard reports), CSV/XLSX/PDF export | Real |
| In-app notification center (read/unread) | Real |
| Reminder/escalation background sweep (writes real in-app notifications) | Real (email delivery is a console-log placeholder) |
| Delegation (nominate/list/revoke a temporary approval proxy) | Real |
| Per-project/department approval chain override | Partial — table + settings API exist, routing doesn't read them yet |
| Notification cadence rules driving the scheduler | Partial — rules are CRUD-able, scheduler uses hardcoded cadence |
| SSO (SAML/OAuth) | Not implemented — pluggable by design, no provider chosen |
| Real email/Slack/Teams delivery | Not implemented — `services/notify.ts` is the single seam to add a provider |
| Redis (sessions/cache/rate-limit) | Not implemented — in-memory JWT verification has no session store dependency yet |
| S3-compatible file storage | Not implemented — imports are processed in-memory (`multer.memoryStorage()`) and not retained as files |
