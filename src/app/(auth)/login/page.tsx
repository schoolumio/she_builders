import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, Notice } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/current-user";
import { safeNextPath } from "@/lib/urls";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to join meetings and connect with your community.</p>
      {sp.reset && <Notice tone="success" className="mt-4">Your password was changed. Please sign in.</Notice>}
      <ActionForm action={loginAction} className="mt-6">
        <input type="hidden" name="next" value={next} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton className="w-full" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </ActionForm>
      <div className="mt-6 flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
        <Link href="/forgot-password" className="text-plum-700 underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
        <Link href={`/register${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-plum-700 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </div>
    </Card>
  );
}
