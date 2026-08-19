import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Advisor — long-term value analysis",
  description:
    "India (Zerodha) and Canada (Wealthsimple) portfolios analyzed through the lens of Buffett, Damani and Jhunjhunwala. Free data, 5-year horizon, everything stored only on your device.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
