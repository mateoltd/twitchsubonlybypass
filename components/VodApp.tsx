"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  IconArrowRight,
  IconBroadcast,
  IconClock,
  IconEye,
  IconSearch,
  IconVideo,
} from "@tabler/icons-react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { History, addToHistory } from "@/components/History";
import { Player } from "@/components/Player";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareButton } from "@/components/ShareButton";
import { VodInfo } from "@/components/VodInfo";
import { LogoMark } from "@/components/Logo";
import { formatTime } from "@/lib/format";
import {
  buildChannelPath,
  buildVodPath,
  extractChannelName,
  extractVodId,
  parseStartTime,
} from "@/lib/validation";

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
  title?: string;
  isLiveArchive?: boolean;
  broadcastType: string;
  qualities: Quality[];
}

interface ChannelVideo {
  id: string;
  title: string;
  createdAt: string;
  lengthSeconds: number;
  viewCount: number;
  broadcastType: string;
  previewThumbnailURL: string;
}

interface LiveStream {
  id: string;
  title: string;
  type: string;
  viewersCount: number;
  createdAt: string;
  game?: { name: string } | null;
}

interface ChannelData {
  id: string;
  login: string;
  displayName: string;
  description: string;
  profileImageURL: string;
  stream: LiveStream | null;
  videos: ChannelVideo[];
}

interface SearchResult {
  id: string;
  login: string;
  displayName: string;
  description: string;
  profileImageURL: string;
  isLive: boolean;
  title?: string;
  gameName?: string;
  viewersCount?: number;
}

type AppState = "home" | "loading" | "video" | "channel" | "error";

function playbackKey(vodId: string) {
  return `phantom-playback:${vodId}`;
}

