import { NextResponse } from "next/server";
import { buildPrompt, parseTasteInput, ruleBasedProfile } from "@/lib/taste";
import type { TasteProfile } from "@/lib/archive-types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    personaTitle: { type: "STRING", description: "취향을 담은 시적인 에디토리얼 페르소나 제목" },
    editorialSummary: { type: "STRING", description: "매체를 가로지르는 취향의 3문장 분석" },
    coreMoods: { type: "ARRAY", items: { type: "STRING" }, description: "핵심 분위기 키워드 4~5개" },
    narrativePreferences: { type: "ARRAY", items: { type: "STRING" }, description: "선호하는 서사 패턴 3개" },
    crossMediaInsight: { type: "STRING", description: "책·영화·드라마·웹툰으로 이어지는 취향 인사이트" },
    nextDiscoveryPrompt: { type: "STRING", description: "다음 탐색을 위한 구체적인 큐레이션 요청 문장" },
  },
  required: ["personaTitle", "editorialSummary", "coreMoods", "narrativePreferences", "crossMediaInsight", "nextDiscoveryPrompt"],
};

const asStrings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8).map((x) => x.slice(0, max)) : [];

async function callGemini(prompt: string, key: string): Promise<TasteProfile> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data: unknown = await res.json();
  const text = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("빈 응답");
  const p = JSON.parse(text) as Record<string, unknown>;
  if (typeof p.personaTitle !== "string" || typeof p.editorialSummary !== "string") throw new Error("형식 오류");
  return {
    personaTitle: p.personaTitle.slice(0, 200),
    editorialSummary: p.editorialSummary.slice(0, 1500),
    coreMoods: asStrings(p.coreMoods, 60),
    narrativePreferences: asStrings(p.narrativePreferences, 200),
    crossMediaInsight: typeof p.crossMediaInsight === "string" ? p.crossMediaInsight.slice(0, 1500) : "",
    nextDiscoveryPrompt: typeof p.nextDiscoveryPrompt === "string" ? p.nextDiscoveryPrompt.slice(0, 500) : "",
    updatedAt: new Date().toISOString(),
    source: "ai",
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const input = parseTasteInput(body);
  if (!input) {
    return NextResponse.json({ error: "분석할 보관함 작품이나 인생작이 없습니다." }, { status: 400 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ profile: ruleBasedProfile(input), notice: "AI 분석이 설정되지 않아 기본 분석 결과를 보여드려요." });
  }
  try {
    return NextResponse.json({ profile: await callGemini(buildPrompt(input), key) });
  } catch {
    return NextResponse.json({ profile: ruleBasedProfile(input), notice: "AI 분석이 일시적으로 어려워 기본 분석 결과를 보여드려요." });
  }
}
