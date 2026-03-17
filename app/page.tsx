"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { History, addToHistory } from "@/components/History";
import { Player } from "@/components/Player";
import { ShareButton } from "@/components/ShareButton";
import { VodInfo } from "@/components/VodInfo";
import { VodInput } from "@/components/VodInput";
import { LogoMark } from "@/components/Logo";

interface Quality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
}

interface VodData {
  vodId: string;
  channel: string;
  broadcastType: string;
  qualities: Quality[];
}

type AppState = "empty" | "loading" | "playing" | "error";

function Navbar() {
  return (
    <nav className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
      <a href="/" className="flex items-center gap-2">
        <LogoMark size={18} className="text-text-secondary" />
        <span className="text-[13px] font-semibold tracking-tight text-text-secondary">
          Phantom
        </span>
      </a>
      <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-wider text-text-tertiary/50">
        v1.0
      </span>
    </nav>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>("empty");
  const [vodData, setVodData] = useState<VodData | null>(null);
  const [error, setError] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [startTime, setStartTime] = useState(0);
  const [playerTime, setPlayerTime] = useState(0);
  const resolvedRef = useRef(false);

  const handleResolve = useCallback(
    async (input: string) => {
      setState("loading");
      setError("");

      try {
        const resp = await fetch("/api/vod/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: input }),
        });

        if (!resp.ok) {
          const data = await resp.json();
          throw new Error(data.error || `Error: ${resp.status}`);
        }

        const data: VodData = await resp.json();
        setVodData(data);
        setMasterUrl(`/api/vod/master.m3u8?vodId=${data.vodId}`);
        setState("playing");

        addToHistory({
          vodId: data.vodId,
          channel: data.channel,
          broadcastType: data.broadcastType,
        });

        const url = new URL(window.location.href);
        url.searchParams.set("v", data.vodId);
        if (startTime > 0) url.searchParams.set("t", startTime.toString());
        else url.searchParams.delete("t");
        window.history.replaceState({}, "", url.toString());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setState("error");
      }
    },
    [startTime]
  );

  useEffect(() => {
    if (resolvedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const vodId = params.get("v");
    const t = params.get("t");
    if (vodId) {
      resolvedRef.current = true;
      if (t) setStartTime(Number(t));
      handleResolve(vodId);
    }
  }, [handleResolve]);

  const submitHandler = (value: string) => {
    setStartTime(0);
    handleResolve(value);
  };

  const isHero = state === "empty" || state === "loading" || state === "error";

  return (
    <main className="relative min-h-screen">
      {/* ── Hero states (/, loading, error) ── */}
      {isHero && (
        <div className="flex min-h-screen flex-col animate-fade-in">
          <Navbar />

          <div className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 lg:px-8">
            <h1 className="sr-only">Phantom Twitch - Watch Sub-Only Twitch VODs</h1>
            <VodInput
              onSubmit={submitHandler}
              disabled={state === "loading"}
              compact={false}
            />

            {state === "loading" && (
              <div className="mx-auto mt-10 w-full max-w-sm animate-fade-in">
                <div className="overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-[3px] w-1/5 rounded-full bg-phantom/50"
                    style={{ animation: "progress-slide 1.5s ease-in-out infinite" }}
                  />
                </div>
                <p className="mt-3 text-center text-[12px] text-text-tertiary">
                  Resolving VOD source...
                </p>
              </div>
            )}

            {state === "error" && (
              <ErrorDisplay
                message={error}
                onRetry={() => setState("empty")}
              />
            )}

            {state === "empty" && <History onSelect={handleResolve} />}
          </div>

          <footer className="px-5 pb-4 text-center sm:px-8">
            <p className="text-[11px] text-text-tertiary/40">
              Not affiliated with Twitch. For educational purposes only.
            </p>
          </footer>
        </div>
      )}

      {/* ── Playing state ── */}
      {state === "playing" && vodData && (
        <div className="min-h-screen animate-fade-in">
          <Navbar />

          <div className="mx-auto max-w-5xl px-2 sm:px-6 lg:px-8">
            {/* Compact input bar */}
            <div className="mb-5 px-1 sm:px-0 animate-slide-up">
              <VodInput
                onSubmit={submitHandler}
                disabled={false}
                compact={true}
              />
            </div>

            {/* VOD info + share */}
            <div
              className="mb-3 flex items-center justify-between gap-3 px-1 sm:px-0 stagger-child"
              style={{ animationDelay: "0.05s" }}
            >
              <VodInfo
                channel={vodData.channel}
                broadcastType={vodData.broadcastType}
              />
              <ShareButton
                vodId={vodData.vodId}
                currentTime={playerTime}
              />
            </div>

            {/* Player */}
            <div className="stagger-child" style={{ animationDelay: "0.1s" }}>
              <Player
                src={masterUrl}
                qualities={vodData.qualities}
                startTime={startTime}
                onTimeUpdate={setPlayerTime}
              />
            </div>

            {/* Keyboard shortcuts hint (desktop only) */}
            <div
              className="mt-3 hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-tertiary stagger-child"
              style={{ animationDelay: "0.15s" }}
            >
              <span><Kbd>Space</Kbd> play/pause</span>
              <span><Kbd>&larr;</Kbd><Kbd>&rarr;</Kbd> seek 10s</span>
              <span><Kbd>&uarr;</Kbd><Kbd>&darr;</Kbd> volume</span>
              <span><Kbd>M</Kbd> mute</span>
              <span><Kbd>F</Kbd> fullscreen</span>
            </div>

            <footer className="mt-8 pb-4 text-center">
              <p className="text-[11px] text-text-tertiary/40">
                Not affiliated with Twitch. For educational purposes only.
              </p>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-[1.3em] items-center justify-center rounded border border-white/[0.04] bg-white/[0.02] px-1 py-0.5 font-mono text-[10px] text-text-tertiary">
      {children}
    </kbd>
  );
}
