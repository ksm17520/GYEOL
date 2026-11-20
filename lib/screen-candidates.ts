import { getJson } from "./cover";
import { kmdbMovie } from "./kmdb";

export type ScreenKind = "film" | "drama";
export type Availability = "available" | "discontinued";

/** TMDB에서 찾은 실존 영화·시리즈. AI는 이 목록에서만 고릅니다. */
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
  /** 영화: KMDb의 장르·관람등급·키워드·줄거리(추천 근거 보강). 없으면 빈 문자열 */
  kmdb?: string;
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
  [/애니|만화|지브리|디즈니|픽사/, ["애니"]],
  [/서늘|치밀|심리|내면|미스터리|추리/, ["스릴러", "미스터리", "범죄"]],
  [/따뜻|위로|잔잔|힐링|편안/, ["드라마", "가족", "애니", "로맨스"]],
  [/세계관|스케일|판타지|모험/, ["판타지", "SF", "애니", "모험"]],
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
  overview: String(r.overview ?? "").replace(/\s+/g, " ").slice(0, 110),
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
 * 한국 OTT 제공 목록(TMDB·JustWatch 정보)에서 영화·시리즈 후보를 OTT별로 같은 수만큼 모으고,
 * 지금 어느 OTT에서도 볼 수 없는 인기작은 `서비스 중단` 후보로 소수 덧붙입니다. TMDB_API_KEY가 없거나 실패하면 빈 목록입니다.
 */
export async function gatherScreenCandidates(
  media: ScreenKind[],
  context: string,
  opts: { era?: string; wantedOtts?: string[]; /** 시리즈만: 방영 중(ongoing)·종영(finished) */ status?: "ongoing" | "finished" } = {},
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
      // 시리즈의 방영 상태: TMDB with_status 0=방영 중(Returning Series), 3=종영(Ended).
      // 시즌 사이에 쉬는 작품도 Returning Series라서, 방영 중은 최근 45일 안에 방영분이 있는 작품만,
      // 종영은 Ended + 시즌 사이에 쉬는 작품(Returning이지만 최근 방영분 없음)으로 나눕니다.
      const recent = new Date(Date.now() - 45 * DAY).toISOString().slice(0, 10);
      const airingParam = `&with_status=0&air_date.gte=${recent}`;
      const statusParam = kind === "drama" && opts.status ? (opts.status === "ongoing" ? airingParam : "&with_status=0|3") : "";
      const dropAiring = kind === "drama" && opts.status === "finished";
      const perOtt = await Promise.all(ottNames.map(async (n) => {
        try {
          const base = `&with_watch_providers=${(ids.get(n) as number[]).join("|")}&with_watch_monetization_types=flatrate`;
          let rows = await discover(kind, gids, era, `${base}${statusParam}`);
          if (dropAiring) {
            const airing = new Set((await discover(kind, gids, era, `${base}${airingParam}`).catch(() => [])).map((r) => r.id));
            rows = rows.filter((r) => !airing.has(r.id));
          }
          return rows.slice(0, 12).map((r) => ({ c: toCand(r, kind, [n], "available") }));
        } catch { return []; }
      }));
      const merged = mergeRows(perOtt.flat());
      const balanced = balanceByOtt(merged, ottNames, 18);
      // 서비스 중단 후보: 장르에 맞는 평점 높은 작품 중 한국에서 볼 방법이 전혀 없는 것 (뒤로 미루고 최대 2편)
      let gone: Omit<ScreenCandidate, "id">[] = [];
      if (wanted.length === 0 && !(kind === "drama" && opts.status === "ongoing")) {
        try {
          const rows = (await discover(kind, gids, era, `&sort_by=vote_average.desc&vote_count.gte=800${dropAiring ? "&with_status=3" : statusParam}`)).slice(0, 14);
          const known = new Set(balanced.map((b) => b.tmdbId));
          const checks = await Promise.all(rows.filter((r) => !known.has(r.id)).map(async (r) => ({ r, p: await koreaProviders(kind, r.id) })));
          gone = checks.filter((x) => x.p && !x.p.any).slice(0, 3).map((x) => toCand(x.r, kind, [], "discontinued"));
        } catch { /* 중단 후보는 없이 진행 */ }
      }
      // 국내 개봉 영화는 KMDb 정보를 덧붙여 AI가 고를 근거를 늘립니다(KMDB_API_KEY가 있을 때만, 실패하면 건너뜀).
      if (kind === "film" && process.env.KMDB_API_KEY) {
        const list = [...balanced, ...gone];
        const queue = [...list];
        await Promise.all(Array.from({ length: 6 }, async () => {
          for (let c = queue.shift(); c; c = queue.shift()) {
            const r = await kmdbMovie(c.title, c.year, c.originalTitle ? [c.originalTitle] : []);
            if (r.movie?.brief) c.kmdb = r.movie.brief;
          }
        }));
      }
      for (const c of [...balanced, ...gone]) out.push({ ...c, id: `${kind === "film" ? "m" : "d"}${++seq}` });
    } catch { /* 이 매체는 후보 없이 → 기존 방식 */ }
  }));
  return out;
}

