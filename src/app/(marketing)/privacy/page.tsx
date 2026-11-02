import { brand } from "@/config/brand";
import { LegalPage } from "../legal";

export const metadata = { title: "Privacy policy (draft)" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        {brand.productName} is operated by {brand.companyName}, a business of {brand.legalEntity} (&ldquo;we&rdquo;). Communities (&ldquo;organisations&rdquo;) use the platform to run their activities. For content members share inside a community, that organisation decides how it is used; we process it on their behalf.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email address, password (stored only as a salted hash), time zone and notification preferences.</li>
        <li>Community activity: memberships, roles, meeting participation records, prayer requests, testimonies, programme progress.</li>
        <li>Payments: donation amounts, status and receipts. Card and bank details are entered on the payment provider&apos;s pages and are not stored by us; we keep only references and masked details supplied by the provider.</li>
        <li>Technical data: session records, hashed IP addresses for security and rate limiting.</li>
      </ul>
      <h2>Prayer requests</h2>
      <p>
        You choose who can see each prayer request before submitting it. Private requests are visible only to you, the organisation&apos;s prayer coordinators and people a coordinator assigns. Platform staff cannot read prayer requests through our tools. Prayer requests are never used to train AI models or sent to third-party AI providers.
      </p>
      <h2>Meetings</h2>
      <p>Meetings are not recorded. In-app audio and video are carried by our real-time provider (LiveKit). WhatsApp meetings take place on WhatsApp under WhatsApp&apos;s own terms; we do not access WhatsApp conversations.</p>
      <h2>Who we share data with</h2>
      <ul>
        <li>Service providers that run the platform: hosting, database, email delivery, real-time media, payment providers (Paystack, Stripe).</li>
        <li>The organisations you join, according to your roles and the visibility you choose.</li>
        <li>Authorities, where required by law.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can download your data from your profile page and delete your account at any time. When you delete your account we remove your profile and personal content. Records of donations are retained in anonymised form where financial record-keeping obligations require it.
      </p>
      <h2>Retention</h2>
      <p>Sessions expire after 30 days of inactivity. Security tokens expire within 48 hours. Financial records are retained for the period required by applicable law.</p>
      <h2>Contact</h2>
      <p>Questions or requests: {brand.supportEmail}.</p>
    </LegalPage>
  );
}
