import type { Media } from "./data";

export type CoverTarget = { title: string; originalTitle?: string; englishTitle?: string; creator: string; media: Media; releaseYear?: string };

/**
 * 확장 출처(예스24·알라딘 검색 페이지 파싱, IMDb 비공식 검색, 네이버웹툰 비공식 API)를 쓸지 여부.
 * 무료 서비스 단계에서만 켜 두는 것을 전제로 하며, 기본값은 켜짐입니다.
 * 결제(유료) 서비스를 열 때는 환경 변수 COVER_EXTENDED_SOURCES=off 로 끄세요.
 * 이 출처들은 공식 API가 아니라 해당 사이트의 이용 약관에 어긋날 수 있고, 사이트 구조가 바뀌면 동작하지 않을 수 있습니다.
 */
export const EXTENDED_SOURCES = (process.env.COVER_EXTENDED_SOURCES ?? "on").toLowerCase() !== "off";

// 공개 API가 제공하는 이미지 호스트
const EXACT_HOSTS = new Set(["covers.openlibrary.org", "upload.wikimedia.org", "static.tvmaze.com", "s4.anilist.co", "image.tmdb.org"]);
const SUFFIX_HOSTS = [".mzstatic.com", ".archive.org"];
// 확장 출처의 이미지 호스트 (EXTENDED_SOURCES가 켜져 있을 때만 허용)
const EXTENDED_HOSTS = new Set(["image.yes24.com", "image.aladin.co.kr", "contents.kyobobook.co.kr", "image-comic.pstatic.net", "shared-comic.pstatic.net", "m.media-amazon.com", "movie-phinf.pstatic.net", "search.pstatic.net"]);

export function isAllowedCoverHost(host: string): boolean {
  return EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s)) || (EXTENDED_SOURCES && EXTENDED_HOSTS.has(host));
}

/** 일부 이미지 서버는 Referer가 없으면 요청을 거부합니다. */
export function refererFor(host: string): string | undefined {
  if (host.includes("yes24.com")) return "https://www.yes24.com/";
  if (host.includes("aladin.co.kr")) return "https://www.aladin.co.kr/";
  if (host.includes("kyobobook.co.kr")) return "https://www.kyobobook.co.kr/";
  if (host.startsWith("image-comic") || host.startsWith("shared-comic")) return "https://comic.naver.com/";
  if (host.includes("pstatic.net")) return "https://search.naver.com/";
  if (host.includes("media-amazon.com")) return "https://www.imdb.com/";
  return undefined;
}

const cache = new Map<string, string | null>();

