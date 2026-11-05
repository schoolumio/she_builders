import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; displayName: string | null; avatarUrl: string | null };

const first = (p: Person) => (p.displayName ?? p.name).split(" ")[0];

/** Overlapping faces plus a sentence such as "Ada, Tunde and 8 others are praying". `verb` is [singular, plural]. */
export function AvatarStack({ people, verb, max = 5, onDark = false, meId }: { people: Person[]; verb: [string, string]; max?: number; onDark?: boolean; meId?: string }) {
  if (people.length === 0) return null;
  // Put the viewer first so "You and 3 others" reads naturally.
  const ordered = meId ? [...people.filter((p) => p.id === meId), ...people.filter((p) => p.id !== meId)] : people;
  const names = ordered.slice(0, 2).map((p) => (p.id === meId ? "You" : first(p)));
  const rest = ordered.length - names.length;
  const plural = ordered.length > 1 || names[0] === "You";
  const sentence = rest > 0 ? `${names.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}` : names.join(" and ");
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex -space-x-2">
        {ordered.slice(0, max).map((p) => (
          <span key={p.id} className={cn("rounded-full ring-2", onDark ? "ring-plum-900" : "ring-surface")}>
            <Avatar name={p.displayName ?? p.name} src={p.avatarUrl} size={28} />
          </span>
        ))}
      </span>
      <span className={cn("text-sm", onDark ? "text-white/80" : "text-ink/75")}>
        <span className={cn("font-semibold", onDark ? "text-white" : "text-plum-900")}>{sentence}</span> {plural ? verb[1] : verb[0]}
      </span>
    </div>
  );
}
