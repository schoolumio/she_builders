import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { listGifts } from "@/server/gifts/service";
import { getEntitlements } from "@/server/billing/entitlements";
import { formatMoney, fromMinorUnits } from "@/lib/money";
import { deleteGiftAction, paidGiftsAction, saveGiftAction } from "../actions";

export const metadata = { title: "Virtual gifts" };

export default async function GiftsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "gifts.manage");
  const [gifts, ent] = await Promise.all([listGifts(ctx.org.id, { includeUnavailable: true }), getEntitlements(ctx.org.id)]);
  const paidAllowed = ent.features.has("feature.paid_gifts");
  return (
    <>
      <PageHeader title="Virtual gifts" description="Small gestures of encouragement members can send during in-app meetings." />
      <Notice className="mb-6">
        Free gifts are on by default. Paid gifts are optional, are charged through your verified payment account, show their price before purchase, and are recorded separately from donations. There is no virtual currency.
      </Notice>
      <Card className="mb-6">
        <CardTitle>Paid gifts</CardTitle>
        {!paidAllowed ? <p className="mt-2 text-sm text-muted">Not included in your current plan.</p> : (
          <div className="mt-2 flex items-center gap-3">
            <Badge tone={ctx.org.paidGiftsEnabled ? "success" : "neutral"}>{ctx.org.paidGiftsEnabled ? "Enabled" : "Disabled"}</Badge>
            <InlineAction action={paidGiftsAction.bind(null, slug)} fields={{ enabled: ctx.org.paidGiftsEnabled ? "0" : "1" }}>{ctx.org.paidGiftsEnabled ? "Disable paid gifts" : "Enable paid gifts"}</InlineAction>
          </div>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {gifts.map((g) => (
          <Card key={g.id}>
            <ActionForm action={saveGiftAction.bind(null, slug)}>
              <input type="hidden" name="id" value={g.id} />
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>{g.emoji}</span>
                <div className="flex-1"><p className="font-semibold">{g.name}</p><p className="text-xs text-muted">{g.priceAmount && g.currency ? formatMoney(g.priceAmount, g.currency) : "Free"}</p></div>
                {!g.available && <Badge>hidden</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Name" name="name" defaultValue={g.name} required />
                <TextField label="Emoji" name="emoji" defaultValue={g.emoji} required />
                <TextField label="Order" name="position" type="number" defaultValue={String(g.position)} />
              </div>
              <CheckboxField name="available" label="Available" defaultChecked={g.available} />
              <CheckboxField name="showInFeed" label="Show in the live feed" defaultChecked={g.showInFeed} />
              {paidAllowed && (
                <>
                  <CheckboxField name="paid" label="Paid gift" defaultChecked={!!g.priceAmount} />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Price" name="price" type="number" step="0.01" defaultValue={g.priceAmount && g.currency ? String(fromMinorUnits(g.priceAmount, g.currency)) : ""} />
                    <TextField label="Currency" name="currency" defaultValue={g.currency ?? ctx.org.defaultCurrency} maxLength={3} />
                  </div>
                </>
              )}
              <div className="flex gap-2"><SubmitButton size="sm">Save</SubmitButton></div>
            </ActionForm>
            {g.available && <div className="mt-2"><InlineAction action={deleteGiftAction.bind(null, slug)} fields={{ id: g.id }} variant="ghost">Hide</InlineAction></div>}
          </Card>
        ))}
        <Card>
          <CardTitle>Add a gift</CardTitle>
          <ActionForm action={saveGiftAction.bind(null, slug)} className="mt-3" resetOnSuccess>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Name" name="name" required />
              <TextField label="Emoji" name="emoji" required placeholder="🌟" />
            </div>
            <input type="hidden" name="available" value="on" />
            <input type="hidden" name="showInFeed" value="on" />
            <SubmitButton size="sm">Add free gift</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
