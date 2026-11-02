import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";

const features = [
  { title: "Meet the way you already do", body: "Keep using WhatsApp, or host secure in-app audio and video prayer meetings with hand-raising, speaker control and a prayer agenda beside the call." },
  { title: "Prayer requests, kept private", body: "Members choose who can see each request before they submit it. Private requests reach only your prayer coordinators — not every administrator." },
  { title: "Community-owned giving", body: "Donations settle to your community's own verified payment account through Paystack or Stripe. We provide the software; we never hold your funds." },
  { title: "Schedules across time zones", body: "Recurring daily and weekly meetings that show in each member's local time, with reminders, cancellations and calendar files." },
  { title: "Programmes and devotionals", body: "Run Bible studies, prayer challenges and fasting programmes with daily activities, reflections and progress tracking." },
  { title: "Roles that respect boundaries", body: "Owners, administrators, moderators, prayer coordinators, hosts and finance administrators each see only what their role needs." },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-violet-50 to-canvas">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-wider text-gold-600">For prayer communities, ministries and fellowships</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-tight text-plum-900 sm:text-5xl">
            A calm, trustworthy home for your community&apos;s prayer life.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            {brand.productName} brings together membership, prayer meetings, confidential prayer requests, programmes and community-owned giving — on any phone, in any time zone.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/register?next=/orgs/new" size="lg">
              Start your community
            </LinkButton>
            <LinkButton href="/pricing" variant="secondary" size="lg">
              See plans
            </LinkButton>
          </div>
          <p className="mt-4 text-sm text-muted">Free plan available. No card required to start.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-serif text-2xl font-semibold text-plum-900 sm:text-3xl">Built for how online communities actually gather</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <h3 className="font-semibold text-plum-900">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>
      <section className="bg-plum-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Privacy and trust are the foundation</h2>
            <p className="mt-3 text-violet-100/90">
              Every community is isolated from every other. Confidential prayer requests are never used to train AI models or shared with third-party AI providers. Our own platform staff cannot read your prayer requests.
            </p>
          </div>
          <ul className="space-y-3 text-sm text-violet-100/90">
            <li>• Each organisation&apos;s data is scoped and access-checked on the server.</li>
            <li>• Payments are confirmed by the payment provider, never by a browser redirect.</li>
            <li>• Meetings are not recorded.</li>
            <li>• Members can export or delete their data.</li>
          </ul>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
        <h2 className="font-serif text-2xl font-semibold text-plum-900">Ready to gather your community?</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">Create your community in a few minutes, invite your members, and schedule your first prayer meeting.</p>
        <LinkButton href="/register?next=/orgs/new" size="lg" className="mt-6">
          Get started
        </LinkButton>
      </section>
    </>
  );
}
