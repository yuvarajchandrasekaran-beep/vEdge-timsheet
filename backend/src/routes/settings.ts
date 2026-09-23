import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";

const router = Router();

async function getOrgSettingsRow() {
  let settings = await prisma.organizationSettings.findFirst();
  if (!settings) settings = await prisma.organizationSettings.create({ data: {} });
  return settings;
}

function serializeOrgSettings(s: Awaited<ReturnType<typeof getOrgSettingsRow>>) {
  return {
    orgName: s.orgName,
    timezone: s.timezone,
    weekStartsOn: s.workWeekStartDay,
    dailyHourLimit: s.standardHoursPerDay,
    weeklyHourLimit: s.weeklyHourLimit,
  };
}

/**
 * @swagger
 * /settings/organization:
 *   get:
 *     summary: Get organization-wide settings
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/organization",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(serializeOrgSettings(await getOrgSettingsRow()));
  })
);

const orgSchema = z.object({
  orgName: z.string().optional(),
  timezone: z.string().optional(),
  weekStartsOn: z.enum(["MONDAY", "SUNDAY"]).optional(),
  dailyHourLimit: z.coerce.number().optional(),
  weeklyHourLimit: z.coerce.number().optional(),
});

/**
 * @swagger
 * /settings/organization:
 *   put:
 *     summary: Update organization-wide settings
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/organization",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const body = orgSchema.parse(req.body);
    const existing = await getOrgSettingsRow();
    const updated = await prisma.organizationSettings.update({
      where: { id: existing.id },
      data: {
        orgName: body.orgName,
        timezone: body.timezone,
        workWeekStartDay: body.weekStartsOn,
        standardHoursPerDay: body.dailyHourLimit,
        weeklyHourLimit: body.weeklyHourLimit,
      },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "OrganizationSettings", entityId: updated.id, action: "Update", before: existing, after: updated });
    res.json(serializeOrgSettings(updated));
  })
);

/**
 * @swagger
 * /settings/branding:
 *   get:
 *     summary: Get branding configuration (logo, colors)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/branding",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const settings = await getOrgSettingsRow();
    res.json({
      logoUrl: settings.brandingLogoUrl,
      primaryColor: settings.brandingPrimaryColor,
      accentColor: settings.brandingAccentColor,
    });
  })
);

const brandingSchema = z.object({
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  accentColor: z.string().optional(),
});

/**
 * @swagger
 * /settings/branding:
 *   put:
 *     summary: Update branding configuration
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/branding",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const body = brandingSchema.parse(req.body);
    const existing = await getOrgSettingsRow();
    const updated = await prisma.organizationSettings.update({
      where: { id: existing.id },
      data: {
        brandingLogoUrl: body.logoUrl,
        brandingPrimaryColor: body.primaryColor,
        brandingAccentColor: body.accentColor,
      },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Branding", entityId: updated.id, action: "Update", before: existing, after: updated });
    res.json({ logoUrl: updated.brandingLogoUrl, primaryColor: updated.brandingPrimaryColor, accentColor: updated.brandingAccentColor });
  })
);

/**
 * @swagger
 * /settings/approval-chains:
 *   get:
 *     summary: Describe the single-level approval model (read-only — there is nothing left to configure since it's always the project's own Project Admin(s), with Super Admin as a standing override)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/approval-chains",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    res.json([
      {
        level: "PROJECT_ADMIN",
        approverRole: "PROJECT_ADMIN",
        description:
          "Every submitted timesheet is reviewed and approved by the Project Admin(s) of the project it logs the most time against. If a Project Admin is the only person logging time on their own project, that submission self-approves immediately. Super Admin can always act as a fallback approver.",
      },
    ]);
  })
);

const DEFAULT_NOTIFICATION_RULES: { type: string; event: string; description: string }[] = [
  { type: "SubmissionReminder", event: "Submission reminder", description: "Weekly nudge if the current week isn't submitted yet." },
  { type: "OverdueSubmission", event: "Overdue submission", description: "Escalating notice after the submission deadline passes, cc'd to the manager." },
  { type: "PendingApprovalReminder", event: "Pending approval reminder", description: "Recurring reminder while an item sits in an approver's queue." },
  { type: "EscalationAlert", event: "Escalation alert", description: "Sent to Super Admin when a pending Project Admin approval breaches SLA." },
  { type: "Rejection", event: "Rejection notice", description: "Immediate notice to the employee when a timesheet is rejected." },
  { type: "FinalApproval", event: "Final approval confirmation", description: "Immediate confirmation when a timesheet is approved." },
];

async function getNotificationRuleRows() {
  const existing = await prisma.notificationRule.findMany({ where: { scope: "Global", type: { in: DEFAULT_NOTIFICATION_RULES.map((r) => r.type) } } });
  const byType = new Map(existing.map((r) => [r.type, r]));
  const rows = [];
  for (const def of DEFAULT_NOTIFICATION_RULES) {
    let row = byType.get(def.type);
    if (!row) {
      row = await prisma.notificationRule.create({
        data: { scope: "Global", type: def.type, cadenceConfig: JSON.stringify({ emailEnabled: true, inAppEnabled: true }) },
      });
    }
    rows.push({ row, def });
  }
  return rows;
}

/**
 * @swagger
 * /settings/notification-rules:
 *   get:
 *     summary: List notification/reminder rules
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/notification-rules",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (_req, res) => {
    const rows = await getNotificationRuleRows();
    res.json(
      rows.map(({ row, def }) => {
        const cfg = JSON.parse(row.cadenceConfig || "{}");
        return { id: row.id, event: def.event, description: def.description, emailEnabled: cfg.emailEnabled ?? true, inAppEnabled: cfg.inAppEnabled ?? true };
      })
    );
  })
);

const ruleUpdateSchema = z.object({
  rules: z.array(
    z.object({ id: z.coerce.number(), event: z.string().optional(), description: z.string().optional(), emailEnabled: z.boolean(), inAppEnabled: z.boolean() })
  ),
});

/**
 * @swagger
 * /settings/notification-rules:
 *   put:
 *     summary: Update notification/reminder rule channel toggles
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/notification-rules",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const body = ruleUpdateSchema.parse(req.body);
    for (const rule of body.rules) {
      await prisma.notificationRule.update({
        where: { id: rule.id },
        data: { cadenceConfig: JSON.stringify({ emailEnabled: rule.emailEnabled, inAppEnabled: rule.inAppEnabled }) },
      });
    }
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "NotificationRule", action: "Update", after: body.rules });
    const rows = await getNotificationRuleRows();
    res.json(
      rows.map(({ row, def }) => {
        const cfg = JSON.parse(row.cadenceConfig || "{}");
        return { id: row.id, event: def.event, description: def.description, emailEnabled: cfg.emailEnabled ?? true, inAppEnabled: cfg.inAppEnabled ?? true };
      })
    );
  })
);

export default router;
