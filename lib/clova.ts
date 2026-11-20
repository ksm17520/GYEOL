// 네이버 CLOVA Studio(HyperCLOVA X) 호출. 구조화 출력(responseFormat)은 HCX-007에서만 지원됩니다.
export const CLOVA_MODEL = process.env.CLOVA_MODEL || "HCX-007";

export class ClovaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Gemini용 스키마(type이 대문자)를 일반 JSON 스키마(소문자)로 바꿉니다. */
function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : toJsonSchema(v);
  }
  return out;
}

export const clovaConfigured = () => Boolean(process.env.CLOVASTUDIO_API_KEY);

export async function clovaJson(prompt: string, schema: unknown, timeoutMs: number): Promise<unknown> {
  const key = process.env.CLOVASTUDIO_API_KEY;
  if (!key) throw new ClovaError(503, "CLOVA 키가 없습니다.");
  let res: Response;
  try {
    res = await fetch(`https://clovastudio.stream.ntruss.com/v3/chat-completions/${encodeURIComponent(CLOVA_MODEL)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "X-NCP-CLOVASTUDIO-REQUEST-ID": crypto.randomUUID(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        responseFormat: { type: "json", schema: toJsonSchema(schema) },
        thinking: { effort: "none" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new ClovaError(504, "CLOVA 응답이 지연되고 있어요.");
    throw new ClovaError(503, "CLOVA에 연결하지 못했어요.");
  }
  const text = await res.text();
  if (!res.ok) {
    console.error(`[clova] ${CLOVA_MODEL} -> ${res.status} ${text.slice(0, 300)}`);
    throw new ClovaError(res.status, `CLOVA 오류 (${res.status})`);
  }
  let data: { status?: { code?: string }; result?: { message?: { content?: string } } };
  try { data = JSON.parse(text); } catch { throw new ClovaError(502, "CLOVA 응답을 읽지 못했어요."); }
  const content = data.result?.message?.content?.trim();
  if (!content) {
    console.error(`[clova] empty content, status=${data.status?.code}`);
    throw new ClovaError(502, "CLOVA가 빈 응답을 보냈어요.");
  }
  try { return JSON.parse(content); } catch { throw new ClovaError(502, "CLOVA 응답 형식을 읽지 못했어요."); }
}
