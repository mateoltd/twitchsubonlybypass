import { IconBroadcast, IconFlame, IconUpload } from "@tabler/icons-react";

interface VodInfoProps {
  channel: string;
  broadcastType: string;
  title?: string;
}

export function VodInfo({ channel, broadcastType, title }: VodInfoProps) {
  const typeLabel =
    broadcastType === "highlight"
      ? "Highlight"
      : broadcastType === "upload"
        ? "Upload"
        : "Archive";

  const Icon =
    broadcastType === "highlight"
      ? IconFlame
      : broadcastType === "upload"
        ? IconUpload
        : IconBroadcast;

  return (
    <div className="flex items-center gap-2.5 animate-fade-in">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-phantom/10 text-[12px] font-semibold text-phantom uppercase">
        {channel.charAt(0)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold tracking-tight text-text">
          {title || channel}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <Icon size={11} stroke={2} />
          {channel} · {typeLabel}
        </div>
      </div>
    </div>
  );
}
