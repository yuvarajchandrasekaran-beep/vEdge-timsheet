# TimeSync — User Manual

TimeSync is Vivid Edge Integration COE's timesheet, approval, and reporting
application. This guide walks through everything you can do in it, organized
by what you're trying to accomplish. If you only do one thing with this
document, read **Section 1** — it covers the weekly habit every employee
needs, and it's designed to take you well under a minute once you know it.

Your available menu items and screens depend on your role — see
**Section 9** for a summary of who can do what.

**Finding your way around**: the left sidebar lists Dashboard, Timesheets,
Approvals, Reports, Projects, Users, and Holiday Calendar, in that order —
the items you'll use most often are near the top. Super Admins additionally
get a **Settings** link pinned at the very bottom of the sidebar, below a
divider. Two things live in the top bar instead of the sidebar: your
notifications (the bell icon, top right) and logging out (click your
name/avatar, top right, for Logout).

---

## 1. Logging your time (every employee)

### 1.1 Four views, one set of data

Click **Timesheets** in the left sidebar. A tab strip at the top lets you
switch between four views of the same underlying data — entering an hour in
one view shows up in all the others immediately:

- **Monthly** (the default view when you open Timesheets) — every week that
  falls in the selected calendar month, stacked as a series of weekly grids,
  with one shared comments box and one Submit button for the whole month.
- **Fortnight** — the same idea over two consecutive weeks.
- **Weekly** — one week's grid, the most detailed view, with its own Submit.
- **Daily** — one day at a time as a simple list (handy on mobile).

Each week within the Monthly/Fortnight views is still its own week for
approval purposes — submitting a month submits every week in it together, but
each week is reviewed and approved on its own.

**Compact view**: Monthly and Fortnight views hide Saturday/Sunday columns by
default to save space. Click **Compact view** in the toolbar to toggle
weekends back on — the setting is remembered on your device for next time.
Hiding weekend columns only affects what's shown; hours already logged on a
weekend still count toward your totals and warnings either way.

### 1.2 The grid

You'll see one row per project or task you're assigned to, and one column per
day, with a running total column on the right and a total row at the bottom.

- **Enter hours**: click a cell and type a number. Use the arrow keys or
  **Enter** to move between cells without touching the mouse.
- **Add a project row**: use the search box above the grid to find and add a
  project/task you're assigned to but that isn't showing yet.
- **Comments**: a small comment icon sits next to every hours box. Click it
  to open a small overlay window and type what that entry was for — the
  comment stays with that specific entry (nothing is shown inline in the
  grid until you open it, keeping the grid uncluttered). A comment becomes
  **required** on any entry over 8 hours; the icon turns red until you add
  one.
- **Comments for this period**: Monthly, Fortnight, and Weekly views each
  also have one comments box at the bottom for overall context on the whole
  period — this is where the "at least one comment somewhere" rule (below)
  is easiest to satisfy in one shot.
- **Autosave**: everything you type saves as a draft automatically within a
  couple of seconds — watch for the small save indicator. You can close the
  tab mid-entry and pick up exactly where you left off later.
