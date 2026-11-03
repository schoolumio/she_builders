"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Banknote,
  BookOpen,
  CalendarCog,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Crown,
  Gift,
  HandHeart,
  HeartHandshake,
  House,
  IdCard,
  Landmark,
  Layers,
  LayoutDashboard,
  MailPlus,
  Megaphone,
  Menu,
  MessageSquareHeart,
  Newspaper,
  ReceiptText,
  Repeat,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Icons are referenced by name so server components can describe navigation. */
const ICONS = {
  house: House,
  calendar: CalendarDays,
  sparkles: Sparkles,
  prayer: HandHeart,
  megaphone: Megaphone,
  testimony: MessageSquareHeart,
  book: BookOpen,
  groups: UsersRound,
  gift: Gift,
  id: IdCard,
  dashboard: LayoutDashboard,
  settings: Settings,
  users: Users,
  invite: MailPlus,
  layers: Layers,
  calendarCog: CalendarCog,
  news: Newspaper,
  care: HeartHandshake,
  shield: ShieldAlert,
  crown: Crown,
  card: CreditCard,
  scroll: ScrollText,
  wallet: Wallet,
  bank: Landmark,
  target: Target,
  receipt: ReceiptText,
  repeat: Repeat,
  banknote: Banknote,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon?: IconName; exact?: boolean };
export type NavSection = { title?: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function useCurrent(sections: NavSection[]) {
  const pathname = usePathname();
  const all = sections.flatMap((s) => s.items);
  return { pathname, current: all.filter((i) => isActive(pathname, i)).sort((a, b) => b.href.length - a.href.length)[0] };
}

function Section({ section, current, defaultOpen }: { section: NavSection; current?: NavItem; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const body = (
    <ul className="space-y-0.5">
      {section.items.map((item) => {
        const active = current?.href === item.href;
        const Icon = item.icon ? ICONS[item.icon] : null;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-[0.9rem] transition-colors",
                active ? "bg-plum-900 font-semibold text-white shadow-[var(--shadow-card)]" : "text-ink/75 hover:bg-violet-50 hover:text-plum-900",
              )}
            >
              {Icon && <Icon aria-hidden className={cn("size-[1.1rem] shrink-0", active ? "text-gold-400" : "text-plum-700/60 group-hover:text-plum-700")} />}
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
  if (!section.title) return body;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted hover:text-plum-900"
      >
        {section.title}
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open ? "rotate-180" : "")} />
      </button>
      {open && <div className="mt-1">{body}</div>}
    </div>
  );
}

function Panel({ sections, header, current }: { sections: NavSection[]; header?: React.ReactNode; current?: NavItem }) {
  return (
    <div className="space-y-5">
      {header}
      {sections.map((s, i) => (
        <Section key={s.title ?? i} section={s} current={current} defaultOpen={!s.title || s.items.some((it) => it.href === current?.href) || sections.length <= 2} />
      ))}
    </div>
  );
}

/**
 * Sticky sidebar on large screens. On phones: a bottom tab bar with the most-used destinations
 * plus a "Menu" sheet holding the full navigation.
 */
export function SideNav({ sections, label, header, tabs }: { sections: NavSection[]; label: string; header?: React.ReactNode; tabs?: NavItem[] }) {
  const { pathname, current } = useCurrent(sections);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const sheetOpen = sheetFor === pathname;
  return (
    <>
      <nav aria-label={label} className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pb-6">
        <div className="rounded-2xl border border-line/80 bg-surface p-3 shadow-[var(--shadow-card)]">
          <Panel sections={sections} header={header} current={current} />
        </div>
      </nav>

      {!tabs && (
        <button
          type="button"
          onClick={() => setSheetFor(pathname)}
          aria-expanded={sheetOpen}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium shadow-[var(--shadow-card)] lg:hidden"
        >
          <span>{current?.label ?? "Menu"}</span>
          <Menu aria-hidden className="size-4" />
        </button>
      )}

      {tabs && (
        <nav aria-label={`${label} (mobile)`} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <ul className="mx-auto grid max-w-lg grid-cols-5">
            {tabs.slice(0, 4).map((t) => {
              const active = current?.href === t.href;
              const Icon = t.icon ? ICONS[t.icon] : House;
              return (
                <li key={t.href}>
                  <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium", active ? "text-plum-900" : "text-muted")}>
                    <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-plum-900 text-gold-400")}>
                      <Icon aria-hidden className="size-[1.15rem]" />
                    </span>
                    {t.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => setSheetFor(pathname)} aria-expanded={sheetOpen} className="flex w-full flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium text-muted">
                <span className="flex h-7 w-12 items-center justify-center rounded-full">
                  <Menu aria-hidden className="size-[1.15rem]" />
                </span>
                Menu
              </button>
            </li>
          </ul>
        </nav>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-plum-950/50" onClick={() => setSheetFor(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="mx-auto h-1.5 w-12 rounded-full bg-line" aria-hidden />
              <button type="button" onClick={() => setSheetFor(null)} className="absolute right-4 rounded-full p-2 text-muted hover:bg-violet-50" aria-label="Close menu">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <Panel sections={sections} header={header} current={current} />
          </div>
        </div>
      )}
    </>
  );
}
