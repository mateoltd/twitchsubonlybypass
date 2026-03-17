import { NextRequest } from "next/server";

const ALLOWED_HOSTS = [
  /^[a-z0-9-]+\.twitch\.tv$/,
  /^[a-z0-9]+\.cloudfront\.net$/,
];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!ALLOWED_HOSTS.some((r) => r.test(parsed.hostname))) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return new Response("Upstream error", { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
