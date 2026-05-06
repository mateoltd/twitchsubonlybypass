"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBrandSpeedtest,
  IconChevronLeft,
  IconChevronRight,
  IconDeviceTv,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconSettings,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react";
import { formatTime } from "@/lib/format";

interface Quality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
}

interface PlayerProps {
  src: string;
  qualities: Quality[];
  startTime?: number;
  isLive?: boolean;
  dvrMode?: boolean;
  onTimeUpdate?: (time: number) => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
};

type IOSFullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

function getFullscreenElement() {
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

function requestNativeFullscreen(element: FullscreenElement) {
  const request =
    element.requestFullscreen ??
    element.webkitRequestFullscreen ??
    element.webkitRequestFullScreen;

  return request?.call(element);
}

function exitNativeFullscreen() {
  const fullscreenDocument = document as FullscreenDocument;
  const exit =
    document.exitFullscreen ??
    fullscreenDocument.webkitExitFullscreen ??
    fullscreenDocument.webkitCancelFullScreen;

  return exit?.call(document);
}

function pickInitialLevel(
  levels: { name: string; index: number }[],
  sourceLevels: Hls["levels"]
) {
  if (levels.length === 0) return -1;

  return levels.reduce((best, current) => {
    const bestLevel = sourceLevels[best.index];
    const currentLevel = sourceLevels[current.index];
    const bestBitrate = bestLevel?.bitrate ?? bestLevel?.maxBitrate ?? 0;
    const currentBitrate = currentLevel?.bitrate ?? currentLevel?.maxBitrate ?? 0;
    return currentBitrate > bestBitrate ? current : best;
  }, levels[0]).index;
}

function labelHlsLevel(level: Hls["levels"][number]) {
  const attrs = level.attrs as Record<string, string | undefined> | undefined;
  const twitchName =
    attrs?.["STABLE-VARIANT-ID"] ??
    attrs?.["IVS-NAME"] ??
    attrs?.VIDEO ??
    level.name;

  if (twitchName) {
    if (twitchName === "chunked") return "Source";
    return twitchName;
  }

  const frameRate = level.frameRate ? Math.round(level.frameRate) : 0;
  return level.height
    ? `${level.height}p${frameRate >= 50 ? frameRate : ""}`
    : "Quality";
}

export function Player({
  src,
  qualities,
  startTime = 0,
  isLive = false,
  dvrMode = false,
  onTimeUpdate,
}: PlayerProps) {
  const debugVideo =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const levelsSyncedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekableStart, setSeekableStart] = useState(0);
  const [seekableEnd, setSeekableEnd] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [levels, setLevels] = useState<{ name: string; index: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<"speed" | "quality" | "mobile" | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [loading, setLoading] = useState(true);

  const syncDisplayedTime = useCallback(
    (time: number) => {
      setCurrentTime(time);
      onTimeUpdate?.(time);
    },
    [onTimeUpdate]
  );

  const clearSeekFrame = useCallback(() => {
    if (seekFrameRef.current !== null) {
      cancelAnimationFrame(seekFrameRef.current);
      seekFrameRef.current = null;
    }
  }, []);

  const clampTime = useCallback(
    (time: number) => {
      if (isLive && seekableEnd > seekableStart) {
        return Math.max(seekableStart, Math.min(time, seekableEnd));
      }
      if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
      return Math.max(0, Math.min(time, duration));
    },
    [duration, isLive, seekableEnd, seekableStart]
  );

  const commitSeek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const nextTime = clampTime(time);
      pendingSeekRef.current = nextTime;
      syncDisplayedTime(nextTime);
      clearSeekFrame();
      seekFrameRef.current = requestAnimationFrame(() => {
        seekFrameRef.current = null;
        if (!videoRef.current || pendingSeekRef.current === null) return;
        videoRef.current.currentTime = pendingSeekRef.current;
      });
    },
    [clampTime, clearSeekFrame, syncDisplayedTime]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const stored = localStorage.getItem("phantom-volume");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === "number" && parsed >= 0 && parsed <= 1) {
          video.volume = parsed;
          setVolume(parsed);
        }
      }
    } catch {}

    video.disableRemotePlayback = true;

    const onLoadedMetadata = () => {
      if (!isLive && startTime > 0) {
        video.currentTime = startTime;
        syncDisplayedTime(startTime);
      }
      setLoading(false);
    };

    if (debugVideo) {
      console.info("[phantom-hls] player init", {
        src,
        isLive,
        dvrMode,
        hlsSupported: Hls.isSupported(),
        nativeHls: video.canPlayType("application/vnd.apple.mpegurl"),
        providedQualities: qualities.map((quality) => quality.name),
      });
    }

    if (!Hls.isSupported()) {
      if (debugVideo) {
        console.info("[phantom-hls] using native hls fallback");
      }
      video.src = src;
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      return () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: isLive && !dvrMode,
      capLevelToPlayerSize: true,
      startLevel: -1,
      autoStartLoad: !(isLive || dvrMode),
      backBufferLength: isLive && !dvrMode ? 15 : 30,
      maxBufferLength: isLive && !dvrMode ? 8 : 30,
      maxMaxBufferLength: isLive && !dvrMode ? 20 : 60,
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 3,
      capLevelOnFPSDrop: isLive && !dvrMode,
      renderTextTracksNatively: false,
    });
    hlsRef.current = hls;
    levelsSyncedRef.current = false;

    const syncLevels = (sourceLevels = hls.levels) => {
      const hevcSupported =
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"');

      const filteredLevels = sourceLevels
        .map((level) => {
          const index = hls.levels.indexOf(level);
          const levelIndex = index >= 0 ? index : sourceLevels.indexOf(level);
          if (level.codecs?.startsWith("hev1") && !hevcSupported) return null;
          return { name: labelHlsLevel(level), index: levelIndex };
        })
        .filter((level): level is NonNullable<typeof level> => level !== null);

      setLevels(filteredLevels);
      levelsSyncedRef.current = filteredLevels.length > 0;
      if ((isLive || dvrMode) && filteredLevels.length > 0) {
        const actualLevels = hls.levels.length > 0 ? hls.levels : sourceLevels;
        const firstLevel = pickInitialLevel(filteredLevels, actualLevels);
        hls.currentLevel = firstLevel;
        hls.nextLevel = firstLevel;
        hls.loadLevel = firstLevel;
        hls.autoLevelCapping = -1;
        setCurrentLevel(firstLevel);
        if (debugVideo) {
          console.info("[phantom-hls] selected initial level", {
            level: firstLevel,
            levelInfo: hls.levels[firstLevel],
          });
        }
      } else {
        setCurrentLevel(-1);
      }
    };

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      if (debugVideo) {
        console.info("[phantom-hls] manifest parsed", {
          isLive,
          levels: data.levels.map((level) => ({
            name: level.name,
            width: level.width,
            height: level.height,
            frameRate: level.frameRate,
            bitrate: level.bitrate,
            url: level.url?.[0],
          })),
        });
      }
      syncLevels(data.levels.length > 0 ? data.levels : hls.levels);
      if (isLive || dvrMode) {
        hls.startLoad(startTime > 0 ? startTime : -1);
      }
      if (!isLive && startTime > 0) {
        video.currentTime = startTime;
        syncDisplayedTime(startTime);
      }
      setLoading(false);
    });

    hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
      if (!levelsSyncedRef.current && hls.levels.length > 0) {
        syncLevels();
      }

      if (dvrMode && data.details.live && data.details.fragments.length > 0) {
        const first = data.details.fragments[0];
        const last = data.details.fragments[data.details.fragments.length - 1];
        const start = first.start;
        const end = last.start + last.duration;
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          if (debugVideo) {
            console.info("[phantom-hls] live window", {
              isLive,
              level: data.level,
              fragments: data.details.fragments.length,
              start,
              end,
              duration: end - start,
            });
          }
          setSeekableStart(start);
          setSeekableEnd(end);
        }
      }
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (debugVideo) {
        console.warn("[phantom-hls] error", data);
      }
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        hls.destroy();
        hlsRef.current = null;
      }
    });

    hls.loadSource(src);
    hls.attachMedia(video);

    return () => {
      hls.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [debugVideo, dvrMode, isLive, qualities, src, startTime, syncDisplayedTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      setControlsVisible(true);
    };
    const updateSeekable = () => {
      const ranges = video.seekable;
      if (ranges.length === 0) {
        setSeekableStart(0);
        setSeekableEnd(0);
        return;
      }

      setSeekableStart(ranges.start(0));
      setSeekableEnd(ranges.end(ranges.length - 1));
    };
    const onTime = () => {
      if (dragging) return;
      updateSeekable();
      const actualTime = video.currentTime;
      if (
        pendingSeekRef.current !== null &&
        Math.abs(actualTime - pendingSeekRef.current) < 0.35
      ) {
        pendingSeekRef.current = null;
      }
      syncDisplayedTime(actualTime);
    };
    const onDurationChange = () => {
      setDuration(video.duration || 0);
      updateSeekable();
    };
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      updateSeekable();
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onPlaying = () => {
      setLoading(false);
      updateSeekable();
    };
    const onRateChange = () => setSpeed(video.playbackRate);
    const onSeeked = () => {
      pendingSeekRef.current = null;
      setLoading(false);
      updateSeekable();
      syncDisplayedTime(video.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      setControlsVisible(true);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("progress", onProgress);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ended", onEnded);
    };
  }, [dragging, syncDisplayedTime]);

  const isFullscreen = nativeFullscreen;

  useEffect(() => {
    const onFullscreenChange = () =>
      setNativeFullscreen(Boolean(getFullscreenElement()));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current as IOSFullscreenVideo | null;
    if (!video) return;
    const onIOSFullscreenChange = () =>
      setNativeFullscreen(Boolean(video.webkitDisplayingFullscreen));
    video.addEventListener("webkitbeginfullscreen", onIOSFullscreenChange);
    video.addEventListener("webkitendfullscreen", onIOSFullscreenChange);
    return () => {
      video.removeEventListener("webkitbeginfullscreen", onIOSFullscreenChange);
      video.removeEventListener("webkitendfullscreen", onIOSFullscreenChange);
    };
  }, []);

  useEffect(() => {
    setPipSupported(
      "pictureInPictureEnabled" in document &&
        (document as Document & { pictureInPictureEnabled: boolean })
          .pictureInPictureEnabled
    );
  }, []);

  useEffect(() => {
    return () => {
      clearSeekFrame();
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, [clearSeekFrame]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2600);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const base = pendingSeekRef.current ?? videoRef.current?.currentTime ?? currentTime;
      commitSeek(base + delta);
      showControls();
    },
    [commitSeek, currentTime, showControls]
  );

  const seekToLive = useCallback(() => {
    if (seekableEnd <= seekableStart) return;
    commitSeek(seekableEnd - 1);
    showControls();
  }, [commitSeek, seekableEnd, seekableStart, showControls]);

  const changeVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, nextVolume));
    video.volume = clamped;
    video.muted = false;
    try {
      localStorage.setItem("phantom-volume", JSON.stringify(clamped));
    } catch {}
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current as IOSFullscreenVideo | null;
    if (!container) return;

    if (getFullscreenElement()) {
      Promise.resolve(exitNativeFullscreen()).catch(() => {});
      return;
    }

    if (video?.webkitDisplayingFullscreen) {
      video.webkitExitFullscreen?.();
      return;
    }

    const request = requestNativeFullscreen(container);
    if (request) {
      Promise.resolve(request).catch(() => video?.webkitEnterFullscreen?.());
    } else if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
    setMenuOpen(null);
    showControls();
  }, [showControls]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current as (HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
    }) | null;
    if (!video || !video.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {}
  }, []);

  const changeSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setSpeed(rate);
    setMenuOpen(null);
  }, []);

  const changeQuality = useCallback((level: number) => {
    if (hlsRef.current) {
      const hls = hlsRef.current;
      const video = videoRef.current;
      hls.currentLevel = level;
      hls.nextLevel = level;
      hls.loadLevel = level;
      setCurrentLevel(level);

      if (dvrMode && video && level >= 0) {
        const resumeAt = video.currentTime;
        hls.stopLoad();
        hls.startLoad(resumeAt);
        video.currentTime = resumeAt;
      }
    }
    setMenuOpen(null);
  }, [dvrMode]);

  const getProgressFromClientX = useCallback((clientX: number) => {
    const bar = progressRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const dvrWindow = Math.max(0, seekableEnd - seekableStart);

  const onProgressDown = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      event.preventDefault();
      setDragging(true);
      showControls();

      const clientX = "touches" in event ? event.touches[0].clientX : event.clientX;
      const nextProgress = getProgressFromClientX(clientX);
      syncDisplayedTime(
        isLive
          ? seekableStart + nextProgress * dvrWindow
          : nextProgress * duration
      );
    },
    [duration, dvrWindow, getProgressFromClientX, isLive, seekableStart, showControls, syncDisplayedTime]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: MouseEvent | TouchEvent) => {
      const clientX = "touches" in event ? event.touches[0].clientX : event.clientX;
      const nextProgress = getProgressFromClientX(clientX);
      syncDisplayedTime(
        isLive
          ? seekableStart + nextProgress * dvrWindow
          : nextProgress * duration
      );
    };

    const onUp = (event: MouseEvent | TouchEvent) => {
      const clientX =
        "changedTouches" in event ? event.changedTouches[0].clientX : event.clientX;
      const nextProgress = getProgressFromClientX(clientX);
      commitSeek(
        isLive
          ? seekableStart + nextProgress * dvrWindow
          : nextProgress * duration
      );
      setDragging(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [commitSeek, dragging, duration, dvrWindow, getProgressFromClientX, isLive, seekableStart, syncDisplayedTime]);

  const onVideoClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggleFullscreen();
      return;
    }

    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      togglePlay();
    }, 220);
  }, [toggleFullscreen, togglePlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (event.key) {
        case " ":
        case "k":
          if (event.repeat) return;
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "j":
          event.preventDefault();
          seekBy(-10);
          break;
        case "ArrowRight":
        case "l":
          event.preventDefault();
          seekBy(10);
          break;
        case "ArrowUp":
          event.preventDefault();
          changeVolume(video.volume + 0.1);
          showControls();
          break;
        case "ArrowDown":
          event.preventDefault();
          changeVolume(video.volume - 0.1);
          showControls();
          break;
        case "m":
          if (event.repeat) return;
          event.preventDefault();
          toggleMute();
          showControls();
          break;
        case "f":
          if (event.repeat) return;
          event.preventDefault();
          toggleFullscreen();
          break;
        case "p":
          if (event.shiftKey && !event.repeat) {
            event.preventDefault();
            togglePip();
          }
          break;
        case ",":
          if (event.shiftKey) {
            event.preventDefault();
            const index = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            if (index > 0) changeSpeed(SPEEDS[index - 1]);
          }
          break;
        case ".":
          if (event.shiftKey) {
            event.preventDefault();
            const index = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            if (index < SPEEDS.length - 1) changeSpeed(SPEEDS[index + 1]);
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeSpeed, changeVolume, seekBy, showControls, speed, toggleFullscreen, toggleMute, togglePip, togglePlay]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const liveWindow = dvrWindow;
  const useDvrTimeline =
    dvrMode && dvrWindow > 1 && (isLive || !Number.isFinite(duration) || duration <= 0);
  const hasTimeline =
    (!isLive && Number.isFinite(duration) && duration > 0) ||
    useDvrTimeline;
  const timelineDuration = useDvrTimeline ? dvrWindow : duration;
  const timelineTime = useDvrTimeline
    ? Math.max(0, Math.min(currentTime - seekableStart, liveWindow))
    : currentTime;
  const progress = hasTimeline ? (timelineTime / timelineDuration) * 100 : 0;
  const bufferProgress =
    hasTimeline && !useDvrTimeline ? (buffered / timelineDuration) * 100 : 0;
  const liveLag =
    useDvrTimeline && seekableEnd > 0 ? Math.max(0, seekableEnd - currentTime) : 0;
  const canSeek = !isLive || liveWindow > 1;

  return (
    <div
      ref={containerRef}
      className={`player-shell relative aspect-video min-h-[45vh] w-full overflow-hidden rounded-lg sm:min-h-0 sm:rounded-2xl select-none ${
        !controlsVisible && playing ? "cursor-none" : ""
      }`}
      onMouseMove={showControls}
      onTouchStart={showControls}
      onMouseLeave={() => {
        if (playing) {
          if (controlsTimer.current) clearTimeout(controlsTimer.current);
          setControlsVisible(false);
        }
        setHoverProgress(null);
      }}
    >
      <video
        ref={videoRef}
        className={`h-full w-full cursor-pointer bg-black object-contain transition-[filter] duration-300 ${
          !playing && !loading ? "blur-sm brightness-75" : ""
        }`}
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture={!pipSupported}
        onClick={onVideoClick}
      />

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/10 bg-black/60 px-4 py-2 font-sans text-xs uppercase tracking-[0.22em] text-text backdrop-blur-md">
            Buffering
          </div>
        </div>
      )}

      {!playing && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-phantom to-phantom-dark text-white">
            <IconPlayerPlayFilled size={26} />
          </div>
        </div>
      )}

      {menuOpen === "mobile" && (
        <div className="panel-soft absolute inset-x-2 bottom-20 z-20 rounded-2xl p-3 sm:hidden">
          <div className="grid gap-4">
            {!isLive && (
              <MobileGroup title="Speed">
                {SPEEDS.map((value) => (
                  <MiniChip
                    key={value}
                    active={value === speed}
                    onClick={() => changeSpeed(value)}
                  >
                    {value}x
                  </MiniChip>
                ))}
              </MobileGroup>
            )}

            <MobileGroup title="Quality">
              <MiniChip active={currentLevel === -1} onClick={() => changeQuality(-1)}>
                Auto
              </MiniChip>
              {levels.map((level) => (
                <MiniChip
                  key={level.index}
                  active={currentLevel === level.index}
                  onClick={() => changeQuality(level.index)}
                >
                  {level.name}
                </MiniChip>
              ))}
            </MobileGroup>

            <div>
              <div className="mb-2 font-sans text-[11px] uppercase tracking-[0.22em] text-text-tertiary">
                Volume
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                className="range-accent w-full"
                aria-label="Volume"
              />
            </div>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 transition-opacity duration-200 ${
          controlsVisible || !playing
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-transparent" />

        <div className="relative px-2.5 pb-2 sm:px-4 sm:pb-4">
          {hasTimeline ? (
            <>
              <div
                ref={progressRef}
                className="relative mb-2 h-1.5 cursor-pointer rounded-full bg-white/12 sm:mb-3"
                onMouseDown={onProgressDown}
                onTouchStart={onProgressDown}
                onMouseMove={(event) =>
                  setHoverProgress(getProgressFromClientX(event.clientX))
                }
                onMouseLeave={() => setHoverProgress(null)}
                role="slider"
                aria-label="Seek bar"
                aria-valuemin={0}
                aria-valuemax={Math.floor(timelineDuration || 0)}
                aria-valuenow={Math.floor(timelineTime)}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/16"
                  style={{ width: `${bufferProgress}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-phantom to-phantom-light"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-phantom"
                  style={{ left: `${progress}%` }}
                />

                {hoverProgress !== null && (
                  <div
                    className="absolute bottom-full mb-2 -translate-x-1/2 rounded-full bg-black/80 px-2.5 py-1 font-sans text-xs text-white backdrop-blur-sm"
                    style={{ left: `${hoverProgress * 100}%` }}
                  >
                    {useDvrTimeline
                      ? `-${formatTime(
                          Math.max(0, liveWindow - hoverProgress * liveWindow)
                        )}`
                      : formatTime(hoverProgress * duration)}
                  </div>
                )}
              </div>

              <div className="mb-1.5 flex items-center justify-between gap-3 font-sans text-[10px] uppercase tracking-[0.16em] text-text-secondary sm:mb-3 sm:text-[11px]">
                <span>{useDvrTimeline ? `-${formatTime(liveLag)}` : formatTime(currentTime)}</span>
                <span>{useDvrTimeline ? "Live" : formatTime(duration)}</span>
              </div>
            </>
          ) : (
            <div className="mb-2 flex items-center justify-between gap-3 font-sans text-[10px] uppercase tracking-[0.2em] text-text-secondary sm:mb-3 sm:text-[11px]">
              <span className="inline-flex items-center gap-2 text-red-300">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Live
              </span>
              <span>{playing ? "Now playing" : "Ready"}</span>
            </div>
          )}

          <div className="grid gap-1 sm:gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-center">
            <div className="flex items-center gap-1 sm:gap-2">
              <ControlBtn onClick={togglePlay} label={playing ? "Pause" : "Play"} large>
                {playing ? (
                  <IconPlayerPauseFilled size={20} />
                ) : (
                  <IconPlayerPlayFilled size={20} />
                )}
              </ControlBtn>
              {canSeek && (
                <>
                  <ControlBtn onClick={() => seekBy(-10)} label="Back 10 seconds">
                    <IconChevronLeft size={18} />
                    <span className="font-sans text-[11px]">10</span>
                  </ControlBtn>
                  <ControlBtn onClick={() => seekBy(10)} label="Forward 10 seconds">
                    <span className="font-sans text-[11px]">10</span>
                    <IconChevronRight size={18} />
                  </ControlBtn>
                </>
              )}
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <ControlBtn onClick={toggleMute} label={muted || volume === 0 ? "Unmute" : "Mute"}>
                {muted || volume === 0 ? (
                  <IconVolumeOff size={18} />
                ) : volume < 0.5 ? (
                  <IconVolume2 size={18} />
                ) : (
                  <IconVolume size={18} />
                )}
              </ControlBtn>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                className="volume-slider w-28"
                aria-label="Volume"
              />
            </div>

            <div className="hidden sm:block" />

            <div className="hidden sm:flex sm:justify-end sm:gap-2">
              {!isLive && (
                <div className="relative">
                  <MenuBtn
                    onClick={() => setMenuOpen(menuOpen === "speed" ? null : "speed")}
                    label={`Speed ${speed}x`}
                  >
                    <IconBrandSpeedtest size={16} />
                    {speed === 1 ? "1x" : `${speed}x`}
                  </MenuBtn>
                  {menuOpen === "speed" && (
                    <DesktopMenu>
                      {SPEEDS.map((value) => (
                        <MenuItem
                          key={value}
                          active={value === speed}
                          onClick={() => changeSpeed(value)}
                        >
                          {value}x
                        </MenuItem>
                      ))}
                    </DesktopMenu>
                  )}
                </div>
              )}
              {useDvrTimeline && liveLag > 3 && (
                <MenuBtn onClick={seekToLive} label="Jump to live">
                  Live
                </MenuBtn>
              )}

              {levels.length > 0 && (
                <div className="relative">
                  <MenuBtn
                    onClick={() => setMenuOpen(menuOpen === "quality" ? null : "quality")}
                    label="Quality menu"
                  >
                    <IconSettings size={16} />
                    Quality
                  </MenuBtn>
                  {menuOpen === "quality" && (
                    <DesktopMenu>
                      <MenuItem active={currentLevel === -1} onClick={() => changeQuality(-1)}>
                        Auto
                      </MenuItem>
                      {levels.map((level) => (
                        <MenuItem
                          key={level.index}
                          active={currentLevel === level.index}
                          onClick={() => changeQuality(level.index)}
                        >
                          {level.name}
                        </MenuItem>
                      ))}
                    </DesktopMenu>
                  )}
                </div>
              )}

              {pipSupported && (
                <ControlBtn onClick={togglePip} label="Picture in picture">
                  <IconDeviceTv size={18} />
                </ControlBtn>
              )}

              <ControlBtn
                onClick={toggleFullscreen}
                label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? (
                  <IconArrowsMinimize size={18} />
                ) : (
                  <IconArrowsMaximize size={18} />
                )}
              </ControlBtn>
            </div>

            <div className="flex items-center justify-between gap-1 sm:hidden">
              <div className="flex gap-1">
                <ControlBtn onClick={toggleMute} label={muted || volume === 0 ? "Unmute" : "Mute"}>
                  {muted || volume === 0 ? (
                    <IconVolumeOff size={18} />
                  ) : volume < 0.5 ? (
                    <IconVolume2 size={18} />
                  ) : (
                    <IconVolume size={18} />
                  )}
                </ControlBtn>
                <ControlBtn
                  onClick={() => setMenuOpen(menuOpen === "mobile" ? null : "mobile")}
                  label="More controls"
                >
                  <IconSettings size={18} />
                </ControlBtn>
              </div>
              <div className="flex gap-1">
                {pipSupported && (
                  <ControlBtn onClick={togglePip} label="Picture in picture">
                    <IconDeviceTv size={18} />
                  </ControlBtn>
                )}
                <ControlBtn
                  onClick={toggleFullscreen}
                  label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? (
                    <IconArrowsMinimize size={18} />
                  ) : (
                    <IconArrowsMaximize size={18} />
                  )}
                </ControlBtn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlBtn({
  onClick,
  children,
  label,
  large = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`ctrl-btn flex items-center justify-center gap-1 rounded-full px-2 sm:px-3 text-sm font-medium ${
        large ? "h-9 min-w-9 sm:h-11 sm:min-w-11" : "h-8 min-w-8 sm:h-10 sm:min-w-10"
      }`}
    >
      {children}
    </button>
  );
}

function MenuBtn({
  onClick,
  children,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="ctrl-btn flex h-10 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-medium"
    >
      {children}
    </button>
  );
}

function DesktopMenu({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel-soft absolute bottom-full right-0 z-20 mb-2 min-w-36 rounded-[22px] p-1.5">
      {children}
    </div>
  );
}

function MenuItem({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-[16px] px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-gradient-to-r from-phantom to-phantom-dark text-white"
          : "text-text-secondary hover:bg-white/8 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function MobileGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 font-sans text-[11px] uppercase tracking-[0.22em] text-text-tertiary">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function MiniChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "bg-gradient-to-r from-phantom to-phantom-dark text-white"
          : "bg-white/6 text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}
