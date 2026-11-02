import type { Metadata, Viewport } from "next";
import "./globals.css";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: "A home for online prayer communities, ministries and fellowships — meetings, prayer requests, programmes and community-owned giving.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#2b1a3d", width: "device-width", initialScale: 1 };

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
