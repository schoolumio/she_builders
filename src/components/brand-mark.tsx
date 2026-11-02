import Link from "next/link";
import { brand } from "@/config/brand";

export function BrandMark({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 font-serif text-lg font-semibold ${light ? "text-white" : "text-plum-900"}`}>
      <svg aria-hidden width="28" height="28" viewBox="0 0 32 32" className="shrink-0">
        <rect width="32" height="32" rx="9" fill={light ? "#ffffff" : "#2b1a3d"} />
        <path d="M16 6c-1.2 3.6-4 6.4-7.6 7.6C12 14.8 14.8 17.6 16 21.2c1.2-3.6 4-6.4 7.6-7.6C20 12.4 17.2 9.6 16 6z" fill="#c49a3a" />
        <path d="M10 24h12" stroke={light ? "#2b1a3d" : "#ffffff"} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{brand.shortName}</span>
    </Link>
  );
}
