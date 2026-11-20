import { EXTENDED_SOURCES, KAKAO_HEADERS, getJson, naverWebtoonSearch, sameTitle, toProxy } from "./cover";

export type WebtoonPlatform = "카카오페이지" | "카카오웹툰" | "네이버웹툰";

/** 플랫폼 검색에서 실제로 찾은 웹툰. AI는 이 목록에서만 고릅니다. */
export type WebtoonCandidate = {
  id: string; // "c1" 형식. AI가 이 값으로 고릅니다.
  title: string;
  creator: string;
  genre: string;
  platforms: WebtoonPlatform[];
  coverImageUrl: string | null;
  /** 완결 여부. 플랫폼이 알려 준 경우에만 true/false, 모르면 undefined */
  finished?: boolean;
  /** 분위기 해시태그·소개(카카오웹툰 상세에서 읽음). AI가 분위기로 고르는 데 씁니다. */
  tags?: string[];
  synopsis?: string;
  /** 플랫폼 인기 지표(카카오페이지 조회수). 같은 플랫폼 안에서 앞에 오게 하는 데만 씁니다. */
  popularity?: number;
  /** 플랫폼별 작품 번호(완결 확인용). 화면에는 쓰지 않습니다. */
  pids?: Partial<Record<WebtoonPlatform, string>>;
};

type Raw = { title: string; creator: string; genre: string; platform: WebtoonPlatform; cover: string | null; pid?: string; done?: boolean; pop?: number };

/** 카카오 검색에서 잘 통하는 장르·분위기 낱말. AI는 제목이 아니라 이 중에서 고릅니다. */
export const WEBTOON_KEYWORDS = ["로맨스", "로맨스 판타지", "판타지", "액션", "스릴러", "미스터리", "드라마", "일상", "힐링", "개그", "무협", "학원", "SF", "공포", "감성", "성장"];
export const FALLBACK_KEYWORDS = ["드라마", "로맨스", "스릴러", "판타지"];

async function kakaoPage(keyword: string, finishedOnly: boolean): Promise<Raw[]> {
  try {
    const d = (await getJson(`https://bff-page.kakao.com/api/gateway/api/v2/search/series?keyword=${encodeURIComponent(keyword)}&category_uid=10&is_complete=${finishedOnly}&sort_type=ACCURACY&page=0&size=25`, { headers: { ...KAKAO_HEADERS, Referer: "https://page.kakao.com/" } }, 4000)) as {
      result?: { list?: { series_id?: number; title?: string; category?: string; sub_category?: string; authors?: string; service_property?: { view_count?: number } }[] };
    };
    return (d.result?.list ?? []).filter((x) => x.title && x.category === "웹툰").sort((a, b) => (b.service_property?.view_count ?? 0) - (a.service_property?.view_count ?? 0)).map((x) => ({ title: x.title as string, creator: String(x.authors ?? ""), genre: String(x.sub_category ?? ""), platform: "카카오페이지" as const, cover: null, pid: String(x.series_id ?? ""), done: finishedOnly ? true : undefined, pop: x.service_property?.view_count }));
  } catch { return []; }
}

async function kakaoWebtoon(keyword: string): Promise<Raw[]> {
  try {
    const d = (await getJson(`https://gateway-kw.kakao.com/search/v2/content?limit=30&offset=0&word=${encodeURIComponent(keyword)}`, { headers: { ...KAKAO_HEADERS, Referer: "https://webtoon.kakao.com/" } }, 4000)) as {
      data?: { content?: { id?: number; title?: string; genre?: string; authors?: { name?: string }[] }[] };
    };
    return (d.data?.content ?? []).filter((x) => x.title).map((x) => ({ title: x.title as string, creator: (x.authors ?? []).map((a) => a.name).filter(Boolean).slice(0, 2).join(", "), genre: String(x.genre ?? ""), platform: "카카오웹툰" as const, cover: null, pid: String(x.id ?? "") }));
  } catch { return []; }
}

async function naver(keyword: string): Promise<Raw[]> {
  const list = await naverWebtoonSearch(keyword);
  return list.filter((x) => x.titleName).map((x) => ({ title: x.titleName as string, creator: "", genre: "", platform: "네이버웹툰" as const, cover: toProxy(x.thumbnailUrl), pid: x.titleId != null ? String(x.titleId) : undefined, done: typeof x.finished === "boolean" ? x.finished : undefined }));
}

type NaverListItem = { titleId?: number | string; titleName?: string; thumbnailUrl?: string; starScore?: number };
const naverRaws = (list: NaverListItem[], finished: boolean): Raw[] =>
  list.filter((x) => x.titleName && x.titleId != null).map((x) => ({ title: x.titleName as string, creator: "", genre: "", platform: "네이버웹툰" as const, cover: toProxy(x.thumbnailUrl), pid: String(x.titleId), done: finished ? true : undefined, pop: x.starScore }));

