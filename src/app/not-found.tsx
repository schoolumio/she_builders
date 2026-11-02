import { LinkButton } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <BrandMark />
      <h1 className="font-serif text-3xl font-semibold text-plum-900">We couldn&apos;t find that page</h1>
      <p className="max-w-md text-muted">It may have moved, or you may not have access to it.</p>
      <LinkButton href="/app">Go to my communities</LinkButton>
    </div>
  );
}