function readStoredPlayback(vodId: string) {
  try {
    const value = localStorage.getItem(playbackKey(vodId));
    if (!value) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

function storePlayback(vodId: string, time: number) {
  if (!Number.isFinite(time) || time < 5) return;
  try {
    localStorage.setItem(playbackKey(vodId), Math.floor(time).toString());
  } catch {}
}

function Navbar() {
  return (
    <nav className="relative z-20 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
      <a href="/" className="flex items-center gap-2">
        <LogoMark size={18} className="text-text-secondary" />
        <span className="text-[13px] font-semibold tracking-tight text-text-secondary">
          Phantom
        </span>
      </a>
      <div className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1 text-[11px] font-medium text-text-tertiary sm:flex">
        <a href="/" className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/[0.06] hover:text-text-secondary">
          Search
        </a>
      </div>
    </nav>
  );
}

export function VodApp() {
  const params = useParams<{ videoId?: string; channelName?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const routeVodId = params.videoId ?? searchParams.get("v") ?? "";
  const routeChannel = params.channelName ?? "";
  const routeStartTime = useMemo(
    () => parseStartTime(searchParams.get("t")),
    [searchParams]
  );

  const [state, setState] = useState<AppState>(
    routeVodId || routeChannel ? "loading" : "home"
  );
  const [vodData, setVodData] = useState<VodData | null>(null);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [error, setError] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [startTime, setStartTime] = useState(routeStartTime);
  const [playerTime, setPlayerTime] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const resetPlayback = useCallback(() => {
    setVodData(null);
    setChannelData(null);
    setMasterUrl("");
    setPlayerTime(0);
    setStartTime(0);
  }, []);

  const loadVod = useCallback(async (vodId: string, nextStartTime: number) => {
    setState("loading");
    setError("");
    setChannelData(null);

    const resumeTime = nextStartTime || readStoredPlayback(vodId);
    setStartTime(resumeTime);

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
      setPlayerTime(resumeTime);
      setState("video");

      addToHistory({
        vodId: data.vodId,
        channel: data.channel,
        broadcastType: data.broadcastType,
      });
    } catch (err) {
      resetPlayback();
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, [resetPlayback]);

  const loadChannel = useCallback(async (channel: string) => {
    setState("loading");
    setError("");
    setVodData(null);
    setStartTime(0);
    setPlayerTime(0);

    try {
      const resp = await fetch(
        `/api/channel/resolve?channel=${encodeURIComponent(channel)}`
      );

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || `Error: ${resp.status}`);
      }

      const data: ChannelData = await resp.json();
      setChannelData(data);
      setMasterUrl(
        data.stream
          ? `/api/live/master.m3u8?channel=${encodeURIComponent(data.login)}`
          : ""
      );
      setState("channel");
    } catch (err) {
      resetPlayback();
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, [resetPlayback]);

  useEffect(() => {
    if (routeVodId) {
      void loadVod(routeVodId, routeStartTime);
      return;
    }

    if (routeChannel) {
      void loadChannel(routeChannel);
      return;
    }

    resetPlayback();
    setError("");
    setState("home");
  }, [loadChannel, loadVod, resetPlayback, routeChannel, routeStartTime, routeVodId]);

  const navigateFromInput = useCallback(
    (input: string) => {
      const vodId = extractVodId(input);
      if (vodId) {
        router.push(buildVodPath(vodId));
        return;
      }

      const channel = extractChannelName(input);
      if (channel) {
        router.push(buildChannelPath(channel));
        return;
      }

      setError("Enter a Twitch channel, VOD ID, or Twitch URL");
      setState("error");
    },
    [router]
  );

  const handleSearch = useCallback(async (query: string) => {
    const vodId = extractVodId(query);
    if (vodId) {
      router.push(buildVodPath(vodId));
      return;
    }

    setSearching(true);
    setSearchError("");

    try {
      const resp = await fetch(`/api/channel/search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || `Search failed: ${resp.status}`);
      }

      const data: { results: SearchResult[] } = await resp.json();
      setSearchResults(data.results);

      const exact = data.results.find(
        (result) => result.login.toLowerCase() === query.toLowerCase()
      );
      if (exact) {
        router.push(buildChannelPath(exact.login));
      }
    } catch (err) {
      const channel = extractChannelName(query);
      if (channel) {
        router.push(buildChannelPath(channel));
        return;
      }
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [router]);

  const onVodTimeUpdate = useCallback(
    (time: number) => {
      setPlayerTime(time);
      if (vodData?.vodId) {
        storePlayback(vodData.vodId, time);
      }
    },
    [vodData?.vodId]
  );

  return (
    <main className="relative min-h-screen">
      <Navbar />

      {state === "home" && (
        <HomeView
          onSubmit={navigateFromInput}
          onSearch={handleSearch}
          searchResults={searchResults}
          searching={searching}
          searchError={searchError}
        />
      )}

      {state === "loading" && <LoadingView />}

      {state === "error" && (
        <div className="relative mx-auto w-full max-w-3xl px-4 pt-20">
          <ErrorDisplay message={error} onRetry={() => router.push("/")} />
        </div>
      )}

      {state === "video" && vodData && (
        <VideoView
          vodData={vodData}
          masterUrl={masterUrl}
          startTime={startTime}
          playerTime={playerTime}
          onInput={navigateFromInput}
          onTimeUpdate={onVodTimeUpdate}
        />
      )}

      {state === "channel" && channelData && (
        <ChannelView
          channel={channelData}
          masterUrl={masterUrl}
          onVideo={(vodId) => router.push(buildVodPath(vodId))}
          onInput={navigateFromInput}
        />
      )}
    </main>
  );
}

function HomeView({
  onSubmit,
  onSearch,
  searchResults,
  searching,
  searchError,
}: {
  onSubmit: (value: string) => void;
  onSearch: (value: string) => void;
  searchResults: SearchResult[];
  searching: boolean;
  searchError: string;
}) {
  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-5xl flex-col px-4 pb-6 sm:px-6 lg:px-8">
      <section className="flex flex-1 flex-col items-center pt-16 sm:pt-24">
        <div className="w-full animate-fade-in">
          <div className="flex flex-col items-center">
            <h1 className="text-center text-[2.5rem] font-bold leading-[1] tracking-[-0.035em] text-text sm:text-5xl lg:text-[4.5rem]">
              Watch Twitch
            </h1>
            <h2 className="mt-1 text-center text-[2.5rem] font-bold leading-[1] tracking-[-0.035em] text-text-tertiary sm:text-5xl lg:text-[4.5rem]">
              Live & VODs
            </h2>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-[14px] leading-6 text-text-tertiary sm:text-[15px]">
            Search for a channel, paste a VOD URL, or enter a video ID to start watching.
          </p>
          <div className="mx-auto w-full max-w-2xl">
            <SearchBox onSubmit={onSearch} searching={searching} />
          </div>
          {searchError && (
            <p className="mt-3 text-center text-sm text-error">{searchError}</p>
          )}
        </div>

        <div className="mx-auto mt-12 w-full max-w-2xl animate-fade-in sm:mt-14">
          <div className="mb-2 px-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary/60">
              Search results
            </span>
          </div>
          {searchResults.length > 0 ? (
            <div className="space-y-px">
              {searchResults.slice(0, 8).map((result, index) => (
                <a
                  key={result.id}
                  href={buildChannelPath(result.login)}
                  className="stagger-child group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
                  style={{ animationDelay: `${0.03 * index}s` }}
                >
                  <img
                    src={result.profileImageURL}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-text-secondary">
                        {result.displayName}
                      </span>
                      {result.isLive && <LivePill compact />}
                    </div>
                    <p className="truncate text-[10px] text-text-tertiary/60">
                      {result.title || result.description || `@${result.login}`}
                    </p>
                  </div>
                  <IconArrowRight
                    size={12}
                    stroke={2.5}
                    className="shrink-0 text-text-tertiary/30 transition-colors group-hover:text-text-secondary"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-6 text-center">
              <IconSearch className="mx-auto mb-2 text-text-tertiary/50" size={20} />
              <p className="text-[12px] text-text-tertiary/60">
                Results will appear here after searching.
              </p>
            </div>
          )}
        </div>

        <div className="w-full">
          <History onSelect={onSubmit} />
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SearchBox({
  onSubmit,
  searching,
  compact = false,
}: {
  onSubmit: (value: string) => void;
  searching: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  if (compact) {
    return (
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-1.5 animate-fade-in"
      >
        <IconSearch className="ml-3 shrink-0 text-text-tertiary" size={18} />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search channel, paste VOD URL, or video ID..."
          className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-text outline-none placeholder:text-text-tertiary"
        />

        <button
          type="submit"
          disabled={!value.trim() || searching}
          className="rounded-2xl bg-text px-4 py-3 text-sm font-bold text-bg transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {searching ? "Searching" : "Go"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-10 max-w-2xl sm:mt-12">
      <div className="group flex items-center border-b border-white/[0.08] pb-5 transition-colors focus-within:border-white/20 sm:pb-6">
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search channel, paste VOD URL, or video ID..."
            autoFocus
            className="w-full bg-transparent py-1 text-2xl font-medium tracking-tight text-text placeholder:text-text-tertiary/90 outline-none sm:text-4xl"
          />
        </div>

        <button
          type="submit"
          disabled={!value.trim() || searching}
          className="ml-3 flex h-10 shrink-0 items-center justify-center rounded-full bg-phantom px-5 text-[13px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-95 disabled:opacity-20 sm:h-12 sm:px-6"
        >
          {searching ? "Searching" : "Go"}
        </button>
      </div>
      <p className="mt-3 text-center text-[12px] text-text-tertiary/50">
        Search channel, paste a Twitch VOD link, or enter a video ID
      </p>
    </form>
  );
}
function LoadingView() {
  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-72px)] max-w-sm flex-col items-center justify-center px-4">
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full w-1/4 rounded-full bg-text"
          style={{ animation: "progress-slide 1.2s ease-in-out infinite" }}
        />
      </div>
      <p className="mt-4 text-sm text-text-tertiary">Loading Twitch source...</p>
    </div>
  );
}

function VideoView({
  vodData,
  masterUrl,
  startTime,
  playerTime,
  onInput,
  onTimeUpdate,
}: {
  vodData: VodData;
  masterUrl: string;
  startTime: number;
  playerTime: number;
  onInput: (value: string) => void;
  onTimeUpdate: (time: number) => void;
}) {
  return (
    <div className="relative mx-auto max-w-6xl px-3 pb-8 sm:px-6 lg:max-w-[78vw] lg:px-8">
      <div className="mb-5 animate-slide-up">
        <SearchBox onSubmit={onInput} searching={false} compact />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <VodInfo
          channel={vodData.channel}
          broadcastType={vodData.broadcastType}
          title={vodData.title}
        />
        <div className="flex items-center gap-2">
          <DownloadButton
            qualities={vodData.qualities}
            channel={vodData.channel}
            vodId={vodData.vodId}
          />
          <ShareButton vodId={vodData.vodId} currentTime={playerTime} />
        </div>
      </div>

      <Player
        src={masterUrl}
        qualities={vodData.qualities}
        startTime={startTime}
        isLive={Boolean(vodData.isLiveArchive)}
        dvrMode={Boolean(vodData.isLiveArchive)}
        onTimeUpdate={onTimeUpdate}
      />
      <Footer />
    </div>
  );
}

function ChannelView({
  channel,
  masterUrl,
  onVideo,
  onInput,
}: {
  channel: ChannelData;
  masterUrl: string;
  onVideo: (vodId: string) => void;
  onInput: (value: string) => void;
}) {
  const stream = channel.stream;
  const liveArchive = stream
    ? channel.videos.find((video) => isLikelyLiveArchive(video, stream)) ??
      channel.videos.find((video) => video.broadcastType.toLowerCase() === "archive")
    : null;

  return (
    <div className="relative mx-auto max-w-7xl px-3 pb-8 sm:px-6 lg:px-8">
      <div className="mb-5 animate-slide-up">
        <SearchBox onSubmit={onInput} searching={false} compact />
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {channel.stream && masterUrl ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <ChannelHeader channel={channel} />
                <LivePill />
              </div>
              <Player src={masterUrl} qualities={[]} isLive />
            </>
          ) : (
            <div className="flex aspect-video min-h-[340px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-white/[0.08] bg-white/[0.035] p-8 text-center">
              <IconBroadcast size={34} className="mb-3 text-text-tertiary" />
              <h2 className="text-2xl font-black tracking-tight text-text">
                {channel.displayName} is offline
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                Recent VODs are still available below, including archives that are still being generated.
              </p>
            </div>
          )}
        </div>

        <aside className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl">
          <ChannelHeader channel={channel} compact />
          {channel.stream && (
            <div className="mt-4 rounded-2xl bg-black/25 p-3">
              <p className="line-clamp-2 text-sm font-semibold text-text">
                {channel.stream.title}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                <span>{channel.stream.game?.name || "Live"}</span>
                <span>{channel.stream.viewersCount.toLocaleString()} viewers</span>
              </div>
              {liveArchive && (
                <button
                  type="button"
                  onClick={() => onVideo(liveArchive.id)}
                  className="mt-3 w-full rounded-xl bg-white/[0.06] px-3 py-2 text-left text-xs font-semibold text-text-secondary transition-colors hover:bg-white/[0.09] hover:text-text"
                >
                  Open live archive for deeper rewind
                </button>
              )}
            </div>
          )}
        </aside>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
              Recent videos
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-text">
              VODs from {channel.displayName}
            </h2>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {channel.videos.map((video) => (
            <button
              key={video.id}
              onClick={() => onVideo(video.id)}
              className="group overflow-hidden rounded-[1.2rem] border border-white/[0.07] bg-white/[0.035] text-left transition-all hover:-translate-y-1 hover:bg-white/[0.07]"
            >
              <div className="relative aspect-video bg-black/40">
                {video.previewThumbnailURL && (
                  <img
                    src={video.previewThumbnailURL}
                    alt=""
                    className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-1 font-mono text-[11px] text-white">
                  {formatTime(video.lengthSeconds)}
                </span>
              </div>
              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-text">
                  {video.title || `Video ${video.id}`}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                  <span className="inline-flex items-center gap-1">
                    <IconVideo size={13} /> {formatBroadcastType(video.broadcastType)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <IconEye size={13} /> {video.viewCount.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <IconClock size={13} /> {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function ChannelHeader({
  channel,
  compact = false,
}: {
  channel: ChannelData;
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${compact ? "" : "animate-fade-in"}`}>
      <img
        src={channel.profileImageURL}
        alt=""
        className={compact ? "h-12 w-12 rounded-2xl" : "h-14 w-14 rounded-2xl"}
      />
      <div className="min-w-0">
        <h1 className={compact ? "truncate text-lg font-black text-text" : "truncate text-2xl font-black tracking-tight text-text"}>
          {channel.displayName}
        </h1>
        <p className="truncate text-sm text-text-tertiary">@{channel.login}</p>
      </div>
    </div>
  );
}

function LivePill({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-red-500/12 font-semibold uppercase tracking-[0.14em] text-red-200 ${
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-3 py-1.5 text-[11px]"
      }`}
    >
      <span className={compact ? "h-1.5 w-1.5 rounded-full bg-red-400" : "h-2 w-2 rounded-full bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.8)]"} />
      Live
    </span>
  );
}

function formatBroadcastType(type: string) {
  if (type.toLowerCase() === "highlight") return "Highlight";
  if (type.toLowerCase() === "upload") return "Upload";
  return "Archive";
}

function isLikelyLiveArchive(video: ChannelVideo, stream: LiveStream) {
  if (video.broadcastType.toLowerCase() !== "archive") return false;

  const videoStart = Date.parse(video.createdAt);
  const streamStart = Date.parse(stream.createdAt);
  if (!Number.isFinite(videoStart) || !Number.isFinite(streamStart)) return false;

  return Math.abs(videoStart - streamStart) < 20 * 60 * 1000;
}

function Footer() {
  return (
    <footer className="mt-8 pb-4 text-center">
      <p className="text-[11px] text-text-tertiary/45">
        Not affiliated with Twitch. For authorized use only.{" "}
        <a href="/disclaimer" className="underline transition-colors hover:text-text-tertiary">
          Legal disclaimer
        </a>
      </p>
    </footer>
  );
}
