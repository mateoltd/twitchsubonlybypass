export interface ResolvedQuality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
}

export interface VodResolveResult {
  vodId: string;
  channel: string;
  broadcastType: string;
  qualities: ResolvedQuality[];
}

export function extractVodId(input: string): string | null {
  const trimmed = input.trim();

  // Bare numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  // URL formats: twitch.tv/videos/123456
  const urlMatch = trimmed.match(/twitch\.tv\/videos\/(\d+)/);
  if (urlMatch) return urlMatch[1];

  return null;
}

export function isCloudFrontUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(".cloudfront.net");
  } catch {
    return false;
  }
}
