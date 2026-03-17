"use client";

import { IconArrowRight } from "@tabler/icons-react";
import { useLocalStorage } from "@/lib/hooks";

export interface HistoryEntry {
  vodId: string;
  channel: string;
  broadcastType: string;
  timestamp: number;
}

interface HistoryProps {
  onSelect: (vodId: string) => void;
}

function formatType(type: string) {
  if (type === "highlight") return "Highlight";
  if (type === "upload") return "Upload";
  return "Archive";
}

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function History({ onSelect }: HistoryProps) {
  const [history] = useLocalStorage<HistoryEntry[]>("phantom-history", []);

  if (history.length === 0) return null;

  return (
    <section className="mx-auto mt-16 w-full max-w-lg sm:mt-20">
      <div className="mb-2 px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary/60">
          Recent
        </span>
      </div>

      <div className="space-y-px">
        {history.slice(0, 5).map((entry, i) => (
          <button
            key={entry.vodId}
            onClick={() => onSelect(entry.vodId)}
            className="stagger-child group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
            style={{ animationDelay: `${0.03 * i}s` }}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-[11px] font-semibold uppercase text-text-tertiary">
              {entry.channel.charAt(0)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-text-secondary">
                {entry.channel}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary/60">
                <span>{formatType(entry.broadcastType)}</span>
                <span>&middot;</span>
                <span className="font-mono">{entry.vodId}</span>
                <span>&middot;</span>
                <span>{timeAgo(entry.timestamp)}</span>
              </div>
            </div>

            <IconArrowRight
              size={12}
              stroke={2.5}
              className="shrink-0 text-text-tertiary/30 transition-colors group-hover:text-text-secondary"
            />
          </button>
        ))}
      </div>
    </section>
  );
}

export function addToHistory(entry: Omit<HistoryEntry, "timestamp">) {
  try {
    const stored = localStorage.getItem("phantom-history");
    const history: HistoryEntry[] = stored ? JSON.parse(stored) : [];
    const filtered = history.filter((h) => h.vodId !== entry.vodId);
    filtered.unshift({ ...entry, timestamp: Date.now() });
    localStorage.setItem(
      "phantom-history",
      JSON.stringify(filtered.slice(0, 20))
    );
  } catch {}
}