const norm = (v: string) => v.toLowerCase().replace(/[\s\-_.,!?:'"()[\]·~]/g, "").trim();
/**
 * 같은 작품의 제목인지 봅니다. 띄어쓰기·기호 차이를 뺀 제목이 같거나, 한쪽이 다른 쪽으로 "시작하고 바로 뒤가 띄어쓰기·기호·숫자"일 때(부제·시즌 표기)만 인정합니다.
 * 한쪽이 다른 쪽의 일부로 들어 있기만 한 경우('계시록'과 '청춘계시록')는 다른 작품이므로 인정하지 않습니다.
 */
function sameBase(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const clean = (v: string) => v.toLowerCase().trim().replace(/^['"‘“]+/, "");
  const [s, l] = x.length <= y.length ? [clean(a), clean(b)] : [clean(b), clean(a)];
  return s.length >= 2 && l.startsWith(s) && /^[\s:：\-–(\[\d]/.test(l.slice(s.length));
}
const close = sameBase;

export async function getJson(url: string, init: RequestInit = {}, ms = 2800): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": "GyeolArchive/1.0", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function getText(url: string, ms = 2800): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

// ---- 확장 출처 (EXTENDED_SOURCES) ----
async function yes24(title: string, creator: string): Promise<string | null> {
  for (const q of creator ? [`${title} ${creator}`, title] : [title]) {
    try {
      const html = await getText(`https://www.yes24.com/Product/Search?domain=BOOK&query=${encodeURIComponent(q)}`);
      const m = html.match(/https:\/\/image\.yes24\.com\/goods\/(\d+)\/[A-Z]+/);
      if (m?.[1]) return `https://image.yes24.com/goods/${m[1]}/L`;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

async function aladin(title: string, creator: string): Promise<string | null> {
  for (const q of creator ? [`${title} ${creator}`, title] : [title]) {
    try {
      const html = await getText(`https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=${encodeURIComponent(q)}`);
      const m = html.match(/https:\/\/image\.aladin\.co\.kr\/product\/\d+\/\d+\/cover\d*\/[^"'\s>]+/);
      if (m?.[0]) return m[0].replace(/\/cover\d+\//, "/cover500/");
    } catch { /* 다음 후보 */ }
  }
  return null;
}

async function imdb(t: CoverTarget, kind: "film" | "drama"): Promise<string | null> {
  const queries = Array.from(new Set([t.englishTitle, t.originalTitle, t.title].filter((x): x is string => Boolean(x))));
  const year = Number(t.releaseYear) || 0;
  for (const q of queries) {
    try {
      const d = (await getJson(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`)) as { d?: { l?: string; y?: number; qid?: string; i?: { imageUrl?: string } }[] };
      const scored = (d.d ?? []).filter((x) => x.i?.imageUrl).map((x) => {
        let score = 0;
        if (x.l && close(x.l, q)) score += 5;
        if (year && x.y && Math.abs(x.y - year) <= 1) score += 4;
        if (kind === "film" && x.qid === "movie") score += 3;
        if (kind === "drama" && (x.qid === "tvSeries" || x.qid === "tvMiniSeries")) score += 3;
        return { x, score };
      }).sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best && best.score >= 3 && best.x.i?.imageUrl) return best.x.i.imageUrl.replace(/_V1_\.jpg$/i, "_V1_SX600.jpg");
    } catch { /* 다음 후보 */ }
  }
  return null;
}

export type NaverComic = { titleName?: string; thumbnailUrl?: string; titleId?: number | string; finished?: boolean };
export async function naverWebtoonSearch(keyword: string): Promise<NaverComic[]> {
  try {
    const d = (await getJson(`https://comic.naver.com/api/search/all?keyword=${encodeURIComponent(keyword)}`)) as {
      searchWebtoonResult?: { searchViewList?: NaverComic[] };
      searchNbooksComicResult?: { searchViewList?: NaverComic[] };
    };
    return [...(d.searchWebtoonResult?.searchViewList ?? []), ...(d.searchNbooksComicResult?.searchViewList ?? [])];
  } catch { return []; }
}

async function naverWebtoon(title: string): Promise<string | null> {
  const pool = await naverWebtoonSearch(title);
  return pool.find((x) => x.thumbnailUrl && x.titleName && close(x.titleName, title))?.thumbnailUrl ?? null;
}

/** 같은 제목인지 확인합니다(부제·시즌 표기는 허용, 단순 포함은 불허). */
export function sameTitle(a: string, b: string): boolean {
  return sameBase(a, b);
}

export const toProxy = (raw: string | undefined): string | null => {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && isAllowedCoverHost(u.hostname) ? `/api/cover-proxy?url=${encodeURIComponent(raw)}` : null;
  } catch { return null; }
};

export const KAKAO_HEADERS = { "Accept-Language": "ko", Accept: "application/json" };

/** 카카오페이지에서 웹툰으로 올라 있는 작품 제목들 (비공식 검색 주소). */
async function kakaoPageWebtoonTitles(keyword: string): Promise<string[]> {
  try {
    const d = (await getJson(`https://bff-page.kakao.com/api/gateway/api/v2/search/series?keyword=${encodeURIComponent(keyword)}&category_uid=0&is_complete=false&sort_type=ACCURACY&page=0&size=25`, { headers: { ...KAKAO_HEADERS, Referer: "https://page.kakao.com/" } })) as {
      result?: { list?: { title?: string; category?: string }[] };
    };
    return (d.result?.list ?? []).filter((x) => x.category === "웹툰" && x.title).map((x) => x.title as string);
  } catch { return []; }
}

/** 카카오웹툰에 올라 있는 작품 제목들 (비공식 검색 주소). */
async function kakaoWebtoonTitles(keyword: string): Promise<string[]> {
  try {
    const d = (await getJson(`https://gateway-kw.kakao.com/search/v2/content?limit=30&offset=0&word=${encodeURIComponent(keyword)}`, { headers: { ...KAKAO_HEADERS, Referer: "https://webtoon.kakao.com/" } })) as {
      data?: { content?: { title?: string }[] };
    };
    return (d.data?.content ?? []).filter((x) => x.title).map((x) => x.title as string);
  } catch { return []; }
}

export type WebtoonOfficial = { title: string; coverImageUrl: string | null; platform: "네이버웹툰" | "카카오페이지" | "카카오웹툰" };

/**
 * 웹툰 플랫폼(네이버웹툰·카카오페이지·카카오웹툰)에 실제로 올라 있는 공식 제목을 찾습니다.
 * AI가 적은 제목과 거의 같은 작품이 있으면 그 플랫폼 표기를, 없으면 null을 돌려줍니다.
 * 세 곳을 동시에 조회하고, 표지가 있는 네이버웹툰 결과를 우선합니다.
 * 모두 비공식 출처이므로 COVER_EXTENDED_SOURCES가 꺼져 있으면 항상 null입니다.
 */
export async function findWebtoonOfficial(title: string): Promise<WebtoonOfficial | null> {
  if (!EXTENDED_SOURCES || !title.trim()) return null;
  const [naver, kakaoPage, kakaoWebtoon] = await Promise.all([naverWebtoonSearch(title), kakaoPageWebtoonTitles(title), kakaoWebtoonTitles(title)]);
  const n = naver.find((x) => x.titleName && sameTitle(x.titleName, title));
  if (n?.titleName) return { title: n.titleName.slice(0, 100), coverImageUrl: toProxy(n.thumbnailUrl), platform: "네이버웹툰" };
  const kp = kakaoPage.find((t) => sameTitle(t, title));
  if (kp) return { title: kp.slice(0, 100), coverImageUrl: null, platform: "카카오페이지" };
  const kw = kakaoWebtoon.find((t) => sameTitle(t, title));
  if (kw) return { title: kw.slice(0, 100), coverImageUrl: null, platform: "카카오웹툰" };
  return null;
}

// TMDB 공식 API (무료 키 필요): 국내 영화·시리즈까지 가장 폭넓게 찾습니다. TMDB_API_KEY가 없으면 건너뜁니다.
async function tmdb(t: CoverTarget, kind: "film" | "drama"): Promise<string | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const year = Number(t.releaseYear) || 0;
  const queries = Array.from(new Set([t.title, t.originalTitle, t.englishTitle].filter((x): x is string => Boolean(x))));
  for (const q of queries) {
    try {
      const path = kind === "film" ? "movie" : "tv";
      const d = (await getJson(`https://api.themoviedb.org/3/search/${path}?api_key=${encodeURIComponent(key)}&language=ko-KR&query=${encodeURIComponent(q)}`)) as {
        results?: { title?: string; name?: string; original_title?: string; original_name?: string; poster_path?: string | null; release_date?: string; first_air_date?: string; popularity?: number }[];
      };
      const scored = (d.results ?? []).filter((x) => x.poster_path).slice(0, 8).map((x) => {
        let score = 0;
        const names = [x.title, x.name, x.original_title, x.original_name].filter((n): n is string => Boolean(n));
        if (names.some((n) => close(n, q))) score += 5;
        const y = Number((x.release_date || x.first_air_date || "").slice(0, 4)) || 0;
        if (year && y && Math.abs(y - year) <= 1) score += 4;
        return { x, score };
      }).sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best && best.score >= 5) return `https://image.tmdb.org/t/p/w500${best.x.poster_path}`;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

// 네이버 검색 결과 페이지의 영화·시리즈 포스터 (비공식, EXTENDED_SOURCES). 페이지 구조가 바뀌면 동작하지 않습니다.
async function naverPoster(title: string, kind: "film" | "drama"): Promise<string | null> {
  try {
    const html = await getText(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(`${title} ${kind === "film" ? "영화" : "드라마"}`)}`, 3500);
    const m = html.match(/https:\/\/movie-phinf\.pstatic\.net\/[^"'\s>)\\]+\.(?:jpg|jpeg|png)[^"'\s>)\\]*/i);
    return m?.[0]?.replace(/&amp;/g, "&") ?? null;
  } catch { return null; }
}

async function openLibrary(q: string): Promise<string | null> {
  if (!q) return null;
  try {
    const d = (await getJson(`https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=3`)) as { docs?: { cover_i?: number }[] };
    const hit = d.docs?.find((x) => x.cover_i);
    return hit?.cover_i ? `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg` : null;
  } catch { return null; }
}

async function itunes(queries: string[], entity: "ebook" | "movie"): Promise<string | null> {
  const param = entity === "ebook" ? "media=ebook" : "entity=movie";
  for (const country of ["kr", "us"]) {
    for (const q of queries) {
      if (!q) continue;
      try {
        const d = (await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=${country}&${param}&limit=3`)) as { results?: { trackName?: string; artworkUrl100?: string }[] };
        const hit = d.results?.find((r) => r.artworkUrl100 && r.trackName && close(r.trackName, q));
        if (hit?.artworkUrl100) return hit.artworkUrl100.replace("100x100bb", entity === "movie" ? "600x900bb" : "600x600bb");
      } catch { /* 다음 후보 */ }
    }
  }
  return null;
}

async function tvmaze(queries: string[]): Promise<string | null> {
  for (const q of queries) {
    if (!q) continue;
    try {
      const d = (await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`)) as { show?: { name?: string; image?: { original?: string; medium?: string } } }[];
      const hit = d.find((x) => x.show?.image && x.show.name && close(x.show.name, q));
      const img = hit?.show?.image?.original || hit?.show?.image?.medium;
      if (img) return img;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

async function anilist(queries: string[]): Promise<string | null> {
  for (const q of queries) {
    if (!q) continue;
    try {
      const d = (await getJson("https://graphql.anilist.co", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "query ($s: String) { Media(search: $s, type: MANGA) { title { native romaji english } coverImage { extraLarge large } } }", variables: { s: q } }),
      })) as { data?: { Media?: { title?: Record<string, string | null>; coverImage?: { extraLarge?: string; large?: string } } } };
      const m = d.data?.Media;
      if (!m?.coverImage) continue;
      const titles = Object.values(m.title ?? {}).filter((t): t is string => Boolean(t));
      if (titles.some((t) => close(t, q))) return m.coverImage.extraLarge || m.coverImage.large || null;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

async function wikipedia(queries: string[]): Promise<string | null> {
  for (const lang of ["ko", "en"]) {
    for (const q of queries) {
      if (!q) continue;
      try {
        const d = (await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=2&prop=pageimages&piprop=thumbnail&pithumbsize=600&format=json`)) as { query?: { pages?: Record<string, { title?: string; thumbnail?: { source?: string } }> } };
        const hit = Object.values(d.query?.pages ?? {}).find((p) => p.thumbnail?.source && p.title && close(p.title, q));
        if (hit?.thumbnail?.source) return hit.thumbnail.source;
      } catch { /* 다음 후보 */ }
    }
  }
  return null;
}

/** 공개 API(Open Library, Apple, TVmaze, AniList, Wikipedia)에서 표지를 찾아 프록시 경로로 돌려줍니다. */
export async function resolveCoverUrl(t: CoverTarget): Promise<string | null> {
  const key = `${t.media}::${t.title.trim().toLowerCase()}::${t.creator.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const intl = Array.from(new Set([t.englishTitle, t.originalTitle, t.title].filter((x): x is string => Boolean(x))));
  let raw: string | null = null;
  if (t.media === "book") {
    raw = (EXTENDED_SOURCES ? (await yes24(t.title, t.creator)) || (await aladin(t.title, t.creator)) : null) ||
      (await openLibrary(t.englishTitle || t.originalTitle || t.title)) || (await itunes([t.title, t.englishTitle ?? ""], "ebook")) || (await wikipedia([`${t.title} ${t.creator}`.trim(), t.title]));
  } else if (t.media === "film") {
    raw = (await tmdb(t, "film")) || (EXTENDED_SOURCES ? (await imdb(t, "film")) || (await naverPoster(t.title, "film")) : null) || (await itunes([t.title, t.englishTitle ?? ""], "movie")) || (await wikipedia([`${t.title} 영화`, t.englishTitle || t.title]));
  } else if (t.media === "drama") {
    raw = (await tmdb(t, "drama")) || (EXTENDED_SOURCES ? (await imdb(t, "drama")) || (await naverPoster(t.title, "drama")) : null) || (await tvmaze(intl)) || (await wikipedia([`${t.title} 드라마`, t.englishTitle || t.title]));
  } else {
    // 예스24·알라딘은 검색 결과 첫 항목을 제목 확인 없이 쓰므로, 제목이 틀린 웹툰에 엉뚱한 표지가 붙지 않게 웹툰에서는 뺐습니다.
    raw = (EXTENDED_SOURCES ? await naverWebtoon(t.title) : null) ||
      (await anilist([t.title, t.englishTitle ?? ""])) || (await wikipedia([t.title, t.englishTitle ?? ""]));
  }
  let out: string | null = null;
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" && isAllowedCoverHost(u.hostname)) out = `/api/cover-proxy?url=${encodeURIComponent(raw)}`;
    } catch { out = null; }
  }
  if (cache.size >= 500) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}
