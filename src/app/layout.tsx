import type { Metadata } from "next";
import "./globals.css";
import { getBusinessInfo } from "@/lib/business-info";

export async function generateMetadata(): Promise<Metadata> {
  const info = await getBusinessInfo();
  return {
    title: info.name,
    description: `Professional car detailing services from ${info.name} — book your appointment online.`,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
