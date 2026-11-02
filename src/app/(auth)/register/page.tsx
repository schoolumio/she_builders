import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/current-user";
import { safeNextPath } from "@/lib/urls";
import { registerAction } from "../actions";
import { TimezoneInput } from "@/components/timezone-input";

export const metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">Create your account</h1>
      <p className="mt-1 text-sm text-muted">One account works across every community you belong to.</p>
      <ActionForm action={registerAction} className="mt-6">
        <input type="hidden" name="next" value={next} />
        <TimezoneInput />
        <TextField label="Full name" name="name" autoComplete="name" required />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters. A short phrase is easy to remember." />
        <CheckboxField
          name="acceptTerms"
          label={
            <>
              I agree to the{" "}
              <Link href="/terms" className="underline">
                terms of service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </>
          }
        />
        <SubmitButton className="w-full" pendingText="Creating account…">
          Create account
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href={`/login${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-plum-700 underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
