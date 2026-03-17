import { Suspense } from "react";
import { VodApp } from "@/components/VodApp";

export default function VideoPage() {
  return (
    <Suspense>
      <VodApp />
    </Suspense>
  );
}
