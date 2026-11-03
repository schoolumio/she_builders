import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/server/auth/current-user";
import { now } from "@/lib/clock";

const NAV = [
  { href: "/#platform", label: "Platform" },
  { href: "/#security", label: "Security" },
  { href: "/#giving", label: "Giving" },
  { href: "/pricing", label: "Pricing" },
];

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-plum-900 text-white">
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <BrandMark light />
          <nav aria-label="Main" className="hidden items-center gap-8 text-[0.925rem] text-white/75 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="transition-colors hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <Link href="/app" className="rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-plum-950 transition hover:bg-gold-400">
                Open the app
              </Link>
            ) : (
              <>
                <Link href="/login" className="whitespace-nowrap rounded-full px-2 py-2.5 text-sm font-medium text-white/85 hover:text-white sm:px-3">
                  Sign in
                </Link>
                <Link href="/support?topic=demo" className="hidden rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/60 sm:inline-flex">
                  Book a demo
                </Link>
                <Link href="/register?next=/orgs/new" className="whitespace-nowrap rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-plum-950 transition hover:bg-gold-400 sm:px-5">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="bg-plum-950 text-white/70">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <BrandMark light />
            <p className="mt-4 max-w-sm text-sm leading-6">
              {brand.productName} is ministry software by {brand.companyName}, a business of {brand.legalEntity}. Built for prayer communities, ministries and churches of every size.
            </p>
          </div>
          <nav aria-label="Product" className="text-sm">
            <p className="eyebrow text-gold-400">Product</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link href="/#platform" className="hover:text-white">Platform</Link></li>
              <li><Link href="/#security" className="hover:text-white">Security</Link></li>
              <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
              <li><Link href="/communities" className="hover:text-white">Find a community</Link></li>
            </ul>
          </nav>
          <nav aria-label="Company" className="text-sm">
            <p className="eyebrow text-gold-400">Company</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link href="/support?topic=demo" className="hover:text-white">Book a demonstration</Link></li>
              <li><Link href="/support" className="hover:text-white">Contact & support</Link></li>
              <li><a href={`mailto:${brand.securityEmail}`} className="hover:text-white">Report a security issue</a></li>
            </ul>
          </nav>
          <nav aria-label="Legal" className="text-sm">
            <p className="eyebrow text-gold-400">Policies</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link href="/privacy" className="hover:text-white">Privacy policy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms of service</Link></li>
              <li><Link href="/guidelines" className="hover:text-white">Community guidelines</Link></li>
              <li><Link href="/fundraising-disclosures" className="hover:text-white">Fundraising disclosures</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-5 py-6 text-xs text-white/50 sm:px-8">
            © {now().getFullYear()} {brand.legalEntity}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
