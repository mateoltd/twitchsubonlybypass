export interface ParsedPlaylist {
  initSegmentUrl: string | null;
  segmentUrls: string[];
  totalDuration: number;
  extension: string;
}

export function parsePlaylist(
  text: string,
  playlistUrl: string
): ParsedPlaylist {
  const base = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);
  const lines = text.split("\n");
  const segments: string[] = [];
  let initUrl: string | null = null;
  let totalDuration = 0;
  let extension = "ts";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("#EXT-X-MAP:")) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) {
        initUrl = base + match[1];
        extension = "mp4";
      }
    }

    if (line.startsWith("#EXTINF:")) {
      totalDuration += parseFloat(line.split(":")[1]);
      for (let j = i + 1; j < lines.length; j++) {
        const seg = lines[j].trim();
        if (seg && !seg.startsWith("#")) {
          segments.push(base + seg);
          i = j;
          break;
        }
      }
    }
  }

  return { initSegmentUrl: initUrl, segmentUrls: segments, totalDuration, extension };
}

export interface DownloadProgress {
  phase: "fetching" | "downloading" | "finalizing";
  downloaded: number;
  total: number;
  bytes: number;
}

const CONCURRENCY = 6;
const MAX_RETRIES = 3;

function proxyUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

async function fetchWithRetry(
  url: string,
  signal: AbortSignal,
  retries = MAX_RETRIES
): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, { signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.arrayBuffer();
    } catch (err) {
      if (signal.aborted) throw err;
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
}

export async function downloadVod(
  playlistUrl: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<{ blob: Blob; extension: string }> {
  onProgress({ phase: "fetching", downloaded: 0, total: 0, bytes: 0 });

  const resp = await fetch(proxyUrl(playlistUrl), { signal });
  if (!resp.ok) throw new Error(`Failed to fetch playlist: ${resp.status}`);
  const text = await resp.text();
  // Pass the original playlistUrl (not proxy) so segment base URLs resolve correctly
  const playlist = parsePlaylist(text, playlistUrl);

  const total =
    playlist.segmentUrls.length + (playlist.initSegmentUrl ? 1 : 0);
  let downloaded = 0;
  let bytes = 0;

  const parts: ArrayBuffer[] = [];

  // Download init segment first if fMP4
  if (playlist.initSegmentUrl) {
    const buf = await fetchWithRetry(proxyUrl(playlist.initSegmentUrl), signal);
    parts.push(buf);
    bytes += buf.byteLength;
    downloaded++;
    onProgress({ phase: "downloading", downloaded, total, bytes });
  }

  // Download media segments with concurrency pool
  const segmentBuffers = new Array<ArrayBuffer>(playlist.segmentUrls.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < playlist.segmentUrls.length) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const i = nextIndex++;
      const buf = await fetchWithRetry(proxyUrl(playlist.segmentUrls[i]), signal);
      segmentBuffers[i] = buf;
      bytes += buf.byteLength;
      downloaded++;
      onProgress({ phase: "downloading", downloaded, total, bytes });
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, playlist.segmentUrls.length) },
    () => worker()
  );
  await Promise.all(workers);

  onProgress({ phase: "finalizing", downloaded, total, bytes });

  const blob = new Blob([...parts, ...segmentBuffers], {
    type: playlist.extension === "mp4" ? "video/mp4" : "video/mp2t",
  });

  return { blob, extension: playlist.extension };
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
