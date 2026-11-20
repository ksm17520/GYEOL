import { NextResponse } from "next/server";
import { aiErrorBody, AiError, generateJson } from "@/lib/gemini";
import { verifyItems } from "@/lib/verify";
import { rateLimited } from "@/lib/ratelimit";
import { crossoverPrompt, crossoverSchema, parseCrossoverRequest, parseItems } from "@/lib/recommend-api";

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
  const parsed = parseCrossoverRequest(body);
  if (!parsed) return NextResponse.json({ error: "최소 1개 이상의 인생작을 입력해 주세요.", code: "BAD" }, { status: 400 });
  try {
    const raw = (await generateJson(crossoverPrompt(parsed), crossoverSchema())) as Record<string, unknown>;
    const items = await verifyItems(parseItems(raw.items, "cross"));
    if (items.length === 0) throw new AiError(502, "추천 결과를 만들지 못했어요. 다시 시도해 주세요.");
    return NextResponse.json({
      sharedDnaTitle: typeof raw.sharedDnaTitle === "string" && raw.sharedDnaTitle ? raw.sharedDnaTitle.slice(0, 200) : "매체를 잇는 서사의 결",
      sharedDnaSummary: typeof raw.sharedDnaSummary === "string" && raw.sharedDnaSummary ? raw.sharedDnaSummary.slice(0, 600) : "인생작이 지닌 정서와 미학을 다른 매체로 확장한 큐레이션입니다.",
      items,
    });
  } catch (e) {
    const { status, body: b } = aiErrorBody(e);
    return NextResponse.json(b, { status });
  }
}
