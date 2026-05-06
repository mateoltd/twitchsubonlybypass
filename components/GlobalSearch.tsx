"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconSearch, IconVideo } from "@tabler/icons-react";
import { LogoMark } from "@/components/Logo";
import {
  buildChannelPath,
  buildVodPath,
  extractChannelName,
  extractVodId,
} from "@/lib/validation";

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

export function GlobalSearch() {
  return (
    <nav className="relative z-20 flex min-h-16 w-full items-center justify-center px-4 py-3 sm:px-8">
      <Link
        href="/"
        className="absolute left-8 hidden items-center gap-2 sm:flex"
        aria-label="Phantom home"
      >
        <LogoMark size={18} className="text-text-secondary" />
        <span className="text-[13px] font-semibold tracking-tight text-text-secondary">
          Phantom
        </span>
      </Link>
      <div className="w-full min-w-0 max-w-[41rem]">
        <SearchBox />
      </div>
    </nav>
  );
}

function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchAbortRef = useRef<AbortController | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const resultCacheRef = useRef(new Map<string, SearchResult[]>());
  const activeQueryRef = useRef("");

  const runLiveSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    const normalizedQuery = trimmed.toLowerCase();

    if (extractVodId(trimmed) || normalizedQuery.length < 2) {
      searchAbortRef.current?.abort();
      activeQueryRef.current = "";
      setSearchResults([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    const channel = extractChannelName(trimmed);
    const searchTerm = channel ?? normalizedQuery;
    if (activeQueryRef.current === searchTerm) return;

    searchAbortRef.current?.abort();

    const cachedResults = resultCacheRef.current.get(searchTerm);
    if (cachedResults) {
      activeQueryRef.current = searchTerm;
      setSearchResults(cachedResults);
      setSearchError("");
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    activeQueryRef.current = searchTerm;
    setSearching(true);
    setSearchError("");

    try {
      const resp = await fetch(
        `/api/channel/search?q=${encodeURIComponent(searchTerm)}`,
        { signal: controller.signal }
      );
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || `Search failed: ${resp.status}`);
      }

      const data: { results: SearchResult[] } = await resp.json();
      resultCacheRef.current.set(searchTerm, data.results);
      setSearchResults(data.results);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      activeQueryRef.current = "";
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      if (searchAbortRef.current === controller) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void runLiveSearch(value);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [runLiveSearch, value]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const closeResultsSoon = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = window.setTimeout(() => {
      blurTimeoutRef.current = null;
      setResultsOpen(false);
    }, 120);
  };

  const openResults = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setResultsOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed) return;

    const vodId = extractVodId(trimmed);
    if (vodId) {
      setResultsOpen(false);
      router.push(buildVodPath(vodId));
      return;
    }

    const channel = extractChannelName(trimmed);
    if (channel) {
      setResultsOpen(false);
      router.push(buildChannelPath(channel));
      return;
    }

    setResultsOpen(true);
    setSearchError("Enter a Twitch channel, VOD ID, or Twitch URL");
  };

  return (
    <div
      className="relative w-full animate-fade-in font-sans"
      onBlur={closeResultsSoon}
    >
      <form
        onSubmit={submit}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5"
      >
        <IconSearch className="shrink-0 text-text-tertiary" size={15} />
        <input
          id="global-search-input"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            openResults();
          }}
          onFocus={openResults}
          aria-label="Search Twitch channel or VOD"
          placeholder="Search channel, paste VOD URL, or video ID..."
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] font-medium tracking-normal text-text outline-none placeholder:font-normal placeholder:text-text-tertiary"
        />
        {searching && (
          <span className="hidden shrink-0 text-[11px] font-medium text-text-tertiary sm:inline">
            Searching
          </span>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          className="flex h-7 shrink-0 items-center justify-center rounded-lg bg-phantom px-3 text-[12px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-95 disabled:opacity-30"
        >
          Go
        </button>
      </form>
      <SearchResultsCascade
        open={resultsOpen && value.trim().length >= 2}
        query={value}
        searching={searching}
        searchResults={searchResults}
        searchError={searchError}
      />
    </div>
  );
}

function SearchResultsCascade({
  open,
  query,
  searching,
  searchResults,
  searchError,
}: {
  open: boolean;
  query: string;
  searching: boolean;
  searchResults: SearchResult[];
  searchError: string;
}) {
  if (!open) return null;

  const vodId = extractVodId(query);
  const visibleResults = searchResults.slice(0, 8);

  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/[0.07] bg-surface/95 shadow-2xl shadow-black/30 backdrop-blur-xl">
      {vodId ? (
        <Link
          href={buildVodPath(vodId)}
          className="group flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-text-tertiary">
            <IconVideo size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-text-secondary">
              Open VOD {vodId}
            </p>
            <p className="truncate text-[10px] text-text-tertiary/60">
              Twitch video ID
            </p>
          </div>
          <IconArrowRight
            size={12}
            stroke={2.5}
            className="shrink-0 text-text-tertiary/30 transition-colors group-hover:text-text-secondary"
          />
        </Link>
      ) : searchError ? (
        <div className="px-3 py-3 text-[12px] text-error">{searchError}</div>
      ) : searchResults.length > 0 ? (
        <div className="max-h-[22rem] overflow-y-auto py-1">
          {visibleResults.map((result, index) => (
            <Link
              key={result.id}
              href={buildChannelPath(result.login)}
              className="stagger-child group flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
              style={{ animationDelay: `${0.025 * index}s` }}
            >
              <img
                src={result.profileImageURL}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-8 w-8 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-text-secondary">
                    {result.displayName}
                  </span>
                  {result.isLive && <SearchLivePill />}
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
            </Link>
          ))}
        </div>
      ) : (
        <div className="px-3 py-3 text-[12px] text-text-tertiary/60">
          {searching ? "Searching channels..." : "No channels found."}
        </div>
      )}
    </div>
  );
}

function SearchLivePill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-red-500/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-normal text-red-300">
      Live
    </span>
  );
}
