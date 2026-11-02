import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { activeConnection, donationReadiness, listConnections } from "@/server/payments/connections";
import { availableProviders, getPaymentProvider } from "@/server/payments/providers";
import { CONNECTION_STATUS_COPY } from "@/server/payments/status";
import { getEntitlements } from "@/server/billing/entitlements";
import { errorMeta, log } from "@/server/log";
import { disconnectAction, fundraisingToggleAction, refreshConnectionAction, startOnboardingAction } from "../actions";

export const metadata = { title: "Payment account" };

const PROVIDER_COPY: Record<string, string> = {
  PAYSTACK: "For organisations in Nigeria, Ghana, Kenya, South Africa and Côte d'Ivoire. Donations settle to your bank account through a Paystack subaccount. BridgeCodes reviews your organisation before donations are enabled.",
  STRIPE: "For organisations in Stripe-supported countries. You complete identity and bank verification on Stripe's own pages; donations settle to your Stripe account.",
  SIMULATOR: "Development and testing only. Simulates onboarding and payments without real money. Never available in production.",
};

export default async function FinanceSetupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ return?: string; refresh?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await pageOrgContext(slug, "finance.manage");
  const [conn, history, ent, ready] = await Promise.all([activeConnection(ctx.org.id), listConnections(ctx), getEntitlements(ctx.org.id), donationReadiness(ctx.org.id, ctx.org.defaultCurrency)]);
  const providers = availableProviders();
  const fundraisingAllowed = ent.features.has("feature.fundraising");

  let banks: { code: string; name: string }[] = [];
  let bankError = false;
  const paystack = providers.find((p) => p.id === "PAYSTACK");
  if (!conn && paystack?.listBanks) {
    try {
      banks = await paystack.listBanks(ctx.org.country);
    } catch (e) {
      bankError = true;
      log.warn("paystack.list_banks_failed", errorMeta(e));
    }
  }

  return (
    <>
      <PageHeader title="Payment account" description="Connect your community's own account with a supported payment provider. BridgeCodes never receives your donations." />
      {sp.return && <Notice tone="success" className="mb-4">Welcome back. If you completed the provider&apos;s steps, refresh the status below — verification can take a little while.</Notice>}
      {sp.refresh && <Notice tone="warning" className="mb-4">The provider link expired. Continue onboarding to get a fresh link.</Notice>}
      {!fundraisingAllowed && <Notice tone="warning" className="mb-4" title="Fundraising is not included in your plan">An owner can upgrade in Plan & billing.</Notice>}

      <Card className="mb-6">
        <CardTitle>Accepting donations</CardTitle>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Badge tone={ready.ready ? "success" : "warning"}>{ready.ready ? "Yes — donations can be accepted" : "No"}</Badge>
          {!ready.ready && <span className="text-sm text-muted">{ready.reason}</span>}
        </div>
        <div className="mt-3">
          <InlineAction action={fundraisingToggleAction.bind(null, slug)} fields={{ enabled: ctx.org.fundraisingEnabled ? "0" : "1" }} variant={ctx.org.fundraisingEnabled ? "ghost" : "secondary"}>
            {ctx.org.fundraisingEnabled ? "Turn fundraising off" : "Turn fundraising on"}
          </InlineAction>
        </div>
      </Card>

      {conn ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{getPaymentProvider(conn.provider).displayName}</CardTitle>
            <Badge tone={CONNECTION_STATUS_COPY[conn.status].tone === "success" ? "success" : CONNECTION_STATUS_COPY[conn.status].tone === "danger" ? "danger" : "warning"}>{CONNECTION_STATUS_COPY[conn.status].label}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted">{CONNECTION_STATUS_COPY[conn.status].help}</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Account name (from provider)</dt><dd>{conn.accountName ?? "—"}</dd></div>
            <div><dt className="text-muted">Settlement bank</dt><dd>{conn.bankName ? `${conn.bankName}${conn.accountLast4 ? ` ····${conn.accountLast4}` : ""}` : "—"}</dd></div>
            <div><dt className="text-muted">Can accept payments</dt><dd>{conn.chargesEnabled ? "Yes" : "No"}</dd></div>
            <div><dt className="text-muted">Payouts enabled</dt><dd>{conn.payoutsEnabled ? "Yes" : "No"}</dd></div>
            <div><dt className="text-muted">Currencies</dt><dd>{(conn.currencies.length ? conn.currencies : getPaymentProvider(conn.provider).supportedCurrencies(ctx.org.country)).join(", ")}</dd></div>
            <div><dt className="text-muted">Last checked</dt><dd>{conn.lastSyncedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "—"} UTC</dd></div>
            {getPaymentProvider(conn.provider).capabilities.requiresPlatformReview && (
              <div className="sm:col-span-2"><dt className="text-muted">BridgeCodes organisation review</dt><dd>{conn.platformReviewedAt ? "Approved" : conn.reviewNote ? `Not approved: ${conn.reviewNote}` : "Pending — we'll review your organisation details."}</dd></div>
            )}
          </dl>
          {conn.requirements.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium">Outstanding requirements from the provider</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">{conn.requirements.map((r) => <li key={r}>{r.replace(/[._]/g, " ")}</li>)}</ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <InlineAction action={refreshConnectionAction.bind(null, slug)} fields={{ id: conn.id }}>Refresh status</InlineAction>
            {getPaymentProvider(conn.provider).capabilities.hostedOnboarding && conn.status !== "VERIFIED" && (
              <ActionForm action={startOnboardingAction.bind(null, slug)} className="space-y-0">
                <input type="hidden" name="provider" value={conn.provider} />
                <SubmitButton size="sm">Continue onboarding</SubmitButton>
              </ActionForm>
            )}
            <InlineAction action={disconnectAction.bind(null, slug)} fields={{ id: conn.id }} variant="danger" confirm="Disconnect this payment account? Donations will stop until a new account is verified.">Disconnect</InlineAction>
          </div>
        </Card>
      ) : providers.length === 0 ? (
        <Notice tone="warning" title="No payment providers are configured on this platform yet">Fundraising will be available once BridgeCodes completes provider setup.</Notice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between gap-2"><CardTitle>{p.displayName}</CardTitle>{p.isTestMode() && <Badge tone="gold">Test mode</Badge>}</div>
              <p className="mt-2 text-sm text-muted">{PROVIDER_COPY[p.id]}</p>
              <ActionForm action={startOnboardingAction.bind(null, slug)} className="mt-4">
                <input type="hidden" name="provider" value={p.id} />
                {p.capabilities.bankDetailsForm && (
                  <>
                    {bankError && <Notice tone="warning">We couldn&apos;t load the bank list from {p.displayName}. Try again later.</Notice>}
                    <SelectField label="Settlement bank" name="bankCode" options={banks.map((b) => ({ value: b.code, label: b.name }))} required />
                    <TextField label="Account number" name="accountNumber" inputMode="numeric" autoComplete="off" required hint={`Sent directly to ${p.displayName} to confirm the account. We store only the last four digits.`} />
                    <TextField label="Registered organisation name" name="businessName" defaultValue={ctx.org.name} required />
                  </>
                )}
                <SubmitButton disabled={!fundraisingAllowed || (p.capabilities.bankDetailsForm && banks.length === 0)}>{p.capabilities.hostedOnboarding ? `Connect with ${p.displayName}` : "Submit to provider"}</SubmitButton>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
      {history.filter((h) => h.status === "DISCONNECTED").length > 0 && (
        <p className="mt-6 text-xs text-muted">Previously disconnected accounts: {history.filter((h) => h.status === "DISCONNECTED").map((h) => `${h.provider} (${h.disconnectedAt?.toISOString().slice(0, 10)})`).join(", ")}</p>
      )}
    </>
  );
}
