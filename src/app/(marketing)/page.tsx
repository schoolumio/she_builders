import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Church,
  EyeOff,
  HandCoins,
  HeartHandshake,
  KeyRound,
  Landmark,
  Layers,
  Lock,
  MessageCircle,
  Radio,
  Repeat,
  ScrollText,
  ShieldCheck,
  UserCheck,
  Users,
  Video,
} from "lucide-react";
import { ProductPreview } from "@/components/marketing/product-preview";
import { brand } from "@/config/brand";

const PILLARS = [
  { icon: Radio, title: "Prayer lines that scale", body: "Host-led audio and video rooms where hosts speak, members listen and raise hands, and speakers are granted one by one — or keep meeting on WhatsApp." },
  { icon: CalendarClock, title: "Schedules across time zones", body: "Daily and weekly meetings that keep their local time through daylight-saving changes, with reminders, cancellations and calendar files for every member." },
  { icon: HeartHandshake, title: "Pastoral prayer care", body: "Confidential requests reach your prayer coordinators — not every administrator. Assign intercessors, schedule follow-ups and record answered prayer." },
  { icon: BookOpen, title: "Programmes and devotionals", body: "Bible studies, fasting programmes and prayer challenges with daily readings, reflection questions and progress for every participant." },
  { icon: Layers, title: "Departments and groups", body: "Organise members into departments, cells and groups. Scope meetings, announcements and requests to exactly the right people." },
  { icon: HandCoins, title: "Giving that belongs to you", body: "One-time and recurring gifts settle to your ministry's own verified account through Paystack or Stripe, with receipts, refunds and payout reconciliation." },
];

const SECURITY = [
  { icon: KeyRound, title: "Two-factor sign-in", body: "Authenticator-app codes and recovery codes. Require two-factor for every administrator in your ministry." },
  { icon: UserCheck, title: "Separation of duties", body: "Seven distinct roles. Finance staff never see prayer requests; prayer coordinators never see finances." },
  { icon: Lock, title: "Isolated by design", body: "Every ministry's data is scoped and access-checked on the server, and tested continuously." },
  { icon: ScrollText, title: "Complete audit trail", body: "Role changes, approvals, refunds and exports are recorded with who did what and when." },
  { icon: EyeOff, title: "Confidential by default", body: "Meetings are never recorded. Prayer requests are never used to train AI or shared with AI providers." },
  { icon: ShieldCheck, title: "Your data, your control", body: "Members can export or delete their data. Donations are confirmed by the payment provider, never by a browser." },
];

