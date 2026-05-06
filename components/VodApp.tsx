"use client";

import {
  FormEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  IconArrowRight,
  IconBroadcast,
  IconClock,
  IconEye,
  IconMaximize,
  IconMessageCircle,
  IconMinimize,
  IconRefresh,
  IconSearch,
  IconVideo,
} from "@tabler/icons-react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { History, addToHistory } from "@/components/History";
import { Player } from "@/components/Player";
import { Switch } from "@/components/ui/switch";
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
  channelDisplayName?: string;
  channelProfileImageURL?: string;
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
type ChatMode = "fast" | "slow";

interface ChatMessage {
  id: string;
  user: string;
  color: string;
  text: string;
}

const CHAT_MODE_CONFIG: Record<
  ChatMode,
  { label: string; intervalMs: number; batchSize: number; maxMessages: number }
> = {
  fast: { label: "Fast", intervalMs: 100, batchSize: 12, maxMessages: 50 },
  slow: { label: "Slow", intervalMs: 750, batchSize: 3, maxMessages: 30 },
};
const CHAT_MAX_TEXT_LENGTH = 360;
const CHAT_MAX_USER_LENGTH = 32;

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

function Navbar({
  onSearch,
  searching,
}: {
  onSearch: (value: string) => void;
  searching: boolean;
}) {
  return (
    <nav className="relative z-20 grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-8">
      <a href="/" className="flex items-center gap-2 justify-self-start">
        <LogoMark size={18} className="text-text-secondary" />
        <span className="hidden text-[13px] font-semibold tracking-tight text-text-secondary sm:inline">
          Phantom
        </span>
      </a>
      <div className="min-w-0 justify-self-center w-full max-w-[41rem]">
        <SearchBox onSubmit={onSearch} searching={searching} compact />
      </div>
      <div aria-hidden="true" className="invisible flex items-center gap-2 justify-self-end">
        <LogoMark size={18} />
        <span className="hidden text-[13px] font-semibold sm:inline">Phantom</span>
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
      <Navbar onSearch={handleSearch} searching={searching} />

      {state === "home" && (
        <HomeView
          onSubmit={navigateFromInput}
          searchResults={searchResults}
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
          onTimeUpdate={onVodTimeUpdate}
        />
      )}

      {state === "channel" && channelData && (
        <ChannelView
          channel={channelData}
          masterUrl={masterUrl}
          onVideo={(vodId) => router.push(buildVodPath(vodId))}
        />
      )}
    </main>
  );
}

function HomeView({
  onSubmit,
  searchResults,
  searchError,
}: {
  onSubmit: (value: string) => void;
  searchResults: SearchResult[];
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
          {searchError && (
            <p className="mt-8 text-center text-sm text-error">{searchError}</p>
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
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5 font-sans animate-fade-in"
      >
        <IconSearch className="shrink-0 text-text-tertiary" size={15} />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Search Twitch channel or VOD"
          placeholder="Search channel, paste VOD URL, or video ID..."
          disabled={searching}
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] font-medium tracking-normal text-text outline-none placeholder:font-normal placeholder:text-text-tertiary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!value.trim() || searching}
          className="flex h-7 shrink-0 items-center justify-center rounded-lg bg-phantom px-3 text-[12px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-95 disabled:opacity-30"
        >
          Go
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
  onTimeUpdate,
}: {
  vodData: VodData;
  masterUrl: string;
  startTime: number;
  playerTime: number;
  onTimeUpdate: (time: number) => void;
}) {
  return (
    <div className="relative mx-auto w-full max-w-6xl px-3 pb-8 sm:px-6 lg:max-w-[78vw] lg:px-8">
      <div className="flex min-h-[calc(100vh-4rem)] items-center">
        <div className="w-full">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <VodInfo
              channel={vodData.channel}
              channelDisplayName={vodData.channelDisplayName}
              channelProfileImageURL={vodData.channelProfileImageURL}
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
        </div>
      </div>
      <Footer />
    </div>
  );
}

