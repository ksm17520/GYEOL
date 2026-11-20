import { getJson } from "./cover";

export type ScreenKind = "film" | "drama";
export type Availability = "available" | "discontinued";

/** TMDB에서 찾은 실존 영화·드라마. AI는 이 목록에서만 고릅니다. */
export type ScreenCandidate = {
  id: string; // "m1" 형식 (영화 m, 드라마 d). AI가 이 값으로 고릅니다.
  tmdbId: number;
  kind: ScreenKind;
  title: string;
  originalTitle: string;
  year: string;
  genres: string;
  overview: string;
  posterUrl: string | null;
  /** 지금 한국에서 볼 수 있는 OTT 이름. 비어 있으면 서비스 중단으로 봅니다. */
  otts: string[];
  availability: Availability;
};

const TMDB = "https://api.themoviedb.org/3";
const key = () => process.env.TMDB_API_KEY;

/** 서비스에서 지원하는 OTT와 TMDB 제공처 이름 대응 */
const OTT_MAP: { name: string; re: RegExp }[] = [
  { name: "넷플릭스", re: /netflix/i },
  { name: "티빙", re: /tving/i },
  { name: "웨이브", re: /wavve/i },
  { name: "왓챠", re: /watcha/i },
  { name: "쿠팡플레이", re: /coupang/i },
  { name: "Apple TV+", re: /apple tv/i },
];
export const ottNameOf = (tmdbName: string): string | null => OTT_MAP.find((o) => o.re.test(tmdbName))?.name ?? null;

type ProviderRow = { provider_id: number; provider_name: string };
const providerCache = new Map<ScreenKind, { at: number; map: Map<string, number[]> }>();

/** 한국 OTT별 TMDB 제공처 번호 (같은 OTT의 광고형 요금제 등 여러 번호를 모읍니다). 1시간 캐시. */
async function providerIds(kind: ScreenKind): Promise<Map<string, number[]>> {
  const hit = providerCache.get(kind);
  if (hit && Date.now() - hit.at < 3600_000) return hit.map;
  const d = (await getJson(`${TMDB}/watch/providers/${kind === "film" ? "movie" : "tv"}?api_key=${encodeURIComponent(key() as string)}&watch_region=KR&language=ko-KR`, {}, 4000)) as { results?: ProviderRow[] };
  const map = new Map<string, number[]>();
  for (const r of d.results ?? []) {
    const name = ottNameOf(r.provider_name);
    if (name) map.set(name, [...(map.get(name) ?? []), r.provider_id]);
  }
  providerCache.set(kind, { at: Date.now(), map });
  return map;
}

const MOVIE_GENRE: Record<string, number> = { 액션: 28, 모험: 12, 애니: 16, 코미디: 35, 범죄: 80, 드라마: 18, 가족: 10751, 판타지: 14, 역사: 36, 공포: 27, 음악: 10402, 미스터리: 9648, 로맨스: 10749, SF: 878, 스릴러: 53, 전쟁: 10752 };
const TV_GENRE: Record<string, number> = { 액션: 10759, 모험: 10759, 애니: 16, 코미디: 35, 범죄: 80, 드라마: 18, 가족: 10751, 판타지: 10765, 미스터리: 9648, SF: 10765, 로맨스: 18, 스릴러: 9648, 전쟁: 10768 };

/** 분위기·상황 낱말 → 장르 이름 (AI 호출 없이 규칙으로 고릅니다) */
const GENRE_RULES: [RegExp, string[]][] = [
  [/서늘|치밀|심리|내면|미스터리|추리/, ["스릴러", "미스터리", "범죄"]],
  [/따뜻|위로|잔잔|힐링|편안/, ["드라마", "가족", "로맨스"]],
  [/세계관|스케일|판타지|모험/, ["판타지", "SF", "모험"]],
  [/여운|시적|감성|쓸쓸|서정/, ["드라마", "로맨스"]],
  [/위트|경쾌|웃|코믹|가볍/, ["코미디"]],
  [/도파민|강렬|액션|전개|짜릿/, ["액션", "스릴러"]],
  [/청춘|성장|학원|학교/, ["드라마", "코미디"]],
  [/로맨스|연애|사랑|설렘|연인/, ["로맨스"]],
  [/공포|무서|오싹/, ["공포"]],
];
export function pickGenres(context: string): string[] {
  const out: string[] = [];
  for (const [re, gs] of GENRE_RULES) if (re.test(context)) for (const g of gs) if (!out.includes(g)) out.push(g);
  return out.length ? out.slice(0, 4) : ["드라마", "스릴러", "로맨스"];
}

