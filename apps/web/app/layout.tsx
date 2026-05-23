import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted Satoshi (Fontshare). One variable woff2 covers weights
// 300–900 in <50 KB; the italic file is loaded but only kicks in when
// something is wrapped in <em>/<i> (rare in this app).
const satoshi = localFont({
  src: [
    {
      path: "../public/fonts/Satoshi-Variable.woff2",
      weight: "300 900",
      style: "normal",
    },
    {
      path: "../public/fonts/Satoshi-VariableItalic.woff2",
      weight: "300 900",
      style: "italic",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ResQ — Emergency Response Platform",
  description:
    "Nigeria's community-powered emergency network. USSD, mobile, web — every second counts.",
};

// Without this, mobile browsers render the page at desktop width and the
// user has to pinch-zoom. Also locks the URL bar colour to the dark surface
// so the iOS / Android chrome doesn't break the dark theme at the top.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
  // Mobile Safari over-zooms text inputs <16 px font-size; the global body
  // copy is 14 px in places, so the platform default isn't enough. We don't
  // disable user-scalability — keep accessibility intact.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${satoshi.variable}`}>
      <body className="min-h-screen bg-resq-dark font-sans text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
