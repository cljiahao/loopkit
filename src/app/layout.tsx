import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Display: characterful grotesque for headlines, used with restraint.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

// Body: friendly, rounded, highly readable for non-technical vendors.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

// Mono: for stamp counters and receipt-ticket numerals.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "loopkit — turn one-time buyers into regulars",
  description:
    "A digital stamp card for Singapore's small food vendors. Stamp customers by phone number, reward the regulars — no app for them to download.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${jakarta.variable} ${plexMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
