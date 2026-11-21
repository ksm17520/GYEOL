import { NextResponse } from "next/server";
import { findScreen, screenDetails, type ScreenDetails } from "@/lib/screen-candidates";
import { kmdbMovie } from "@/lib/kmdb";
import { rateLimited } from "@/lib/ratelimit";
import { findBook } from "@/lib/yes24";
import { refreshWebtoon } from "@/lib/candidates";

export const runtime = "nodejs";
export const maxDuration = 30;

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** 보관함 갱신 결과(매체 공통). 못 찾은 항목은 null이고, 값이 빈 필드는 저장된 값을 그대로 둡니다. */
type Refreshed = ScreenDetails & { releaseYear?: string; sourceUrl?: string; /** 예스24에 없는 책(검색은 정상이었음) — 보관함에서 지웁니다 */ gone?: boolean };

/**
 * 보관함에 저장된 작품을 최신 정보로 다시 읽습니다(보관함을 열 때마다 호출).
 * 영화·시리즈=TMDB·KMDb(감독·출연진·분량·상영/방영 상태·포스터), 책=예스24(저자·쪽수·출간 연도·표지·출처 링크), 웹툰=네이버·카카오(작가·완결 여부·표지).
 */
export async function POST(req: Request) {
  if (rateLimited(req, "refresh", 20)) return NextResponse.json({ error: "요청이 너무 많아요.", code: "RATE" }, { status: 429 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "요청 형식이 올바르지 않습니다.", code: "BAD" }, { status: 400 }); }
  const list = Array.isArray(b?.items) ? (b.items as unknown[]).slice(0, 10) : [];
  const matches: string[] = []; // 확인용: 각 항목을 어떻게 찾았는지
  const results: (Refreshed | null)[] = await Promise.all(list.map(async (x, n) => {
    const o = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
    const title = clip(o.title, 100);
    if (!title) return null;
    if (o.media === "book") {
      const { book: b, status } = await findBook(title, clip(o.creator, 100));
      matches[n] = b ? `book ${b.title}` : `book ${status}`;
      if (status === "none") return { creator: "", cast: [], characters: [], lengthInfo: "", completionStatus: "", gone: true };
      return b ? { creator: b.author, cast: [], characters: [], lengthInfo: b.pages ? `${b.pages}쪽` : "", completionStatus: "", releaseYear: b.year, sourceUrl: b.link, coverImageUrl: b.coverImageUrl ? `/api/cover-proxy?url=${encodeURIComponent(b.coverImageUrl)}` : undefined } : null;
    }
    if (o.media === "webtoon") {
      const w = await refreshWebtoon(title);
      matches[n] = w ? `webtoon ${w.title}` : "webtoon none";
      return w ? { creator: w.creator, cast: [], characters: [], lengthInfo: "", completionStatus: w.finished === true ? "완결" : w.finished === false ? "연재 중" : "", coverImageUrl: w.coverImageUrl ?? undefined } : null;
    }
    const kind = o.media === "film" || o.media === "drama" ? o.media : null;
    if (!kind) return null;
    const found = await findScreen(kind, title, clip(o.year, 4), [clip(o.originalTitle, 100), clip(o.englishTitle, 100)].filter(Boolean));
    const id = found.id;
    matches[n] = found.match;
    if (id) return screenDetails(kind, id);
    // TMDB에 없는 국내 개봉 영화는 KMDb만으로 감독·배우·분량을 보완합니다(상영 상태는 모르므로 비워 저장된 값을 유지).
    if (kind !== "film") return null;
    const { movie, status } = await kmdbMovie(title, clip(o.year, 4), [clip(o.originalTitle, 100), clip(o.englishTitle, 100)].filter(Boolean));
    return movie ? { kmdb: status, creator: movie.directors.slice(0, 2).join(", "), cast: movie.actors.slice(0, 4), characters: [], lengthInfo: movie.runtime ? `${movie.runtime}분` : "", completionStatus: "" } : null;
  }));
  return NextResponse.json({ results, matches });
}
