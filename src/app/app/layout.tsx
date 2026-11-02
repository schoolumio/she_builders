import { TopBar } from "@/components/top-bar";
import { requireUser } from "@/server/auth/current-user";

export default async function MemberHomeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/app");
  return (
    <>
      <TopBar user={user} />
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
