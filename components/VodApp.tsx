"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { History, addToHistory } from "@/components/History";
import { Player } from "@/components/Player";
import { ShareButton } from "@/components/ShareButton";
import { VodInfo } from "@/components/VodInfo";
import { VodInput } from "@/components/VodInput";
import { LogoMark } from "@/components/Logo";
import { buildVodPath, extractVodId, parseStartTime } from "@/lib/validation";

interface Quality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
  playlistUrl: string;
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

export function VodApp() {
  const params = useParams<{ videoId?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const routeVodId = params.videoId ?? searchParams.get("v") ?? "";
  const routeStartTime = useMemo(
    () => parseStartTime(searchParams.get("t")),
    [searchParams]
  );

  const [state, setState] = useState<AppState>(routeVodId ? "loading" : "empty");
  const [vodData, setVodData] = useState<VodData | null>(null);
  const [error, setError] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [startTime, setStartTime] = useState(routeStartTime);
  const [playerTime, setPlayerTime] = useState(0);

  const loadVod = useCallback(async (vodId: string, nextStartTime: number) => {
    setState("loading");
    setError("");
    setStartTime(nextStartTime);

    try {
      const resp = await fetch(
        `/api/vod/resolve?vodId=${encodeURIComponent(vodId)}`
      );

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || `Error: ${resp.status}`);
      }

      const data: VodData = await resp.json();
      setVodData(data);
      setMasterUrl(`/api/vod/master.m3u8?vodId=${data.vodId}`);
      setPlayerTime(nextStartTime);
      setState("playing");

      addToHistory({
        vodId: data.vodId,
        channel: data.channel,
        broadcastType: data.broadcastType,
      });
    } catch (err) {
      setVodData(null);
      setMasterUrl("");
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!routeVodId) {
      setVodData(null);
      setMasterUrl("");
      setPlayerTime(0);
      setStartTime(0);
      setError("");
      setState("empty");
      return;
    }

    void loadVod(routeVodId, routeStartTime);
  }, [loadVod, routeStartTime, routeVodId]);

  const navigateToVod = useCallback(
    (input: string) => {
      const vodId = extractVodId(input);

      if (!vodId) {
        setVodData(null);
        setMasterUrl("");
        setError("Invalid VOD URL or ID");
        setState("error");
        return;
      }

      setError("");
      setState("loading");
      router.push(buildVodPath(vodId));
    },
    [router]
  );

  const isHero = state === "empty" || state === "loading" || state === "error";

  return (
    <main className="relative min-h-screen">
      {isHero && (
        <div className="flex min-h-screen flex-col animate-fade-in">
          <Navbar />

          <div className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 lg:px-8">
            <h1 className="sr-only">Phantom Twitch - Watch Sub-Only Twitch VODs</h1>
            <VodInput
              onSubmit={navigateToVod}
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
              <ErrorDisplay message={error} onRetry={() => router.push("/")} />
            )}

            {state === "empty" && <History onSelect={navigateToVod} />}
          </div>

          <footer className="px-5 pb-4 text-center sm:px-8">
            <p className="text-[11px] text-text-tertiary/40">
              Not affiliated with Twitch. For educational purposes only.
            </p>
          </footer>
        </div>
      )}

      {state === "playing" && vodData && (
        <div className="min-h-screen animate-fade-in">
          <Navbar />

          <div className="mx-auto max-w-5xl px-2 sm:px-6 lg:max-w-[70vw] lg:px-8">
            <div className="mb-5 px-1 sm:px-0 animate-slide-up">
              <VodInput onSubmit={navigateToVod} disabled={false} compact={true} />
            </div>

            <div
              className="mb-3 flex items-center justify-between gap-3 px-1 sm:px-0 stagger-child"
              style={{ animationDelay: "0.05s" }}
            >
              <VodInfo
                channel={vodData.channel}
                broadcastType={vodData.broadcastType}
              />
              <ShareButton vodId={vodData.vodId} currentTime={playerTime} />
            </div>

            <div className="stagger-child" style={{ animationDelay: "0.1s" }}>
              <Player
                src={masterUrl}
                qualities={vodData.qualities}
                startTime={startTime}
                onTimeUpdate={setPlayerTime}
              />
              <p className="mt-2 text-center text-[11px] text-text-tertiary/50 sm:hidden">
                Use fullscreen for the best viewing experience
              </p>
            </div>

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
