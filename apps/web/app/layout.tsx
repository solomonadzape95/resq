import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResQ — Emergency Response Platform",
  description:
    "Nigeria's community-powered emergency network. USSD, mobile, web — every second counts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-resq-dark text-neutral-100">{children}</body>
    </html>
  );
}
