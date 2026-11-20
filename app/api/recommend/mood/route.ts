import { NextResponse } from "next/server";
import { aiErrorBody, AiError, generateJson } from "@/lib/gemini";
import { rateLimited } from "@/lib/ratelimit";
import { moodPrompt, moodSchema, parseItems, parseMoodRequest } from "@/lib/recommend-api";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (rateLimited(req, "recommend", 8)) {
    return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", code: "RATE" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다.", code: "BAD" }, { status: 400 });
  }
  const parsed = parseMoodRequest(body);
  if (!parsed) return NextResponse.json({ error: "분위기, 상황, 요청 문장 중 하나 이상을 입력해 주세요.", code: "BAD" }, { status: 400 });
  try {
    const raw = (await generateJson(moodPrompt(parsed), moodSchema())) as Record<string, unknown>;
    const items = parseItems(raw.items, "rec");
    if (items.length === 0) throw new AiError(502, "추천 결과를 만들지 못했어요. 다시 시도해 주세요.");
    return NextResponse.json({
      curationTitle: typeof raw.curationTitle === "string" && raw.curationTitle ? raw.curationTitle.slice(0, 200) : "오늘의 결에 맞춘 큐레이션",
      editorialNote: typeof raw.editorialNote === "string" && raw.editorialNote ? raw.editorialNote.slice(0, 600) : "선택한 분위기와 상황에 맞춰 엄선한 작품 목록입니다.",
      items,
    });
  } catch (e) {
    const { status, body: b } = aiErrorBody(e);
    return NextResponse.json(b, { status });
  }
}
