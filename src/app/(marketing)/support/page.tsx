import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/current-user";
import { brand } from "@/config/brand";
import { supportAction } from "./actions";

export const metadata = { title: "Contact & support" };

export default async function SupportPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold text-plum-900">Contact & support</h1>
      <p className="mt-2 text-muted">Questions about plans, setup or your account? Send us a message, or email {brand.supportEmail}.</p>
      <Card className="mt-8">
        <ActionForm action={supportAction} resetOnSuccess>
          <TextField label="Your email" name="email" type="email" defaultValue={user?.email} required />
          <TextField label="Subject" name="subject" required />
          <TextAreaField label="How can we help?" name="body" rows={6} required hint="Please don't include passwords, card details or confidential prayer requests." />
          <SubmitButton>Send message</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
