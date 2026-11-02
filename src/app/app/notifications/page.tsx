import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { requireUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { formatInZone } from "@/lib/time";
import { markAllReadAction } from "../actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser("/app/notifications");
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { organization: { select: { name: true } } } });
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          items.some((i) => !i.readAt) ? (
            <form action={markAllReadAction}>
              <button className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-violet-50">Mark all as read</button>
            </form>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState title="You're all caught up">New meeting reminders, announcements and updates will appear here.</EmptyState>
      ) : (
        <Card className="divide-y divide-line p-0">
          {items.map((n) => {
            const body = (
              <div className="flex gap-3 px-5 py-4">
                {!n.readAt && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-gold-500" />}
                <div className="min-w-0">
                  <p className={n.readAt ? "text-ink" : "font-semibold text-plum-900"}>{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {n.organization?.name ? `${n.organization.name} · ` : ""}
                    {formatInZone(n.createdAt, user.timezone)}
                  </p>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block hover:bg-violet-50">
                {body}
              </Link>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
        </Card>
      )}
    </>
  );
}
