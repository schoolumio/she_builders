import { initials } from "@/lib/utils";

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-full bg-violet-100 font-semibold text-plum-800" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name) || "?"}
    </span>
  );
}
