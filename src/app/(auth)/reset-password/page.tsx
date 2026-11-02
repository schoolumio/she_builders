import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, Notice } from "@/components/ui/card";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">Choose a new password</h1>
      {!token ? (
        <Notice tone="danger" className="mt-4">This link is incomplete. Please use the link from your email.</Notice>
      ) : (
        <ActionForm action={resetPasswordAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <TextField label="New password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters." />
          <SubmitButton className="w-full">Save new password</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}
