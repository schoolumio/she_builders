import Link from "next/link";
import { brand } from "@/config/brand";

/** Logo mark: a gold cathedral-arch window on deep navy. Replaceable via branding configuration. */
export function LogoGlyph({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      <rect x="0.5" y="0.5" width="39" height="39" rx="10" fill={light ? "rgba(255,255,255,0.06)" : "#0e1530"} stroke={light ? "rgba(197,161,74,0.55)" : "#0e1530"} />
      <path d="M12 31V18.5C12 13.8 15.6 10 20 10s8 3.8 8 8.5V31" fill="none" stroke="#c5a14a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 14.5v12M16.2 19.2h7.6" stroke="#f6efdc" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 31h22" stroke="#c5a14a" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 ${light ? "text-white" : "text-plum-900"}`}>
      <LogoGlyph light={light} />
      <span className="whitespace-nowrap font-serif text-[1.05rem] font-semibold leading-none tracking-tight sm:text-[1.2rem]">{brand.shortName}</span>
    </Link>
  );
}
