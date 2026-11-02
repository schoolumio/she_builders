import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-h-11 sm:min-h-10 whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110 shadow-sm",
  secondary: "border border-line bg-surface text-ink hover:bg-violet-50",
  ghost: "text-plum-800 hover:bg-violet-50",
  danger: "bg-danger text-white hover:brightness-110",
  gold: "bg-gold-500 text-plum-950 hover:brightness-105",
};
const sizes: Record<Size, string> = { sm: "px-3 py-1.5 text-sm min-h-9 sm:min-h-8", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
