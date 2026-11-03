import { CalendarCheck, LifeBuoy } from "lucide-react";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { getCurrentUser } from "@/server/auth/current-user";
import { brand } from "@/config/brand";
import { supportAction } from "./actions";

export const metadata = { title: "Contact & demonstrations" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const user = await getCurrentUser();
  const demo = (await searchParams).topic === "demo";
  return (
    <div className="bg-canvas">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="eyebrow text-gold-600">{demo ? "Book a demonstration" : "Contact & support"}</p>
          <h1 className="mt-4 font-serif text-4xl font-medium leading-tight text-plum-900 sm:text-5xl">{demo ? "See the platform with your leadership team." : "How can we help?"}</h1>
          <p className="mt-5 text-lg leading-8 text-muted">
            {demo
              ? "Tell us about your ministry — size, departments, how you meet and give today — and we'll arrange a guided walkthrough and onboarding plan."
              : `Questions about plans, setup or your account? Send a message or email ${brand.supportEmail}.`}
          </p>
          <ul className="mt-10 space-y-6">
            <li className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-plum-900 text-gold-400"><CalendarCheck className="size-5" aria-hidden /></span>
              <div><p className="font-semibold text-plum-900">Guided demonstration</p><p className="text-sm leading-6 text-muted">Meetings, prayer care, programmes, giving and security, shown with your use cases.</p></div>
            </li>
            <li className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-plum-900 text-gold-400"><LifeBuoy className="size-5" aria-hidden /></span>
              <div><p className="font-semibold text-plum-900">Onboarding support</p><p className="text-sm leading-6 text-muted">Help importing members, configuring roles and connecting your payment account.</p></div>
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-10">
          <ActionForm action={supportAction} resetOnSuccess>
            <TextField label="Your email" name="email" type="email" defaultValue={user?.email} required />
            <TextField label="Subject" name="subject" defaultValue={demo ? "Demonstration request" : undefined} required />
            <TextAreaField
              label={demo ? "About your ministry" : "How can we help?"}
              name="body"
              rows={7}
              required
              placeholder={demo ? "Ministry name, approximate members, departments, how you meet and give today, preferred dates…" : undefined}
              hint="Please don't include passwords, card details or confidential prayer requests."
            />
            <SubmitButton size="lg" className="w-full">{demo ? "Request a demonstration" : "Send message"}</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
