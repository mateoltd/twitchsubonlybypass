import { NextRequest } from "next/server";
import { resolveVod } from "@/lib/resolve";
import { generateMasterPlaylist } from "@/lib/playlist";

export async function GET(request: NextRequest) {
  const vodId = request.nextUrl.searchParams.get("vodId");

  if (!vodId || !/^\d+$/.test(vodId)) {
    return new Response("Missing or invalid vodId", { status: 400 });
  }

  try {
    const data = await resolveVod(vodId);
    const playlist = generateMasterPlaylist(vodId, data.qualities);

    return new Response(playlist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("VOD not found", { status: 404 });
  }
}
