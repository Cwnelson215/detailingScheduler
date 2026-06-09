import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { getBusinessInfo } from "@/lib/business-info";
import { Toaster } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const SITE_URL = process.env.SITE_URL || "https://detailing.cwnel.com";

export async function generateMetadata(): Promise<Metadata> {
  const info = await getBusinessInfo();
  const description = `Professional car detailing services from ${info.name} — book your appointment online.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: info.name,
      template: `%s · ${info.name}`,
    },
    description,
    applicationName: info.name,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: SITE_URL,
      siteName: info.name,
      title: info.name,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: info.name,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const info = await getBusinessInfo();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoWash",
    name: info.name,
    description: `Professional car detailing services from ${info.name}.`,
    url: SITE_URL,
    telephone: info.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: info.address.replace(/\n/g, ", "),
    },
  };

  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
