export interface TwitchVideoData {
  broadcastType: string;
  createdAt: string;
  seekPreviewsURL: string;
  owner: { login: string };
}

interface TwitchGQLResponse {
  data: {
    video: TwitchVideoData | null;
  };
}

const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

export async function fetchVodMetadata(vodId: string): Promise<TwitchVideoData> {
  const resp = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-Id": CLIENT_ID,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query { video(id: "${vodId}") { broadcastType, createdAt, seekPreviewsURL, owner { login } } }`,
    }),
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      throw new Error("Twitch API authentication failed — Client-ID may have changed");
    }
    throw new Error(`Twitch API error: ${resp.status}`);
  }

  const data: TwitchGQLResponse = await resp.json();

  if (!data?.data?.video) {
    throw new Error("VOD not found");
  }

  return data.data.video;
}