const HANGUL = /[가-힯]/;
const koCache = new Map<number, string>();
/** 인물 이름을 한글로. 이미 한글이면 그대로, 아니면 TMDB 인물 정보(ko-KR)의 한글 이름·다른 이름에서 찾고, 없으면 원래 이름을 씁니다. */
async function koName(id: number | undefined, name: string): Promise<string> {
  if (!id || HANGUL.test(name)) return name;
  const hit = koCache.get(id);
  if (hit !== undefined) return hit;
  let out = name;
  try {
    const p = (await getJson(`${TMDB}/person/${id}?api_key=${encodeURIComponent(key() as string)}&language=ko-KR`, {}, 2500)) as { name?: string; also_known_as?: string[] };
    out = (p.name && HANGUL.test(p.name) ? p.name : (p.also_known_as ?? []).find((n) => HANGUL.test(n) && !/\s{2,}/.test(n))) || name;
  } catch { return name; } // 일시 오류는 캐시하지 않습니다
  if (koCache.size >= 2000) koCache.clear();
  koCache.set(id, out);
  return out;
}
type Person = { id?: number; name?: string };
const koNames = async (list: Person[], n: number): Promise<string> => {
  const seen = new Set<number | string>();
  const uniq = list.filter((p) => p.name && !seen.has(p.id ?? p.name) && seen.add(p.id ?? p.name)).slice(0, n);
  return names(await Promise.all(uniq.map((p) => koName(p.id, p.name as string))), n);
};
const keepCharacter = (character: string | undefined) => Boolean(character);

export type ScreenDetails = { /** 확인용: 영화 감독·배우를 KMDb에서 가져왔는지(ok) 또는 이유 */ kmdb?: string; /** TMDB의 원제(보관함에 저장해 다음 조회에 쓰임) */ originalTitle?: string; creator: string; cast: string[]; characters: string[]; lengthInfo: string; completionStatus: string };

const DAY = 86400_000;
let nowPlaying: { at: number; ids: Set<number> } | null = null;

/** 지금 한국 극장에서 상영 중인 영화 번호들(재개봉 포함). 30분 캐시. 실패하면 null(상영 여부를 모름). */
async function nowPlayingIds(): Promise<Set<number> | null> {
  if (nowPlaying && Date.now() - nowPlaying.at < 30 * 60_000) return nowPlaying.ids;
  try {
    const pages = await Promise.all([1, 2, 3].map((p) => getJson(`${TMDB}/movie/now_playing?api_key=${encodeURIComponent(key() as string)}&region=KR&language=ko-KR&page=${p}`, {}, 3500) as Promise<{ results?: { id: number }[] }>));
    const ids = new Set(pages.flatMap((d) => (d.results ?? []).map((r) => r.id)));
    nowPlaying = { at: Date.now(), ids };
    return ids;
  } catch { return null; }
}

type Crew = { id?: number; name?: string; job?: string; department?: string; total_episode_count?: number; jobs?: { job?: string; episode_count?: number }[] };
const names = (list: (string | undefined)[], n: number) => Array.from(new Set(list.filter((x): x is string => Boolean(x)))).slice(0, n).join(", ").slice(0, 100);

/**
 * 확정한 작품의 감독·출연진과 상영·방영 상태를 TMDB에서 읽습니다(AI 추측이 아님).
 * 감독이 비지 않도록 여러 곳을 차례로 찾습니다: 영화=크레딧의 Director→연출 부서, 드라마=에피소드 연출(많이 맡은 순)→만든 사람→크레딧의 Director.
 * 상태: 영화는 상영 중/재개봉/개봉연도, 드라마는 방영 중 또는 N부작·방영 시작 연도.
 */
