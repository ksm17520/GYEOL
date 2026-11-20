import { isAllowedCoverHost, refererFor } from "@/lib/cover";
import { rateLimited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BYTES = 5_000_000;

/** 본문을 읽다가 상한을 넘으면 바로 끊고 null을 돌려줍니다. (content-length가 없는 응답도 막기 위함) */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

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
      up = await fetch(target, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; GyeolArchive/1.0)", ...(refererFor(target.hostname) ? { Referer: refererFor(target.hostname) as string } : {}) }, signal: AbortSignal.timeout(4500) });
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
    const buf = await readCapped(up, MAX_BYTES);
    if (!buf) return new Response("Image too large", { status: 413 });
    return new Response(buf as BodyInit, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, s-maxage=604800", "X-Content-Type-Options": "nosniff" } });
  }
  return new Response("Too many redirects", { status: 508 });
}
