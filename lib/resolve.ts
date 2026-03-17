import { fetchVodMetadata } from "./twitch";
import { extractUrlInfo, buildPlaylistUrl, VodUrlInfo } from "./url-builder";
import { probeQuality } from "./quality";
import { defaultResolutions } from "./resolutions";
import { cacheGet, cacheSet } from "./cache";
import { ResolvedQuality } from "./validation";

export interface CachedVodData {
  vodId: string;
  channel: string;
  broadcastType: string;
  createdAt: string;
  urlInfo: VodUrlInfo;
  qualities: ResolvedQuality[];
}

export async function resolveVod(vodId: string): Promise<CachedVodData> {
  const cached = cacheGet<CachedVodData>(vodId);
  if (cached) return cached;

  const vodData = await fetchVodMetadata(vodId);
  const urlInfo = extractUrlInfo(vodData);

  // Probe all qualities in parallel
  const probeEntries = Object.entries(defaultResolutions);

  const probes = probeEntries.map(async ([key, res]) => {
    const url = buildPlaylistUrl(urlInfo, vodId, key, vodData.createdAt);
    const result = await probeQuality(url);
    return { key, res, result };
  });

  const results = await Promise.all(probes);

  // Assign decreasing bandwidth values (preserves quality order)
  let bandwidth = 8534030;
  const qualities: ResolvedQuality[] = [];

  for (const { key, res, result } of results) {
    if (result) {
      qualities.push({
        key,
        name: res.name,
        resolution: res.resolution,
        frameRate: res.frameRate,
        bandwidth,
        codec: result.codec,
      });
      bandwidth -= 100;
    }
  }

  const data: CachedVodData = {
    vodId,
    channel: vodData.owner.login,
    broadcastType: urlInfo.broadcastType,
    createdAt: vodData.createdAt,
    urlInfo,
    qualities,
  };

  cacheSet(vodId, data);
  return data;
}
