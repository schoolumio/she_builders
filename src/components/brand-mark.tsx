import Link from "next/link";
import { useId } from "react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * AltarCall mark: a radiant cross rising from an altar arch over an open Bible.
 * Vector redraw of the brand artwork so it stays crisp from favicon to projector.
 */
/** `onDark` keeps the luminous ivory cross of the original artwork; on light backgrounds the cross is navy for contrast. */
export function LogoGlyph({ size = 36, glow = true, onDark = true, className }: { size?: number; glow?: boolean; onDark?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 120 110" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7dc85" />
          <stop offset="0.55" stopColor="#d9ab3c" />
          <stop offset="1" stopColor="#b07f1f" />
        </linearGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={onDark ? "#fffbea" : "#233166"} />
          <stop offset="1" stopColor={onDark ? "#f2cf6b" : "#0e1530"} />
        </linearGradient>
        <radialGradient id={`r${id}`} cx="60" cy="30" r="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbe7a6" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fbe7a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {glow && (
        <g>
          <circle cx="60" cy="30" r="34" fill={`url(#r${id})`} />
          {[-60, -40, -22, 0, 22, 40, 60].map((a) => (
            <line key={a} x1="60" y1="30" x2={60 + 30 * Math.sin((a * Math.PI) / 180)} y2={30 - 30 * Math.cos((a * Math.PI) / 180)} stroke="#f7dc85" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
          ))}
        </g>
      )}
      {/* Altar arch */}
      <path d="M20 80 C14 52 24 33 44 25 C33 38 30 56 31 78 Z" fill={`url(#g${id})`} />
      <path d="M100 80 C106 52 96 33 76 25 C87 38 90 56 89 78 Z" fill={`url(#g${id})`} />
      {/* Cross */}
      <rect x="56.5" y="12" width="7" height="64" rx="1.5" fill={`url(#c${id})`} />
      <rect x="40" y="26" width="40" height="7" rx="1.5" fill={`url(#c${id})`} />
      {/* Open Bible */}
      <path d="M24 80 Q42 72 60 79 Q78 72 96 80 L96 84 Q78 77 60 84 Q42 77 24 84 Z" fill={`url(#g${id})`} />
      <path d="M4 92 Q32 76 60 88 Q88 76 116 92 Q88 84 60 104 Q32 84 4 92 Z" fill={`url(#g${id})`} />
    </svg>
  );
}

/** Wordmark: the configured name, with the accent suffix (e.g. "Call") set in gold. */
export function Wordmark({ light = false, className }: { light?: boolean; className?: string }) {
  const name = brand.shortName;
  const accent = brand.wordmarkAccent && name.endsWith(brand.wordmarkAccent) ? brand.wordmarkAccent : "";
  const base = accent ? name.slice(0, -accent.length) : name;
  return (
    <span className={cn("whitespace-nowrap font-serif font-semibold leading-none tracking-tight", className)}>
      <span className={light ? "text-[#fbf7ec]" : "text-plum-900"}>{base}</span>
      {accent && <span className={light ? "text-gold-400" : "text-gold-600"}>{accent}</span>}
    </span>
  );
}

export function BrandMark({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5" aria-label={`${brand.shortName} home`}>
      <LogoGlyph size={38} glow={light} onDark={light} />
      <Wordmark light={light} className="text-[1.3rem] sm:text-[1.45rem]" />
    </Link>
  );
}
