import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces/full.css";
import "./globals.css";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${brand.productName} — ${brand.tagline.replace(/\.$/, "")}`, template: `%s · ${brand.productName}` },
  description: "One secure home for prayer meetings, confidential prayer care, discipleship programmes and community-owned giving — for churches and ministries of every size.",
  applicationName: brand.productName,
  openGraph: { siteName: brand.productName, type: "website" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0e1530", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
