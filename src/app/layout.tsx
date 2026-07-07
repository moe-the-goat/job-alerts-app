import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// One text face, one mono. Headings differentiate through weight and
// tracking, not through a second typeface.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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

// Runs before first paint: applies a saved theme choice so there's no flash of
// the wrong theme on load. With no saved choice it does nothing and the CSS
// default takes over (light, with a prefers-color-scheme:dark fallback).
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