const AUDIENCES = ["Large congregations", "Prayer departments", "Women's ministries", "Intercessory networks", "Bible study fellowships", "Online ministries"];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-plum-900 text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_85%_-10%,rgba(197,161,74,0.22),transparent_60%),radial-gradient(40rem_30rem_at_-10%_110%,rgba(74,95,174,0.35),transparent_60%)]" />
        <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-28 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-32 lg:pt-28 [&>*]:min-w-0">
          <div>
            <p className="eyebrow text-gold-400">{brand.tagline}</p>
            <h1 className="mt-6 font-serif text-[2.6rem] font-medium leading-[1.05] sm:text-6xl lg:text-[4.25rem]">
              Shepherd every gathering. <span className="italic text-gold-400">Steward</span> every gift.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/75">
              {brand.productName} gives churches and ministries one secure home for prayer meetings, confidential prayer care, discipleship programmes and giving — from a single fellowship to a congregation of thousands.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/support?topic=demo" className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-500 px-7 py-4 text-[0.95rem] font-semibold text-plum-950 transition hover:bg-gold-400">
                Book a demonstration <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/register?next=/orgs/new" className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-4 text-[0.95rem] font-semibold text-white transition hover:border-white/60 hover:bg-white/5">
                Start free
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/70">
              {["Two-factor security", "Funds settle to your accounts", "Works on any phone"].map((t) => (
                <li key={t} className="flex items-center gap-2 whitespace-nowrap">
                  <Check className="size-4 shrink-0 text-gold-400" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:pl-4">
            <ProductPreview />
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section aria-label="Who it is for" className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-8 text-sm font-medium text-muted sm:px-8">
          <span className="eyebrow text-gold-600">Built for</span>
          {AUDIENCES.map((a) => (
            <span key={a} className="flex items-center gap-2">
              <Church className="size-4 text-plum-700" aria-hidden /> {a}
            </span>
          ))}
        </div>
      </section>

      {/* Platform */}
      <section id="platform" className="scroll-mt-20 bg-canvas">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <div className="max-w-2xl">
            <p className="eyebrow text-gold-600">The platform</p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-plum-900 sm:text-5xl">Everything your prayer ministry runs on, in one place.</h2>
            <p className="mt-5 text-lg leading-8 text-muted">Replace scattered group chats, spreadsheets and payment links with a platform your pastors, coordinators, finance team and members can all trust.</p>
          </div>
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-surface p-8 transition-colors hover:bg-violet-50/60">
                <span className="flex size-11 items-center justify-center rounded-xl bg-plum-900 text-gold-400">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-6 text-lg font-semibold text-plum-900">{title}</h3>
                <p className="mt-2 leading-7 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Meetings */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:py-32">
          <div>
            <p className="eyebrow text-gold-600">Meetings</p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-plum-900">Meet the way your people already pray.</h2>
            <p className="mt-5 text-lg leading-8 text-muted">Each meeting chooses its own format. Members always see one clear “Join” button and the prayer agenda.</p>
            <ul className="mt-10 space-y-8">
              {[
                { icon: Radio, t: "Broadcast prayer lines", d: "Hosts lead; members listen, raise hands and are invited to speak. Hosts can mute, remove and lock the room." },
                { icon: Video, t: "Interactive audio and video", d: "Cell meetings and Bible studies with cameras, screen sharing, waiting rooms and chat." },
                { icon: MessageCircle, t: "WhatsApp, done properly", d: "Keep your WhatsApp groups. Members get a safe join link, instructions, reminders and a calendar entry." },
              ].map(({ icon: Icon, t, d }) => (
                <li key={t} className="flex gap-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-600"><Icon className="size-5" aria-hidden /></span>
                  <div>
                    <h3 className="font-semibold text-plum-900">{t}</h3>
                    <p className="mt-1 leading-7 text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="rounded-2xl border border-line bg-canvas p-6 shadow-[var(--shadow-card)]">
            <p className="eyebrow text-gold-600">This week</p>
            <ul className="mt-4 space-y-3">
              {[
                ["Mon · 05:00", "Morning watch", "Prayer line", "Lagos time · shown in your time zone"],
                ["Wed · 18:30", "Bible study — Romans", "Video", "Cell groups"],
                ["Fri · 21:00", "Night of intercession", "WhatsApp", "All members"],
                ["Sun · 16:00", "Women's fellowship", "Audio", "Women's ministry"],
              ].map(([when, title, mode, who]) => (
                <li key={title} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
                  <div>
                    <p className="text-xs font-medium text-muted">{when}</p>
                    <p className="mt-0.5 font-semibold text-plum-900">{title}</p>
                    <p className="text-xs text-muted">{who}</p>
                  </div>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-plum-800">{mode}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Giving */}
      <section id="giving" className="scroll-mt-20 bg-plum-950 text-white">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="eyebrow text-gold-400">Giving &amp; stewardship</p>
              <h2 className="mt-4 font-serif text-4xl font-medium leading-tight sm:text-5xl">Every gift goes straight to your ministry.</h2>
              <p className="mt-5 text-lg leading-8 text-white/70">
                {brand.companyName} provides the software — we never hold, pool or redistribute your funds. Donations settle to your own verified Paystack or Stripe account, and only payments the provider confirms are ever recorded.
              </p>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: Landmark, t: "Connect your account", d: "Your finance team connects the ministry's own payment account through the provider's verification." },
                { icon: ShieldCheck, t: "Verified before launch", d: "Campaigns are approved by finance, and donations stay closed until the provider confirms your account." },
                { icon: Repeat, t: "One-time and recurring", d: "Members give once or set up monthly partnership, and can manage or cancel it themselves." },
                { icon: Users, t: "Reconciled to the bank", d: "Receipts, refunds, an append-only ledger and imported payouts show what reached your bank and when." },
              ].map(({ icon: Icon, t, d }, i) => (
                <li key={t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-2xl text-gold-400">0{i + 1}</span>
                    <Icon className="size-5 text-white/60" aria-hidden />
                  </div>
                  <p className="mt-4 font-semibold">{t}</p>
                  <p className="mt-1.5 text-sm leading-6 text-white/65">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-20 bg-canvas">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-gold-600">Security &amp; governance</p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-plum-900 sm:text-5xl">Built for the trust a church places in it.</h2>
            <p className="mt-5 text-lg leading-8 text-muted">Prayer requests, member records and financial data are protected by design — with controls your leadership and auditors can understand.</p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-line bg-surface p-7 shadow-[var(--shadow-card)]">
                <Icon className="size-6 text-plum-700" aria-hidden />
                <h3 className="mt-5 font-semibold text-plum-900">{title}</h3>
                <p className="mt-2 text-[0.95rem] leading-7 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise CTA */}
      <section className="bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-plum-900 px-8 py-16 text-white sm:px-16">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(40rem_20rem_at_100%_0%,rgba(197,161,74,0.25),transparent_60%)]" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="eyebrow text-gold-400">For large ministries</p>
                <h2 className="mt-4 font-serif text-3xl font-medium leading-tight sm:text-4xl">Planning a rollout across your departments?</h2>
                <p className="mt-4 max-w-xl leading-7 text-white/70">We&apos;ll walk your leadership through the platform, plan onboarding for your teams, and agree the security, data-protection and support arrangements your ministry requires.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Link href="/support?topic=demo" className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-500 px-7 py-4 font-semibold text-plum-950 transition hover:bg-gold-400">
                  Book a demonstration <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href="/pricing" className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-4 font-semibold transition hover:border-white/60">
                  View plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
