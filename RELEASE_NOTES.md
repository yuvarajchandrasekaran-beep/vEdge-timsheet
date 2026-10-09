# Release Notes

All notable changes to TimeSync are recorded here, newest first.

**Versioning:** `MAJOR.MINOR.PATCH` — MINOR when a release adds a new capability (even alongside fixes), PATCH when it's fixes only. Dates are when the release was committed/deployed.

---

## v1.3.0 — 2026-10-09

QA retest log (6 Oct) — approvals visibility, delegation eligibility, project permissions, bulk import mapping, report pagination.

**Root cause fix:** the "Add a project/task" picker offered every active project org-wide to Super Admin/HR Admin instead of only ones they're actually assigned to, and a cell the server rejected (project window closed, hour cap exceeded, missing note) stayed visible in the grid as if it had saved until the next reload. Together these explained two separate-looking reports: Super Admin/HR Admin unable to submit their own timesheet, and a week over the 70h hard cap still submitting. Project pickers now respect real membership for every role, and a rejected save corrects the grid immediately.

**Approvals**
- Super Admin's Approved/Returned tabs now show org-wide history instead of only timesheets they personally acted on, so a Project Admin's approval is actually visible to oversight.
- Added a "View details" action so an approver can see a timesheet's real day-by-day entries before deciding, instead of approving/rejecting blind.
- Pending/Approved/Returned filters no longer leak across tabs.
- Impersonate confirmation is a proper modal instead of a native, URL-exposing browser `confirm()`.

**Delegation**
- The proxy picker is now backed by a real eligibility check (Super Admin, or a real per-project admin) instead of the full user directory, and shows why each person qualifies.
- Duplicate/overlapping delegate + date-range nominations are rejected with a clear message.

**Projects**
- The Tasks tab had no permission gating at all — anyone could see live-looking edit controls, and a rejected status change failed silently as if it had worked. Both fixed.
- Switching projects without closing the modal carried over the previous project's unsaved draft text into the new one.
- Added Name/Start date/End date editing to the Overview tab — the backend already supported it, nothing in the UI exposed it.
- Bulk Import is now HR Admin/Super Admin only (matching Users import), not Project Admin.

**Bulk import**
- The Map Columns step defaulted selections by *position* against an incomplete, outdated field list — fixed to match by real column name against the complete list, which also restores the missing Start Date/Status/Sub-task Name/Project Admin options.
- Review & Confirm row numbers no longer count the header row (was off by one).

**Reports & notifications**
- Added pagination to large reports (Audit Trail, Timesheet Summary, Approval Compliance).
- Approval notifications now include the timesheet code (e.g. "TS-2026-191") so they're distinguishable instead of all reading the same.

---

## v1.2.1 — 2026-10-02

Submission-blocker fixes reported directly off production data.

- Fixed a false "comment required" block on Monthly/Fortnight submit — the period view summed each week's *isolated* comment check instead of the real "one comment anywhere in the period" rule the backend actually enforces.
- Fixed inability to remove or zero out a timesheet entry once its project had closed or its active window had passed — a 0-hour correction was being rejected by the same rule it was trying to clear, so a stale entry could never be deleted.
- Fixed Monthly/Fortnight submit failing entirely when one week in the period was already approved — it now submits the remaining weeks instead of rejecting the whole batch.

---

## v1.2.0 — 2026-09-30

Delegation feature, report/export parity, and an authorization fix.

- Reports: the on-screen preview now matches the PDF/Excel/CSV export for every report type (previously every report was forced into Project Utilization's chart shape).
- Timesheets: added a "Download" button to the Monthly/Fortnight view, exporting the full period grid as Excel.
- Approvals: built the Delegation feature end-to-end (nominate a temporary proxy approver for a date range) — replaced an old delegate endpoint that recorded a proxy but never actually routed anything to them.
- Fixed a real authorization bug surfaced while building Delegation: a user who co-administers a project but holds a different global role (e.g. an HR Admin who is also a project's admin) was completely locked out of approvals, since routes were checking global role instead of real per-project admin status.

---

## v1.1.1 — 2026-09-29

13 bugs fixed from the first QA retest log pass.

- Bulk import (Users & Projects) always failed with a generic validation error — a content-type bug in the upload call.
- A newly created project could land outside the current filter/search, reading as "not created."
- The Projects and Clients tabs shared one search box, silently re-filtering each other.
- Added the missing Max hrs/day / Max hrs/week inputs to the Members tab.
- Added Bulk Reject (the backend endpoint already existed, unused).
- Duplicate holidays (same name + date) are now rejected instead of silently duplicating.
- Schedule Report's confirmation screen no longer shows stale state on reopen.
- Change History now shows role/department/manager names instead of raw IDs.
- Rejected timesheet entries (missing note, outside window, over a cap) now surface a toast instead of failing silently.
- Seed data: gave Super Admin a project membership so his own timesheet can actually be submitted.

---

## v1.1.0 — 2026-09-23

Monthly/Fortnight period views, holidays, and client-send, plus PDF and permission fixes.

- Added Excel-style Monthly/Fortnight grid views spanning multiple weeks, with a Compact view toggle and per-week color grouping.
- Added US federal holiday sync and a Holiday Calendar management page, with holiday columns highlighted in the grid.
- Added project-level "send timesheet to client" review/export flow with send history.
- Added optional Google sign-in and a Super Admin impersonation flow.
- Project Admins now also appear as team members on their own projects (roles are additive, not exclusive).
- Fixed unreadable PDF report exports (borders, zebra striping, formatted dates, real column widths) and branded every PDF with the Vivid Edge logo.
- Fixed the Approval Compliance report miscounting already-decided historical timesheets as pending/SLA-breached.
- Fixed the "Send timesheets to client" checkbox silently failing for non-admins (no error feedback) and, at the root, production 500s on that same action caused by MySQL's default VARCHAR(191) truncating audit-log data — widened the affected columns to `TEXT`.
- Added a branded PDF export of the user manual.

---

## v1.0.0 — 2026-09-10

Initial release: TimeSync timesheet, approval & reporting platform.
