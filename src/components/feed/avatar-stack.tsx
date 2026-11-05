import { UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; displayName: string | null; avatarUrl: string | null };

const first = (p: Person) => (p.displayName ?? p.name).split(" ")[0];

/** Overlapping faces plus a sentence such as "Ada, Tunde and 8 others are praying". `verb` is [singular, plural]. */
export function AvatarStack({ people, total, verb, max = 5, onDark = false, meId }: { people: Person[]; total?: number; verb: [string, string]; max?: number; onDark?: boolean; meId?: string }) {
  const count = Math.max(total ?? people.length, people.length);
  if (count === 0) return null;
  // Private attendance: the server sends no people at all, only the number.
  if (people.length === 0) {
    return (
      <p className={cn("flex items-center gap-2 text-sm", onDark ? "text-white/80" : "text-ink/75")}>
        <UsersRound className={cn("size-4", onDark ? "text-gold-400" : "text-plum-700")} aria-hidden />
        <span>
          <span className={cn("font-semibold", onDark ? "text-white" : "text-plum-900")}>{count.toLocaleString("en")} {count === 1 ? "person" : "people"}</span> {count === 1 ? verb[0] : verb[1]}
        </span>
      </p>
    );
  }
  // Put the viewer first so "You and 3 others" reads naturally.
  const ordered = meId ? [...people.filter((p) => p.id === meId), ...people.filter((p) => p.id !== meId)] : people;
  const names = ordered.slice(0, 2).map((p) => (p.id === meId ? "You" : first(p)));
  const rest = count - names.length;
  const plural = count > 1 || names[0] === "You";
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
