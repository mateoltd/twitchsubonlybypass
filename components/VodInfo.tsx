import Link from "next/link";
import { IconBroadcast, IconFlame, IconUpload } from "@tabler/icons-react";
import { buildChannelPath } from "@/lib/validation";

interface VodInfoProps {
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  broadcastType: string;
  title?: string;
}

export function VodInfo({
  channel,
  channelDisplayName,
  channelProfileImageURL,
  broadcastType,
  title,
}: VodInfoProps) {
  const typeLabel =
    broadcastType === "highlight"
      ? "Highlight"
      : broadcastType === "upload"
        ? "Upload"
        : "Archive";
  const channelHref = buildChannelPath(channel);
  const label = channelDisplayName || channel;

  const Icon =
    broadcastType === "highlight"
      ? IconFlame
      : broadcastType === "upload"
        ? IconUpload
        : IconBroadcast;

  return (
    <div className="flex items-center gap-2.5 animate-fade-in">
      <Link
        href={channelHref}
        aria-label={`Open ${label} channel`}
        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-phantom/10 text-[12px] font-semibold text-phantom uppercase"
      >
        {channelProfileImageURL ? (
          // Twitch image URLs are already sized by the GraphQL request.
          <img
            src={channelProfileImageURL}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          channel.charAt(0)
        )}
      </Link>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold tracking-tight text-text">
          {title || channel}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <Icon size={11} stroke={2} />
          <Link
            href={channelHref}
            className="truncate transition-colors hover:text-text-secondary"
          >
            {label}
          </Link>
          <span aria-hidden="true">·</span>
          <span>{typeLabel}</span>
        </div>
      </div>
    </div>
  );
}
