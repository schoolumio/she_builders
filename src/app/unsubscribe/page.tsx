import type { NotificationCategory } from "@prisma/client";
import { BrandMark } from "@/components/brand-mark";
import { Card, Notice } from "@/components/ui/card";
import { verifySignedValue } from "@/server/crypto";
import { updatePreference, CATEGORY_LABELS } from "@/server/notifications";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function unsubscribe(formData: FormData) {
  "use server";
  const value = verifySignedValue(String(formData.get("t") ?? ""));
  if (!value) return;
  const [userId, category] = value.split(":") as [string, NotificationCategory];
  if (category && category in CATEGORY_LABELS) await updatePreference(userId, category, { email: false });
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t } = await searchParams;
  const value = t ? verifySignedValue(t) : null;
  const category = value?.split(":")[1] as NotificationCategory | undefined;
  return (
    <div className="min-h-dvh px-4 py-6">
      <BrandMark />
      <main id="main" className="mx-auto mt-10 max-w-md">
        <Card className="p-6">
          <h1 className="font-serif text-2xl font-semibold text-plum-900">Email preferences</h1>
          {!value || !category ? (
            <Notice tone="danger" className="mt-4">This unsubscribe link is not valid.</Notice>
          ) : (
            <form action={unsubscribe} className="mt-4 space-y-4">
              <input type="hidden" name="t" value={t} />
              <p className="text-sm">Stop emails about: <strong>{CATEGORY_LABELS[category]}</strong>? You will still see these in the app, and you can change this anytime in your profile.</p>
              <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Unsubscribe</button>
            </form>
          )}
        </Card>
      </main>
    </div>
  );
}
