import { prisma } from "../lib/prisma";

export async function notify(userId: number, type: string, title: string, message: string, payload?: unknown) {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      payload: payload !== undefined ? JSON.stringify(payload) : null,
    },
  });
  // Email/Slack/Teams delivery would be dispatched from here in production —
  // see README "Swap points". For this build we only write the in-app record.
}
