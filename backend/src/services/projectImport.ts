import { prisma } from "../lib/prisma";
import { PROJECT_BILLING_TYPE } from "../constants/enums";

export interface ProjectImportRow {
  "Client Name": string;
  "Project Code": string;
  "Project Name": string;
  "Project Billing Type": string;
  "Sub-task Name"?: string;
  "Sub-task Billable"?: string;
  "Sub-task Estimated Hours"?: string | number;
  "Start Date": string;
  "End Date": string;
  "Project Admin (Employee ID)": string;
}

export interface ValidatedRow {
  rowNumber: number;
  data: ProjectImportRow;
  status: "VALID" | "WARNING" | "ERROR";
  messages: string[];
}

const BILLING_TYPE_ALIASES: Record<string, string> = {
  "T&M": PROJECT_BILLING_TYPE.T_AND_M,
  "T & M": PROJECT_BILLING_TYPE.T_AND_M,
  "TIME AND MATERIALS": PROJECT_BILLING_TYPE.T_AND_M,
  "TIME & MATERIALS": PROJECT_BILLING_TYPE.T_AND_M,
  FIXED: PROJECT_BILLING_TYPE.FIXED,
  "FIXED PRICE": PROJECT_BILLING_TYPE.FIXED,
  "MANAGED SERVICES": PROJECT_BILLING_TYPE.MANAGED_SERVICES,
};

export function normalizeBillingType(raw: string): string {
  const key = raw.trim().toUpperCase();
  return BILLING_TYPE_ALIASES[key] ?? key.replace(/\s+/g, "_");
}

export async function validateProjectRows(rows: ProjectImportRow[]): Promise<ValidatedRow[]> {
  const clients = await prisma.client.findMany();
  const clientNames = new Set(clients.map((c) => c.name.toLowerCase()));
  const existingCodes = new Set((await prisma.project.findMany({ select: { code: true } })).map((p) => p.code.toLowerCase()));
  const admins = await prisma.user.findMany({ where: { role: { name: { in: ["PROJECT_ADMIN", "SUPER_ADMIN"] } } } });
  const adminByEmployeeId = new Map(admins.map((a) => [a.employeeId, a]));

  const seenCodesInFile = new Set<string>();
  const validBillingTypes = new Set<string>(Object.values(PROJECT_BILLING_TYPE));

  return rows.map((row, idx) => {
    const messages: string[] = [];
    let status: ValidatedRow["status"] = "VALID";

    const clientName = String(row["Client Name"] ?? "").trim();
    const projectCode = String(row["Project Code"] ?? "").trim();
    const projectName = String(row["Project Name"] ?? "").trim();
    const startRaw = row["Start Date"];
    const endRaw = row["End Date"];
    const estimatedHours = row["Sub-task Estimated Hours"];
    const adminEmployeeId = String(row["Project Admin (Employee ID)"] ?? "").trim();
    const billingTypeRaw = String(row["Project Billing Type"] ?? "").trim();
    const subtaskBillable = String(row["Sub-task Billable"] ?? "").trim();

    if (!clientName) {
      messages.push("Client Name is required");
      status = "ERROR";
    } else if (!clientNames.has(clientName.toLowerCase())) {
      messages.push(`Client "${clientName}" does not exist and will be created`);
      status = "WARNING";
    }

    if (!projectCode) {
      messages.push("Project Code is required");
      status = "ERROR";
    } else if (existingCodes.has(projectCode.toLowerCase()) || seenCodesInFile.has(projectCode.toLowerCase())) {
      messages.push(`Project Code "${projectCode}" already exists`);
      status = "ERROR";
    }
    seenCodesInFile.add(projectCode.toLowerCase());

    if (!projectName) {
      messages.push("Project Name is required");
      status = "ERROR";
    }

    let start: Date | null = null;
    let end: Date | null = null;
    if (!startRaw || !endRaw) {
      messages.push("Start Date and End Date are required");
      status = "ERROR";
    } else {
      start = new Date(startRaw);
      end = new Date(endRaw);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        messages.push("Start/End Date is not a valid date");
        status = "ERROR";
      } else if (end <= start) {
        messages.push("End Date must be after Start Date");
        status = "ERROR";
      }
    }

    if (estimatedHours !== undefined && estimatedHours !== "" && isNaN(Number(estimatedHours))) {
      messages.push("Sub-task Estimated Hours must be numeric");
      status = "ERROR";
    } else if (estimatedHours !== undefined && estimatedHours !== "" && Number(estimatedHours) < 0) {
      messages.push("Sub-task Estimated Hours must be >= 0");
      status = "ERROR";
    }

    if (!adminEmployeeId) {
      messages.push("Project Admin (Employee ID) is required");
      status = "ERROR";
    } else if (!adminByEmployeeId.has(adminEmployeeId)) {
      messages.push(`Project Admin "${adminEmployeeId}" not found or not an active Project Admin/Super Admin`);
      status = "ERROR";
    }

    if (!billingTypeRaw || !validBillingTypes.has(normalizeBillingType(billingTypeRaw))) {
      messages.push('Project Billing Type must be one of "T&M", "Fixed", "Managed Services"');
      status = "ERROR";
    }

    if (subtaskBillable && !["Billable", "Non-billable"].includes(subtaskBillable)) {
      messages.push('Sub-task Billable must be "Billable" or "Non-billable" (defaults to Billable if left blank)');
      status = "ERROR";
    }

    return { rowNumber: idx + 2, data: row, status, messages };
  });
}
