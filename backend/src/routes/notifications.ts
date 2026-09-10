import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();

const DEFAULT_PREFERENCES = {
  email: true,
  inApp: true,
  digest: "NONE" as "NONE" | "DAILY" | "WEEKLY",
  reminders: { submitDeadline: true, approvalPending: true, rejection: true },
};

function serializeNotification(n: any) {
  return {
    id: n.id,
    userId: n.userId,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  };
}

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List the current user's in-app notifications
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const unreadOnly = String(req.query.unreadOnly ?? "") === "true";
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // Array directly — useNotifications types this as Notification[].
    res.json(notifications.map(serializeNotification));
  })
);

/**
 * @swagger
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark one notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    res.json({ updated: result.count });
  })
);

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     summary: Mark all of the current user's notifications as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ updated: result.count });
  })
);

/**
 * @swagger
 * /notifications/preferences:
 *   get:
 *     summary: Get the current user's notification channel preferences
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rule = await prisma.notificationRule.findFirst({ where: { scope: "User", scopeId: req.user!.id, type: "Preferences" } });
    res.json(rule ? JSON.parse(rule.cadenceConfig) : DEFAULT_PREFERENCES);
  })
);

/**
 * @swagger
 * /notifications/preferences:
 *   put:
 *     summary: Update the current user's notification channel preferences
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.notificationRule.findFirst({ where: { scope: "User", scopeId: req.user!.id, type: "Preferences" } });
    const prefs = { ...DEFAULT_PREFERENCES, ...req.body };
    if (existing) {
      await prisma.notificationRule.update({ where: { id: existing.id }, data: { cadenceConfig: JSON.stringify(prefs) } });
    } else {
      await prisma.notificationRule.create({
        data: { scope: "User", scopeId: req.user!.id, type: "Preferences", cadenceConfig: JSON.stringify(prefs) },
      });
    }
    res.json(prefs);
  })
);

export default router;
