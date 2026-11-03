import { Check } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-plum-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(40rem_30rem_at_100%_0%,rgba(197,161,74,0.22),transparent_60%),radial-gradient(30rem_25rem_at_0%_100%,rgba(74,95,174,0.35),transparent_60%)]" />
        <div className="relative"><BrandMark light /></div>
        <div className="relative max-w-md">
          <p className="font-serif text-4xl font-medium leading-tight">
            “Continue in prayer, and watch in the same with thanksgiving.”
          </p>
          <p className="mt-4 text-sm text-gold-400">Colossians 4:2 (KJV)</p>
          <ul className="mt-10 space-y-3 text-sm text-white/75">
            {["Confidential prayer care", "Meetings on WhatsApp or in the app", "Giving that settles to your ministry"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 text-gold-400" aria-hidden /> {t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/45">{brand.productName} · {brand.companyName}</p>
      </aside>
      <div className="flex flex-col bg-canvas">
        <header className="px-6 py-6 lg:hidden"><BrandMark /></header>
        <main id="main" className="flex flex-1 items-center justify-center px-5 pb-16 pt-4">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
