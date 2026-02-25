import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Premium Auto Detailing",
  description: "Professional car detailing services — book your appointment online",
};

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
