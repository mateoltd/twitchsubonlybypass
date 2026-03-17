import { NextRequest } from "next/server";
import { resolveVod } from "@/lib/resolve";
import { buildPlaylistUrl } from "@/lib/url-builder";
import { rewriteVariantPlaylist } from "@/lib/playlist";

export async function GET(request: NextRequest) {
  const vodId = request.nextUrl.searchParams.get("vodId");
  const quality = request.nextUrl.searchParams.get("quality");

  if (!vodId || !/^\d+$/.test(vodId) || !quality) {
    return new Response("Missing parameters", { status: 400 });
  }

  try {
    const data = await resolveVod(vodId);
    const url = buildPlaylistUrl(
      data.urlInfo,
      vodId,
      quality,
      data.createdAt
    );

    const resp = await fetch(url);
    if (!resp.ok) {
      return new Response("Quality not available", { status: 404 });
    }

    const m3u8Text = await resp.text();
    const rewritten = rewriteVariantPlaylist(m3u8Text, url);

    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Error loading playlist", { status: 502 });
  }
}
