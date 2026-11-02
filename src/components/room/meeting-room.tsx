"use client";

import "@livekit/components-styles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectionQualityIndicator,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartAudio,
  TrackToggle,
  useChat,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, MediaDeviceFailure, RoomEvent, Track, type Participant } from "livekit-client";
import { cn } from "@/lib/utils";

export type RoomProps = {
  slug: string;
  occurrenceId: string;
  title: string;
  mode: "AUDIO" | "VIDEO";
  format: "INTERACTIVE" | "BROADCAST";
  chatEnabled: boolean;
  giftsEnabled: boolean;
  canManage: boolean;
  theme: string | null;
  scriptureRefs: string[];
  agenda: { id: string; title: string; details: string | null; scriptureRef: string | null; durationMinutes: number | null }[];
  gifts: { id: string; name: string; emoji: string; price: string | null }[];
  backHref: string;
};

type JoinState =
  | { kind: "loading" }
  | { kind: "waiting" }
  | { kind: "denied"; reason: string }
  | { kind: "error"; reason: string }
  | { kind: "ready"; token: string; url: string; role: string; identity: string }
  | { kind: "left" };

async function api(slug: string, id: string, body: object) {
  const res = await fetch(`/api/orgs/${slug}/occurrences/${id}/room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

const FAILURE_COPY: Record<string, string> = {
  [MediaDeviceFailure.PermissionDenied]: "Your browser blocked access to the microphone or camera. Allow access in your browser's site settings, then try again.",
  [MediaDeviceFailure.NotFound]: "No microphone or camera was found on this device.",
  [MediaDeviceFailure.DeviceInUse]: "Your microphone or camera is being used by another app. Close it and try again.",
  [MediaDeviceFailure.Other]: "We couldn't start your microphone or camera.",
};

export function MeetingRoom(props: RoomProps) {
  const [join, setJoin] = useState<JoinState>({ kind: "loading" });
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const router = useRouter();

  const requestToken = useCallback(
    () =>
      api(props.slug, props.occurrenceId, { op: "token" }).then(
        (r) => {
          if (r.status === "ok") setJoin({ kind: "ready", token: r.token, url: r.url, role: r.role, identity: r.identity });
          else if (r.status === "waiting") setJoin({ kind: "waiting" });
          else setJoin({ kind: "denied", reason: r.reason });
        },
        (e: Error) => setJoin({ kind: "error", reason: e.message }),
      ),
    [props.slug, props.occurrenceId],
  );

  useEffect(() => {
    const t = setTimeout(requestToken, 0);
    return () => clearTimeout(t);
  }, [requestToken]);

  // Poll while waiting for a host to admit us.
  useEffect(() => {
    if (join.kind !== "waiting") return;
    const t = setInterval(requestToken, 5000);
    return () => clearInterval(t);
  }, [join.kind, requestToken]);

  if (join.kind === "loading") return <Centered title="Connecting…" body="Checking your access to this meeting." />;
  if (join.kind === "waiting") return <Centered title="Waiting to be admitted" body="A host will let you in shortly. Keep this page open." />;
  if (join.kind === "denied" || join.kind === "error")
    return <Centered title="You can't join right now" body={join.reason} action={<a className="underline" href={props.backHref}>Back to meeting details</a>} />;
  if (join.kind === "left")
    return (
      <Centered
        title="You left the meeting"
        body="Thank you for joining."
        action={
          <div className="flex gap-3">
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={() => { setJoin({ kind: "loading" }); void requestToken(); }}>Rejoin</button>
            <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => router.push(props.backHref)}>Done</button>
          </div>
        }
      />
    );

  return (
    <LiveKitRoom
      serverUrl={join.url}
      token={join.token}
      connect
      audio={false}
      video={false}
      data-lk-theme="default"
      className="!bg-plum-950"
      style={{ height: "calc(100dvh - 4rem)" }}
      onDisconnected={() => setJoin({ kind: "left" })}
      onMediaDeviceFailure={(failure) => setDeviceError(FAILURE_COPY[failure ?? MediaDeviceFailure.Other] ?? FAILURE_COPY.Other!)}
      onError={(e) => setDeviceError(e.message)}
      options={{ adaptiveStream: true, dynacast: true }}
    >
      <RoomInner {...props} identity={join.identity} deviceError={deviceError} clearDeviceError={() => setDeviceError(null)} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function Centered({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div role="status" className="max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
        <p className="font-serif text-xl font-semibold text-plum-900">{title}</p>
        <p className="mt-2 text-sm text-muted">{body}</p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

type FloatingGift = { id: string; emoji: string; label: string; left: number };

function RoomInner(props: RoomProps & { identity: string; deviceError: string | null; clearDeviceError: () => void }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const perms = useLocalParticipantPermissions();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants({
    updateOnlyOn: [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ParticipantAttributesChanged,
      RoomEvent.ParticipantPermissionsChanged,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.ConnectionQualityChanged,
    ],
  });
  const [panel, setPanel] = useState<"agenda" | "people" | "chat" | "host" | null>(null);
  const [floating, setFloating] = useState<FloatingGift[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const canPublish = !!perms?.canPublish;
  const myHand = !!localParticipant.attributes?.hand;

  // Gifts and system events are only trusted when sent by the server (no participant sender).
  useDataChannel("gift", (msg) => {
    if (msg.from) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as { id: string; gift: { emoji: string; name: string }; sender: string };
      const g = { id: `${data.id}-${Math.random()}`, emoji: data.gift.emoji, label: `${data.sender} sent ${data.gift.name}`, left: 10 + Math.random() * 70 };
      setFloating((f) => [...f.slice(-12), g]);
      setTimeout(() => setFloating((f) => f.filter((x) => x.id !== g.id)), 3400);
    } catch {
      /* ignore malformed */
    }
  });
  useDataChannel("system", (msg) => {
    if (msg.from) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as { type: string; locked?: boolean };
      if (data.type === "lock") {
        setLocked(!!data.locked);
        setNotice(data.locked ? "The host locked the meeting. No one new can join." : "The meeting is open again.");
      }
    } catch {
      /* ignore */
    }
  });

  // When a host revokes speaking, make sure the local mic is off.
  useEffect(() => {
    if (!canPublish && localParticipant.isMicrophoneEnabled) void localParticipant.setMicrophoneEnabled(false);
  }, [canPublish, localParticipant]);

  const toggleHand = async () => {
    try {
      await api(props.slug, props.occurrenceId, { op: "hand", raised: !myHand });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const hands = participants.filter((p) => p.attributes?.hand).length;

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{props.title}</p>
          <p className="text-xs text-violet-100/70">
            {participants.length} {participants.length === 1 ? "person" : "people"}
            {locked && " · Locked"}
          </p>
        </div>
        <ConnectionBadge state={connection} />
      </div>

      {(props.deviceError || notice) && (
        <div role="alert" className="flex items-start justify-between gap-3 bg-gold-100 px-4 py-2 text-sm text-plum-950">
          <span>{props.deviceError ?? notice}</span>
          <button className="underline" onClick={() => { props.clearDeviceError(); setNotice(null); }}>Dismiss</button>
        </div>
      )}
      {connection === ConnectionState.Reconnecting && (
        <div role="status" className="bg-warning-bg px-4 py-2 text-sm text-warning">Connection lost — reconnecting…</div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {props.mode === "VIDEO" ? <VideoStage /> : <AudioStage participants={participants} />}
          <div aria-live="polite" className="pointer-events-none absolute inset-0 overflow-hidden">
            {floating.map((g) => (
              <div key={g.id} className="gift-float absolute bottom-6 flex flex-col items-center" style={{ left: `${g.left}%` }}>
                <span className="text-4xl" aria-hidden>{g.emoji}</span>
                <span className="mt-1 rounded-full bg-black/50 px-2 py-0.5 text-xs">{g.label}</span>
              </div>
            ))}
          </div>
          <StartAudio label="Tap to enable meeting audio" className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-plum-950" />
        </div>

        {panel && (
          <aside className="absolute inset-0 z-20 flex flex-col bg-plum-950 sm:static sm:w-[340px] sm:border-l sm:border-white/10" aria-label="Meeting side panel">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <p className="text-sm font-semibold capitalize">{panel === "host" ? "Host controls" : panel}</p>
              <button className="rounded px-2 py-1 text-sm underline" onClick={() => setPanel(null)}>Close</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
              {panel === "agenda" && <AgendaPanel {...props} />}
              {panel === "people" && <PeoplePanel participants={participants} canManage={props.canManage} slug={props.slug} occurrenceId={props.occurrenceId} localId={props.identity} onError={setNotice} />}
              {panel === "chat" && <ChatPanel />}
              {panel === "host" && props.canManage && <HostPanel slug={props.slug} occurrenceId={props.occurrenceId} onError={setNotice} onLocked={setLocked} onEnd={() => room.disconnect()} />}
            </div>
          </aside>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-plum-950 px-3 py-3" role="toolbar" aria-label="Meeting controls">
        {canPublish ? (
          <TrackToggle source={Track.Source.Microphone} className="lk-button min-h-11" />
        ) : (
          <span className="rounded-lg bg-white/10 px-3 py-2 text-xs">Listening</span>
        )}
        {props.mode === "VIDEO" && canPublish && <TrackToggle source={Track.Source.Camera} className="lk-button min-h-11" />}
        {props.mode === "VIDEO" && props.canManage && <TrackToggle source={Track.Source.ScreenShare} className="lk-button min-h-11" />}
        {!props.canManage && (
          <button onClick={toggleHand} aria-pressed={myHand} className={cn("lk-button min-h-11", myHand && "!bg-gold-500 !text-plum-950")}>
            ✋ {myHand ? "Lower hand" : "Raise hand"}
          </button>
        )}
        <PanelButton label="Agenda" active={panel === "agenda"} onClick={() => setPanel(panel === "agenda" ? null : "agenda")} />
        <PanelButton label={`People${hands ? ` (${hands}✋)` : ""}`} active={panel === "people"} onClick={() => setPanel(panel === "people" ? null : "people")} />
        {props.chatEnabled && <PanelButton label="Chat" active={panel === "chat"} onClick={() => setPanel(panel === "chat" ? null : "chat")} />}
        {props.canManage && <PanelButton label="Host" active={panel === "host"} onClick={() => setPanel(panel === "host" ? null : "host")} />}
        {props.giftsEnabled && props.gifts.length > 0 && <GiftPicker {...props} onError={setNotice} />}
        <button onClick={() => room.disconnect()} className="lk-button lk-disconnect-button min-h-11">Leave</button>
      </div>
    </div>
  );
}

function PanelButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("lk-button min-h-11", active && "!bg-violet-500")}>
      {label}
    </button>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const map: Record<string, [string, string]> = {
    [ConnectionState.Connected]: ["Connected", "bg-success"],
    [ConnectionState.Connecting]: ["Connecting", "bg-gold-500"],
    [ConnectionState.Reconnecting]: ["Reconnecting", "bg-gold-500"],
    [ConnectionState.SignalReconnecting]: ["Reconnecting", "bg-gold-500"],
    [ConnectionState.Disconnected]: ["Disconnected", "bg-danger"],
  };
  const [label, color] = map[state] ?? ["", "bg-white"];
  return (
    <span className="flex items-center gap-2 text-xs" role="status">
      <span className={cn("size-2 rounded-full", color)} aria-hidden />
      {label}
    </span>
  );
}

function VideoStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare && t.publication);
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);
  if (screen) {
    return (
      <div className="flex h-full flex-col gap-2 p-2 lg:flex-row">
        <div className="min-h-0 flex-1">
          <ParticipantTile trackRef={screen} className="h-full" />
        </div>
        <div className="flex gap-2 overflow-auto lg:w-56 lg:flex-col">
          {cameras.map((t) => (
            <div key={`${t.participant.identity}-cam`} className="aspect-video w-40 shrink-0 lg:w-full">
              <ParticipantTile trackRef={t} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <GridLayout tracks={cameras} className="h-full p-2">
      <ParticipantTile />
    </GridLayout>
  );
}

function AudioStage({ participants }: { participants: Participant[] }) {
  const sorted = useMemo(
    () => [...participants].sort((a, b) => Number(b.permissions?.canPublish ?? false) - Number(a.permissions?.canPublish ?? false) || Number(b.isSpeaking) - Number(a.isSpeaking)),
    [participants],
  );
  return (
    <ul className="grid h-full auto-rows-min grid-cols-3 gap-4 overflow-y-auto p-6 sm:grid-cols-4 lg:grid-cols-6" aria-label="Participants">
      {sorted.map((p) => {
        const name = p.name || "Participant";
        const speaker = p.permissions?.canPublish;
        return (
          <li key={p.identity} className="flex flex-col items-center text-center">
            <span
              className={cn(
                "relative flex size-16 items-center justify-center rounded-full bg-violet-600 text-xl font-semibold transition-shadow sm:size-20",
                p.isSpeaking && "ring-4 ring-gold-500",
                !speaker && "opacity-80",
              )}
            >
              {name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
              {p.attributes?.hand && <span className="absolute -right-1 -top-1 text-lg" aria-label="Hand raised">✋</span>}
            </span>
            <span className="mt-2 max-w-full truncate text-xs">{name}{p.isLocal ? " (you)" : ""}</span>
            <span className="text-[10px] text-violet-100/60">{speaker ? (p.isMicrophoneEnabled ? "Speaking allowed · mic on" : "Mic off") : "Listening"}</span>
            <ConnectionQualityIndicator participant={p} className="mt-1 scale-75" />
          </li>
        );
      })}
    </ul>
  );
}

function AgendaPanel({ theme, scriptureRefs, agenda }: RoomProps) {
  return (
    <div className="space-y-4">
      {theme && <p><span className="text-violet-100/60">Theme</span><br />{theme}</p>}
      {scriptureRefs.length > 0 && <p className="text-gold-500">{scriptureRefs.join(" · ")}</p>}
      {agenda.length === 0 ? (
        <p className="text-violet-100/70">No agenda for this meeting.</p>
      ) : (
        <ol className="space-y-3">
          {agenda.map((a, i) => (
            <li key={a.id} className="rounded-lg bg-white/5 p-3">
              <p className="font-semibold">{i + 1}. {a.title}{a.durationMinutes ? ` · ${a.durationMinutes} min` : ""}</p>
              {a.details && <p className="mt-1 text-violet-100/80">{a.details}</p>}
              {a.scriptureRef && <p className="mt-1 text-xs text-gold-500">{a.scriptureRef}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PeoplePanel({ participants, canManage, slug, occurrenceId, localId, onError }: { participants: Participant[]; canManage: boolean; slug: string; occurrenceId: string; localId: string; onError: (m: string) => void }) {
  const act = async (action: string, userId: string) => {
    if (action === "remove" && !window.confirm("Remove this person from the meeting? They won't be able to rejoin this session.")) return;
    try {
      await api(slug, occurrenceId, { op: "control", action, userId });
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const sorted = [...participants].sort((a, b) => (b.attributes?.hand ? 1 : 0) - (a.attributes?.hand ? 1 : 0));
  return (
    <ul className="space-y-2">
      {sorted.map((p) => (
        <li key={p.identity} className="rounded-lg bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">
              {p.attributes?.hand && "✋ "}
              {p.name || "Participant"}
              {p.identity === localId && " (you)"}
            </span>
            <span className="text-xs text-violet-100/60">{p.permissions?.canPublish ? (p.isMicrophoneEnabled ? "🎙 on" : "🎙 off") : "listener"}</span>
          </div>
          {canManage && p.identity !== localId && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.isMicrophoneEnabled && <SmallBtn onClick={() => act("mute", p.identity)}>Mute</SmallBtn>}
              {p.permissions?.canPublish ? <SmallBtn onClick={() => act("revoke_speak", p.identity)}>Stop speaking</SmallBtn> : <SmallBtn onClick={() => act("allow_speak", p.identity)}>Allow to speak</SmallBtn>}
              {p.attributes?.hand && <SmallBtn onClick={() => act("lower_hand", p.identity)}>Lower hand</SmallBtn>}
              <SmallBtn danger onClick={() => act("remove", p.identity)}>Remove</SmallBtn>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SmallBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("rounded-md px-2.5 py-1.5 text-xs font-semibold", danger ? "bg-danger text-white" : "bg-white/15 hover:bg-white/25")}>
      {children}
    </button>
  );
}

function ChatPanel() {
  const { chatMessages, send, isSending } = useChat();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chatMessages.length]);
  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-xs text-violet-100/60">Chat messages are not saved after the meeting.</p>
      <ul ref={listRef} className="min-h-40 flex-1 space-y-2 overflow-y-auto" aria-live="polite">
        {chatMessages.map((m) => (
          <li key={m.id} className="rounded-lg bg-white/5 p-2">
            <p className="text-xs font-semibold text-gold-500">{m.from?.name || "Participant"}</p>
            <p className="whitespace-pre-wrap break-words">{m.message}</p>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const t = text.trim().slice(0, 1000);
          if (!t) return;
          await send(t);
          setText("");
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Message</label>
        <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} className="min-h-11 flex-1 rounded-lg bg-white/10 px-3 text-sm text-white placeholder:text-white/50" placeholder="Write a message" maxLength={1000} />
        <button disabled={isSending} className="rounded-lg bg-violet-500 px-3 text-sm font-semibold">Send</button>
      </form>
    </div>
  );
}

type ControlState = { locked: boolean; waiting: { userId: string; name: string }[]; hands: { userId: string }[] };

function HostPanel({ slug, occurrenceId, onError, onLocked, onEnd }: { slug: string; occurrenceId: string; onError: (m: string) => void; onLocked: (l: boolean) => void; onEnd: () => void }) {
  const [state, setState] = useState<ControlState | null>(null);
  const load = useCallback(
    () =>
      fetch(`/api/orgs/${slug}/occurrences/${occurrenceId}/room`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((s: ControlState | null) => s && setState(s))
        .catch(() => undefined),
    [slug, occurrenceId],
  );
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  const call = async (body: object) => {
    try {
      await api(slug, occurrenceId, body);
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  if (!state) return <p>Loading…</p>;
  return (
    <div className="space-y-5">
      <section>
        <p className="font-semibold">Waiting to join ({state.waiting.length})</p>
        {state.waiting.length === 0 ? (
          <p className="mt-1 text-violet-100/60">Nobody is waiting.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {state.waiting.map((w) => (
              <li key={w.userId} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2">
                <span className="truncate">{w.name}</span>
                <span className="flex gap-1.5">
                  <SmallBtn onClick={() => call({ op: "control", action: "admit", userId: w.userId })}>Admit</SmallBtn>
                  <SmallBtn danger onClick={() => call({ op: "control", action: "deny", userId: w.userId })}>Deny</SmallBtn>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <p className="font-semibold">Meeting</p>
        <button
          className="w-full rounded-lg bg-white/15 px-3 py-2 text-left"
          onClick={async () => {
            await call({ op: "lock", locked: !state.locked });
            onLocked(!state.locked);
          }}
        >
          {state.locked ? "🔓 Unlock meeting" : "🔒 Lock meeting (no new participants)"}
        </button>
        <button
          className="w-full rounded-lg bg-danger px-3 py-2 text-left font-semibold"
          onClick={async () => {
            if (!window.confirm("End the meeting for everyone?")) return;
            await call({ op: "end" });
            onEnd();
          }}
        >
          End meeting for everyone
        </button>
      </section>
    </div>
  );
}

function GiftPicker({ slug, occurrenceId, gifts, onError }: RoomProps & { onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [showName, setShowName] = useState(true);
  const [sending, setSending] = useState(false);
  const router = useRouter();
  const send = async (g: RoomProps["gifts"][number]) => {
    if (g.price && !window.confirm(`${g.name} costs ${g.price}. You'll review the payment before paying. Continue?`)) return;
    setSending(true);
    try {
      const r = await api(slug, occurrenceId, { op: "gift", giftId: g.id, showName, paid: !!g.price });
      if (r.checkout) router.push(r.checkout);
      setOpen(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="relative">
      <button className="lk-button min-h-11" aria-expanded={open} onClick={() => setOpen((o) => !o)}>🎁 Gift</button>
      {open && (
        <div className="absolute bottom-14 left-1/2 z-30 w-72 -translate-x-1/2 rounded-lg bg-surface p-3 text-ink shadow-xl">
          <p className="text-sm font-semibold text-plum-900">Send encouragement</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {gifts.map((g) => (
              <button key={g.id} disabled={sending} onClick={() => send(g)} className="flex flex-col items-center rounded-lg border border-line p-2 text-xs hover:bg-violet-50">
                <span className="text-2xl" aria-hidden>{g.emoji}</span>
                <span>{g.name}</span>
                <span className="text-[10px] text-muted">{g.price ?? "Free"}</span>
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="size-4" /> Show my name
          </label>
          <p className="mt-2 text-[10px] text-muted">Paid gifts are payments to this community, not tax-deductible donations.</p>
        </div>
      )}
    </div>
  );
}