- **Copy feature**: every view has a **Copy** button ("Copy Last Week", "Copy
  previous fortnight", "Copy previous month", "Copy from previous day") that
  pre-fills the current period from the immediately preceding period of the
  same length — hours and the project/task list carry over, but **comments
  are always left blank** so you're not accidentally forwarding an old note.
- **Download**: Monthly and Fortnight views have a **Download** button that
  exports the whole grid exactly as shown — one row per project/task, one
  column per date across every week in the period — as an Excel file.

### 1.3 Mandatory conditions

The system enforces a few rules on top of your own project's hour caps:

| Condition | What happens |
|---|---|
| Under or over the standard 40h week | Nothing — this is fine on its own, no warning. |
| A week totals **over 50 hours** | A warning at submit time asking you to double-check — you can still submit. |
| A week totals **over 70 hours** | **Blocked.** You cannot submit until you fix the entries. |
| Time logged on a US federal holiday | A warning at submit time asking you to confirm the entry is legitimate — you can still submit. |
| No comment anywhere in the submission | **Blocked.** At least one comment — on any single entry, or in the period's comments box — is required before you can submit; even one comment for one day is enough. |

These checks run per calendar week (Mon–Sun) regardless of which view you
used to enter the time, and the same rules apply whether you're submitting
one week or a whole Monthly/Fortnight batch at once.

### 1.4 What the colors mean

The grid checks your entries as you type, before you ever hit submit:

| What you see | What it means |
|---|---|
| Red cell + message | **Blocking.** You're not assigned to that project, it's outside the project's active dates, or you've gone over a configured hour cap. Fix it before you can save that entry. |
| Amber highlight | **Warning.** Unusually high total for one day across all your projects (e.g. over 12 hours) — you can proceed, but confirm it's intentional. |
| Purple day column | **Company holiday.** Hover the day header for the holiday's name. Informational only — you can still log time that day, and it's still the same "confirm it's legitimate" warning at submit time described above. |
| A cell that won't save | Usually a missing required note on a large entry — add the note and it will save. |

### 1.5 Submitting

When your period looks right, click **Submit**. You'll see a summary of
total hours, any warnings (over 50h, a holiday entry), and — if something is
blocking (over 70h, or no comment anywhere) — exactly what to fix, before you
can confirm. Once submitted, your status moves to **Submitted** and it heads
to your approver (see Section 2).

- **Changed your mind?** As long as your approver hasn't acted on it yet,
  click **Recall** (from Weekly view) to pull that week back to Draft and
  keep editing.
- **Once approved**, a week's entries lock — you can no longer edit them
  yourself. If something needs to change, ask your approver to reject it
  (with a comment explaining why), which reopens it for editing.

### 1.6 Your dashboard

The **Dashboard** (your home screen) shows this week's status at a glance:
total hours logged, hours remaining against a standard week, your top
projects by hours, and any org announcements (e.g. an upcoming holiday and
its effect on the submission deadline). It also shows a calendar view of your
last several weeks so you can spot a missing or rejected week quickly.

---

## 2. Approving timesheets (Project Admins & Super Admin)

Every submitted timesheet goes through exactly **one** approval: the
**Project Admin** of the project it logs the most time against. There is no
second/final tier — HR Admin does not approve timesheets. Super Admin can
always act as a fallback approver on any timesheet.

- **Self-approval**: if a Project Admin is the only person logging time
  against their own project (i.e. they're one of the resolved approvers for
  their own submission), their timesheet is **approved automatically** the
  moment they submit it — there's no one else who could meaningfully review
  it.

### 2.1 The Approvals inbox

Click **Approvals**. You'll see every timesheet currently waiting on you,
with the employee, the week, total hours, when it was submitted, and how many
days it's been pending. Filter by department or how long something has been
waiting.

- **Approve**: click the checkmark. Optionally leave a comment. This is
  final — the employee gets an immediate confirmation and the data is now
  considered settled for reporting purposes.
- **Reject**: click the X. A comment is **required** — the submitting
  employee sees it immediately along with which entries were flagged, and
  their timesheet reopens for edits.
- **Bulk approve / bulk reject**: for straightforward weeks that don't need
  line-by-line review, select multiple rows and act on them together.
- **Delegate**: heading out on leave? Click **Delegate my approvals** (top
  right of the Approvals screen) to nominate a proxy — anyone who's a Super
  Admin, or who already administers at least one project — for a date range.
  While it's active, every timesheet you'd normally approve also appears in
  the proxy's own Pending tab automatically; they don't need to do anything
  else to see or act on it, and you can still act on it yourself too if
  you're reachable after all. Revoke it early from the same panel, which
  keeps a record of past delegations rather than deleting them outright.

### 2.2 SLA and escalation

Every pending item shows how many days it's been sitting in a queue. If a
timesheet has no resolvable Project Admin, or sits too long (the org's
configured threshold), the system automatically notifies every Super Admin
so a stalled approval doesn't depend on someone remembering to chase it.

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
  least one). Any of a project's admins can approve its timesheets.
- **Only a project's own Project Admin (or Super Admin) can add people** to
  that project or its tasks — this applies to both the "Project admins" and
  "Members" sections. Anyone else can still view the Members tab, but won't
  see the add/remove controls.
- **The same restriction applies to the Overview tab**: only that project's
  own admin (or Super Admin) can change its Status, Billing type, or the
  "Send timesheets to the client" setting. Anyone else with view access to
  the project (e.g. an assigned team member) sees a plain read-only summary
  of these instead of editable controls, so it's clear at a glance who owns
  that project's settings.
- **Team members**: from a project's **Members** tab, assign the people who
  can log time against it. You can also set an individual's maximum hours
  per day/week on this project here (e.g. capping a part-time engagement at
  20h/week) — this cap is what powers the red-cell blocking rule employees
  see in their grid.
