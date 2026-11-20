export const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export class AiError extends Error {
  constructor(public status: number, message: string, public code: "NO_KEY" | "FAILED" = "FAILED") {
    super(message);
  }
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
};

const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash";

async function callModel(model: string, body: unknown, timeoutMs: number): Promise<{ ok: true; data: GeminiResponse } | { ok: false; status: number; detail: string }> {
  const key = process.env.GEMINI_API_KEY as string;
  let status = 500;
  let detail = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { ok: true, data: (await res.json()) as GeminiResponse };
      status = res.status;
      detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[gemini] ${model} -> ${status} ${detail}`);
      if (![429, 500, 503].includes(status)) break;
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError(504, "AI 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
      status = 503;
      detail = e instanceof Error ? e.message : "network";
      console.error(`[gemini] ${model} network error: ${detail}`);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: false, status, detail };
}

async function post(body: unknown, timeoutMs: number): Promise<GeminiResponse> {
  if (!process.env.GEMINI_API_KEY) throw new AiError(503, "AI 추천이 아직 설정되지 않았습니다.", "NO_KEY");
  let r = await callModel(MODEL, body, timeoutMs);
  // 기본 모델이 없거나(404) 과부하(429·500·503)일 때 보조 모델로 한 번 더 시도합니다.
  if (!r.ok && [404, 429, 500, 503].includes(r.status) && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
    const second = await callModel(FALLBACK_MODEL, body, timeoutMs);
    if (second.ok) return second.data;
    r = r.status === 404 ? second : r;
  }
  if (r.ok) return r.data;
  if ([400, 401, 403].includes(r.status)) throw new AiError(502, `AI 설정(API 키·모델)을 확인해 주세요. (${r.status})`);
  if (r.status === 404) throw new AiError(502, `AI 모델을 찾을 수 없어요. GEMINI_MODEL 설정을 확인해 주세요. (404)`);
  if (r.status === 429) throw new AiError(429, "요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요. (429)");
  throw new AiError(503, `AI 서버가 일시적으로 혼잡해요. 잠시 후 다시 시도해 주세요. (${r.status})`);
}

const textOf = (r: GeminiResponse) => r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

/** 스키마를 따르는 JSON 응답을 받습니다. */
export async function generateJson(prompt: string, schema: unknown, timeoutMs = 25000): Promise<unknown> {
  const r = await post({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } }, timeoutMs);
  const text = textOf(r).trim();
  if (!text) throw new AiError(502, "AI가 빈 응답을 보냈어요. 다시 시도해 주세요.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError(502, "AI 응답 형식을 읽지 못했어요. 다시 시도해 주세요.");
  }
}

/** Google 검색을 근거로 한 텍스트 응답과 출처 링크를 받습니다. */
export async function generateGrounded(prompt: string, timeoutMs = 25000): Promise<{ text: string; sources: { title: string; uri: string }[] }> {
  const r = await post({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }, timeoutMs);
  const seen = new Set<string>();
  const sources: { title: string; uri: string }[] = [];
  for (const c of r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    const uri = c.web?.uri;
    if (!uri || seen.has(uri)) continue;
    try {
      if (new URL(uri).protocol !== "https:") continue;
    } catch { continue; }
    seen.add(uri);
    sources.push({ title: (c.web?.title ?? "").slice(0, 120) || "검색 페이지", uri });
  }
  return { text: textOf(r).trim(), sources: sources.slice(0, 6) };
}

export function aiErrorBody(e: unknown): { status: number; body: { error: string; code: string } } {
  if (e instanceof AiError) return { status: e.status, body: { error: e.message, code: e.code } };
  return { status: 500, body: { error: "요청을 처리하는 중 오류가 발생했어요.", code: "FAILED" } };
}
