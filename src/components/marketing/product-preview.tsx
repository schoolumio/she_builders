import { Hand, Mic, Radio, Users } from "lucide-react";

/**
 * Illustrative preview of the live prayer-line screen, drawn with the same styles as the app.
 * Decorative only: names and content are placeholders, not customers or real data.
 */
export function ProductPreview() {
  const people = ["Host", "Co-host", "Speaker", "Listener", "Listener", "Listener", "Listener", "Listener"];
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-gold-500/25 via-violet-500/10 to-transparent blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-plum-950 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="ml-3 min-w-0 truncate rounded-md bg-white/5 px-3 py-1 text-[11px] text-white/50">your-ministry / meetings / midnight-prayer-line</span>
        </div>
        <div className="grid text-white sm:grid-cols-[1fr_190px]">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold-400">Live · Prayer line</p>
                <p className="mt-1 font-serif text-lg">Midnight intercession</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-1 text-[11px] text-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-300" /> Connected
              </span>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {people.map((role, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <span className={`relative flex size-12 items-center justify-center rounded-full text-xs font-semibold ${i < 3 ? "bg-violet-500" : "bg-white/10"} ${i === 0 ? "ring-2 ring-gold-400 ring-offset-2 ring-offset-plum-950" : ""}`}>
                    {String.fromCharCode(65 + i)}
                    {i === 5 && <Hand className="absolute -right-1 -top-1 size-4 text-gold-400" />}
                  </span>
                  <span className="text-[10px] text-white/50">{role}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 mb-16 flex items-center justify-center gap-2 sm:mb-14">
              {[Mic, Hand, Users, Radio].map((Icon, i) => (
                <span key={i} className={`flex size-9 items-center justify-center rounded-full ${i === 0 ? "bg-white text-plum-900" : "bg-white/10 text-white/80"}`}>
                  <Icon className="size-4" />
                </span>
              ))}
              <span className="ml-2 rounded-full bg-danger px-3 py-2 text-[11px] font-semibold">Leave</span>
            </div>
          </div>
          <div className="hidden border-l border-white/10 bg-white/[0.03] p-4 sm:block">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">Prayer agenda</p>
            <ol className="mt-3 space-y-3 text-[12px]">
              {[
                ["Thanksgiving", "Psalm 100", "10 min"],
                ["Families", "Joshua 24:15", "15 min"],
                ["The nations", "1 Tim 2:1-2", "15 min"],
                ["Personal requests", "Phil 4:6", "20 min"],
              ].map(([t, s, m], i) => (
                <li key={t} className={`rounded-lg p-2.5 ${i === 1 ? "bg-gold-500/15 ring-1 ring-gold-500/40" : "bg-white/5"}`}>
                  <p className="font-medium">{t}</p>
                  <p className="mt-0.5 text-[10px] text-white/50">{s} · {m}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-20 -left-8 hidden w-60 rounded-xl border border-line bg-white p-4 text-ink shadow-[var(--shadow-lift)] sm:block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-600">Prayer request</p>
        <p className="mt-1 text-sm font-semibold">Visible to prayer coordinators only</p>
        <p className="mt-1 text-xs leading-5 text-muted">Members see exactly who can read a request before they share it.</p>
      </div>
    </div>
  );
}
