"use client";

import { useCallback, useState } from "react";
import { IconCheck, IconShare3 } from "@tabler/icons-react";
import { buildVodPath } from "@/lib/validation";

interface ShareButtonProps {
  vodId: string;
  currentTime?: number;
}

export function ShareButton({ vodId, currentTime }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const url = new URL(buildVodPath(vodId, currentTime), window.location.origin);

    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [vodId, currentTime]);

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all active:scale-[0.97] ${
        copied
          ? "bg-success/8 text-success"
          : "bg-white/[0.03] text-text-tertiary hover:bg-white/[0.05] hover:text-text-secondary"
      }`}
    >
      {copied ? (
        <IconCheck size={12} stroke={2.2} />
      ) : (
        <IconShare3 size={12} stroke={2} />
      )}
      {copied ? "Copied" : "Share"}
    </button>
  );
}
