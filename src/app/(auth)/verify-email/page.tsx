import { Card, Notice } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { verifyEmail } from "@/server/auth/service";

export const metadata = { title: "Confirm email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmail(token) : false;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">Email confirmation</h1>
      {ok ? (
        <Notice tone="success" className="mt-4">Thank you — your email address is confirmed.</Notice>
      ) : (
        <Notice tone="danger" className="mt-4">This confirmation link is invalid or has expired. Sign in and request a new one from your profile.</Notice>
      )}
      <LinkButton href="/app" className="mt-6">
        Continue
      </LinkButton>
    </Card>
  );
}