export async function screenDetails(kind: ScreenKind, tmdbId: number): Promise<ScreenDetails | null> {
  const k = encodeURIComponent(key() as string);
  const path = kind === "film" ? "movie" : "tv";
  try {
    const credits = getJson(`${TMDB}/${path}/${tmdbId}/credits?api_key=${k}&language=ko-KR`, {}, 3000) as Promise<{ cast?: { id?: number; name?: string; character?: string }[]; crew?: Crew[] }>;
    if (kind === "film") {
      const [cr, detail, rel, playing] = await Promise.all([
        credits,
        getJson(`${TMDB}/movie/${tmdbId}?api_key=${k}&language=ko-KR`, {}, 3000) as Promise<{ runtime?: number; release_date?: string; title?: string; original_title?: string }>,
        getJson(`${TMDB}/movie/${tmdbId}/release_dates?api_key=${k}`, {}, 3000).catch(() => null) as Promise<{ results?: { iso_3166_1?: string; release_dates?: { type?: number; release_date?: string }[] }[] } | null>,
        nowPlayingIds(),
      ]);
      const top = (cr.cast ?? []).filter((c) => c.name).slice(0, 4);
      const crew = cr.crew ?? [];
      const directors = crew.filter((c) => c.job === "Director");
      const [tmdbCreator, tmdbCast, nvr] = await Promise.all([koNames(directors.length ? directors : crew.filter((c) => c.department === "Directing"), 2), Promise.all(top.map((c) => koName(c.id, c.name as string))), kmdbMovie(detail.title ?? "", String(detail.release_date ?? "").slice(0, 4), detail.original_title ? [detail.original_title] : [])]);
      const nv = nvr.movie;
      // 국내 개봉작은 KMDb(한국영상자료원)의 한글 감독·배우를 우선하고, 없으면 TMDB 정보를 씁니다.
      const creator = nv?.directors.length ? nv.directors.slice(0, 2).join(", ") : tmdbCreator;
      const castKo = top.map((c, i) => tmdbCast[i]);
      const castShown = nv?.actors.length ? nv.actors.slice(0, 4) : castKo;
      // 한국 극장 개봉일(2=제한 개봉, 3=극장 개봉) 중 가장 이른 날이 최초 개봉, 없으면 세계 개봉일
      const krDates = (rel?.results?.find((r) => r.iso_3166_1 === "KR")?.release_dates ?? []).filter((d) => (d.type === 2 || d.type === 3) && d.release_date).map((d) => Date.parse(d.release_date as string)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
      const first = krDates[0] ?? Date.parse(detail.release_date ?? "");
      // 한국 개봉일이 TMDB에 없으면 KMDb의 국내 개봉 연도를 먼저 쓰고, 그것도 없으면 TMDB의 세계 개봉 연도를 씁니다.
      const year = krDates.length === 0 && nv?.year ? nv.year : Number.isNaN(first) || first === undefined ? String(detail.release_date ?? "").slice(0, 4) : String(new Date(first).getUTCFullYear());
      const isPlaying = playing?.has(tmdbId) === true;
      const reopened = isPlaying && !Number.isNaN(first) && first !== undefined && Date.now() - first > 365 * DAY;
      return {
        kmdb: nvr.status,
        originalTitle: String(detail.original_title ?? "").slice(0, 100),
        creator,
        cast: castShown,
        // 극중 이름은 TMDB 표기(KMDb는 극중 이름을 주지 않음). 배우 이름은 위에서 정한 한글 표기와 맞춥니다.
        characters: top.flatMap((c, i) => (keepCharacter(c.character) ? [`${String(c.character).slice(0, 30)}(${castKo[i]})`] : [])),
        lengthInfo: detail.runtime ? `${detail.runtime}분` : nv?.runtime ? `${nv.runtime}분` : "",
        completionStatus: isPlaying ? (reopened ? "재개봉" : "상영중") : year,
      };
    }
    const [cr, detail, agg] = await Promise.all([
      credits,
      getJson(`${TMDB}/tv/${tmdbId}?api_key=${k}&language=ko-KR`, {}, 3000) as Promise<{ created_by?: Person[]; original_name?: string; original_language?: string; status?: string; number_of_episodes?: number; number_of_seasons?: number; first_air_date?: string; last_air_date?: string; next_episode_to_air?: unknown }>,
      getJson(`${TMDB}/tv/${tmdbId}/aggregate_credits?api_key=${k}&language=ko-KR`, {}, 3000).catch(() => null) as Promise<{ crew?: Crew[] } | null>,
    ]);
    const top = (cr.cast ?? []).filter((c) => c.name).slice(0, 4);
    const directors = (agg?.crew ?? []).filter((c) => (c.jobs ?? []).some((j) => /director/i.test(j.job ?? ""))).sort((a, b) => (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0));
    const crewDirectors = (cr.crew ?? []).filter((c) => c.job === "Director");
    const [creator, castKo] = await Promise.all([koNames(directors.length ? directors : (detail.created_by ?? []).length ? (detail.created_by as Person[]) : crewDirectors, 2), Promise.all(top.map((c) => koName(c.id, c.name as string)))]);
    const last = Date.parse(detail.last_air_date ?? "");
    const airing = Boolean(detail.next_episode_to_air) || (detail.status === "Returning Series" && !Number.isNaN(last) && Date.now() - last < 45 * DAY);
    const seasons = detail.number_of_seasons ?? 0, eps = detail.number_of_episodes ?? 0;
    return {
      originalTitle: String(detail.original_name ?? "").slice(0, 100),
      creator,
      cast: castKo,
      characters: top.flatMap((c, i) => (keepCharacter(c.character) ? [`${String(c.character).slice(0, 30)}(${castKo[i]})`] : [])),
      lengthInfo: seasons > 1 ? `${seasons}시즌` : eps ? `${eps}부작` : "",
      completionStatus: airing ? "방영 중" : String(detail.first_air_date ?? "").slice(0, 4),
    };
  } catch { return null; }
}

const norm = (v: string) => v.toLowerCase().replace(/[\s'"‘’“”·:：,.!?\-–—_()[\]]+/g, "");

/**
 * 보관함에 저장된 제목·연도로 TMDB 작품 번호를 찾습니다. 제목이 같고(저장된 제목·원제·영문 제목 중 하나) 연도가 ±1년 이내일 때만 인정해 엉뚱한 작품과 섞이지 않게 합니다.
 * 연도가 저장돼 있지 않으면 제목이 정확히 같은 가장 인기 있는 작품을 고릅니다.
 */
export async function findScreenId(kind: ScreenKind, title: string, year: string, alt: string[] = []): Promise<number | null> {
  return (await findScreen(kind, title, year, alt)).id;
}

/** findScreenId와 같지만, 어떻게 찾았는지(또는 못 찾은 이유와 검색 결과 상위 항목)를 `match`에 함께 돌려줍니다(확인용). */
export async function findScreen(kind: ScreenKind, title: string, year: string, alt: string[] = []): Promise<{ id: number | null; match: string }> {
  if (!key()) return { id: null, match: "no-key" };
  const path = kind === "film" ? "movie" : "tv";
  const parts = title.split(/\s+[-–]\s+|\s*[:：]\s*/).map((x) => x.replace(/^['"‘“]+|['"’”]+$/g, "").trim()).filter(Boolean);
  const queries = Array.from(new Set([title, ...parts, ...alt].map((x) => x.trim()).filter(Boolean))).slice(0, 4);
  const wanted = new Set(queries.map(norm));
  const y0 = Number(year) || 0;
  type Hit = { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; popularity?: number };
  const yearOf = (r: Hit) => (r.release_date || r.first_air_date || "").slice(0, 4);
  const label = (r: Hit) => `${r.title || r.name || "?"}/${r.original_title || r.original_name || "?"}(${yearOf(r) || "?"})`;
  const log: string[] = [];
  let firstTop: Hit | null = null; // 저장된 제목으로 검색한 결과의 1위(표기가 달라 정확히 같은 제목을 못 찾을 때의 후보)
  for (const q of queries) {
    try {
      const d = (await getJson(`${TMDB}/search/${path}?api_key=${encodeURIComponent(key() as string)}&language=ko-KR&include_adult=false&query=${encodeURIComponent(q)}`, {}, 3500)) as { results?: Hit[] };
      if (q === queries[0]) firstTop = (d.results ?? [])[0] ?? null;
      log.push(`"${q}"→${(d.results ?? []).slice(0, 3).map(label).join(" | ") || "결과 없음"}`);
      const hits = (d.results ?? []).slice(0, 10).filter((r) => [r.title, r.name, r.original_title, r.original_name].some((n) => n && wanted.has(norm(n))));
      const ok = hits.filter((r) => {
        const y = Number(yearOf(r)) || 0;
        return !y0 || !y || Math.abs(y - y0) <= 1;
      }).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      if (ok[0]) return { id: ok[0].id, match: `exact "${q}"→${label(ok[0])}` };
    } catch { log.push(`"${q}"→검색 실패`); }
  }
  // 정확히 같은 제목이 없으면, 검색 1위이고 연도가 정확히 같은 작품만 인정합니다(띄어쓰기·표기 차이 대응).
  // 한쪽 제목이 다른 쪽을 포함하는 경우('계시록'과 '청춘계시록')는 다른 작품일 수 있어 인정하지 않습니다.
  const top = firstTop as Hit | null;
  if (top && y0) {
    const w = norm(title);
    const confusable = [top.title, top.name, top.original_title, top.original_name].some((n) => { const a = n ? norm(n) : ""; return a && a !== w && (a.includes(w) || w.includes(a)); });
    if (Number(yearOf(top)) === y0 && !confusable) return { id: top.id, match: `top ${label(top)}` };
    return { id: null, match: `none(저장 연도 ${y0}, 1위 ${label(top)}, ${confusable ? "제목 포함 관계라 제외" : Number(yearOf(top)) === y0 ? "" : "연도 불일치"}) ${log.join(" ; ")}` };
  }
  return { id: null, match: `none(${y0 ? "검색 결과 없음" : "저장 연도 없음"}) ${log.join(" ; ")}` };
}
