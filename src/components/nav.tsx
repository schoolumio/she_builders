"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; exact?: boolean };
export type NavSection = { title?: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Responsive sidebar: a disclosure menu on small screens, a sticky column on large screens. */
export function SideNav({ sections, label, header }: { sections: NavSection[]; label: string; header?: React.ReactNode }) {
  const pathname = usePathname();
  // The menu is open only for the path it was opened on, so navigating closes it.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const all = sections.flatMap((s) => s.items);
  const current = all.filter((i) => isActive(pathname, i)).sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav aria-label={label} className="lg:sticky lg:top-20">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium lg:hidden"
        aria-expanded={open}
        onClick={() => setOpenFor(open ? null : pathname)}
      >
        <span>{current?.label ?? "Menu"}</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      <div className={cn("mt-2 space-y-5 rounded-lg border border-line bg-surface p-3 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0", open ? "block" : "hidden")}>
        {header}
        {sections.map((s, i) => (
          <div key={i}>
            {s.title && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{s.title}</p>}
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const active = current?.href === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn("block rounded-lg px-3 py-2 text-sm", active ? "bg-violet-100 font-semibold text-plum-900" : "text-ink hover:bg-violet-50")}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