- **A project admin is automatically also a team member** on that project —
  they appear in both the "Project admins" and "Members" sections (labeled
  "Project Admin" in the latter), and can log their own time against it like
  anyone else. The same person can likewise be an admin on one project and a
  plain member on a different one; either way, every project they're on
  shows up in their timesheet's project picker.
- **Sending timesheets to the client**: from a project's **Overview** tab,
  check **"Send timesheets to the client for this project"** and enter the
  client's contact email. This unlocks a **Send timesheet to client…** link
  that opens a review page: pick the period, see every logged entry across
  all users for that project (all selected by default, with the option to
  deselect a few), then send. The recipient email is asked for again at send
  time (pre-filled from the project setting, but editable), and everything
  selected is sent as a single file. There's no live email provider wired up
  in this build — sending is logged as a real, downloadable audit record
  (who sent what, to whom, and the exact file) rather than an actual inbox
  delivery; see the README's "Swap points" for wiring in a real provider.
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
  do (also summarized in Section 9 below).
- **Impersonate** (Super Admin only): click **Impersonate** next to any other
  active user to sign in as them — useful for reproducing what an employee
  sees without needing their password. A persistent amber banner stays on
  screen the whole time naming who you're impersonating and who started it;
  click **Return to my account** in that banner to end it. Every action taken
  while impersonating is attributed to the impersonated user in the audit
  trail, with the Super Admin recorded as the actor behind it.

---

## 5. Holiday Calendar (HR Admin & Super Admin)

Click **Holiday Calendar**. This is the company's list of holidays — it
powers the "you're logging time on a holiday" warning employees see when
submitting (Section 1.3).

- **Synced with the US federal calendar by default**: pick a year and click
  **Sync US federal holidays for &lt;year&gt;** to add that year's 11 US
  federal holidays (New Year's Day, MLK Day, Washington's Birthday, Memorial
  Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day,
  Thanksgiving, and Christmas). A holiday that falls on a weekend is filed
  under its actual observed weekday, matching how the US government
  publishes it. Syncing is safe to repeat — it only adds what's missing, it
  never duplicates or overwrites a holiday you've already customized.
- **Add / edit / delete**: use these to add a company-specific holiday (e.g.
  a Founder's Day) or adjust a synced one.

---

## 6. Bulk uploading users or projects (Excel)

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

## 7. Reports & analytics (Project Admin, HR Admin, Super Admin)

Click **Reports**. Pick a report type, a date range, and any filters (client,
project, department, user, status), then **Generate**.

Available reports:

| Report | What it shows |
|---|---|
| Timesheet Summary | Hours by user, project, client, and date, drillable down to individual entries |
| Project Utilization vs. Budget | Actual hours logged against a project's budgeted hours |
| Approval Compliance | How long approvals are taking, who decided each one, and current SLA breaches |
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

## 8. Notifications

The bell icon in the top bar shows your in-app notifications — submission
reminders, approvals waiting on you, rejections (with the approver's
comment), and final-approval confirmations. Click to mark as read, or "mark
all read" to clear the badge. For the full list plus channel preferences
(email, in-app, digest frequency, and which reminder types you get), click
**View all** in that dropdown, or go to **Notifications** from the "View
all"/mail-icon shortcut in the top bar — the preferences panel lives
alongside your notification list there.

---

## 9. Who can do what

| Capability | Super Admin | HR Admin | Project Admin | Individual User |
|---|:---:|:---:|:---:|:---:|
| Enter & submit own timesheet | ✅ | ✅ | ✅ | ✅ |
| Approve timesheets | ✅ (fallback) | | ✅ (own projects) | |
| Manage users (incl. bulk) | ✅ | ✅ | | |
| Manage clients/projects/tasks | ✅ | view only | ✅ (own) | view (assigned) |
| Add people to a project / its tasks | ✅ | | ✅ (own projects only) | |
| Maintain the Holiday Calendar | ✅ | ✅ | | |
| Enable/send client timesheets | ✅ | | ✅ (own projects) | |
| View reports | all, org-wide | all, org-wide | own projects | own data only |
| Export reports | ✅ | ✅ | ✅ (own projects) | own data only |
| System/security configuration | ✅ | | | |
| View audit log | full | HR-scoped | project-scoped | |

---

## 10. Getting help

If something looks wrong — a project you should be assigned to is missing, a
cap seems misconfigured, or an approval seems stuck — your first stop is your
Project Admin (for project/assignment questions) or HR Admin (for account or
compliance questions). For anything that looks like a system bug rather than
a data/configuration issue, contact the engineering team — see `README.md`
for how the application is built and where to look.
