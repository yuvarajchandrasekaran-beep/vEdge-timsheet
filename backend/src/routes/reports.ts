import path from "path";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, REPORT_KEYS, ReportKey, PROJECT_MEMBER_ROLE } from "../constants/enums";
import { getClientAuditReport, getReportData, getUtilizationOverview, ReportFilters } from "../services/reports";
import { buildWorkbookFromRows, rowsToCsv } from "../services/excel";
import { renderPdfTable } from "../services/pdfTable";
import PDFDocument from "pdfkit";

const router = Router();

// Sibling to both src/ and dist/ (see backend/Dockerfile), so this path
// resolves the same way under `tsx watch` (dev) and the compiled
// `dist/routes/reports.js` (prod).
const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "vivid-edge-logo.png");
const LOGO_ASPECT_RATIO = 576 / 2000; // native PNG is 2000x576px

function parseFilters(req: any): ReportFilters {
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : undefined;
  if (dateFrom && dateTo && new Date(dateTo) < new Date(dateFrom)) {
    throw ApiError.badRequest("To date must be on or after the From date");
  }
  return {
    dateFrom,
    dateTo,
    clientId: req.query.clientId ? Number(req.query.clientId) : undefined,
    projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
    departmentId: req.query.departmentId ? Number(req.query.departmentId) : undefined,
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
  };
}

function assertValidKey(key: string): asserts key is ReportKey {
  if (!(REPORT_KEYS as readonly string[]).includes(key)) {
    throw ApiError.badRequest(`Unknown report key "${key}". Valid keys: ${REPORT_KEYS.join(", ")}`);
  }
}

// Report keys that are meaningfully scoped to "my own data" — the others
// (approval-compliance, missing-timesheets, audit-trail, client-audit) are
// org/manager-level views with no per-user filter to safely restrict them
// to, so Individual Users don't get those at all.
const INDIVIDUAL_USER_REPORT_KEYS: ReadonlySet<string> = new Set(["timesheet-summary", "overtime", "project-utilization"]);

function applyIndividualUserScope(req: any, reportKey: string, filters: ReportFilters) {
  if (req.user!.role !== ROLES.INDIVIDUAL_USER) return;
  if (!INDIVIDUAL_USER_REPORT_KEYS.has(reportKey)) {
    throw ApiError.forbidden("This report isn't available to your role — see Section 8 of the user manual.");
  }
  // Force, regardless of what the caller passed — an Individual User must
  // never be able to pull another user's timesheet/overtime data.
  filters.userId = req.user!.id;
}

