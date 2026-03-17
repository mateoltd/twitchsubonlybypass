import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Phantom Twitch — Watch Sub-Only Twitch VODs Unrestricted",
    template: "%s | Phantom Twitch",
  },
  description:
    "Watch any Twitch VOD without restrictions, including sub-only content. A modern, fast, and secure web player for Twitch VODs with adaptive quality.",
  keywords: [
    "twitch sub-only bypass",
    "watch twitch vods",
    "twitch vod player",
    "phantom twitch",
    "twitch restricted vods",
    "twitch vod downloader",
    "sub-only vod bypass",
  ],
  authors: [{ name: "mateoltd", url: "https://github.com/mateoltd" }],
  creator: "mateoltd",
  publisher: "Phantom Research",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: process.env.NEXT_PUBLIC_BASE_URL 
    ? new URL(process.env.NEXT_PUBLIC_BASE_URL) 
    : process.env.VERCEL_URL 
      ? new URL(`https://${process.env.VERCEL_URL}`)
      : new URL("http://localhost:3000"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Phantom Twitch — Watch Sub-Only Twitch VODs Unrestricted",
    description:
      "Watch any Twitch VOD without restrictions, including sub-only content. Modern web player with adaptive quality.",
    url: "/",
    siteName: "Phantom Twitch",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Phantom Twitch — Watch Sub-Only Twitch VODs Unrestricted",
    description:
      "Watch any Twitch VOD without restrictions, including sub-only content. Modern web player with adaptive quality.",
    creator: "@mateoltd",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
