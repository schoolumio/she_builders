import { brand } from "@/config/brand";
import { LegalPage } from "../legal";

export const metadata = { title: "Fundraising disclosures (draft)" };

export default function FundraisingDisclosuresPage() {
  return (
    <LegalPage title="Fundraising disclosures">
      <h2>Who receives your donation</h2>
      <p>
        Donations go to the organisation named on the donation page, through that organisation&apos;s own account with a payment provider (for example Paystack or Stripe). {brand.companyName} does not receive, hold or pool donated funds.
      </p>
      <h2>Verification</h2>
      <p>
        A &ldquo;verified&rdquo; payment account means the payment provider has confirmed the account can accept payments. It does not mean {brand.companyName} has audited the organisation, its campaign or how funds are used, unless a page explicitly says so.
      </p>
      <h2>Fees</h2>
      <p>
        The payment provider charges processing fees, which are deducted from the amount the organisation receives. A platform fee is not charged by default; if a plan includes one, it is shown on the review page before you pay.
      </p>
      <h2>Receipts and tax</h2>
      <p>You receive a payment confirmation once the provider confirms your payment. It is not a tax receipt unless the recipient organisation states otherwise.</p>
      <h2>Refunds and disputes</h2>
      <p>Refund requests are handled by the recipient organisation according to its policies and the payment provider&apos;s rules.</p>
      <h2>Virtual gifts</h2>
      <p>Paid virtual gifts, where enabled, are payments to the organisation for a gesture in a live session. They are not charitable donations and are recorded separately.</p>
    </LegalPage>
  );
}
