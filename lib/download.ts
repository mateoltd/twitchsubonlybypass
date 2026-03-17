export interface DownloadProgress {
  phase: "fetching" | "downloading" | "finalizing";
  downloaded: number;
  total: number;
  bytes: number;
}

// 16 concurrent proxy requests — ~2.7x faster than 6
const CONCURRENCY = 16;
// First retry is immediate, then back off
const RETRY_DELAYS_MS = [0, 400, 1200];

function proxyUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

async function fetchWithRetry(
  url: string,
  signal: AbortSignal
): Promise<ArrayBuffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const resp = await fetch(url, { signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.arrayBuffer();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

interface ParsedPlaylist {
  initSegmentUrl: string | null;
  segmentUrls: string[];
  extension: string;
}

function parsePlaylist(text: string, playlistUrl: string): ParsedPlaylist {
  const base = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);
  const lines = text.split("\n");
  const segmentUrls: string[] = [];
  let initSegmentUrl: string | null = null;
  let extension = "ts";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-MAP:")) {
      const m = line.match(/URI="([^"]+)"/);
      if (m) {
        initSegmentUrl = base + m[1];
        extension = "mp4";
      }
    }
    if (line.startsWith("#EXTINF:")) {
      for (let j = i + 1; j < lines.length; j++) {
        const seg = lines[j].trim();
        if (seg && !seg.startsWith("#")) {
          segmentUrls.push(base + seg);
          i = j;
          break;
        }
      }
    }
  }

  return { initSegmentUrl, segmentUrls, extension };
}

// Receives out-of-order segment pushes, flushes them in-sequence to the sink.
// Workers download in parallel and may finish out of order; this ensures the
// output stream is always contiguous without stalling any worker.
class OrderedWriter {
  private readonly pending = new Map<number, ArrayBuffer>();
  private nextIdx = 0;
  private chain = Promise.resolve();

  constructor(private readonly sink: (buf: ArrayBuffer) => Promise<void>) {}

  push(index: number, buf: ArrayBuffer): void {
    this.pending.set(index, buf);
    this.chain = this.chain.then(() => this.flush());
  }

  private async flush(): Promise<void> {
    while (this.pending.has(this.nextIdx)) {
      const buf = this.pending.get(this.nextIdx)!;
      this.pending.delete(this.nextIdx);
      this.nextIdx++;
      await this.sink(buf);
    }
  }

  drain(): Promise<void> {
    return this.chain;
  }
}

async function fetchParallel(
  urls: string[],
  writer: OrderedWriter,
  onProgress: (downloaded: number, bytes: number) => void,
  signal: AbortSignal
): Promise<void> {
  let cursor = 0;
  let downloaded = 0;
  let bytes = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const idx = cursor++;
      if (idx >= urls.length) return;
      const buf = await fetchWithRetry(proxyUrl(urls[idx]), signal);
      writer.push(idx, buf);
      bytes += buf.byteLength;
      onProgress(++downloaded, bytes);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker)
  );
  await writer.drain();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type FSAWindow = Window & {
  showSaveFilePicker?: (opts: object) => Promise<{
    createWritable: () => Promise<{ write: (d: ArrayBuffer) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

// Stream directly to disk via File System Access API (Chrome/Edge).
// Avoids holding the whole file in memory and lets the OS show download progress.
async function downloadWithFSA(
  playlist: ParsedPlaylist,
  filename: string,
  total: number,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  const handle = await (window as FSAWindow).showSaveFilePicker!({
    suggestedName: filename,
    types: [
      {
        description: "Video file",
        accept:
          playlist.extension === "mp4"
            ? { "video/mp4": [".mp4"] }
            : { "video/mp2t": [".ts"] },
      },
    ],
  });

  const writable = await handle.createWritable();
  let downloaded = 0;
  let bytes = 0;

  try {
    if (playlist.initSegmentUrl) {
      const buf = await fetchWithRetry(proxyUrl(playlist.initSegmentUrl), signal);
      await writable.write(buf);
      bytes += buf.byteLength;
      downloaded++;
      onProgress({ phase: "downloading", downloaded, total, bytes });
    }

    const initOffset = playlist.initSegmentUrl ? 1 : 0;
    await fetchParallel(
      playlist.segmentUrls,
      new OrderedWriter(async (buf) => writable.write(buf)),
      (dl, b) => {
        downloaded = initOffset + dl;
        bytes = b;
        onProgress({ phase: "downloading", downloaded, total, bytes });
      },
      signal
    );

    onProgress({ phase: "finalizing", downloaded, total, bytes });
  } finally {
    await writable.close();
  }
}

// In-memory fallback for Safari/Firefox — accumulates all segments then triggers download.
async function downloadInMemory(
  playlist: ParsedPlaylist,
  filename: string,
  total: number,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  const parts: ArrayBuffer[] = [];
  let downloaded = 0;
  let bytes = 0;

  if (playlist.initSegmentUrl) {
    const buf = await fetchWithRetry(proxyUrl(playlist.initSegmentUrl), signal);
    parts.push(buf);
    bytes += buf.byteLength;
    downloaded++;
    onProgress({ phase: "downloading", downloaded, total, bytes });
  }

  const initOffset = playlist.initSegmentUrl ? 1 : 0;
  await fetchParallel(
    playlist.segmentUrls,
    new OrderedWriter(async (buf) => {
      parts.push(buf);
    }),
    (dl, b) => {
      downloaded = initOffset + dl;
      bytes = b;
      onProgress({ phase: "downloading", downloaded, total, bytes });
    },
    signal
  );

  onProgress({ phase: "finalizing", downloaded, total, bytes });

  const blob = new Blob(parts, {
    type: playlist.extension === "mp4" ? "video/mp4" : "video/mp2t",
  });
  triggerBlobDownload(blob, filename);
}

export async function downloadVod(
  playlistUrl: string,
  baseFilename: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  onProgress({ phase: "fetching", downloaded: 0, total: 0, bytes: 0 });

  const resp = await fetch(proxyUrl(playlistUrl), { signal });
  if (!resp.ok) throw new Error(`Failed to fetch playlist: ${resp.status}`);
  const playlist = parsePlaylist(await resp.text(), playlistUrl);

  const filename = `${baseFilename}.${playlist.extension}`;
  const total =
    playlist.segmentUrls.length + (playlist.initSegmentUrl ? 1 : 0);

  // Prefer FSA (Chrome/Edge): streams to disk, no memory pressure
  const fsaAvailable =
    typeof window !== "undefined" && "showSaveFilePicker" in window;

  if (fsaAvailable) {
    try {
      await downloadWithFSA(playlist, filename, total, onProgress, signal);
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // User cancelled the picker → treat as abort
      if ((err as DOMException).name === "AbortError") throw err;
      // FSA unavailable or any other error → fall through to in-memory
    }
  }

  await downloadInMemory(playlist, filename, total, onProgress, signal);
}
