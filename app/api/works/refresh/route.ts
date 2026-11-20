import { NextResponse } from "next/server";
import { findScreenId, screenDetails, type ScreenDetails } from "@/lib/screen-candidates";
import { kmdbMovie } from "@/lib/kmdb";
import { rateLimited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** 보관함에 저장된 영화·드라마의 감독·출연진·분량·상영/방영 상태를 TMDB 정보로 다시 읽습니다. 못 찾으면 null. */
export async function POST(req: Request) {
  if (rateLimited(req, "refresh", 20)) return NextResponse.json({ error: "요청이 너무 많아요.", code: "RATE" }, { status: 429 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "요청 형식이 올바르지 않습니다.", code: "BAD" }, { status: 400 }); }
  const list = Array.isArray(b?.items) ? (b.items as unknown[]).slice(0, 10) : [];
  const results: (ScreenDetails | null)[] = await Promise.all(list.map(async (x) => {
    const o = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
    const kind = o.media === "film" || o.media === "drama" ? o.media : null;
    const title = clip(o.title, 100);
    if (!kind || !title) return null;
    const id = await findScreenId(kind, title, clip(o.year, 4), [clip(o.originalTitle, 100), clip(o.englishTitle, 100)].filter(Boolean));
    if (id) return screenDetails(kind, id);
    // TMDB에 없는 국내 개봉 영화는 KMDb만으로 감독·배우·분량을 보완합니다(상영 상태는 모르므로 비워 저장된 값을 유지).
    if (kind !== "film") return null;
    const { movie, status } = await kmdbMovie(title, clip(o.year, 4), [clip(o.originalTitle, 100), clip(o.englishTitle, 100)].filter(Boolean));
    return movie ? { kmdb: status, creator: movie.directors.slice(0, 2).join(", "), cast: movie.actors.slice(0, 4), characters: [], lengthInfo: movie.runtime ? `${movie.runtime}분` : "", completionStatus: "" } : null;
  }));
  return NextResponse.json({ results });
}
