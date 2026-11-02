import { brand } from "@/config/brand";
import { LegalPage } from "../legal";

export const metadata = { title: "Terms of service (draft)" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>These terms govern use of {brand.productName}, provided by {brand.companyName} ({brand.legalEntity}).</p>
      <h2>Accounts</h2>
      <p>You must provide accurate information and keep your password secure. You are responsible for activity on your account.</p>
      <h2>Organisations</h2>
      <p>
        People who create an organisation accept responsibility for its administration, the people they appoint to roles, the content published in it, and compliance with the laws that apply to its activities.
      </p>
      <h2>Fundraising</h2>
      <p>
        Organisations collect donations through their own accounts with supported payment providers. {brand.companyName} provides software and is not a party to donations, does not hold or pool donated funds, and does not verify how donations are used unless explicitly stated. See the fundraising disclosures.
      </p>
      <h2>Subscriptions</h2>
      <p>Paid plans renew automatically until cancelled. Cancellation takes effect at the end of the current billing period. Plan features and limits are enforced by the platform.</p>
      <h2>Acceptable use</h2>
      <p>Follow the community guidelines. We may suspend accounts or organisations that break these terms or the law, following our documented policies.</p>
      <h2>Liability</h2>
      <p>The service is provided as is. To the extent permitted by law, our liability is limited to the fees paid in the 12 months before a claim.</p>
    </LegalPage>
  );
}
