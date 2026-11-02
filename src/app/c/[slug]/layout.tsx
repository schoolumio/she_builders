import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function PublicOrgLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <Link href={user ? "/app" : "/login"} className="text-sm font-medium text-plum-800">{user ? "My communities" : "Sign in"}</Link>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
