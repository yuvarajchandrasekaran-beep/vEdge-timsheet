# TimeSync — User Manual

TimeSync is Vivid Edge Integration COE's timesheet, approval, and reporting
application. This guide walks through everything you can do in it, organized
by what you're trying to accomplish. If you only do one thing with this
document, read **Section 1** — it covers the weekly habit every employee
needs, and it's designed to take you well under a minute once you know it.

Your available menu items and screens depend on your role — see
**Section 8** for a summary of who can do what.

**Finding your way around**: the left sidebar lists Dashboard, Timesheets,
Approvals, Reports, Projects, and Users, in that order — the items you'll use
most often are near the top. Super Admins additionally get a **Settings**
link pinned at the very bottom of the sidebar, below a divider. Two things
live in the top bar instead of the sidebar: your notifications (the bell
icon, top right) and logging out (click your name/avatar, top right, for
Logout).

---

## 1. Logging your time (every employee)

### 1.1 The weekly grid

Click **Timesheets** in the left sidebar. You'll see one row per project or
task you're assigned to, and one column per day of the week (Monday–Sunday),
with a running total column on the right and a total row at the bottom.

- **Enter hours**: click a cell and type a number. Use **Tab**, **Shift+Tab**,
  or the arrow keys to move between cells without touching the mouse; press
  **Enter** to commit a value and move down.
- **Paste from Excel**: copy a row of numbers from a spreadsheet and paste it
  directly into the grid.
- **Add a project row**: use the search box above the grid to find and add a
  project/task you're assigned to but that isn't showing yet. Your most
  recently used and favorited projects are pinned to the top so you rarely
  need to search.
- **Notes**: click the note icon on a cell (or the row) to add context on
  what you worked on. A note becomes **required** if you log more than 8
  hours in a single entry, or if a project is configured to require one —
  you'll see this flagged before you can submit.
- **Autosave**: everything you type saves as a draft automatically within a
  couple of seconds — watch for the small save indicator near the top of the
  grid. You can close the tab mid-entry and pick up exactly where you left
  off later.
- **Copy Last Week**: if your project mix repeats week to week, use this to
  pre-fill this week's rows from last week's projects (hours start at zero —
  it copies your project list, not your hours).

### 1.2 What the colors mean

The grid checks your entries as you type, before you ever hit submit:

| What you see | What it means |
|---|---|
| Red cell + message | **Blocking.** You're not assigned to that project, it's outside the project's active dates, or you've gone over a configured hour cap. Fix it before you can save that entry. |
| Amber highlight | **Warning.** Unusually high total for one day across all your projects (e.g. over 12 hours) — you can proceed, but confirm it's intentional. |
| A cell that won't save | Usually a missing required note on a large entry — add the note and it will save. |

### 1.3 Submitting your week

When your week looks right, click **Submit**. You'll see a summary of total
hours by project and any flagged items before you confirm. Once submitted,
your status moves to **Submitted**, and it heads to your Level 1 approver.

- **Changed your mind?** As long as your Level 1 approver hasn't acted on it
  yet, click **Recall** to pull it back to Draft and keep editing.
- **Once Level 1 approves**, your entries lock — you can no longer edit them
  yourself. If something needs to change at that point, ask your approver to
  reject it (with a comment explaining why), which reopens it for editing.

### 1.4 Day View

If you'd rather enter time one day at a time (e.g. on mobile), switch to
**Day View** from the Timesheets screen. It shows the same projects as a
simple list with one hours field and one note field each, plus your daily
total against your daily limit.

### 1.5 Your dashboard

The **Dashboard** (your home screen) shows this week's status at a glance:
total hours logged, hours remaining against a standard week, your top
projects by hours, and any org announcements (e.g. an upcoming holiday and
its effect on the submission deadline). It also shows a calendar view of your
last several weeks so you can spot a missing or rejected week quickly.

---

## 2. Approving timesheets (Project Admins & HR Admins)

Every submitted timesheet goes through exactly two approvals before it's
final: **Level 1** (your Project Admin) and **Level 2** (HR Admin). Neither
level can be skipped, and both are enforced by the system — not just the
screen you're looking at.

