import { ResolvedQuality } from "./validation";

export function generateMasterPlaylist(qualities: ResolvedQuality[]): string {
  let playlist = "#EXTM3U\n#EXT-X-VERSION:3\n";

  for (const q of qualities) {
    playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},CODECS="${q.codec},mp4a.40.2",RESOLUTION=${q.resolution},FRAME-RATE=${q.frameRate}\n`;
    playlist += `${q.playlistUrl}\n`;
  }

  return playlist;
}
