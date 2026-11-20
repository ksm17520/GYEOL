import { NextResponse } from "next/server";
import { MEDIA_LABEL } from "@/lib/data";
import { aiErrorBody, generateGrounded } from "@/lib/gemini";
import { normalizeMedia } from "@/lib/item";
import { rateLimited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCOPE = {
  book: "예스24, 교보문고, 알라딘, 밀리의 서재, 리디, 네이버 시리즈, 구글 Play 북스, 스토리텔",
  webtoon: "네이버웹툰, 카카오페이지, 레진코믹스, 카카오웹툰",
  film: "넷플릭스, 왓챠, 티빙, 웨이브, Apple TV+, 쿠팡플레이, 유튜브",
  drama: "넷플릭스, 왓챠, 티빙, 웨이브, Apple TV+, 쿠팡플레이, 유튜브",
} as const;

// 같은 작품을 다시 확인할 때 AI 호출(한도 소모)을 줄이기 위한 서버 메모리 캐시 (6시간)
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: { summary: string; sources: { title: string; uri: string }[]; verifiedAt: string } }>();

export async function POST(req: Request) {
  if (rateLimited(req, "access", 10)) {
    return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", code: "RATE" }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다.", code: "BAD" }, { status: 400 });
  }
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
  const creator = typeof body?.creator === "string" ? body.creator.trim().slice(0, 100) : "";
  const media = normalizeMedia(body?.media);
  if (!title || !media) return NextResponse.json({ error: "작품 제목과 매체가 필요합니다.", code: "BAD" }, { status: 400 });

  const cacheKey = `${media}::${title.toLowerCase()}::${creator.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.value);

  const prompt = `한국에서 ${MEDIA_LABEL[media]} "${title}"${creator ? ` (${creator})` : ""} 작품을 현재 어디서 열람, 구매 또는 스트리밍 시청할 수 있는지 검색해 간결하게 정리해 주세요.
확인 대상 주요 플랫폼: ${SCOPE[media]}. 이 목록에 없더라도 해당 작품을 열람·시청할 수 있는 한국의 다른 사이트나 서비스가 확인되면 함께 알려 주세요.
2~3문장으로 현재 확인되는 한국 플랫폼·서점 이용 가능 여부와 특징(구독 포함 여부, 단행본/전자책 출간 여부, 완결 회차 등)만 깔끔한 한국어로 답변해 주세요. 확인되지 않은 내용은 추측하지 말고 '확인되지 않았다'고 적어 주세요.`;
  try {
    const { text, sources } = await generateGrounded(prompt);
    const value = { summary: text.slice(0, 1200) || "주요 플랫폼 검색 결과를 확인했습니다.", sources, verifiedAt: new Date().toISOString() };
    if (text) {
      if (cache.size >= 300) cache.delete(cache.keys().next().value as string);
      cache.set(cacheKey, { at: Date.now(), value });
    }
    return NextResponse.json(value);
  } catch (e) {
    const { status, body: b } = aiErrorBody(e);
    return NextResponse.json(b, { status });
  }
}
