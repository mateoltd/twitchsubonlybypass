import { ResolvedQuality } from "./validation";

function buildMediaPlaylistPath(vodId: string, quality: string): string {
  const params = new URLSearchParams({
    vodId,
    quality,
  });
  return `/api/vod/media.m3u8?${params.toString()}`;
}

function buildProxyPath(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

export function generateMasterPlaylist(
  vodId: string,
  qualities: ResolvedQuality[]
): string {
  let playlist = "#EXTM3U\n#EXT-X-VERSION:3\n";

  for (const q of qualities) {
    playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},CODECS="${q.codec},mp4a.40.2",RESOLUTION=${q.resolution},FRAME-RATE=${q.frameRate}\n`;
    playlist += `${buildMediaPlaylistPath(vodId, q.key)}\n`;
  }

  return playlist;
}

export function rewriteMediaPlaylist(text: string, playlistUrl: string): string {
  return text
    .split("\n")
    .map((line) => rewritePlaylistLine(line, playlistUrl))
    .join("\n");
}

function rewritePlaylistLine(line: string, playlistUrl: string): string {
  const trimmed = line.trim();
  if (!trimmed) return line;

  if (!trimmed.startsWith("#")) {
    return buildProxyPath(new URL(trimmed, playlistUrl).toString());
  }

  if (!trimmed.includes('URI="')) {
    return line;
  }

  return line.replace(/URI="([^"]+)"/g, (_, uri: string) => {
    const proxied = buildProxyPath(new URL(uri, playlistUrl).toString());
    return `URI="${proxied}"`;
  });
}
