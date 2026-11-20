import { clovaConfigured, clovaJson, ClovaError } from "./clova";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

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

const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";

/** Gemini 3 계열은 기본 생각(thinking) 시간이 길어 응답이 늦어지므로 낮춰서 요청합니다. */
function withModelTuning(model: string, body: unknown): unknown {
  if (!model.startsWith("gemini-3") || typeof body !== "object" || body === null) return body;
  const b = body as { generationConfig?: Record<string, unknown> };
  return { ...b, generationConfig: { ...(b.generationConfig ?? {}), thinkingConfig: { thinkingLevel: "low" } } };
}

async function callModel(model: string, body: unknown, timeoutMs: number): Promise<{ ok: true; data: GeminiResponse } | { ok: false; status: number; detail: string }> {
  const key = process.env.GEMINI_API_KEY as string;
  let status = 500;
  let detail = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(withModelTuning(model, body)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { ok: true, data: (await res.json()) as GeminiResponse };
      status = res.status;
      detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[gemini] ${model} -> ${status} ${detail}`);
      if (![500, 503].includes(status)) break; // 429(한도)는 같은 모델로 다시 보내도 소용없고 한도만 더 씁니다
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        console.error(`[gemini] ${model} timeout ${timeoutMs}ms`);
        return { ok: false, status: 504, detail: "timeout" };
      }
      status = 503;
      detail = e instanceof Error ? e.message : "network";
      console.error(`[gemini] ${model} network error: ${detail}`);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: false, status, detail };
}

async function post(body: unknown, timeoutMs: number, models: [string, string] = [MODEL, FALLBACK_MODEL]): Promise<GeminiResponse> {
  if (!process.env.GEMINI_API_KEY) throw new AiError(503, "AI 추천이 아직 설정되지 않았습니다.", "NO_KEY");
  const [primary, fallback] = models;
  let r = await callModel(primary, body, timeoutMs);
  // 기본 모델이 없거나(404) 과부하(429·500·503)일 때 보조 모델로 한 번 더 시도합니다.
  if (!r.ok && [404, 429, 500, 503, 504].includes(r.status) && fallback && fallback !== primary) {
    const second = await callModel(fallback, body, Math.min(timeoutMs, 20000));
    if (second.ok) return second.data;
    r = r.status === 404 || r.status === 504 ? second : r;
  }
  if (r.ok) return r.data;
  if ([400, 401, 403].includes(r.status)) throw new AiError(502, `AI 설정(API 키·모델)을 확인해 주세요. (${r.status})`);
  if (r.status === 404) throw new AiError(502, `AI 모델을 찾을 수 없어요. GEMINI_MODEL 설정을 확인해 주세요. (404)`);
  if (r.status === 504) throw new AiError(504, "AI 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
  if (r.status === 429) throw new AiError(429, "AI 사용 한도에 도달했어요. 1분쯤 뒤에 다시 시도해 주세요. (429)");
  throw new AiError(503, `AI 서버가 일시적으로 혼잡해요. 잠시 후 다시 시도해 주세요. (${r.status})`);
}

const textOf = (r: GeminiResponse) => r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

async function geminiJson(prompt: string, schema: unknown, timeoutMs: number): Promise<unknown> {
  const r = await post({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } }, timeoutMs);
  const text = textOf(r).trim();
  if (!text) throw new AiError(502, "AI가 빈 응답을 보냈어요. 다시 시도해 주세요.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError(502, "AI 응답 형식을 읽지 못했어요. 다시 시도해 주세요.");
  }
}

/**
 * 스키마를 따르는 JSON 응답을 받습니다.
 * AI_PROVIDERS(쉼표 구분, 기본 "gemini,clova") 순서대로, 키가 설정된 제공자를 차례로 시도하고
 * 앞 제공자가 실패하면 다음 제공자로 넘어갑니다. gemini=Google, clova=네이버 HyperCLOVA X.
 */
export async function generateJson(prompt: string, schema: unknown, timeoutMs = 40000): Promise<unknown> {
  const order = (process.env.AI_PROVIDERS || "gemini,clova").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const available = order.filter((p) => (p === "gemini" && process.env.GEMINI_API_KEY) || (p === "clova" && clovaConfigured()));
  if (available.length === 0) throw new AiError(503, "AI 추천이 아직 설정되지 않았습니다.", "NO_KEY");
  const perTry = available.length > 1 ? Math.min(timeoutMs, 25000) : timeoutMs;
  let firstError: AiError | null = null;
  for (const p of available) {
    try {
      return p === "gemini" ? await geminiJson(prompt, schema, perTry) : await clovaJson(prompt, schema, perTry);
    } catch (e) {
      console.error(`[ai] ${p} 실패`, e instanceof Error ? e.message : e);
      if (!firstError) firstError = e instanceof AiError ? e : new AiError(e instanceof ClovaError && e.status === 429 ? 429 : 503, e instanceof ClovaError && e.status === 429 ? "AI 사용 한도에 도달했어요. 1분쯤 뒤에 다시 시도해 주세요. (429)" : "AI 서버가 일시적으로 혼잡해요. 잠시 후 다시 시도해 주세요.");
    }
  }
  throw firstError as AiError;
}

/** Google 검색을 근거로 한 텍스트 응답과 출처 링크를 받습니다. */
/** 검색 근거(Google 검색) 호출용 모델. 무료 등급은 Gemini 3 계열의 검색 근거 한도가 0이라 2.5 계열을 씁니다. */
const GROUNDING_MODELS: [string, string] = [process.env.GEMINI_GROUNDING_MODEL || "gemini-2.5-flash", process.env.GEMINI_GROUNDING_FALLBACK_MODEL || "gemini-2.5-flash-lite"];

export async function generateGrounded(prompt: string, timeoutMs = 25000): Promise<{ text: string; sources: { title: string; uri: string }[] }> {
  const r = await post({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }, timeoutMs, GROUNDING_MODELS);
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
