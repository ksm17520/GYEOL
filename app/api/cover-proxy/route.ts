import { isAllowedCoverHost } from "@/lib/cover";
import { rateLimited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BYTES = 5_000_000;

export async function GET(req: Request) {
  if (rateLimited(req, "proxy", 120)) return new Response("Too many requests", { status: 429 });
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return new Response("Missing url", { status: 400 });
  let target: URL;
  try { target = new URL(raw); } catch { return new Response("Invalid url", { status: 400 }); }

  // 리디렉션은 직접 따라가며, 매 단계마다 https와 허용 호스트인지 확인합니다.
  for (let hop = 0; hop < 4; hop++) {
    if (target.protocol !== "https:" || !isAllowedCoverHost(target.hostname)) return new Response("Disallowed image host", { status: 403 });
    let up: Response;
    try {
      up = await fetch(target, { redirect: "manual", headers: { "User-Agent": "GyeolArchive/1.0" }, signal: AbortSignal.timeout(4500) });
    } catch { return new Response("Failed to fetch cover image", { status: 502 }); }
    if (up.status >= 300 && up.status < 400) {
      const loc = up.headers.get("location");
      if (!loc) return new Response("Bad redirect", { status: 502 });
      try { target = new URL(loc, target); } catch { return new Response("Bad redirect", { status: 502 }); }
      continue;
    }
    if (!up.ok) return new Response("Upstream image error", { status: 502 });
    const type = up.headers.get("content-type") || "";
    if (!type.startsWith("image/") || type.includes("svg")) return new Response("Not an image", { status: 415 });
    const len = Number(up.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return new Response("Image too large", { status: 413 });
    const buf = await up.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response("Image too large", { status: 413 });
    return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, s-maxage=604800", "X-Content-Type-Options": "nosniff" } });
  }
  return new Response("Too many redirects", { status: 508 });
}
