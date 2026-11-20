// 단순 메모리 기반 호출 제한입니다. 서버리스에서는 인스턴스별로 따로 계산되므로
// 완전한 방어는 아니며, 트래픽이 늘면 Upstash Redis 기반 제한으로 교체하세요.
const hits = new Map<string, number[]>();

export function rateLimited(req: Request, bucket: string, limit: number, windowMs = 60_000): boolean {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "anon";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return false;
}