### 2.1 The Approvals inbox

Click **Approvals**. You'll see every timesheet currently waiting on you,
with the employee, the week, total hours, when it was submitted, and how many
days it's been pending. Filter by project, department, or how long something
has been waiting.

- **Approve**: click the checkmark. Optionally leave a comment.
- **Reject**: click the X. A comment is **required** — the submitting
  employee sees it immediately along with which entries were flagged, and
  their timesheet reopens for edits.
- **Bulk approve**: for straightforward weeks that don't need line-by-line
  review, select multiple rows and approve them together.
- **Delegate**: heading out on leave? Nominate a temporary proxy to cover
  your queue without permanently handing off your approval responsibilities.

### 2.2 What happens after you approve

- If you're a **Project Admin (Level 1)** and you approve, the timesheet
  moves to the HR Admin's Level 2 queue.
- If you're an **HR Admin (Level 2)** and you approve, the timesheet is
  **finally approved** — the employee gets an immediate confirmation, and the
  data is now considered settled for reporting purposes.

### 2.3 SLA and escalation

Every pending item shows how many days it's been sitting in a queue. If
something sits too long (the org's configured threshold), the system
automatically emails a nudge to the approver and a courtesy notice to their
manager or HR — so a stalled approval doesn't depend on someone remembering
to chase it.

---

## 3. Managing projects & clients (Project Admins & Super Admin)

Click **Projects**. This screen has two tabs: **Projects** and **Clients**.

- **Clients tab**: every project belongs to a client. Click **New Client** to
  add one (name and an Active/Inactive status) before it can be selected
  when creating a project. This tab also shows, for each client, how many
  projects are currently linked to it.
- **New Project** (Projects tab): pick a client from the list you built on
  the Clients tab, give the project a code and name, set its dates, its
  billing type (**T&M** / **Fixed** / **Managed Services** — the contract
  type), and search-and-select one or more **project admins** (type a name
  to search any user; pick as many as you need). You can also add the
  project's tasks right here — each task gets its own name, estimated hours,
  and a Billable/Non-billable flag.
- **Budget hours are never entered directly** — a project's budget is the
  sum of its tasks' estimated hours, rolled up automatically. Add or adjust
  tasks (in the New Project form or later, from the **Tasks** tab) to change
  it.
- **Sub-tasks live inside their project, not as their own menu**: open a
  project (the eye/pencil icon) and use its **Tasks** tab to add sub-tasks
  (e.g. "Requirements", "Build", "Testing") — each can have its own active
  date window, estimated hours, Billable/Non-billable flag, and be closed
  independently of the parent project. There's no separate top-level "Tasks"
  screen — a sub-task only ever makes sense in the context of the one
  project it belongs to, so it's managed there.
- **A project can have more than one admin**: from a project's **Members**
  tab, the "Project admins" section lists everyone administering it, lets
  you search-and-add another, and remove one (a project must always keep at
  least one). Any of a project's admins can act as its Level 1 timesheet
  approver.
- **Team members**: from a project's **Members** tab, assign the people who
  can log time against it. You can also set an individual's maximum hours
  per day/week on this project here (e.g. capping a part-time engagement at
  20h/week) — this cap is what powers the red-cell blocking rule employees
  see in their grid.
- **Archived / out-of-window projects** become read-only for new time entry
  but stay fully visible in historical reports. A project's status is one of
  Active, On-Hold, Archived, or Completed.
- **Deleting a project** (Super Admin only) permanently removes it along
  with its sub-tasks, team assignments, and — importantly — any time entries
  and approval history logged against it. There's no undo. For a project
  that has real logged time, prefer changing its status to Archived instead
  of deleting it, so the historical data stays available in reports.

---

## 4. Managing users (HR Admin & Super Admin)

Click **Users**.

- **New User**: set employee ID, name, work email, department, role, job
  title, reporting manager, and start date.
- **Deactivate / reactivate**: deactivating blocks new time entry but keeps
  the person's history and audit trail intact — nothing is deleted.
- **Roles**: see the Roles tab for the four available roles and what each can
  do (also summarized in Section 8 below).

---

## 5. Bulk uploading users or projects (Excel)

Instead of entering people or projects one at a time, use **Bulk Upload**
from the Users or Projects screen:

1. **Download the template** — an Excel file with the exact columns expected
   and a sample row.
2. **Fill it in** and upload it.
3. **Review**: every row is checked *before anything is saved*. Each row is
   flagged **Valid**, **Warning** (e.g. a department that will be
   auto-created), or **Error** (with the specific reason — a duplicate
   employee ID, an invalid email, an unrecognized role, etc.).
4. **Commit**: you can import just the valid/warning rows and fix the error
   rows separately — nothing is held hostage by a few bad rows. Every import
   run is logged (who, when, how many succeeded/failed) for traceability.

---

## 6. Reports & analytics (Project Admin, HR Admin, Super Admin)

Click **Reports**. Pick a report type, a date range, and any filters (client,
project, department, user, status), then **Generate**.

Available reports:

| Report | What it shows |
|---|---|
| Timesheet Summary | Hours by user, project, client, and date, drillable down to individual entries |
| Project Utilization vs. Budget | Actual hours logged against a project's budgeted hours |
| Approval Compliance | How long approvals are taking at each level, and current SLA breaches |
| Missing Timesheet | Who hasn't submitted for a given period, and how overdue they are |
| Overtime | Entries exceeding your configured daily/weekly thresholds |
| Audit Trail | Every create/update/approve/reject action, with who and when (Super Admin only) |
| Client Audit Report | Client-submittable proof of hours: every project under a chosen client, the resources who logged time on each, and their hours |

The dashboard view adds a utilization donut chart and a trend line so you can
see the shape of the data before drilling into the table.

**Client Audit Report** works a little differently: pick a **Client** in the
filter bar (required — nothing renders until one is chosen), then Generate.
The on-screen view groups by project, then by resource, with hours and entry
counts per resource and a client-wide total at the top — the exact breakdown
a client would want as proof of billed hours. Its CSV/Excel/PDF export goes a
level deeper than the on-screen summary: one row per individual timesheet
entry (date, task, hours, approval status), so the exported file is a
complete, traceable audit trail rather than just the aggregated totals.

**Exporting**: click **PDF**, **Excel**, or **CSV** at any time — the export
includes the filters you applied, who generated it, and a timestamp.
**Schedule Report** currently only records your requested cadence and
recipients for later wiring — it does not yet email reports on its own; see
the README's "Swap points" section for what's needed to make it real.

---

## 7. Notifications

The bell icon in the top bar shows your in-app notifications — submission
reminders, approvals waiting on you, rejections (with the approver's
comment), and final-approval confirmations. Click to mark as read, or "mark
all read" to clear the badge. For the full list plus channel preferences
(email, in-app, digest frequency, and which reminder types you get), click
**View all** in that dropdown, or go to **Notifications** from the "View
all"/mail-icon shortcut in the top bar — the preferences panel lives
alongside your notification list there.

---

## 8. Who can do what

| Capability | Super Admin | HR Admin | Project Admin | Individual User |
|---|:---:|:---:|:---:|:---:|
| Enter & submit own timesheet | | | ✅ | ✅ |
| Approve — Level 1 | | | ✅ | |
| Approve — Level 2 (final) | | ✅ | | |
| Manage users (incl. bulk) | ✅ | ✅ | | |
| Manage clients/projects/tasks | ✅ | view only | ✅ (own) | view (assigned) |
| Assign users to projects | ✅ | view only | ✅ (own projects) | |
| View reports | all, org-wide | all, org-wide | own projects | own data only |
| Export reports | ✅ | ✅ | ✅ (own projects) | own data only |
| System/security configuration | ✅ | | | |
| View audit log | full | HR-scoped | project-scoped | |

---

## 9. Getting help

If something looks wrong — a project you should be assigned to is missing, a
cap seems misconfigured, or an approval seems stuck — your first stop is your
Project Admin (for project/assignment questions) or HR Admin (for account or
compliance questions). For anything that looks like a system bug rather than
a data/configuration issue, contact the engineering team — see `README.md`
for how the application is built and where to look.
