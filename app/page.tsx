import { Suspense } from "react";
import { VodApp } from "@/components/VodApp";
import { StructuredData } from "@/components/structured-data";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Watch & Download Sub-Only Twitch VODs Without Restrictions",
  description:
    "Watch and download any Twitch VOD without restrictions, including sub-only content. A modern, fast, and secure web player and downloader with adaptive quality streaming.",
  path: "/",
  keywords: [
    "watch twitch vods online",
    "twitch sub-only vod viewer",
    "twitch vod streaming tool",
    "download twitch vods online",
    "twitch vod downloader free",
  ],
});

export default function Home() {
  const baseUrl = getBaseUrl().toString();

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: baseUrl,
          description: siteConfig.description,
          potentialAction: {
            "@type": "SearchAction",
            target: `${baseUrl}?v={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: siteConfig.name,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web",
          description: siteConfig.description,
          url: baseUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }}
      />
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What can Phantom Twitch do?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Phantom Twitch lets you watch and download any Twitch VOD without restrictions, including sub-only content, in a modern web player with adaptive quality streaming and download options.",
              },
            },
            {
              "@type": "Question",
              name: "Which video formats are supported?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Phantom Twitch supports HLS adaptive streaming with multiple quality options including 1080p60, 720p60, 480p, 360p, and 160p, with both H.264 and H.265 codec support where available.",
              },
            },
            {
              "@type": "Question",
              name: "Is Phantom Twitch affiliated with Twitch?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Phantom Twitch is an independent tool and is not endorsed by or affiliated with Twitch or Amazon.",
              },
            },
          ],
        }}
      />
      <Suspense>
        <VodApp />
      </Suspense>
    </>
  );
}
