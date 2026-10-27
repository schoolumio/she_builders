import "server-only";
import type { NotificationCategory } from "@prisma/client";
import { db } from "../db";
import { renderEmail, sendEmail } from "../email";
import { env } from "../env";
import { signValue } from "../crypto";
import { brand } from "@/config/brand";

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  MEETINGS: "Meeting reminders and changes",
  ANNOUNCEMENTS: "Announcements",
  PRAYER: "Prayer request updates and follow-ups",
  PROGRAMMES: "Programme activities",
  FUNDRAISING: "Donation receipts and fundraising updates",
  ACCOUNT: "Account and security (always on)",
};

export type NotifyInput = {
  userIds: string[];
  organizationId?: string | null;
  category: NotificationCategory;
  title: string;
  body?: string;
  link?: string;
  /** Send an email too (subject to the recipient's preferences). */
  email?: boolean;
};

export function unsubscribeUrl(userId: string, category: NotificationCategory) {
  return `${env.appUrl}/unsubscribe?t=${encodeURIComponent(signValue(`${userId}:${category}`))}`;
}

/** Creates in-app notifications and optional emails, honouring per-category preferences. */
export async function notify(input: NotifyInput) {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return;
  const [prefs, users] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId: { in: userIds }, category: input.category } }),
    db.user.findMany({ where: { id: { in: userIds }, status: "ACTIVE" }, select: { id: true, email: true, emailVerifiedAt: true } }),
  ]);
  const prefBy = new Map(prefs.map((p) => [p.userId, p]));
  const alwaysOn = input.category === "ACCOUNT";
  const inApp = users.filter((u) => alwaysOn || prefBy.get(u.id)?.inApp !== false);
  if (inApp.length) {
    await db.notification.createMany({
      data: inApp.map((u) => ({
        userId: u.id,
        organizationId: input.organizationId ?? null,
        category: input.category,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 1000),
        link: input.link,
      })),
    });
  }
  if (input.email) {
    for (const u of users) {
      if (!alwaysOn && (prefBy.get(u.id)?.email === false || !u.emailVerifiedAt)) continue;
      const { text, html } = renderEmail({
        heading: input.title,
        paragraphs: input.body ? [input.body] : [],
        action: input.link ? { label: "Open", url: input.link.startsWith("http") ? input.link : `${env.appUrl}${input.link}` } : undefined,
        footer: alwaysOn
          ? brand.productName
          : `${brand.productName} · Unsubscribe from these emails: ${unsubscribeUrl(u.id, input.category)}`,
      });
      await sendEmail({ to: u.email, subject: input.title, text, html, category: input.category });
    }
  }
}

export async function updatePreference(userId: string, category: NotificationCategory, data: { inApp?: boolean; email?: boolean }) {
  if (category === "ACCOUNT") return;
  await db.notificationPreference.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, inApp: data.inApp ?? true, email: data.email ?? true },
    update: data,
  });
}