/**
 * @swagger
 * /reports/{reportKey}:
 *   get:
 *     summary: Fetch a standard report's data with filters
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:reportKey",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PROJECT_ADMIN, ROLES.INDIVIDUAL_USER),
  asyncHandler(async (req, res) => {
    const reportKey = String(req.params.reportKey);
    assertValidKey(reportKey);
    const filters = parseFilters(req);
    applyIndividualUserScope(req, reportKey, filters);

    // Scope: a Project Admin only ever sees their own projects' data.
    if (req.user!.role === ROLES.PROJECT_ADMIN && !filters.projectId) {
      const owned = await prisma.project.findMany({
        where: { members: { some: { userId: req.user!.id, roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN } } },
        select: { id: true },
      });
      if (owned.length === 1) filters.projectId = owned[0].id;
    }
    // Same simplification for an Individual User on the on-screen
    // project-utilization view: only auto-scoped when unambiguous (exactly
    // one project). With more than one, the existing utilization query has
    // no "any of these projects" filter — a bigger change than this pass.
    if (req.user!.role === ROLES.INDIVIDUAL_USER && reportKey === "project-utilization" && !filters.projectId) {
      const memberOf = await prisma.project.findMany({
        where: { members: { some: { userId: req.user!.id } } },
        select: { id: true },
      });
      if (memberOf.length === 1) filters.projectId = memberOf[0].id;
    }

    if (reportKey === "client-audit") {
      if (!filters.clientId) throw ApiError.badRequest("clientId is required for the Client Audit Report");
      const audit = await getClientAuditReport(filters);
      return res.json({ reportKey, generatedAt: new Date().toISOString(), ...audit });
    }

    // The on-screen table/charts always render project-utilization-shaped
    // data regardless of reportKey (see services/reports.ts docstring) — the
    // distinct per-report-type columns are what the export endpoint below
    // produces instead.
    const overview = await getUtilizationOverview(filters);
    res.json({ reportKey, generatedAt: new Date().toISOString(), ...overview });
  })
);

/**
 * @swagger
 * /reports/{reportKey}/export:
 *   get:
 *     summary: Export a report in the requested format (pdf|xlsx|csv)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:reportKey/export",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PROJECT_ADMIN, ROLES.INDIVIDUAL_USER),
  asyncHandler(async (req, res) => {
    const reportKey = String(req.params.reportKey);
    assertValidKey(reportKey);
    const format = String(req.query.format ?? "csv");
    const filters = parseFilters(req);
    applyIndividualUserScope(req, reportKey, filters);
    if (reportKey === "client-audit" && !filters.clientId) {
      throw ApiError.badRequest("clientId is required for the Client Audit Report");
    }
    const rows = await getReportData(reportKey, filters);
    const fileBase = `${reportKey}_${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      const csv = rowsToCsv(rows as Record<string, unknown>[]);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.csv"`);
      return res.send(csv);
    }

    if (format === "xlsx") {
      const buffer = buildWorkbookFromRows(rows as Record<string, unknown>[], reportKey);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`);
      return res.send(buffer);
    }

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.pdf"`);
      const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
      doc.pipe(res);

      // Every exported report — including Client Audit, which is built
      // specifically to be handed/emailed to an external client — carries
      // the Vivid Edge logo so it reads as a branded, professional document
      // rather than a bare data dump.
      const logoWidth = 110;
      try {
        doc.image(LOGO_PATH, doc.page.margins.left, doc.page.margins.top, { width: logoWidth });
      } catch {
        // Missing/unreadable asset shouldn't block report generation.
      }
      doc.y = doc.page.margins.top + logoWidth * LOGO_ASPECT_RATIO + 10;
      doc.x = doc.page.margins.left;

      doc.fontSize(16).fillColor("#1B4298").text("TimeSync", { continued: true }).fillColor("#000").text(`  —  ${reportKey}`);
      doc.fontSize(9).fillColor("#555").text(`Generated by ${req.user!.name} on ${new Date().toLocaleString()}`);
      const activeFilters = Object.entries(filters).filter(([, v]) => v !== undefined && v !== "");
      if (activeFilters.length > 0) {
        doc.text(`Filters: ${activeFilters.map(([k, v]) => `${k}=${v}`).join(", ")}`);
      }
      doc.moveDown(0.75);
      renderPdfTable(doc, rows as Record<string, unknown>[]);
      doc.end();
      return;
    }

    throw ApiError.badRequest('format must be one of "pdf", "xlsx", "csv"');
  })
);

/**
 * @swagger
 * /reports/{reportKey}/schedule:
 *   post:
 *     summary: Schedule recurring report delivery
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:reportKey/schedule",
  requireAuth,
  // The "Schedule Report" button is shown to every role that can view
  // reports (see ReportsPage.tsx) — Project Admin was missing here, so their
  // click silently 403'd with no error surfaced by the modal.
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const reportKey = String(req.params.reportKey);
    assertValidKey(reportKey);
    const { cadence, recipients } = req.body as { cadence: string; recipients: string[] };
    // Delivery itself needs a real email provider — see README "Swap points".
    // We persist the schedule as a NotificationRule so it's visible/editable.
    const rule = await prisma.notificationRule.create({
      data: {
        scope: "Global",
        type: `ScheduledReport:${reportKey}`,
        cadenceConfig: JSON.stringify({ cadence, recipients }),
      },
    });
    res.status(201).json({ scheduled: true, ruleId: rule.id, reportKey, cadence, recipients });
  })
);

export default router;
