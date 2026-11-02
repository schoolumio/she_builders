import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";
import { requirePlatformAdmin } from "@/server/auth/current-user";
import { listPlans } from "@/server/billing/service";
import { FEATURES, LIMITS } from "@/server/billing/catalog";
import { fromMinorUnits } from "@/lib/money";
import { entitlementAction, updatePlanAction } from "../actions";

export default async function PlansPage() {
  const admin = await requirePlatformAdmin();
  const plans = await listPlans({ includeHidden: true });
  const editable = admin.platformRole === "SUPER_ADMIN";
  return (
    <>
      <PageHeader title="Plans" description="Prices, trials, grace periods, optional donation platform fee and entitlements. Changes apply immediately and are audited." />
      <Notice tone="warning" className="mb-6">A donation platform fee must be disclosed to donors (it is shown automatically on the review page) and must be permitted by the payment provider and applicable regulations. It defaults to 0%.</Notice>
      <div className="space-y-6">
        {plans.map((p) => {
          const ent = new Map(p.entitlements.map((e) => [e.key, e]));
          return (
            <Card key={p.id}>
              <CardTitle>{p.name} <span className="text-sm font-normal text-muted">({p.code})</span></CardTitle>
              <fieldset disabled={!editable}>
                <ActionForm action={updatePlanAction} className="mt-3">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="currency" value={p.currency} />
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <TextField label={`Monthly (${p.currency})`} name="monthlyPrice" type="number" step="0.01" defaultValue={p.monthlyPrice == null ? "" : String(fromMinorUnits(p.monthlyPrice, p.currency))} hint="Blank = contact sales" />
                    <TextField label={`Yearly (${p.currency})`} name="yearlyPrice" type="number" step="0.01" defaultValue={p.yearlyPrice == null ? "" : String(fromMinorUnits(p.yearlyPrice, p.currency))} />
                    <TextField label="Trial days" name="trialDays" type="number" defaultValue={String(p.trialDays)} />
                    <TextField label="Grace days" name="graceDays" type="number" defaultValue={String(p.graceDays)} />
                    <TextField label="Donation platform fee %" name="platformFeePercent" type="number" step="0.01" min={0} max={10} defaultValue={String(p.platformFeeBps / 100)} />
                    <CheckboxField name="public" label="Public" defaultChecked={p.public} />
                    <TextField label="Stripe monthly price id" name="stripeMonthlyPriceId" defaultValue={p.stripeMonthlyPriceId ?? ""} className="sm:col-span-3" />
                    <TextField label="Stripe yearly price id" name="stripeYearlyPriceId" defaultValue={p.stripeYearlyPriceId ?? ""} className="sm:col-span-3" />
                  </div>
                  <SubmitButton size="sm">Save plan</SubmitButton>
                </ActionForm>
              </fieldset>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-plum-700">Entitlements</summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {[...Object.entries(FEATURES), ...Object.entries(LIMITS)].map(([key, label]) => {
                    const e = ent.get(key);
                    const isLimit = key.startsWith("limit.");
                    return (
                      <fieldset key={key} disabled={!editable} className="rounded-lg border border-line p-3">
                        <ActionForm action={entitlementAction} className="space-y-2">
                          <input type="hidden" name="planId" value={p.id} />
                          <input type="hidden" name="key" value={key} />
                          <CheckboxField name="enabled" label={label} defaultChecked={e?.enabled ?? false} />
                          {isLimit && <TextField label="Limit (blank = unlimited)" name="limit" type="number" min={0} defaultValue={e?.limit == null ? "" : String(e.limit)} />}
                          <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                        </ActionForm>
                      </fieldset>
                    );
                  })}
                </div>
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