type Row = {
  id: number; title?: string; name?: string; original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string; overview?: string; genre_ids?: number[]; poster_path?: string | null;
  vote_average?: number; vote_count?: number;
};

const GENRE_LABEL: Record<number, string> = { 28: "액션", 12: "모험", 16: "애니", 35: "코미디", 80: "범죄", 18: "드라마", 10751: "가족", 14: "판타지", 36: "역사", 27: "공포", 10402: "음악", 9648: "미스터리", 10749: "로맨스", 878: "SF", 53: "스릴러", 10752: "전쟁", 10759: "액션·모험", 10765: "SF·판타지", 10768: "전쟁·정치" };

function eraParams(era: string, kind: ScreenKind): string {
  const f = kind === "film" ? "primary_release_date" : "first_air_date";
  const y = new Date().getFullYear();
  if (era === "recent5") return `&${f}.gte=${y - 5}-01-01`;
  if (era === "since2010") return `&${f}.gte=2010-01-01`;
  if (era === "classic") return `&${f}.lte=2009-12-31`;
  return "";
}

const toCand = (r: Row, kind: ScreenKind, otts: string[], availability: Availability): Omit<ScreenCandidate, "id"> => ({
  tmdbId: r.id,
  kind,
  title: String(r.title ?? r.name ?? "").slice(0, 100),
  originalTitle: String(r.original_title ?? r.original_name ?? "").slice(0, 100),
  year: String(r.release_date ?? r.first_air_date ?? "").slice(0, 4),
  genres: (r.genre_ids ?? []).map((g) => GENRE_LABEL[g]).filter(Boolean).slice(0, 3).join("·"),
  overview: String(r.overview ?? "").replace(/\s+/g, " ").slice(0, 70),
  posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
  otts,
  availability,
});

async function discover(kind: ScreenKind, genreIds: number[], era: string, extra: string): Promise<Row[]> {
  const path = kind === "film" ? "movie" : "tv";
  const g = genreIds.length ? `&with_genres=${genreIds.join("|")}` : "";
  const d = (await getJson(`${TMDB}/discover/${path}?api_key=${encodeURIComponent(key() as string)}&language=ko-KR&watch_region=KR&sort_by=popularity.desc&vote_count.gte=100&vote_average.gte=6.3&include_adult=false${g}${eraParams(era, kind)}${extra}`, {}, 4000)) as { results?: Row[] };
  return (d.results ?? []).filter((r) => r.id && (r.title || r.name));
}

/** 작품별 한국 제공 정보. otts는 우리가 지원하는 OTT, any는 어떤 방식으로든 한국에서 볼 수 있는지 */
export async function koreaProviders(kind: ScreenKind, tmdbId: number): Promise<{ otts: string[]; any: boolean } | null> {
  try {
    const d = (await getJson(`${TMDB}/${kind === "film" ? "movie" : "tv"}/${tmdbId}/watch/providers?api_key=${encodeURIComponent(key() as string)}`, {}, 3000)) as {
      results?: { KR?: { flatrate?: ProviderRow[]; rent?: ProviderRow[]; buy?: ProviderRow[]; ads?: ProviderRow[] } };
    };
    const kr = d.results?.KR;
    const flat = kr?.flatrate ?? [];
    const otts = Array.from(new Set(flat.map((p) => ottNameOf(p.provider_name)).filter((x): x is string => Boolean(x))));
    return { otts, any: flat.length + (kr?.rent?.length ?? 0) + (kr?.buy?.length ?? 0) + (kr?.ads?.length ?? 0) > 0 };
  } catch { return null; }
}

/** 같은 작품은 하나로 합치고 올라 있는 OTT를 모읍니다. */
function mergeRows(rows: { c: Omit<ScreenCandidate, "id"> }[]): Omit<ScreenCandidate, "id">[] {
  const m = new Map<number, Omit<ScreenCandidate, "id">>();
  for (const { c } of rows) {
    const hit = m.get(c.tmdbId);
    if (hit) hit.otts = Array.from(new Set([...hit.otts, ...c.otts]));
    else m.set(c.tmdbId, { ...c, otts: [...c.otts] });
  }
  return Array.from(m.values());
}

/** OTT마다 번갈아 가며 limit개를 고릅니다(특정 OTT에 쏠리지 않게). 첫 OTT 기준으로 묶습니다. */
function balanceByOtt(list: Omit<ScreenCandidate, "id">[], ottOrder: string[], limit: number): Omit<ScreenCandidate, "id">[] {
  const q = new Map<string, Omit<ScreenCandidate, "id">[]>(ottOrder.map((o) => [o, []]));
  for (const c of list) { const first = ottOrder.find((o) => c.otts.includes(o)); if (first) q.get(first)?.push(c); }
  const out: Omit<ScreenCandidate, "id">[] = [];
  for (let i = 0; out.length < limit && i < list.length; i++) for (const o of ottOrder) { const c = q.get(o)?.[i]; if (c && out.length < limit) out.push(c); }
  return out;
}

