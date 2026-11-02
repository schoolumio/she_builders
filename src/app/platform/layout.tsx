import { TopBar } from "@/components/top-bar";
import { SideNav } from "@/components/nav";
import { Notice } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/server/auth/current-user";

export const metadata = { title: "Platform administration" };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <>
      <TopBar user={user} />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-8">
        <aside>
          <SideNav
            label="Platform navigation"
            sections={[
              {
                title: "BridgeCodes",
                items: [
                  { href: "/platform", label: "Overview", exact: true },
                  { href: "/platform/orgs", label: "Organisations" },
                  { href: "/platform/payments", label: "Payment reviews" },
                  { href: "/platform/plans", label: "Plans" },
                  { href: "/platform/support", label: "Support requests" },
                  { href: "/platform/audit", label: "Audit log" },
                ],
              },
            ]}
          />
        </aside>
        <main id="main" className="min-w-0">
          <Notice className="mb-6">Platform administrators manage accounts, plans and integrations. Community content such as prayer requests is not accessible from here.</Notice>
          {children}
        </main>
      </div>
    </>
  );
}