/**
 * 네이버웹툰은 검색이 제목 글자만 맞춰 주므로, 장르 낱말로는 후보가 거의 없습니다.
 * 그래서 연재 중 요일별 목록(완결만 보기면 완결 목록)에서 별점이 높은 작품을 후보로 함께 넣어 플랫폼 쏠림을 막습니다(비공식 주소).
 */
async function naverTop(finishedOnly: boolean): Promise<Raw[]> {
  try {
    if (finishedOnly) {
      const d = (await getJson("https://comic.naver.com/api/webtoon/titlelist/finished?page=1&order=VIEW", { headers: { Referer: "https://comic.naver.com/" } }, 4000)) as { titleList?: NaverListItem[] };
      return naverRaws((d.titleList ?? []).slice(0, 30), true);
    }
    const d = (await getJson("https://comic.naver.com/api/webtoon/titlelist/weekday?order=user", { headers: { Referer: "https://comic.naver.com/" } }, 4000)) as { titleListMap?: Record<string, NaverListItem[]> };
    const all = Object.values(d.titleListMap ?? {}).flat();
    const seen = new Set<string>();
    const uniq = all.filter((x) => x.titleId != null && !seen.has(String(x.titleId)) && seen.add(String(x.titleId)));
    return naverRaws(uniq.sort((a, b) => (b.starScore ?? 0) - (a.starScore ?? 0)).slice(0, 30), false);
  } catch { return []; }
}

/** 같은 작품(제목이 같음)을 하나로 합치고, 올라 있는 플랫폼을 모읍니다. 실제로 찾은 순서를 지킵니다. */
export function mergeCandidates(raws: Raw[], limit = 40): WebtoonCandidate[] {
  const out: WebtoonCandidate[] = [];
  for (const r of raws) {
    const title = r.title.trim().slice(0, 100);
    if (!title) continue;
    const hit = out.find((c) => sameTitle(c.title, title));
    if (hit) {
      if (!hit.platforms.includes(r.platform)) hit.platforms.push(r.platform);
      if (!hit.coverImageUrl && r.cover) hit.coverImageUrl = r.cover;
      if (!hit.creator && r.creator) hit.creator = r.creator;
      if (!hit.genre && r.genre) hit.genre = r.genre;
      if (r.pop && !hit.popularity) hit.popularity = r.pop;
      if (r.pid) hit.pids = { ...hit.pids, [r.platform]: r.pid };
      if (r.done !== undefined) hit.finished = hit.finished === true || r.done;
    } else if (out.length < limit) {
      out.push({ id: "", title, creator: r.creator.slice(0, 100), genre: r.genre.slice(0, 30), platforms: [r.platform], coverImageUrl: r.cover, pids: r.pid ? { [r.platform]: r.pid } : undefined, finished: r.done, popularity: r.pop });
    }
  }
  return out.map((c, i) => ({ ...c, id: `c${i + 1}` }));
}

type KwDetail = { finished?: boolean; tags: string[]; synopsis: string };
/** 카카오웹툰 상세에서 완결 여부·분위기 해시태그·소개를 읽습니다(비공식). 읽지 못하면 null. */
async function kakaoWebtoonDetail(id: string): Promise<KwDetail | null> {
  try {
    const d = (await getJson(`https://gateway-kw.kakao.com/decorator/v2/decorator/contents/${encodeURIComponent(id)}/profile`, { headers: { ...KAKAO_HEADERS, Referer: "https://webtoon.kakao.com/" } }, 3000)) as { data?: { badges?: { title?: string; type?: string }[]; seoKeywords?: string[]; synopsis?: string } };
    const badges = d.data?.badges;
    return {
      finished: Array.isArray(badges) ? badges.some((b) => b.type === "STATUS" && b.title === "COMPLETED") : undefined,
      tags: (d.data?.seoKeywords ?? []).filter((t) => typeof t === "string").slice(0, 6),
      synopsis: String(d.data?.synopsis ?? "").replace(/\s+/g, " ").slice(0, 80),
    };
  } catch { return null; }
}

/** 네이버웹툰 작품 정보에서 완결 여부·태그·소개를 읽습니다(비공식). 읽지 못하면 null. */
async function naverDetail(id: string): Promise<KwDetail | null> {
  try {
    const d = (await getJson(`https://comic.naver.com/api/article/list/info?titleId=${encodeURIComponent(id)}`, { headers: { Referer: "https://comic.naver.com/" } }, 3000)) as { finished?: boolean; synopsis?: string; curationTagList?: { tagName?: string }[] };
    return {
      finished: typeof d.finished === "boolean" ? d.finished : undefined,
      tags: (d.curationTagList ?? []).map((t) => (t.tagName ? `#${t.tagName.replace(/^#/, "")}` : "")).filter(Boolean).slice(0, 6),
      synopsis: String(d.synopsis ?? "").replace(/\s+/g, " ").slice(0, 80),
    };
  } catch { return null; }
}