/**
 * 한국 OTT 제공 목록(TMDB·JustWatch 정보)에서 영화·드라마 후보를 OTT별로 같은 수만큼 모으고,
 * 지금 어느 OTT에서도 볼 수 없는 인기작은 `서비스 중단` 후보로 소수 덧붙입니다. TMDB_API_KEY가 없거나 실패하면 빈 목록입니다.
 */
export async function gatherScreenCandidates(
  media: ScreenKind[],
  context: string,
  opts: { era?: string; wantedOtts?: string[] } = {},
): Promise<ScreenCandidate[]> {
  if (!key() || media.length === 0) return [];
  const genres = pickGenres(context);
  const era = opts.era ?? "all";
  const wanted = (opts.wantedOtts ?? []).filter((n) => OTT_MAP.some((o) => o.name === n));
  const out: ScreenCandidate[] = [];
  let seq = 0;
  await Promise.all(media.map(async (kind) => {
    try {
      const gmap = kind === "film" ? MOVIE_GENRE : TV_GENRE;
      const gids = Array.from(new Set(genres.map((g) => gmap[g]).filter((x): x is number => typeof x === "number")));
      const ids = await providerIds(kind);
      const ottNames = OTT_MAP.map((o) => o.name).filter((n) => ids.has(n) && (wanted.length === 0 || wanted.includes(n)));
      const perOtt = await Promise.all(ottNames.map(async (n) => {
        try {
          const rows = await discover(kind, gids, era, `&with_watch_providers=${(ids.get(n) as number[]).join("|")}&with_watch_monetization_types=flatrate`);
          return rows.slice(0, 12).map((r) => ({ c: toCand(r, kind, [n], "available") }));
        } catch { return []; }
      }));
      const merged = mergeRows(perOtt.flat());
      const balanced = balanceByOtt(merged, ottNames, 18);
      // 서비스 중단 후보: 장르에 맞는 평점 높은 작품 중 한국에서 볼 방법이 전혀 없는 것 (뒤로 미루고 최대 2편)
      let gone: Omit<ScreenCandidate, "id">[] = [];
      if (wanted.length === 0) {
        try {
          const rows = (await discover(kind, gids, era, "&sort_by=vote_average.desc&vote_count.gte=800")).slice(0, 14);
          const known = new Set(balanced.map((b) => b.tmdbId));
          const checks = await Promise.all(rows.filter((r) => !known.has(r.id)).map(async (r) => ({ r, p: await koreaProviders(kind, r.id) })));
          gone = checks.filter((x) => x.p && !x.p.any).slice(0, 3).map((x) => toCand(x.r, kind, [], "discontinued"));
        } catch { /* 중단 후보는 없이 진행 */ }
      }
      for (const c of [...balanced, ...gone]) out.push({ ...c, id: `${kind === "film" ? "m" : "d"}${++seq}` });
    } catch { /* 이 매체는 후보 없이 → 기존 방식 */ }
  }));
  return out;
}

/** 확정한 작품의 감독·주연·극중 인물을 TMDB 출연진 정보에서 읽습니다(AI 추측이 아님). */
export async function creditsOf(kind: ScreenKind, tmdbId: number): Promise<{ creator: string; cast: string[]; characters: string[] } | null> {
  try {
    const path = kind === "film" ? "movie" : "tv";
    const [cr, detail] = await Promise.all([
      getJson(`${TMDB}/${path}/${tmdbId}/credits?api_key=${encodeURIComponent(key() as string)}&language=ko-KR`, {}, 3000) as Promise<{ cast?: { name?: string; character?: string }[]; crew?: { name?: string; job?: string }[] }>,
      kind === "drama" ? (getJson(`${TMDB}/tv/${tmdbId}?api_key=${encodeURIComponent(key() as string)}&language=ko-KR`, {}, 3000) as Promise<{ created_by?: { name?: string }[] }>) : Promise.resolve(null),
    ]);
    const top = (cr.cast ?? []).filter((c) => c.name).slice(0, 4);
    const director = kind === "film" ? cr.crew?.find((c) => c.job === "Director")?.name : detail?.created_by?.[0]?.name;
    return {
      creator: String(director ?? "").slice(0, 100),
      cast: top.map((c) => c.name as string).slice(0, 4),
      characters: top.filter((c) => c.character).map((c) => `${String(c.character).slice(0, 30)}(${c.name})`).slice(0, 4),
    };
  } catch { return null; }
}
