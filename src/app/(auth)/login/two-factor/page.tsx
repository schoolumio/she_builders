import Link from "next/link";
import { cookies } from "next/headers";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, Notice } from "@/components/ui/card";
import { safeNextPath } from "@/lib/urls";
import { MFA_COOKIE, twoFactorAction } from "../../actions";

export const metadata = { title: "Two-factor verification" };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const pending = !!(await cookies()).get(MFA_COOKIE);
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">Two-factor verification</h1>
      {!pending ? (
        <Notice tone="warning" className="mt-4">Your sign-in has expired. <Link className="underline" href="/login">Sign in again</Link>.</Notice>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
          <ActionForm action={twoFactorAction} className="mt-6">
            <input type="hidden" name="next" value={safeNextPath(sp.next)} />
            <TextField label="Verification code" name="code" inputMode="text" autoComplete="one-time-code" autoFocus required maxLength={12} />
            <SubmitButton className="w-full" pendingText="Verifying…">Verify</SubmitButton>
          </ActionForm>
          <Link href="/login" className="mt-6 inline-block text-sm text-muted underline">Use a different account</Link>
        </>
      )}
    </Card>
  );
}
