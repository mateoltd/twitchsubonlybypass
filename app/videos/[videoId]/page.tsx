import { Suspense } from "react";
import { VodApp } from "@/components/VodApp";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Watch VOD",
  description: "Watch a Twitch VOD without restrictions in an adaptive quality web player.",
  path: "/videos",
  noIndex: true,
});

export default function VideoPage() {
  return (
    <Suspense>
      <VodApp />
    </Suspense>
  );
}
