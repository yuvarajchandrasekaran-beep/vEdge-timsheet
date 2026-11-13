import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeUsFederalHolidays } from "../src/services/usFederalHolidays";
import { ensureDefaultProject, enrollInDefaultProject } from "../src/services/defaultProject";

const prisma = new PrismaClient();
const PASSWORD = "Password123!";

async function main() {
  console.log("Seeding TimeSync demo data...");

  const roleNames = ["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN", "INDIVIDUAL_USER"];
  const roles: Record<string, { id: number }> = {};
  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const departments: Record<string, { id: number }> = {};
  for (const [name, code] of [
    ["Engineering", "ENG"],
    ["QA", "QA"],
    ["Business", "BIZ"],
    ["HR", "HR"],
    ["Operations", "OPS"],
  ] as const) {
    departments[name] = await prisma.department.upsert({ where: { code }, update: {}, create: { name, code } });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  async function upsertUser(params: {
    employeeId: string;
    name: string;
    email: string;
    role: string;
    department: keyof typeof departments;
    jobTitle: string;
    managerEmployeeId?: string;
    startDate: string;
  }) {
    const manager = params.managerEmployeeId ? await prisma.user.findUnique({ where: { employeeId: params.managerEmployeeId } }) : null;
    return prisma.user.upsert({
      where: { employeeId: params.employeeId },
      update: { managerId: manager?.id, status: "ACTIVE" },
      create: {
        employeeId: params.employeeId,
        name: params.name,
        email: params.email,
        passwordHash,
        roleId: roles[params.role].id,
        departmentId: departments[params.department].id,
        jobTitle: params.jobTitle,
        managerId: manager?.id,
        startDate: new Date(params.startDate),
        status: "ACTIVE",
      },
    });
  }

  // Managers are created before the people who report to them — upsertUser
  // resolves managerEmployeeId by looking up an existing user at the time
  // each row is created, so referencing a not-yet-created employee ID would
  // silently leave managerId null.
  const shibani = await upsertUser({
    employeeId: "VE-2002",
    name: "Shibani Gandhi",
    email: "shibani.gandhi@vivid-edge.com",
    role: "HR_ADMIN",
    department: "HR",
    jobTitle: "HR Admin",
    startDate: "2020-09-01",
  });

  const ramesh = await upsertUser({
    employeeId: "VE-2003",
    name: "Ramesh Natarajan",
    email: "ramesh.natarajan@vivid-edge.com",
    role: "PROJECT_ADMIN",
    department: "Engineering",
    jobTitle: "Project Admin",
    managerEmployeeId: "VE-2002",
    startDate: "2021-11-01",
  });

  const ramakrishna = await upsertUser({
    employeeId: "VE-2004",
    name: "Ramakrishna Avalur",
    email: "ramakrishna.avalur@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Engineering",
    jobTitle: "Software Engineer",
    managerEmployeeId: "VE-2003",
    startDate: "2022-02-15",
  });

  const ravi = await upsertUser({
    employeeId: "VE-2005",
    name: "Ravi Angara",
    email: "ravi.angara@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Engineering",
    jobTitle: "Software Engineer",
    managerEmployeeId: "VE-2003",
    startDate: "2022-05-01",
  });

  const raghu = await upsertUser({
    employeeId: "VE-2006",
    name: "Raghu Muniyappa",
    email: "raghu.muniyappa@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Engineering",
    jobTitle: "Software Engineer",
    managerEmployeeId: "VE-2003",
    startDate: "2022-07-01",
  });

  const steven = await upsertUser({
    employeeId: "VE-2007",
    name: "Steven Dsouza",
    email: "steven.dsouza@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "QA",
    jobTitle: "QA Engineer",
    managerEmployeeId: "VE-2003",
    startDate: "2023-01-10",
  });

  const indira = await upsertUser({
    employeeId: "VE-2008",
    name: "Indira Chunduri",
    email: "indira.chunduri@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Business",
    jobTitle: "Business Analyst",
    managerEmployeeId: "VE-2003",
    startDate: "2022-10-01",
  });

  const krishna = await upsertUser({
    employeeId: "VE-2009",
    name: "Krishna Sindhuja",
    email: "krishna.sindhuja@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "QA",
    jobTitle: "QA Engineer",
    managerEmployeeId: "VE-2003",
    startDate: "2023-03-01",
  });

  const yuvaraj = await upsertUser({
    employeeId: "VE-2010",
    name: "Yuvaraj Chandrasekaran",
    email: "yuvaraj.chandrasekaran@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Operations",
    jobTitle: "Consultant",
    managerEmployeeId: "VE-2003",
    startDate: "2021-01-15",
  });

  const bhaskar = await upsertUser({
    employeeId: "VE-2000",
    name: "Bhaskar Dasari",
    email: "bdasari@vivid-edge.com",
    role: "SUPER_ADMIN",
    department: "Operations",
    jobTitle: "Super Admin",
    startDate: "2021-03-01",
  });

  const jeff = await upsertUser({
    employeeId: "VE-2001",
    name: "Jeff Cockman",
    email: "jeff.cockman@vivid-edge.com",
    role: "SUPER_ADMIN",
    department: "Operations",
    jobTitle: "Super Admin",
    startDate: "2021-06-15",
  });

  // Clients & Projects
  const vividEdgeClient = await prisma.client.upsert({ where: { name: "Vivid Edge" }, update: { status: "ACTIVE" }, create: { name: "Vivid Edge", status: "ACTIVE" } });
  const finCorpClient = await prisma.client.upsert({ where: { name: "FinCorp" }, update: { status: "ACTIVE" }, create: { name: "FinCorp", status: "ACTIVE" } });

  async function upsertProject(params: {
    code: string;
    name: string;
    clientId: number;
    status: string;
    billingType: string;
    startDate: string;
    endDate: string;
    tasks: { name: string; estimatedHours: number; billable: boolean }[];
    sendTimesheetToClient?: boolean;
    clientContactEmail?: string;
  }) {
    const project = await prisma.project.upsert({
      where: { code: params.code },
      update: {
        status: params.status,
        billingType: params.billingType,
        sendTimesheetToClient: params.sendTimesheetToClient ?? false,
        clientContactEmail: params.clientContactEmail,
      },
      create: {
        code: params.code,
        name: params.name,
        clientId: params.clientId,
        status: params.status,
        billingType: params.billingType,
        startDate: new Date(params.startDate),
        endDate: new Date(params.endDate),
        sendTimesheetToClient: params.sendTimesheetToClient ?? false,
        clientContactEmail: params.clientContactEmail,
      },
    });
    const tasks = [];
    for (const taskDef of params.tasks) {
      const existing = await prisma.projectTask.findFirst({ where: { projectId: project.id, name: taskDef.name } });
      tasks.push(
        existing ??
          (await prisma.projectTask.create({
            data: {
              projectId: project.id,
              name: taskDef.name,
              estimatedHours: taskDef.estimatedHours,
              billable: taskDef.billable,
              startDate: project.startDate,
              endDate: project.endDate,
              active: true,
            },
          }))
      );
    }
    return { project, tasks };
  }

  const erp = await upsertProject({
    code: "ERP-01",
    name: "Vivid Edge ERP",
    clientId: vividEdgeClient.id,
    status: "ACTIVE",
    billingType: "MANAGED_SERVICES",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [
      { name: "Development", estimatedHours: 900, billable: false },
      { name: "Testing", estimatedHours: 300, billable: false },
    ],
  });

  const finOps = await upsertProject({
    code: "FIN-02",
    name: "FinOps Platform",
    clientId: finCorpClient.id,
    status: "ACTIVE",
    billingType: "T_AND_M",
    startDate: "2026-02-01",
    endDate: "2026-10-31",
    tasks: [
      { name: "Integration", estimatedHours: 450, billable: true },
      { name: "API Development", estimatedHours: 450, billable: true },
    ],
    sendTimesheetToClient: true,
    clientContactEmail: "billing@fincorp-demo.com",
  });

  const mobile = await upsertProject({
    code: "MOB-03",
    name: "Mobile App Revamp",
    clientId: vividEdgeClient.id,
    status: "ACTIVE",
    billingType: "FIXED",
    startDate: "2026-03-15",
    endDate: "2026-11-30",
    tasks: [
      { name: "UI/UX", estimatedHours: 250, billable: false },
      { name: "Wireframes", estimatedHours: 150, billable: false },
    ],
  });

  const dataMigration = await upsertProject({
    code: "DAT-04",
    name: "Data Migration",
    clientId: vividEdgeClient.id,
    status: "COMPLETED",
    billingType: "FIXED",
    startDate: "2026-01-10",
    endDate: "2026-08-15",
    tasks: [{ name: "Migration", estimatedHours: 300, billable: false }],
  });

  const internalTools = await upsertProject({
    code: "INT-05",
    name: "Internal Tools",
    clientId: vividEdgeClient.id,
    status: "ACTIVE",
    billingType: "MANAGED_SERVICES",
    startDate: "2026-04-01",
    endDate: "2026-12-31",
    tasks: [{ name: "Training", estimatedHours: 200, billable: false }],
  });

  // Pillars / Sub-Pillars — the example values from the original request.
  // Only a couple of tasks are tagged, so the Pillar columns also show what
  // an untagged task looks like.
  const pillarDefs: Record<string, string[]> = {
    "Product Engineering": ["ServiceNow", "Digital Adoption"],
    "Quality Assurance": ["Manual Testing", "Opkey Automation"],
  };
  const subPillars: Record<string, number> = {};
  for (const [pillarName, subNames] of Object.entries(pillarDefs)) {
    const pillar = await prisma.pillar.upsert({ where: { name: pillarName }, update: {}, create: { name: pillarName } });
    for (const name of subNames) {
      const sub = await prisma.subPillar.upsert({
        where: { pillarId_name: { pillarId: pillar.id, name } },
        update: {},
        create: { pillarId: pillar.id, name },
      });
      subPillars[name] = sub.id;
    }
  }
  const [erpDevelopment, erpTesting] = erp.tasks;
  // Only tag untagged tasks, so re-seeding never overwrites an admin's choice.
  await prisma.projectTask.updateMany({ where: { id: erpDevelopment.id, subPillarId: null }, data: { subPillarId: subPillars["ServiceNow"] } });
  await prisma.projectTask.updateMany({ where: { id: erpTesting.id, subPillarId: null }, data: { subPillarId: subPillars["Manual Testing"] } });

  // Example client engagements requested for the demo catalogue.
  const vodacomClient = await prisma.client.upsert({ where: { name: "Vodacom" }, update: { status: "ACTIVE" }, create: { name: "Vodacom", status: "ACTIVE" } });
  const solsticeClient = await prisma.client.upsert({ where: { name: "Solstice" }, update: { status: "ACTIVE" }, create: { name: "Solstice", status: "ACTIVE" } });
  const serviceNowClient = await prisma.client.upsert({ where: { name: "ServiceNow" }, update: { status: "ACTIVE" }, create: { name: "ServiceNow", status: "ACTIVE" } });
  const nucorClient = await prisma.client.upsert({ where: { name: "Nucor Corp" }, update: { status: "ACTIVE" }, create: { name: "Nucor Corp", status: "ACTIVE" } });

  // Holiday calendars — one per client that has one, color-coded. Every
  // employee is auto-enrolled in the standing Time Off & Admin project under
  // Vivid Edge (see services/defaultProject.ts), so everyone sees the Vivid
  // Edge Corporate Calendar by default; anyone also on a Vodacom or
  // ServiceNow project additionally sees that calendar's own holidays,
  // color-coded separately — and on Thanksgiving (shared by both calendars
  // below) sees BOTH colors on the same day, demonstrating overlap. FinCorp,
  // Solstice and Nucor Corp are deliberately left without a calendar, to
  // demonstrate that a client with none contributes no holidays at all.
  const vividEdgeCalendar = await prisma.holidayCalendar.upsert({
    where: { name: "Vivid Edge Corporate Calendar" },
    update: { color: "#1B4298" },
    create: { name: "Vivid Edge Corporate Calendar", color: "#1B4298" },
  });
  const vodacomCalendar = await prisma.holidayCalendar.upsert({
    where: { name: "Vodacom Calendar" },
    update: { color: "#F59E0B" },
    create: { name: "Vodacom Calendar", color: "#F59E0B" },
  });
  const serviceNowCalendar = await prisma.holidayCalendar.upsert({
    where: { name: "ServiceNow Calendar" },
    update: { color: "#16A34A" },
    create: { name: "ServiceNow Calendar", color: "#16A34A" },
  });
  await prisma.client.update({ where: { id: vividEdgeClient.id }, data: { holidayCalendarId: vividEdgeCalendar.id } });
  await prisma.client.update({ where: { id: vodacomClient.id }, data: { holidayCalendarId: vodacomCalendar.id } });
  await prisma.client.update({ where: { id: serviceNowClient.id }, data: { holidayCalendarId: serviceNowCalendar.id } });

  async function ensureHoliday(name: string, date: string, calendarId: number) {
    const d = new Date(date);
    const existing = await prisma.holiday.findFirst({ where: { name, date: d, calendarId } });
    if (!existing) await prisma.holiday.create({ data: { name, date: d, calendarId } });
  }

  // Vivid Edge: Founder's Day plus the full US federal calendar, spanning
  // this and next year so both the current and upcoming Monthly views show
  // holiday warnings without needing a manual sync first.
  await ensureHoliday("Founder's Day", "2026-09-05", vividEdgeCalendar.id);
  for (const year of [2026, 2027]) {
    for (const h of computeUsFederalHolidays(year)) {
      await ensureHoliday(h.name, h.date.toISOString().slice(0, 10), vividEdgeCalendar.id);
    }
  }

  // Vodacom (South Africa) — its own distinct public holidays, none of
  // which overlap the US federal calendar above.
  await ensureHoliday("Heritage Day", "2026-09-24", vodacomCalendar.id);
  await ensureHoliday("Day of Reconciliation", "2026-12-16", vodacomCalendar.id);
  await ensureHoliday("Workers' Day", "2026-05-01", vodacomCalendar.id);

  // ServiceNow — deliberately shares Thanksgiving with Vivid Edge's calendar
  // so anyone on both (e.g. the ServiceNow BCM/BIA team below) sees two
  // colors on that one date.
  await ensureHoliday("Thanksgiving Day", "2026-11-26", serviceNowCalendar.id);
  await ensureHoliday("ServiceNow Customer Appreciation Day", "2026-08-10", serviceNowCalendar.id);

  const vodacomSupport = await upsertProject({
    code: "VOD-01",
    name: "Support",
    clientId: vodacomClient.id,
    status: "ACTIVE",
    billingType: "MANAGED_SERVICES",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [
      { name: "Ticket Resolution", estimatedHours: 250, billable: true },
      { name: "Monitoring", estimatedHours: 150, billable: true },
    ],
  });

  const vodacomSaas = await upsertProject({
    code: "VOD-02",
    name: "SaaS Project",
    clientId: vodacomClient.id,
    status: "ACTIVE",
    billingType: "T_AND_M",
    startDate: "2026-03-01",
    endDate: "2026-12-31",
    tasks: [
      { name: "Development", estimatedHours: 450, billable: true },
      { name: "Deployment", estimatedHours: 250, billable: true },
    ],
  });

  const solsticeDemo = await upsertProject({
    code: "SOL-01",
    name: "Demo Agent Development",
    clientId: solsticeClient.id,
    status: "ACTIVE",
    billingType: "FIXED",
    startDate: "2026-05-01",
    endDate: "2026-09-30",
    tasks: [
      { name: "Agent Build", estimatedHours: 150, billable: true },
      { name: "Testing", estimatedHours: 100, billable: true },
    ],
  });

  const serviceNowBcm = await upsertProject({
    code: "SNOW-01",
    name: "BCM Agent",
    clientId: serviceNowClient.id,
    status: "ACTIVE",
    billingType: "T_AND_M",
    startDate: "2026-02-01",
    endDate: "2026-11-30",
    tasks: [
      { name: "Requirements", estimatedHours: 120, billable: true },
      { name: "Development", estimatedHours: 230, billable: true },
    ],
  });

  const serviceNowBia = await upsertProject({
    code: "SNOW-02",
    name: "BIA Agent",
    clientId: serviceNowClient.id,
    status: "ACTIVE",
    billingType: "T_AND_M",
    startDate: "2026-02-01",
    endDate: "2026-11-30",
    tasks: [
      { name: "Requirements", estimatedHours: 120, billable: true },
      { name: "Development", estimatedHours: 230, billable: true },
    ],
  });

  const nucorDr = await upsertProject({
    code: "NUC-01",
    name: "DR",
    clientId: nucorClient.id,
    status: "ACTIVE",
    billingType: "FIXED",
    startDate: "2026-01-15",
    endDate: "2026-10-31",
    tasks: [
      { name: "Planning", estimatedHours: 150, billable: true },
      { name: "Execution", estimatedHours: 350, billable: true },
    ],
  });

  const exampleProjects = [vodacomSupport, vodacomSaas, solsticeDemo, serviceNowBcm, serviceNowBia, nucorDr];
  const allProjects = [erp, finOps, mobile, dataMigration, internalTools, ...exampleProjects];

  async function assign(userId: number, projectId: number, roleOnProject = "Member") {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: {},
      create: { projectId, userId, roleOnProject },
    });
  }

  // Ramesh administers every project.
  for (const p of allProjects) {
    await assign(ramesh.id, p.project.id, "Project Admin");
  }
  // ERP-01 demonstrates multiple project admins: Shibani co-administers
  // alongside Ramesh.
  await assign(shibani.id, erp.project.id, "Project Admin");
  // Timesheet entry requires a real ProjectMember row (see
  // timesheetValidation.ts's NOT_ASSIGNED check) — without this, a Super
  // Admin has no project to log time against at all and can never submit a
  // timesheet, which reads as "can't submit" rather than the real cause.
  await assign(bhaskar.id, erp.project.id);

  // Individual users spread across both the original and the new client engagements.
  await assign(ramakrishna.id, erp.project.id);
  await assign(ramakrishna.id, dataMigration.project.id);
  await assign(ramakrishna.id, vodacomSaas.project.id);

  await assign(ravi.id, erp.project.id);
  await assign(ravi.id, finOps.project.id);
  await assign(ravi.id, solsticeDemo.project.id);

  await assign(raghu.id, mobile.project.id);
  await assign(raghu.id, vodacomSaas.project.id);
  await assign(raghu.id, serviceNowBia.project.id);

  await assign(steven.id, finOps.project.id);
  await assign(steven.id, vodacomSupport.project.id);
  await assign(steven.id, nucorDr.project.id);

  await assign(indira.id, internalTools.project.id);
  await assign(indira.id, vodacomSupport.project.id);
  await assign(indira.id, serviceNowBia.project.id);

  await assign(krishna.id, mobile.project.id);
  await assign(krishna.id, serviceNowBcm.project.id);
  await assign(krishna.id, nucorDr.project.id);

  await assign(yuvaraj.id, solsticeDemo.project.id);
  await assign(yuvaraj.id, serviceNowBcm.project.id);

  // Ramakrishna Avalur's current week (Aug 31 - Sep 6, 2026) — the populated
  // example week shown on the Dashboard/Timesheet screens by default.
  const weekStart = new Date("2026-08-31");
  const timesheet = await prisma.timesheet.upsert({
    where: { userId_weekStartDate: { userId: ramakrishna.id, weekStartDate: weekStart } },
    update: { status: "SUBMITTED" },
    create: { userId: ramakrishna.id, weekStartDate: weekStart, status: "SUBMITTED", submittedAt: new Date("2026-09-04T10:42:00Z") },
  });

  const erpDev = erp.tasks.find((t) => t.name === "Development")!;
  const vodSaasDev = vodacomSaas.tasks.find((t) => t.name === "Development")!;
  const finOpsIntegration = finOps.tasks.find((t) => t.name === "Integration")!;
  const mobileUiUx = mobile.tasks.find((t) => t.name === "UI/UX")!;
  const internalTraining = internalTools.tasks.find((t) => t.name === "Training")!;

  const dayHours: Record<string, [number, number]> = {
    "2026-08-31": [4, 2.5],
    "2026-09-01": [4, 2],
    "2026-09-02": [4, 2],
    "2026-09-03": [4, 2],
    "2026-09-04": [0, 2],
    "2026-09-05": [0, 0],
    "2026-09-06": [0, 0],
  };

  async function upsertEntry(taskId: number, date: string, hours: number, notes?: string) {
    if (hours <= 0 && !notes) return;
    await prisma.timesheetEntry.upsert({
      where: { timesheetId_projectTaskId_entryDate: { timesheetId: timesheet.id, projectTaskId: taskId, entryDate: new Date(date) } },
      update: { hours, notes },
      create: { timesheetId: timesheet.id, projectTaskId: taskId, entryDate: new Date(date), hours, notes },
    });
  }

  for (const [date, [erpH, saasH]] of Object.entries(dayHours)) {
    await upsertEntry(erpDev.id, date, erpH, date === "2026-09-02" ? "Implemented user role permissions" : undefined);
    await upsertEntry(vodSaasDev.id, date, saasH, date === "2026-09-02" ? "Vodacom SaaS onboarding flow" : undefined);
  }

  // A handful of other submitted timesheets so the approval queues aren't empty.
  async function quickSubmittedWeek(userId: number, taskId: number, totalHoursPerDay: number, status: string) {
    const t = await prisma.timesheet.upsert({
      where: { userId_weekStartDate: { userId, weekStartDate: weekStart } },
      update: { status },
      create: { userId, weekStartDate: weekStart, status, submittedAt: new Date("2026-09-04T09:15:00Z") },
    });
    for (let i = 0; i < 5; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      await prisma.timesheetEntry.upsert({
        where: { timesheetId_projectTaskId_entryDate: { timesheetId: t.id, projectTaskId: taskId, entryDate: date } },
        update: {},
        create: { timesheetId: t.id, projectTaskId: taskId, entryDate: date, hours: totalHoursPerDay },
      });
    }
    return t;
  }

  await quickSubmittedWeek(ravi.id, erpDev.id, 8, "SUBMITTED");
  await quickSubmittedWeek(raghu.id, mobileUiUx.id, 7.7, "SUBMITTED");
  await quickSubmittedWeek(steven.id, finOpsIntegration.id, 8, "SUBMITTED");
  // Ramesh is a Project Admin on ERP-01, so his own submission there self-approves.
  await quickSubmittedWeek(ramesh.id, erpDev.id, 7.2, "APPROVED");

  // Backfill several months of history per project so utilization/reporting
  // screens show realistic, non-zero burn-down rather than a single week of
  // data. Entries are written as Approved history — status here doesn't
  // affect the raw hours utilization sums, but "Approved" reads more
  // realistically as settled historical weeks than "Draft".
  async function backfillProjectHistory(params: { members: { userId: number; taskId: number }[]; targetHours: number; weeksBack: number }) {
    const perWeekTotal = params.targetHours / params.weeksBack;
    const perMemberPerWeek = perWeekTotal / params.members.length;
    for (let w = 1; w <= params.weeksBack; w++) {
      const histWeekStart = new Date(weekStart);
      histWeekStart.setDate(histWeekStart.getDate() - 7 * w);
      for (const member of params.members) {
        const t = await prisma.timesheet.upsert({
          where: { userId_weekStartDate: { userId: member.userId, weekStartDate: histWeekStart } },
          update: { status: "APPROVED" },
          create: { userId: member.userId, weekStartDate: histWeekStart, status: "APPROVED", submittedAt: histWeekStart },
        });
        const perDay = Math.round((perMemberPerWeek / 5) * 100) / 100;
        for (let d = 0; d < 5; d++) {
          const date = new Date(histWeekStart);
          date.setDate(date.getDate() + d);
          await prisma.timesheetEntry.upsert({
            where: { timesheetId_projectTaskId_entryDate: { timesheetId: t.id, projectTaskId: member.taskId, entryDate: date } },
            update: {},
            create: { timesheetId: t.id, projectTaskId: member.taskId, entryDate: date, hours: perDay },
          });
        }
      }
    }
  }

  await backfillProjectHistory({
    members: [
      { userId: ramakrishna.id, taskId: erpDev.id },
      { userId: ravi.id, taskId: erpDev.id },
      { userId: raghu.id, taskId: erp.tasks.find((t) => t.name === "Testing")!.id },
    ],
    targetHours: 928, // ~80% of the 1200h budget once combined with the current-week entries above
    weeksBack: 20,
  });
  await backfillProjectHistory({
    members: [
      { userId: ravi.id, taskId: finOpsIntegration.id },
      { userId: steven.id, taskId: finOps.tasks.find((t) => t.name === "API Development")!.id },
    ],
    targetHours: 599,
    weeksBack: 18,
  });
  await backfillProjectHistory({
    members: [
      { userId: raghu.id, taskId: mobileUiUx.id },
      { userId: krishna.id, taskId: mobile.tasks.find((t) => t.name === "Wireframes")!.id },
    ],
    targetHours: 234,
    weeksBack: 16,
  });
  await backfillProjectHistory({
    members: [{ userId: ramakrishna.id, taskId: dataMigration.tasks.find((t) => t.name === "Migration")!.id }],
    targetHours: 180,
    weeksBack: 12,
  });
  await backfillProjectHistory({
    members: [{ userId: indira.id, taskId: internalTraining.id }],
    targetHours: 110,
    weeksBack: 10,
  });

  // Utilization history for the new client engagements.
  await backfillProjectHistory({
    members: [
      { userId: steven.id, taskId: vodacomSupport.tasks.find((t) => t.name === "Ticket Resolution")!.id },
      { userId: indira.id, taskId: vodacomSupport.tasks.find((t) => t.name === "Monitoring")!.id },
    ],
    targetHours: 320,
    weeksBack: 16,
  });
  await backfillProjectHistory({
    members: [
      { userId: ramakrishna.id, taskId: vodSaasDev.id },
      { userId: raghu.id, taskId: vodacomSaas.tasks.find((t) => t.name === "Deployment")!.id },
    ],
    targetHours: 490,
    weeksBack: 14,
  });
  await backfillProjectHistory({
    members: [
      { userId: ravi.id, taskId: solsticeDemo.tasks.find((t) => t.name === "Agent Build")!.id },
      { userId: yuvaraj.id, taskId: solsticeDemo.tasks.find((t) => t.name === "Testing")!.id },
    ],
    targetHours: 150,
    weeksBack: 10,
  });
  await backfillProjectHistory({
    members: [
      { userId: krishna.id, taskId: serviceNowBcm.tasks.find((t) => t.name === "Requirements")!.id },
      { userId: yuvaraj.id, taskId: serviceNowBcm.tasks.find((t) => t.name === "Development")!.id },
    ],
    targetHours: 245,
    weeksBack: 12,
  });
  await backfillProjectHistory({
    members: [
      { userId: raghu.id, taskId: serviceNowBia.tasks.find((t) => t.name === "Requirements")!.id },
      { userId: indira.id, taskId: serviceNowBia.tasks.find((t) => t.name === "Development")!.id },
    ],
    targetHours: 200,
    weeksBack: 12,
  });
  await backfillProjectHistory({
    members: [
      { userId: steven.id, taskId: nucorDr.tasks.find((t) => t.name === "Planning")!.id },
      { userId: krishna.id, taskId: nucorDr.tasks.find((t) => t.name === "Execution")!.id },
    ],
    targetHours: 350,
    weeksBack: 14,
  });

  await prisma.organizationSettings.upsert({
    where: { id: 1 },
    update: { workWeekStartDay: "MONDAY" },
    create: { id: 1 },
  });

  const allSeedUsers = [bhaskar, jeff, shibani, ramesh, ramakrishna, ravi, raghu, steven, indira, krishna, yuvaraj];

  // Real user creation (single-create, bulk import) auto-enrolls into the
  // standing Time Off & Admin project under Vivid Edge (see
  // services/defaultProject.ts) — seed.ts creates its demo users directly
  // via prisma.user.upsert, bypassing that, so without this every seed user
  // would be missing the one membership that's supposed to guarantee
  // everyone sees at least the Vivid Edge Corporate Calendar.
  const { id: defaultProjectId } = await ensureDefaultProject();
  for (const user of allSeedUsers) {
    await enrollInDefaultProject(user.id, defaultProjectId);
  }

  // A few seed notifications so the Notification Center and dashboard
  // announcement banner aren't empty on a fresh clone.
  for (const user of allSeedUsers) {
    const existing = await prisma.notification.findFirst({ where: { userId: user.id, type: "ANNOUNCEMENT" } });
    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: "ANNOUNCEMENT",
          title: "Upcoming holiday",
          message: "Holiday on Sep 5, 2026 (Founder's Day). Timesheets for this week are due by Sep 6, 2026 11:59 PM.",
        },
      });
    }
  }
  const rameshReminder = await prisma.notification.findFirst({ where: { userId: ramesh.id, type: "PendingApproval" } });
  if (!rameshReminder) {
    await prisma.notification.create({
      data: {
        userId: ramesh.id,
        type: "PendingApproval",
        title: "New timesheets awaiting your approval",
        message: "4 timesheets are ready for your review.",
      },
    });
  }

  console.log("Seed complete. Demo login password for every seed user:", PASSWORD);
  console.log("Users:", allSeedUsers.map((u) => u.email).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