function ChannelView({
  channel,
  masterUrl,
  onVideo,
}: {
  channel: ChannelData;
  masterUrl: string;
  onVideo: (vodId: string) => void;
}) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatClosing, setChatClosing] = useState(false);
  const stream = channel.stream;
  const liveArchive = stream
    ? channel.videos.find((video) => isLikelyLiveArchive(video, stream)) ??
      channel.videos.find((video) => video.broadcastType.toLowerCase() === "archive")
    : null;

  const setChatExpandedSmooth = useCallback((nextExpanded: boolean) => {
    if (nextExpanded) {
      setChatClosing(false);
      setChatExpanded(true);
      return;
    }

    setChatClosing(true);
    window.setTimeout(() => {
      setChatExpanded(false);
      setChatClosing(false);
    }, 180);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-7xl px-3 pb-8 sm:px-6 lg:px-8">
      <div className={chatExpanded ? "block" : "flex min-h-[calc(100vh-4rem)] items-center py-6"}>
        <section className={chatExpanded ? "block" : "mx-auto w-full max-w-6xl"}>
          {!chatExpanded && (
            <>
              {channel.stream && masterUrl ? (
                <Player src={masterUrl} qualities={[]} isLive />
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

              <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <ChannelHeader channel={channel} />
                    {channel.stream && <LivePill />}
                  </div>
                  {channel.stream && (
                    <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-text">
                      {channel.stream.title}
                    </p>
                  )}
                </div>
                {liveArchive && (
                  <button
                    type="button"
                    onClick={() => onVideo(liveArchive.id)}
                    className="shrink-0 rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-white/[0.09] hover:text-text"
                  >
                    Open archive
                  </button>
                )}
              </div>

              <div className="mt-4">
                <LiveChat
                  channelLogin={channel.login}
                  expanded={chatExpanded}
                  onExpandedChange={setChatExpandedSmooth}
                />
              </div>
            </>
          )}

          {chatExpanded && (
            <div
              className={`fixed inset-0 z-50 h-screen w-screen bg-bg/95 p-3 sm:p-6 ${
                chatClosing ? "animate-chat-collapse" : "animate-chat-expand"
              }`}
            >
              <LiveChat
                channelLogin={channel.login}
                expanded={chatExpanded}
                onExpandedChange={setChatExpandedSmooth}
              />
            </div>
          )}
        </section>
      </div>

      {!chatExpanded && <section className="mt-8">
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
      </section>}

      <Footer />
    </div>
  );
}

function LiveChat({
  channelLogin,
  expanded,
  onExpandedChange,
}: {
  channelLogin: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [chatMode, setChatMode] = useState<ChatMode>("fast");
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const chatModeRef = useRef<ChatMode>("fast");
  const pendingRef = useRef<ChatMessage[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  const isPinnedToBottom = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return true;

    const distanceFromBottom =
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    return distanceFromBottom < 48;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const scrollElement = scrollRef.current;
      if (!scrollElement) return;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    });
  }, []);

  const flushMessages = useCallback(() => {
    const config = CHAT_MODE_CONFIG[chatModeRef.current];
    const shouldPin = pinnedRef.current || isPinnedToBottom();
    timeoutRef.current = null;
    const next = pendingRef.current.splice(0, config.batchSize);
    if (next.length === 0) return;

    setMessages((current) => [...current, ...next].slice(-config.maxMessages));
    if (shouldPin) scrollToBottom();

    if (pendingRef.current.length > 0) {
      timeoutRef.current = window.setTimeout(flushMessages, config.intervalMs);
    }
  }, [isPinnedToBottom, scrollToBottom]);

  const enqueueMessages = useCallback(
    (nextMessages: ChatMessage[]) => {
      const config = CHAT_MODE_CONFIG[chatModeRef.current];
      pendingRef.current = [...pendingRef.current, ...nextMessages].slice(-config.maxMessages);
      if (timeoutRef.current === null) {
        timeoutRef.current = window.setTimeout(flushMessages, config.intervalMs);
      }
    },
    [flushMessages]
  );

  const clearPendingMessages = useCallback(() => {
    pendingRef.current = [];
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const normalizedChannel = normalizeChannelLogin(channelLogin);
    if (!normalizedChannel) {
      setStatus("Unavailable");
      return;
    }

    if (document.hidden) {
      setStatus("Paused");
      return;
    }

    socketRef.current?.close();
    clearPendingMessages();

    setMessages([]);
    setStatus("Connecting");

    const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    socketRef.current = socket;

    socket.onopen = () => {
      const nick = `justinfan${Math.floor(100000 + Math.random() * 900000)}`;
      socket.send("CAP REQ :twitch.tv/tags");
      socket.send("PASS SCHMOOPIIE");
      socket.send(`NICK ${nick}`);
      socket.send(`JOIN #${normalizedChannel}`);
      setStatus("Live");
    };

    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      if (raw.startsWith("PING")) {
        socket.send("PONG :tmi.twitch.tv");
        return;
      }

      const nextMessages = raw
        .split("\r\n")
        .map(parseChatLine)
        .filter((message): message is ChatMessage => Boolean(message));

      if (nextMessages.length === 0) return;
      enqueueMessages(nextMessages);
    };

    socket.onerror = () => setStatus("Disconnected");
    socket.onclose = () => {
      if (socketRef.current === socket) setStatus("Disconnected");
    };
  }, [channelLogin, clearPendingMessages, enqueueMessages]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
      clearPendingMessages();
    };
  }, [clearPendingMessages, connect]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const socket = socketRef.current;
        socketRef.current = null;
        socket?.close();
        clearPendingMessages();
        setStatus("Paused");
        return;
      }

      connect();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [clearPendingMessages, connect]);

  const updatePinnedState = useCallback(() => {
    pinnedRef.current = isPinnedToBottom();
  }, [isPinnedToBottom]);

  const toggleChatMode = useCallback(() => {
    setChatMode((current) => {
      const next = current === "fast" ? "slow" : "fast";
      const config = CHAT_MODE_CONFIG[next];
      chatModeRef.current = next;
      pendingRef.current = pendingRef.current.slice(-config.maxMessages);

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(flushMessages, config.intervalMs);
      }

      return next;
    });
  }, [flushMessages]);

  const toggleExpanded = useCallback(() => {
    onExpandedChange(!expanded);
    scrollToBottom();
  }, [expanded, onExpandedChange, scrollToBottom]);

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden bg-black/25 [contain:size_layout_paint] ${
        expanded
          ? "h-full rounded-2xl border border-white/[0.08] bg-black/35 shadow-2xl"
          : "h-[260px] rounded-2xl sm:h-[300px]"
      }`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconMessageCircle size={15} className="shrink-0 text-text-tertiary" />
          <span className="truncate text-xs font-semibold text-text-secondary">
            Live chat
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={chatMode === "fast"}
            onCheckedChange={toggleChatMode}
            aria-label={`${CHAT_MODE_CONFIG[chatMode].label} chat mode`}
            title={`${CHAT_MODE_CONFIG[chatMode].label} chat mode`}
          />
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? "Exit fullscreen chat" : "Expand chat"}
            title={expanded ? "Exit fullscreen chat" : "Expand chat"}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-white/[0.07] hover:text-text-secondary"
          >
            {expanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
          </button>
          <button
            type="button"
            onClick={connect}
            aria-label="Reconnect chat"
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-white/[0.07] hover:text-text-secondary"
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updatePinnedState}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-xs text-text-tertiary">
            {status === "Live" ? "Waiting for messages" : status}
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <ChatMessageRow key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ChatMessageRow = memo(function ChatMessageRow({
  message,
}: {
  message: ChatMessage;
}) {
  return (
    <p className="break-words text-xs leading-5 text-text-secondary">
      <span className="font-bold" style={{ color: message.color }}>
        {message.user}
      </span>
      <span className="text-text-tertiary">: </span>
      {message.text}
    </p>
  );
});

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

function parseChatLine(line: string): ChatMessage | null {
  const privmsgIndex = line.indexOf(" PRIVMSG ");
  if (privmsgIndex === -1) return null;

  const messageStart = line.indexOf(" :", privmsgIndex);
  if (messageStart === -1) return null;

  const tags = line.startsWith("@") ? parseIrcTags(line.slice(1, line.indexOf(" "))) : {};
  const prefixStart = line.startsWith("@") ? line.indexOf(" :") + 2 : 1;
  const prefixEnd = line.indexOf("!", prefixStart);
  const prefixUser =
    prefixStart > 0 && prefixEnd > prefixStart ? line.slice(prefixStart, prefixEnd) : "";
  const user = sanitizeChatUser(tags["display-name"] || prefixUser || "viewer");
  const text = sanitizeChatText(line.slice(messageStart + 2));

  if (!text) return null;

  return {
    id: sanitizeChatId(tags.id) || `${Date.now()}-${Math.random()}`,
    user,
    color: sanitizeChatColor(tags.color) || chatColor(user),
    text,
  };
}

function parseIrcTags(value: string) {
  const tags: Record<string, string> = {};

  for (const pair of value.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    tags[pair.slice(0, separator)] = decodeIrcTag(pair.slice(separator + 1));
  }

  return tags;
}

function decodeIrcTag(value: string) {
  return value
    .replaceAll("\\s", " ")
    .replaceAll("\\:", ";")
    .replaceAll("\\r", "\r")
    .replaceAll("\\n", "\n")
    .replaceAll("\\\\", "\\");
}

function normalizeChannelLogin(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_]{3,25}$/.test(normalized) ? normalized : "";
}

function sanitizeChatUser(value: string) {
  const cleaned = value
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, CHAT_MAX_USER_LENGTH);

  return cleaned || "viewer";
}

function sanitizeChatText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, CHAT_MAX_TEXT_LENGTH);
}

function sanitizeChatId(value?: string) {
  if (!value) return "";
  return /^[a-zA-Z0-9-]{1,64}$/.test(value) ? value : "";
}

function sanitizeChatColor(value?: string) {
  if (!value) return "";
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "";
}

function chatColor(value: string) {
  const colors = ["#95a7c3", "#70e0a3", "#e0c070", "#e87070", "#b79cff", "#70c7e0"];
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index)) % colors.length;
  }

  return colors[hash];
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
