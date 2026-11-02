import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { LinkButton } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line/70 bg-canvas">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandMark />
          <nav aria-label="Main" className="flex items-center gap-1 text-sm sm:gap-4">
            <Link href="/pricing" className="hidden rounded px-2 py-2 text-ink hover:text-plum-700 sm:inline">
              Pricing
            </Link>
            <Link href="/communities" className="hidden rounded px-2 py-2 text-ink hover:text-plum-700 sm:inline">
              Communities
            </Link>
            <Link href="/privacy" className="hidden rounded px-2 py-2 text-ink hover:text-plum-700 md:inline">
              Privacy
            </Link>
            {user ? (
              <LinkButton href="/app" size="sm">
                Open app
              </LinkButton>
            ) : (
              <>
                <Link href="/login" className="rounded px-2 py-2 font-medium text-plum-800">
                  Sign in
                </Link>
                <LinkButton href="/register?next=/orgs/new" size="sm">
                  Start a community
                </LinkButton>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-plum-950 text-violet-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <BrandMark light />
            <p className="mt-3 text-sm text-violet-100/80">
              {brand.productName} is software by {brand.companyName}, a business of {brand.legalEntity}.
            </p>
          </div>
          <nav aria-label="Product" className="text-sm">
            <p className="font-semibold text-white">Product</p>
            <ul className="mt-2 space-y-1.5">
              <li><Link href="/pricing" className="hover:underline">Pricing</Link></li>
              <li><Link href="/communities" className="hover:underline">Find a community</Link></li>
              <li><Link href="/support" className="hover:underline">Contact & support</Link></li>
            </ul>
          </nav>
          <nav aria-label="Legal" className="text-sm">
            <p className="font-semibold text-white">Policies (drafts)</p>
            <ul className="mt-2 space-y-1.5">
              <li><Link href="/privacy" className="hover:underline">Privacy policy</Link></li>
              <li><Link href="/terms" className="hover:underline">Terms of service</Link></li>
              <li><Link href="/guidelines" className="hover:underline">Community guidelines</Link></li>
              <li><Link href="/fundraising-disclosures" className="hover:underline">Fundraising disclosures</Link></li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
