import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { notify } from "../services/notify";
import { resolveApprover } from "../services/approvalRouting";
import { ROLES, TIMESHEET_STATUS } from "../constants/enums";

const ESCALATION_THRESHOLD_DAYS = 3;

// See dashboard.ts's mondayOf for why this must use UTC fields, not local ones.
function mondayOf(date: Date): Date {
  const utcMidnight = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diffFromMonday = (utcMidnight.getUTCDay() + 6) % 7;
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - diffFromMonday);
  return utcMidnight;
}

/**
 * Reminder/escalation engine per spec 4.5. This is a real, running job — it
 * writes real in-app Notification rows — but "sending" beyond the in-app
 * center (email/Slack/Teams) is a console log placeholder. See README
 * "Swap points" to wire in a transactional email provider.
 */
export async function runReminderSweep() {
  const weekStart = mondayOf(new Date());

  const usersWithoutSubmission = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { name: ROLES.INDIVIDUAL_USER },
      timesheets: { none: { weekStartDate: weekStart, status: { not: TIMESHEET_STATUS.DRAFT } } },
    },
  });
  for (const user of usersWithoutSubmission) {
    await notify(
      user.id,
      "SubmissionReminder",
      "Timesheet reminder",
      "Your timesheet for this week hasn't been submitted yet. Please submit before the weekly cutoff.",
      { weekStart: weekStart.toISOString().slice(0, 10) }
    );
  }

  const pendingApprovals = await prisma.timesheet.findMany({ where: { status: TIMESHEET_STATUS.SUBMITTED } });
  const superAdmins = await prisma.user.findMany({ where: { status: "ACTIVE", role: { name: ROLES.SUPER_ADMIN } } });
  for (const t of pendingApprovals) {
    const pendingDays = t.submittedAt ? Math.floor((Date.now() - t.submittedAt.getTime()) / 86400000) : 0;
    if (pendingDays < 1) continue;
    const { approverIds } = await resolveApprover(t.id);
    for (const approverId of approverIds) {
      await notify(approverId, "PendingApprovalReminder", "Timesheet awaiting your approval", "A timesheet is still pending your approval.", { timesheetId: t.id });
    }
    // No second approval tier exists anymore — a stalled approval (no
    // resolvable Project Admin, or still pending past the threshold)
    // escalates straight to Super Admin, the only other approval-capable role.
    if (approverIds.length === 0 || pendingDays > ESCALATION_THRESHOLD_DAYS) {
      for (const admin of superAdmins) {
        await notify(
          admin.id,
          "EscalationAlert",
          "Escalation: approval stalled",
          approverIds.length === 0
            ? `A timesheet has no resolvable Project Admin approver and has been pending for ${pendingDays} days.`
            : `An approval has been pending for ${pendingDays} days.`,
          { timesheetId: t.id }
        );
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[scheduler] reminder sweep complete: ${usersWithoutSubmission.length} submission reminders, ${pendingApprovals.length} approval reminders`);
}

export function startScheduler() {
  // Runs daily at 08:00 server time — cadence itself is meant to be driven by
  // NotificationRule records (Section 4.5.2); this fixed cron kicks off the
  // sweep, the sweep's own logic decides who actually gets notified.
  cron.schedule("0 8 * * *", () => {
    runReminderSweep().catch((err) => console.error("[scheduler] reminder sweep failed", err));
  });
  // eslint-disable-next-line no-console
  console.log("[scheduler] reminder/escalation cron scheduled for 08:00 daily");
}
