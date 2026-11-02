import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { Avatar } from "./ui/avatar";
import { db } from "@/server/db";
import type { CurrentUser } from "@/server/auth/current-user";
import { logoutAction } from "@/app/(auth)/actions";

/** Signed-in header shared by member, admin, finance and platform areas. */
export async function TopBar({ user }: { user: CurrentUser }) {
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <BrandMark href="/app" />
        <div className="flex items-center gap-1 sm:gap-3">
          {user.platformRole && (
            <Link href="/platform" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-plum-800 hover:bg-violet-50 sm:block">
              Platform admin
            </Link>
          )}
          <Link href="/app/notifications" className="relative rounded-lg px-3 py-2 text-sm font-medium text-plum-800 hover:bg-violet-50">
            Notifications
            {unread > 0 && (
              <span className="ml-1 rounded-full bg-gold-500 px-1.5 text-xs font-bold text-plum-950" aria-label={`${unread} unread`}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1.5 hover:bg-violet-50" aria-label="Account menu">
              <Avatar name={user.name} src={user.avatarUrl} size={32} />
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-lg">
              <p className="truncate px-3 py-2 text-sm font-semibold">{user.name}</p>
              <Link href="/app" className="block rounded px-3 py-2 text-sm hover:bg-violet-50">
                My communities
              </Link>
              <Link href="/app/profile" className="block rounded px-3 py-2 text-sm hover:bg-violet-50">
                Profile & settings
              </Link>
              <Link href="/app/donations" className="block rounded px-3 py-2 text-sm hover:bg-violet-50">
                My giving
              </Link>
              <Link href="/app/security" className="block rounded px-3 py-2 text-sm hover:bg-violet-50">
                Account security
              </Link>
              {user.platformRole && (
                <Link href="/platform" className="block rounded px-3 py-2 text-sm hover:bg-violet-50 sm:hidden">
                  Platform admin
                </Link>
              )}
              <form action={logoutAction}>
                <button className="block w-full rounded px-3 py-2 text-left text-sm text-danger hover:bg-danger-bg">Sign out</button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
