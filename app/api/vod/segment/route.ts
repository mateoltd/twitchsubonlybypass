import { NextRequest } from "next/server";
import { isCloudFrontUrl } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url || !isCloudFrontUrl(url)) {
    return new Response("Invalid or disallowed URL", { status: 400 });
  }

  const headers: HeadersInit = {};
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const resp = await fetch(url, { headers });

  if (!resp.ok && resp.status !== 206) {
    return new Response("Segment not found", { status: resp.status });
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    resp.headers.get("content-type") ?? "video/mp2t"
  );
  responseHeaders.set("Cache-Control", "public, max-age=86400");
  responseHeaders.set("Accept-Ranges", "bytes");

  if (resp.headers.has("content-length")) {
    responseHeaders.set("Content-Length", resp.headers.get("content-length")!);
  }
  if (resp.headers.has("content-range")) {
    responseHeaders.set("Content-Range", resp.headers.get("content-range")!);
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: responseHeaders,
  });
}
