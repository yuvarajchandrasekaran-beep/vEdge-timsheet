import { prisma } from "../lib/prisma";
import { ALL_ROLES } from "../constants/enums";

export interface UserImportRow {
  "Employee ID": string;
  "Full Name": string;
  "Work Email": string;
  Department: string;
  Role: string;
  "Reporting Manager (Employee ID)"?: string;
  "Start Date": string;
  Status?: string;
}

export interface ValidatedRow {
  rowNumber: number;
  data: UserImportRow;
  status: "VALID" | "WARNING" | "ERROR";
  messages: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function validateUserRows(rows: UserImportRow[]): Promise<ValidatedRow[]> {
  const existingEmployeeIds = new Set((await prisma.user.findMany({ select: { employeeId: true } })).map((u) => u.employeeId));
  const existingEmails = new Set((await prisma.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()));
  const departments = await prisma.department.findMany();
  const deptByCode = new Map(departments.map((d) => [d.code.toLowerCase(), d]));
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));

  const seenEmployeeIdsInFile = new Set<string>();
  const seenEmailsInFile = new Set<string>();

  const results: ValidatedRow[] = [];

  rows.forEach((row, idx) => {
    const messages: string[] = [];
    let status: ValidatedRow["status"] = "VALID";

    const employeeId = String(row["Employee ID"] ?? "").trim();
    const fullName = String(row["Full Name"] ?? "").trim();
    const email = String(row["Work Email"] ?? "").trim().toLowerCase();
    const department = String(row["Department"] ?? "").trim();
    const role = String(row["Role"] ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    const managerEmployeeId = String(row["Reporting Manager (Employee ID)"] ?? "").trim();
    const startDateRaw = row["Start Date"];
    const statusValue = String(row["Status"] ?? "Active").trim() || "Active";

    if (!employeeId) {
      messages.push("Employee ID is required");
      status = "ERROR";
    } else if (!/^[A-Za-z0-9-]+$/.test(employeeId)) {
      messages.push("Employee ID must be alphanumeric");
      status = "ERROR";
    } else if (existingEmployeeIds.has(employeeId) || seenEmployeeIdsInFile.has(employeeId)) {
      messages.push(`Employee ID "${employeeId}" already exists`);
      status = "ERROR";
    }
    seenEmployeeIdsInFile.add(employeeId);

    if (!fullName) {
      messages.push("Full Name is required");
      status = "ERROR";
    }

    if (!email) {
      messages.push("Work Email is required");
      status = "ERROR";
    } else if (!EMAIL_RE.test(email)) {
      messages.push("Work Email is not a valid email address");
      status = "ERROR";
    } else if (existingEmails.has(email) || seenEmailsInFile.has(email)) {
      messages.push(`Work Email "${email}" already exists`);
      status = "ERROR";
    }
    seenEmailsInFile.add(email);

    if (!department) {
      messages.push("Department is required");
      status = "ERROR";
    } else if (!deptByCode.has(department.toLowerCase()) && !deptByName.has(department.toLowerCase())) {
      messages.push(`Department "${department}" does not exist and will be created`);
      if (status !== "ERROR") status = "WARNING";
    }

    if (!role) {
      messages.push("Role is required");
      status = "ERROR";
    } else if (!(ALL_ROLES as string[]).includes(role)) {
      messages.push(`Role "${row["Role"]}" is not one of: Super Admin, HR Admin, Project Admin, Individual User`);
      status = "ERROR";
    }

    if (managerEmployeeId && !existingEmployeeIds.has(managerEmployeeId) && !seenEmployeeIdsInFile.has(managerEmployeeId)) {
      messages.push(`Reporting Manager Employee ID "${managerEmployeeId}" not found`);
      if (status !== "ERROR") status = "WARNING";
    }

    let startDate: Date | null = null;
    if (!startDateRaw) {
      messages.push("Start Date is required");
      status = "ERROR";
    } else {
      startDate = new Date(startDateRaw as string);
      if (isNaN(startDate.getTime())) {
        messages.push("Start Date is not a valid date");
        status = "ERROR";
      }
    }

    if (statusValue && !["Active", "Inactive"].includes(statusValue)) {
      messages.push(`Status "${statusValue}" defaulted to Active`);
      if (status !== "ERROR") status = "WARNING";
    }

    results.push({
      rowNumber: idx + 2, // account for header row, 1-indexed
      data: row,
      status,
      messages,
    });
  });

  return results;
}
