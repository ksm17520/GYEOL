import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";
import { buildPrompt, parseTasteInput, ruleBasedProfile } from "@/lib/taste";
import type { TasteProfile } from "@/lib/archive-types";
import { generateJson } from "@/lib/gemini";
import { clovaConfigured } from "@/lib/clova";

export const runtime = "nodejs";
export const maxDuration = 60;

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

async function analyze(prompt: string): Promise<TasteProfile> {
  const p = (await generateJson(prompt, SCHEMA, 45000)) as Record<string, unknown>;
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
  if (rateLimited(req, "profile", 6)) {
    return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
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

  if (!process.env.GEMINI_API_KEY && !clovaConfigured()) {
    return NextResponse.json({ profile: ruleBasedProfile(input), notice: "AI 분석이 설정되지 않아 기본 분석 결과를 보여드려요." });
  }
  try {
    return NextResponse.json({ profile: await analyze(buildPrompt(input)) });
  } catch (e) {
    console.error("[profile] AI 분석 실패", e instanceof Error ? e.message : e);
    return NextResponse.json({ profile: ruleBasedProfile(input), notice: "AI 분석이 일시적으로 어려워 기본 분석 결과를 보여드려요." });
  }
}
