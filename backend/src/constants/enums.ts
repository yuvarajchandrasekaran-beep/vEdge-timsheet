export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  HR_ADMIN: "HR_ADMIN",
  PROJECT_ADMIN: "PROJECT_ADMIN",
  INDIVIDUAL_USER: "INDIVIDUAL_USER",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleName[] = Object.values(ROLES);

// All enum-like values below are SCREAMING_SNAKE_CASE API tokens (matching
// the frontend's TS unions in frontend/src/types/index.ts) — the frontend
// derives its own display labels from these (see Badge.tsx's *_TONE maps),
// so do not change these to "friendly" strings without updating the
// frontend's label/tone lookup tables too.
export const TIMESHEET_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED_L1: "APPROVED_L1",
  APPROVED_L2: "APPROVED_L2",
  REJECTED: "REJECTED",
  RECALLED: "RECALLED",
} as const;

export type TimesheetStatus = (typeof TIMESHEET_STATUS)[keyof typeof TIMESHEET_STATUS];

export const USER_STATUS = { ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" } as const;

// Note: the original spec's prose lists a 5th project status, "Planning" —
// dropped here because the shipped UI's project form only offers these four
// (ACTIVE/ON_HOLD/COMPLETED/ARCHIVED); "Closed" was renamed to "ARCHIVED" to
// match. Reintroducing Planning is a matter of adding it back to both this
// enum and the frontend's ProjectStatus type + status dropdown.
export const PROJECT_STATUS = {
  ACTIVE: "ACTIVE",
  ON_HOLD: "ON_HOLD",
  ARCHIVED: "ARCHIVED",
  COMPLETED: "COMPLETED",
} as const;

// Project-level contract classification. Billable/non-billable is no longer
// a project-level flag — it's captured per-task instead (see ProjectTask's
// `billable` column / TASK's createTaskSchema), since a project can mix
// billable and non-billable work.
export const PROJECT_BILLING_TYPE = {
  T_AND_M: "T_AND_M",
  FIXED: "FIXED",
  MANAGED_SERVICES: "MANAGED_SERVICES",
} as const;

export type ProjectBillingType = (typeof PROJECT_BILLING_TYPE)[keyof typeof PROJECT_BILLING_TYPE];

// A project can have more than one admin — modeled as ProjectMember rows
// with this roleOnProject value, rather than a single FK on Project.
export const PROJECT_MEMBER_ROLE = {
  PROJECT_ADMIN: "Project Admin",
  MEMBER: "Member",
} as const;

export const APPROVAL_ACTION = { APPROVED: "APPROVED", REJECTED: "REJECTED" } as const;

export const IMPORT_TYPE = { USERS: "Users", PROJECTS: "Projects" } as const;

export const REPORT_KEYS = [
  "timesheet-summary",
  "project-utilization",
  "approval-compliance",
  "missing-timesheets",
  "overtime",
  "audit-trail",
  "client-audit",
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];
