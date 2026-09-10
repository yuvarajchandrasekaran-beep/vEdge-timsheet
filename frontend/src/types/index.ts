// Domain types mirroring CONTRACT.md Section 6 (Prisma entities) and Section 7 (REST API).

export type RoleName =
  | "SUPER_ADMIN"
  | "HR_ADMIN"
  | "PROJECT_ADMIN"
  | "INDIVIDUAL_USER";

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  PROJECT_ADMIN: "Project Admin",
  INDIVIDUAL_USER: "Individual User",
};

export type UserStatus = "ACTIVE" | "INACTIVE";

export interface Department {
  id: string;
  name: string;
}

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
}

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: RoleName;
  department: string;
  jobTitle: string;
  managerId?: string | null;
  managerName?: string | null;
  status: UserStatus;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface UserChangeHistoryEntry {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

export interface Client {
  id: string;
  name: string;
  status?: "ACTIVE" | "INACTIVE";
  projectCount?: number;
}

export type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD" | "ARCHIVED";
// Project-level contract classification. Billable/non-billable is captured
// per-task instead (see ProjectTask.billable) — a project can mix both.
export type BillingType = "T_AND_M" | "FIXED" | "MANAGED_SERVICES";

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  T_AND_M: "T&M",
  FIXED: "Fixed",
  MANAGED_SERVICES: "Managed Services",
};

export interface ProjectTask {
  id: string;
  projectId: string;
  name: string;
  estimatedHours?: number | null;
  billable: boolean;
  status: "ACTIVE" | "INACTIVE";
}

export interface ProjectAdmin {
  userId: string;
  name: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  userName?: string;
  roleOnProject: string;
  maxHoursPerDay?: number | null;
  maxHoursPerWeek?: number | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  clientId: string;
  clientName: string;
  status: ProjectStatus;
  billingType: BillingType;
  // Computed bottoms-up from tasks[].estimatedHours — never set directly.
  budgetHours: number;
  loggedHours?: number;
  startDate: string;
  endDate?: string | null;
  admins: ProjectAdmin[];
  tasks: ProjectTask[];
  members: ProjectMember[];
}

export type TimesheetStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED_L1"
  | "APPROVED_L2"
  | "REJECTED"
  | "RECALLED";

export interface TimesheetEntry {
  id: string;
  projectTaskId: string;
  projectId: string;
  projectName: string;
  taskName: string;
  entryDate: string; // YYYY-MM-DD
  hours: number;
  notes?: string;
}

export interface Timesheet {
  id: string;
  timesheetCode: string;
  userId: string;
  userName?: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;
  status: TimesheetStatus;
  totalHours: number;
  weekNotes?: string;
  entries: TimesheetEntry[];
  submittedAt?: string | null;
  approvals?: Approval[];
  updatedAt?: string;
}

export type ApprovalLevel = "L1" | "L2";
export type ApprovalAction = "PENDING" | "APPROVED" | "REJECTED";

export interface Approval {
  id: string;
  timesheetId: string;
  level: ApprovalLevel;
  approverId: string;
  approverName: string;
  action: ApprovalAction;
  comment?: string;
  actedAt?: string | null;
}

export interface ApprovalQueueItem {
  timesheetId: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string | null;
  userRole: RoleName;
  department: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  submittedAt: string;
  pendingDays: number;
  status: TimesheetStatus;
  level: ApprovalLevel;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface NotificationPreferences {
  email: boolean;
  inApp: boolean;
  digest: "NONE" | "DAILY" | "WEEKLY";
  reminders: {
    submitDeadline: boolean;
    approvalPending: boolean;
    rejection: boolean;
  };
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  details?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: "VALID" | "WARNING" | "ERROR";
  messages: string[];
  data: Record<string, unknown>;
}

export interface ImportBatch {
  batchId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  rows: ImportPreviewRow[];
}

export type ReportKey =
  | "timesheet-summary"
  | "project-utilization"
  | "approval-compliance"
  | "missing-timesheets"
  | "overtime"
  | "audit-trail"
  | "client-audit";

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  projectId?: string;
  departmentId?: string;
  userId?: string;
  status?: string;
  groupBy?: string;
}

export interface ProjectUtilizationRow {
  projectId: string;
  projectName: string;
  clientName: string;
  budgetHours: number;
  loggedHours: number;
  utilizationPct: number;
}

export interface ReportTrendPoint {
  label: string;
  value: number;
}

export interface ReportResponse {
  reportKey: ReportKey;
  generatedAt: string;
  summary: Record<string, number | string>;
  utilizationByProject: ProjectUtilizationRow[];
  trend: ReportTrendPoint[];
  rows: ProjectUtilizationRow[];
}

export interface ClientAuditResource {
  userId: string;
  employeeId: string;
  name: string;
  role: string;
  totalHours: number;
  entryCount: number;
}

export interface ClientAuditProject {
  projectId: string;
  projectName: string;
  code: string;
  status: string;
  resources: ClientAuditResource[];
  projectTotalHours: number;
}

export interface ClientAuditReport {
  reportKey: "client-audit";
  generatedAt: string;
  client: { id: string; name: string } | null;
  projects: ClientAuditProject[];
  grandTotalHours: number;
  grandTotalResources: number;
}

// ---- API envelope types ----

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

export interface ApiError {
  statusCode: number;
  message: string;
  errorCode?: string;
  details?: unknown;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface OrgSettings {
  orgName: string;
  timezone: string;
  weekStartsOn: "MONDAY" | "SUNDAY";
  dailyHourLimit: number;
  weeklyHourLimit: number;
}

export interface ApprovalChainStep {
  level: ApprovalLevel;
  approverRole: RoleName;
  description: string;
}

export interface BrandingSettings {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}

export interface NotificationRule {
  id: string;
  event: string;
  description: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}
