import Link from "next/link";
import type { MeetingMode, OccurrenceStatus } from "@prisma/client";
import { Badge } from "./ui/badge";
import { formatInZone } from "@/lib/time";
import { now } from "@/lib/clock";

export type OccurrenceRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: OccurrenceStatus;
  meeting: { title: string; mode: MeetingMode; theme: string | null };
};

export const MODE_LABEL: Record<MeetingMode, string> = { WHATSAPP: "WhatsApp", AUDIO: "In-app audio", VIDEO: "In-app video" };

export function OccurrenceList({ rows, slug, tz }: { rows: OccurrenceRow[]; slug: string; tz: string }) {
  const nowMs = now().getTime();
  return (
    <ul className="divide-y divide-line">
      {rows.map((o) => {
        const live = o.status === "LIVE" || (o.startsAt.getTime() <= nowMs && o.endsAt.getTime() >= nowMs && o.status !== "CANCELLED");
        return (
          <li key={o.id}>
            <Link href={`/o/${slug}/meetings/${o.id}`} className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-violet-50 sm:px-3">
              <div className="min-w-0">
                <p className={`truncate font-medium ${o.status === "CANCELLED" ? "text-muted line-through" : "text-plum-900"}`}>{o.meeting.title}</p>
                <p className="text-sm text-muted">{formatInZone(o.startsAt, tz)}</p>
                {o.meeting.theme && <p className="truncate text-xs text-muted">Theme: {o.meeting.theme}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {live && <Badge tone="success">Live now</Badge>}
                {o.status === "CANCELLED" && <Badge tone="danger">Cancelled</Badge>}
                <Badge tone={o.meeting.mode === "WHATSAPP" ? "neutral" : "violet"}>{MODE_LABEL[o.meeting.mode]}</Badge>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
