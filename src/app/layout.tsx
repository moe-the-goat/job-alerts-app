import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif — page titles, empty-state headlines, AI-verdict pull
// quotes. One weight on purpose: it's an accent voice, not a text face.
const instrumentSerif = Instrument_Serif({
  variable: "--font-display-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Job Alerts — A quieter way to job hunt",
    template: "%s · Job Alerts",
  },
  description:
    "An AI scores nine job boards against your CV every morning and emails you the handful that genuinely match. Private beta.",
  metadataBase: new URL("https://job-alerts-app-three.vercel.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
