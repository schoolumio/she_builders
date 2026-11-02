import { LegalPage } from "../legal";

export const metadata = { title: "Community guidelines (draft)" };

export default function GuidelinesPage() {
  return (
    <LegalPage title="Community guidelines">
      <p>Our platform serves many faith communities with different traditions. These guidelines help every community stay safe and welcoming.</p>
      <ul>
        <li>Treat others with respect. No harassment, hate speech, threats or bullying.</li>
        <li>Respect confidentiality. Do not share someone else&apos;s prayer request or personal information outside its intended audience.</li>
        <li>Share testimonies and images only with consent.</li>
        <li>Be honest in fundraising. Describe campaigns accurately and use funds for the stated purpose.</li>
        <li>No spam, scams or impersonation of people or organisations.</li>
        <li>Report concerns using the report tools; moderators will review them.</li>
      </ul>
    </LegalPage>
  );
}
