import { ResolvedQuality } from "./validation";

export function generateMasterPlaylist(
  vodId: string,
  qualities: ResolvedQuality[]
): string {
  let playlist = "#EXTM3U\n";

  for (const q of qualities) {
    playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},CODECS="${q.codec},mp4a.40.2",RESOLUTION=${q.resolution},FRAME-RATE=${q.frameRate}\n`;
    playlist += `/api/vod/variant.m3u8?vodId=${vodId}&quality=${q.key}\n`;
  }

  return playlist;
}

export function rewriteVariantPlaylist(
  m3u8Text: string,
  baseUrl: string
): string {
  // Replace unmuted segments with muted
  let rewritten = m3u8Text.replace(/-unmuted/g, "-muted");

  // Remove Twitch-specific headers that hls.js doesn't need
  rewritten = rewritten
    .split("\n")
    .filter((line) => !line.startsWith("#EXT-X-TWITCH-"))
    .join("\n");

  // Base path for resolving relative URLs
  const base = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);

  const lines = rewritten.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MAP:")) {
      // Rewrite init segment URI
      const rewrittenLine = line.replace(/URI="([^"]+)"/, (_, uri) => {
        const absoluteUrl = uri.startsWith("http") ? uri : base + uri;
        return `URI="/api/vod/segment?url=${encodeURIComponent(absoluteUrl)}"`;
      });
      result.push(rewrittenLine);
    } else if (line && !line.startsWith("#")) {
      // Segment URL — make absolute and proxy through our endpoint
      const absoluteUrl = line.startsWith("http") ? line : base + line;
      result.push(
        `/api/vod/segment?url=${encodeURIComponent(absoluteUrl)}`
      );
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}
