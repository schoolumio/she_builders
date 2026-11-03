import { TopBar } from "@/components/top-bar";
import { SideNav, type NavSection } from "@/components/nav";
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

  const sections: NavSection[] = [
    {
      items: [
        { href: base, label: "Home", exact: true },
        { href: `${base}/meetings`, label: "Meetings" },
        { href: `${base}/prayer-points`, label: "Prayer points" },
        ...(ent.features.has("feature.prayer_requests") ? [{ href: `${base}/prayer`, label: "Prayer requests" }] : []),
        { href: `${base}/announcements`, label: "Announcements" },
        { href: `${base}/testimonies`, label: "Testimonies" },
        ...(ent.features.has("feature.programmes") ? [{ href: `${base}/programmes`, label: "Programmes" }] : []),
        ...(ent.features.has("feature.groups") ? [{ href: `${base}/groups`, label: "Groups" }] : []),
        ...(ctx.org.fundraisingEnabled ? [{ href: `${base}/give`, label: "Give" }] : []),
        { href: `${base}/membership`, label: "My membership" },
      ],
    },
  ];

  const admin = [
    p.has("org.settings") || p.has("members.manage") || p.has("audit.view") ? { href: `${base}/admin`, label: "Overview", exact: true } : null,
    p.has("org.settings") ? { href: `${base}/admin/settings`, label: "Settings" } : null,
    p.has("members.view") ? { href: `${base}/admin/members`, label: "Members" } : null,
    p.has("members.manage") ? { href: `${base}/admin/invitations`, label: "Invitations" } : null,
    p.has("groups.manage") ? { href: `${base}/admin/groups`, label: "Groups" } : null,
    p.has("meetings.create") || p.has("meetings.manage") ? { href: `${base}/admin/meetings`, label: "Meetings" } : null,
    p.has("content.publish") ? { href: `${base}/admin/content`, label: "Announcements & prayer points" } : null,
    p.has("prayer.moderate") || p.has("prayer.view_confidential") ? { href: `${base}/admin/prayer`, label: "Prayer care" } : null,
    p.has("content.moderate") ? { href: `${base}/admin/moderation`, label: "Moderation" } : null,
    p.has("programmes.manage") ? { href: `${base}/admin/programmes`, label: "Programmes" } : null,
    p.has("gifts.manage") ? { href: `${base}/admin/gifts`, label: "Virtual gifts" } : null,
    p.has("billing.view") ? { href: `${base}/admin/billing`, label: "Plan & billing" } : null,
    p.has("audit.view") ? { href: `${base}/admin/audit`, label: "Audit log" } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  if (admin.length) sections.push({ title: "Administration", items: admin });

  if (p.has("finance.view") || p.has("campaigns.draft")) {
    sections.push({
      title: "Finance",
      items: [
        ...(p.has("finance.view") ? [{ href: `${base}/finance`, label: "Overview", exact: true }] : []),
        ...(p.has("finance.manage") ? [{ href: `${base}/finance/setup`, label: "Payment account" }] : []),
        { href: `${base}/finance/campaigns`, label: "Campaigns" },
        ...(p.has("finance.view") ? [{ href: `${base}/finance/donations`, label: "Donations" }] : []),
        ...(p.has("finance.view") ? [{ href: `${base}/finance/recurring`, label: "Recurring gifts" }] : []),
        ...(p.has("finance.view") ? [{ href: `${base}/finance/payouts`, label: "Payouts" }] : []),
      ],
    });
  }

  const accent = ctx.org.accentColor && /^#[0-9a-f]{6}$/i.test(ctx.org.accentColor) ? ctx.org.accentColor : undefined;
  return (
    <div style={accent ? ({ "--org-accent": accent } as React.CSSProperties) : undefined}>
      <TopBar user={user} />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:py-8">
        <aside>
          <SideNav
            label={`${ctx.org.name} navigation`}
            sections={sections}
            header={
              <div className="mb-2 hidden items-center gap-3 px-3 lg:flex">
                <Avatar name={ctx.org.name} src={ctx.org.logoUrl} size={40} />
                <p className="font-semibold leading-tight text-plum-900">{ctx.org.name}</p>
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
