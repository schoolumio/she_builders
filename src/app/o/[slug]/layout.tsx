import { TopBar } from "@/components/top-bar";
import { SideNav, type NavItem, type NavSection } from "@/components/nav";
import { ROLE_LABELS } from "@/server/tenancy/permissions";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/card";
import { pageOrgContext } from "@/server/page";
import { requireUser } from "@/server/auth/current-user";
import { getEntitlements } from "@/server/billing/entitlements";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/o/${slug}`);
  const ctx = await pageOrgContext(slug);
  const ent = await getEntitlements(ctx.org.id);
  const p = ctx.permissions;
  const base = `/o/${slug}`;

  const it = (href: string, label: string, icon: NavItem["icon"], exact?: boolean): NavItem => ({ href, label, icon, exact });
  const community: NavItem[] = [
    it(base, "Home", "house", true),
    it(`${base}/meetings`, "Meetings", "calendar"),
    it(`${base}/prayer-points`, "Prayer points", "sparkles"),
    ...(ent.features.has("feature.prayer_requests") ? [it(`${base}/prayer`, "Prayer requests", "prayer")] : []),
    it(`${base}/announcements`, "Announcements", "megaphone"),
    it(`${base}/testimonies`, "Testimonies", "testimony"),
    ...(ent.features.has("feature.programmes") ? [it(`${base}/programmes`, "Programmes", "book")] : []),
    ...(ent.features.has("feature.groups") ? [it(`${base}/groups`, "Groups", "groups")] : []),
    ...(ctx.org.fundraisingEnabled ? [it(`${base}/give`, "Give", "gift")] : []),
    it(`${base}/membership`, "My membership", "id"),
  ];
  const sections: NavSection[] = [{ title: "Community", items: community }];

  const admin = [
    p.has("org.settings") || p.has("members.manage") || p.has("audit.view") ? it(`${base}/admin`, "Overview", "dashboard", true) : null,
    p.has("org.settings") ? it(`${base}/admin/settings`, "Settings", "settings") : null,
    p.has("members.view") ? it(`${base}/admin/members`, "Members", "users") : null,
    p.has("members.manage") ? it(`${base}/admin/invitations`, "Invitations", "invite") : null,
    p.has("groups.manage") ? it(`${base}/admin/groups`, "Groups", "layers") : null,
    p.has("meetings.create") || p.has("meetings.manage") ? it(`${base}/admin/meetings`, "Meetings", "calendarCog") : null,
    p.has("content.publish") ? it(`${base}/admin/content`, "Announcements & prayer points", "news") : null,
    p.has("prayer.moderate") || p.has("prayer.view_confidential") ? it(`${base}/admin/prayer`, "Prayer care", "care") : null,
    p.has("content.moderate") ? it(`${base}/admin/moderation`, "Moderation", "shield") : null,
    p.has("programmes.manage") ? it(`${base}/admin/programmes`, "Programmes", "book") : null,
    p.has("gifts.manage") ? it(`${base}/admin/gifts`, "Virtual gifts", "gift") : null,
    p.has("billing.view") ? it(`${base}/admin/billing`, "Plan & billing", "card") : null,
    p.has("audit.view") ? it(`${base}/admin/audit`, "Audit log", "scroll") : null,
  ].filter((x): x is NavItem => !!x);
  if (admin.length) sections.push({ title: "Administration", items: admin });

  if (p.has("finance.view") || p.has("campaigns.draft")) {
    sections.push({
      title: "Finance",
      items: [
        ...(p.has("finance.view") ? [it(`${base}/finance`, "Overview", "wallet", true)] : []),
        ...(p.has("finance.manage") ? [it(`${base}/finance/setup`, "Payment account", "bank")] : []),
        it(`${base}/finance/campaigns`, "Campaigns", "target"),
        ...(p.has("finance.view") ? [it(`${base}/finance/donations`, "Donations", "receipt")] : []),
        ...(p.has("finance.view") ? [it(`${base}/finance/recurring`, "Recurring gifts", "repeat")] : []),
        ...(p.has("finance.view") ? [it(`${base}/finance/payouts`, "Payouts", "banknote")] : []),
      ],
    });
  }

  // Phone tab bar: the four destinations members use most.
  const preferred = ["house", "calendar", "prayer", "gift", "book", "sparkles", "megaphone"];
  const short: Record<string, string> = { prayer: "Prayer", sparkles: "Prayer points", megaphone: "News" };
  const tabs: NavItem[] = preferred
    .map((icon) => community.find((c) => c.icon === icon))
    .filter((c): c is NavItem => !!c)
    .slice(0, 4)
    .map((c) => ({ ...c, label: (c.icon && short[c.icon]) || c.label }));
  const topRole = (["OWNER", "ADMIN", "FINANCE_ADMIN", "PRAYER_COORDINATOR", "MODERATOR", "HOST"] as const).find((r) => ctx.membership.roles.includes(r));

  const accent = ctx.org.accentColor && /^#[0-9a-f]{6}$/i.test(ctx.org.accentColor) ? ctx.org.accentColor : undefined;
  return (
    <div style={accent ? ({ "--org-accent": accent } as React.CSSProperties) : undefined}>
      <TopBar user={user} />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[256px_1fr] lg:pb-12 lg:pt-8">
        {/* On phones the aside only holds fixed elements (tab bar, menu sheet), so it takes no space. */}
        <aside className="contents lg:block">
          <SideNav
            label={`${ctx.org.name} navigation`}
            sections={sections}
            tabs={tabs}
            header={
              <div className="relative overflow-hidden rounded-xl bg-plum-900 p-4 text-white">
                <div aria-hidden className="absolute inset-0 bg-[radial-gradient(14rem_8rem_at_100%_0%,rgba(197,161,74,0.28),transparent_70%)]" />
                <div className="relative flex items-center gap-3">
                  <Avatar name={ctx.org.name} src={ctx.org.logoUrl} size={42} />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-semibold leading-tight">{ctx.org.name}</p>
                    <p className="mt-0.5 text-xs text-gold-400">{topRole ? ROLE_LABELS[topRole] : "Member"}</p>
                  </div>
                </div>
              </div>
            }
          />
        </aside>
        <main id="main" className="min-w-0">
          {ctx.org.status === "SUSPENDED" && (
            <Notice tone="danger" title="This community is suspended" className="mb-6">
              {ctx.org.suspendedReason ?? "Contact support for details."} Changes are disabled until the suspension is lifted.
            </Notice>
          )}
          {ctx.mfaRestricted && (
            <Notice tone="warning" title="Administrative access paused" className="mb-6">
              {ctx.org.name} requires two-factor authentication for administrators. <a className="underline" href="/app/security">Turn it on in Account security</a> to restore your access.
            </Notice>
          )}
          {ent.degraded && p.has("billing.view") && (
            <Notice tone="warning" title="Your paid plan has lapsed" className="mb-6">
              The community is now using Free plan limits. Existing content is kept. An owner can renew in Plan & billing.
            </Notice>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
