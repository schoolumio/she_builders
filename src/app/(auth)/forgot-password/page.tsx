import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { forgotPasswordAction } from "../actions";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">Enter your email and we&apos;ll send you a secure link.</p>
      <ActionForm action={forgotPasswordAction} className="mt-6">
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <SubmitButton className="w-full" pendingText="Sending…">
          Send reset link
        </SubmitButton>
      </ActionForm>
      <Link href="/login" className="mt-6 inline-block text-sm text-plum-700 underline">
        Back to sign in
      </Link>
    </Card>
  );
}
