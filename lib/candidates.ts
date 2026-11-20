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
  /** 플랫폼별 작품 번호(완결 확인용). 화면에는 쓰지 않습니다. */
  pids?: Partial<Record<WebtoonPlatform, string>>;
};

type Raw = { title: string; creator: string; genre: string; platform: WebtoonPlatform; cover: string | null; pid?: string; done?: boolean };

/** 카카오 검색에서 잘 통하는 장르·분위기 낱말. AI는 제목이 아니라 이 중에서 고릅니다. */
export const WEBTOON_KEYWORDS = ["로맨스", "로맨스 판타지", "판타지", "액션", "스릴러", "미스터리", "드라마", "일상", "힐링", "개그", "무협", "학원", "SF", "공포", "감성", "성장"];
export const FALLBACK_KEYWORDS = ["드라마", "로맨스", "스릴러", "판타지"];

async function kakaoPage(keyword: string, finishedOnly: boolean): Promise<Raw[]> {
  try {
    const d = (await getJson(`https://bff-page.kakao.com/api/gateway/api/v2/search/series?keyword=${encodeURIComponent(keyword)}&category_uid=10&is_complete=${finishedOnly}&sort_type=ACCURACY&page=0&size=25`, { headers: { ...KAKAO_HEADERS, Referer: "https://page.kakao.com/" } }, 4000)) as {
      result?: { list?: { series_id?: number; title?: string; category?: string; sub_category?: string; authors?: string }[] };
    };
    return (d.result?.list ?? []).filter((x) => x.title && x.category === "웹툰").map((x) => ({ title: x.title as string, creator: String(x.authors ?? ""), genre: String(x.sub_category ?? ""), platform: "카카오페이지" as const, cover: null, pid: String(x.series_id ?? ""), done: finishedOnly ? true : undefined }));
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
      if (r.pid) hit.pids = { ...hit.pids, [r.platform]: r.pid };
      if (r.done !== undefined) hit.finished = hit.finished === true || r.done;
    } else if (out.length < limit) {
      out.push({ id: "", title, creator: r.creator.slice(0, 100), genre: r.genre.slice(0, 30), platforms: [r.platform], coverImageUrl: r.cover, pids: r.pid ? { [r.platform]: r.pid } : undefined, finished: r.done });
    }
  }
  return out.map((c, i) => ({ ...c, id: `c${i + 1}` }));
}

/** 카카오웹툰 상세에서 완결 여부를 읽습니다(비공식). 읽지 못하면 undefined. */
async function kakaoWebtoonFinished(id: string): Promise<boolean | undefined> {
  try {
    const d = (await getJson(`https://gateway-kw.kakao.com/decorator/v2/decorator/contents/${encodeURIComponent(id)}/profile`, { headers: { ...KAKAO_HEADERS, Referer: "https://webtoon.kakao.com/" } }, 3000)) as { data?: { badges?: { title?: string; type?: string }[] } };
    const badges = d.data?.badges;
    return Array.isArray(badges) ? badges.some((b) => b.type === "STATUS" && b.title === "COMPLETED") : undefined;
  } catch { return undefined; }
}

/** 네이버웹툰 회차 목록 정보에서 완결 여부를 읽습니다(비공식). 읽지 못하면 undefined. */
async function naverFinished(id: string): Promise<boolean | undefined> {
  try {
    const d = (await getJson(`https://comic.naver.com/api/article/list/info?titleId=${encodeURIComponent(id)}`, { headers: { Referer: "https://comic.naver.com/" } }, 3000)) as { finished?: boolean };
    return typeof d.finished === "boolean" ? d.finished : undefined;
  } catch { return undefined; }
}

/** 후보 중 완결 여부를 모르는 것은 각 플랫폼에서 확인합니다(작품당 한 번, 최대 36건). */
async function fillFinished(list: WebtoonCandidate[]): Promise<void> {
  let budget = 36;
  await Promise.all(list.map(async (c) => {
    if (c.finished === true || budget <= 0) return;
    budget--;
    const checks: Promise<boolean | undefined>[] = [];
    if (c.pids?.카카오웹툰) checks.push(kakaoWebtoonFinished(c.pids.카카오웹툰));
    if (c.pids?.네이버웹툰 && c.finished === undefined) checks.push(naverFinished(c.pids.네이버웹툰));
    const r = await Promise.all(checks);
    if (r.some((x) => x === true)) c.finished = true;
    else if (c.finished === undefined && r.some((x) => x === false)) c.finished = false;
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
  const rounds = await Promise.all(kws.flatMap((k) => [kakaoPage(k, finishedOnly), kakaoWebtoon(k), naver(k)]));
  // 키워드·플랫폼이 골고루 섞이도록 라운드로빈으로 합칩니다.
  const raws: Raw[] = [];
  for (let i = 0; i < 30; i++) for (const r of rounds) if (r[i]) raws.push(r[i]);
  const wanted = (opts.wantedPlatforms ?? []).filter((p): p is WebtoonPlatform => p === "카카오페이지" || p === "카카오웹툰" || p === "네이버웹툰");
  let pool = mergeCandidates(raws, 200);
  if (wanted.length) pool = pool.filter((c) => c.platforms.some((p) => wanted.includes(p)));
  if (finishedOnly) {
    await fillFinished(pool);
    pool = pool.filter((c) => c.finished === true);
  }
  return balance(pool, 40).map((c, i) => ({ ...c, id: `c${i + 1}` }));
}