/**
 * 후보에 상세 정보를 채웁니다(작품당 한 번, 최대 limit건): 카카오웹툰의 분위기 해시태그·소개·완결 여부, 네이버웹툰의 완결 여부.
 * 요청이 늘어나므로 호출하는 쪽에서 대상 수를 제한합니다.
 */
async function fillDetails(list: WebtoonCandidate[], limit: number, needFinished: boolean): Promise<void> {
  let budget = limit;
  await Promise.all(list.map(async (c) => {
    if (budget <= 0) return;
    const kw = c.pids?.카카오웹툰, nv = c.pids?.네이버웹툰;
    if (!kw && !nv) return;
    budget--;
    const [d1, d2] = await Promise.all([kw ? kakaoWebtoonDetail(kw) : Promise.resolve(null), nv ? naverDetail(nv) : Promise.resolve(null)]);
    for (const d of [d1, d2]) if (d) { if (d.tags.length && !c.tags) c.tags = d.tags; if (d.synopsis && !c.synopsis) c.synopsis = d.synopsis; }
    const fin = [d1?.finished, d2?.finished];
    if (fin.some((x) => x === true)) c.finished = true;
    else if (needFinished && c.finished === undefined && fin.some((x) => x === false)) c.finished = false;
  }));
}

/** 플랫폼이 한쪽으로 쏠리지 않도록, 첫 플랫폼별로 돌아가며 limit개를 고릅니다. */
function balance(list: WebtoonCandidate[], limit: number): WebtoonCandidate[] {
  const groups = new Map<WebtoonPlatform, WebtoonCandidate[]>();
  for (const c of list) groups.set(c.platforms[0], [...(groups.get(c.platforms[0]) ?? []), c]);
  const out: WebtoonCandidate[] = [];
  for (let i = 0; out.length < limit && i < list.length; i++) for (const g of groups.values()) if (g[i] && out.length < limit) out.push(g[i]);
  return out;
}

/**
 * 장르·분위기 낱말로 카카오페이지·카카오웹툰·네이버웹툰을 모두 검색해 실제 웹툰 후보를 모읍니다.
 * 플랫폼에서 찾았다는 것이 곧 '지금 열람 가능'입니다. 비공식 검색 주소라 COVER_EXTENDED_SOURCES가 꺼져 있으면 빈 목록입니다.
 * 어느 한 플랫폼에 치우치지 않게 플랫폼별로 고르게 섞고, 완결작만 보기도 세 플랫폼 모두에서 완결을 확인해 모읍니다.
 * wantedPlatforms가 있으면 그 플랫폼에 올라 있는 작품만 남깁니다.
 */
export async function gatherWebtoonCandidates(keywords: string[], opts: { finishedOnly?: boolean; wantedPlatforms?: string[] } = {}): Promise<WebtoonCandidate[]> {
  if (!EXTENDED_SOURCES) return [];
  const kws = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean))).slice(0, 4);
  if (kws.length === 0) return [];
  const finishedOnly = opts.finishedOnly === true;
  const rounds = await Promise.all([...kws.flatMap((k) => [kakaoPage(k, finishedOnly), kakaoWebtoon(k), naver(k)]), naverTop(finishedOnly)]);
  // 키워드·플랫폼이 골고루 섞이도록 라운드로빈으로 합칩니다.
  const raws: Raw[] = [];
  for (let i = 0; i < 30; i++) for (const r of rounds) if (r[i]) raws.push(r[i]);
  const wanted = (opts.wantedPlatforms ?? []).filter((p): p is WebtoonPlatform => p === "카카오페이지" || p === "카카오웹툰" || p === "네이버웹툰");
  let pool = mergeCandidates(raws, 200);
  if (wanted.length) pool = pool.filter((c) => c.platforms.some((p) => wanted.includes(p)));
  if (finishedOnly) {
    await fillDetails(pool, 36, true);
    pool = pool.filter((c) => c.finished === true);
    return balance(pool, 40).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  }
  // 분위기 정보는 고른 후보 중 카카오웹툰 쪽 일부에만 채웁니다(응답 시간 때문에).
  const picked = balance(pool, 40);
  await fillDetails(picked, 18, false);
  return picked.map((c, i) => ({ ...c, id: `c${i + 1}` }));
}
