import type { Media } from "./data";

export type PlatformGroup = "bookstore" | "ott" | "webtoon";

export type Platform = {
  id: string;
  name: string;
  aliases: string[];
  group: PlatformGroup;
  /** 이 매체의 작품에 감상처로 보여 줄지 */
  media: Media[];
  category: string;
  /** 작품 제목으로 검색 결과 페이지를 여는 링크 */
  search: (q: string) => string;
};

/** 매체별 대표 묶음(감상처 링크를 보여 줄 때 그 매체의 전문 플랫폼을 앞에 두는 데 씁니다). */
const MEDIA_GROUP: Record<Media, PlatformGroup> = { book: "bookstore", film: "ott", drama: "ott", webtoon: "webtoon" };

/** 추천 매체에서 실제로 서비스하는 플랫폼인지. 매체를 하나도 고르지 않으면(전체 매체) 모두 고를 수 있습니다. */
export const platformAllowed = (p: { media: Media[] }, media: Media[]): boolean => media.length === 0 || p.media.some((m) => media.includes(m));
/** 선택한 플랫폼 id 중 현재 매체에서 쓸 수 있는 것만 남깁니다. */
export const keepAllowedPlatforms = (ids: string[], media: Media[]): string[] => ids.filter((id) => { const p = PLATFORMS.find((x) => x.id === id); return p ? platformAllowed(p, media) : false; });

const e = encodeURIComponent;

export const PLATFORMS: Platform[] = [
  { id: "yes24", name: "예스24", aliases: ["예스24", "yes24"], group: "bookstore", media: ["book"], category: "도서·eBook", search: (q) => `https://www.yes24.com/Product/Search?domain=ALL&query=${e(q)}` },
  { id: "kyobo", name: "교보문고", aliases: ["교보문고", "교보", "kyobo"], group: "bookstore", media: ["book", "webtoon"], category: "도서·eBook·웹툰(단행본·전자책)", search: (q) => `https://search.kyobobook.co.kr/search?keyword=${e(q)}` },
  { id: "aladin", name: "알라딘", aliases: ["알라딘", "aladin"], group: "bookstore", media: ["book", "webtoon"], category: "도서·중고·eBook·웹툰(단행본·전자책)", search: (q) => `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=All&SearchWord=${e(q)}` },
  { id: "millie", name: "밀리의 서재", aliases: ["밀리의 서재", "밀리의서재", "밀리", "millie"], group: "bookstore", media: ["book","webtoon"], category: "구독 전자책·웹툰", search: (q) => `https://www.millie.co.kr/v3/search?keyword=${e(q)}` },
  { id: "ridi", name: "리디", aliases: ["리디", "리디북스", "ridi"], group: "bookstore", media: ["book", "webtoon"], category: "전자책·웹툰", search: (q) => `https://ridibooks.com/search?q=${e(q)}` },
  { id: "naverseries", name: "네이버 시리즈", aliases: ["네이버 시리즈", "네이버시리즈", "시리즈"], group: "bookstore", media: ["book", "webtoon"], category: "전자책·웹소설·웹툰", search: (q) => `https://series.naver.com/search/search.series?t=all&q=${e(q)}` },
  { id: "googlebooks", name: "구글 Play 북스", aliases: ["구글 play 북스", "구글 플레이 북스", "google play books", "구글북스"], group: "bookstore", media: ["book"], category: "전자책·오디오북", search: (q) => `https://play.google.com/store/search?q=${e(q)}&c=books` },
  { id: "storytel", name: "스토리텔", aliases: ["스토리텔", "storytel"], group: "bookstore", media: ["book"], category: "구독 오디오북·전자책", search: (q) => `https://www.storytel.com/kr/ko/search?query=${e(q)}` },
  { id: "websearch", name: "웹에서 열람처 찾기", aliases: ["웹 검색", "구글 검색", "그 외"], group: "bookstore", media: ["book"], category: "그 외 열람 가능한 모든 사이트", search: (q) => `https://www.google.com/search?q=${e(`${q} 전자책 읽기`)}` },
  { id: "netflix", name: "넷플릭스", aliases: ["넷플릭스", "netflix"], group: "ott", media: ["film", "drama"], category: "OTT 스트리밍", search: (q) => `https://www.netflix.com/search?q=${e(q)}` },
  { id: "watcha", name: "왓챠", aliases: ["왓챠", "watcha"], group: "ott", media: ["film", "drama"], category: "OTT 스트리밍", search: (q) => `https://watcha.com/search?query=${e(q)}` },
  { id: "tving", name: "티빙", aliases: ["티빙", "tving"], group: "ott", media: ["film", "drama"], category: "OTT 스트리밍", search: (q) => `https://www.tving.com/search/main?keyword=${e(q)}` },
  { id: "wavve", name: "웨이브", aliases: ["웨이브", "wavve", "wave"], group: "ott", media: ["film", "drama"], category: "OTT 스트리밍", search: (q) => `https://www.wavve.com/search?searchWord=${e(q)}` },
  { id: "appletv", name: "Apple TV+", aliases: ["apple tv", "appletv", "애플tv", "애플 티비", "apple tv+"], group: "ott", media: ["film", "drama"], category: "OTT 스트리밍", search: (q) => `https://tv.apple.com/kr/search?term=${e(q)}` },
  { id: "coupangplay", name: "쿠팡플레이", aliases: ["쿠팡플레이", "쿠팡", "coupang"], group: "ott", media: ["film", "drama"], category: "OTT 스트리밍", search: (q) => `https://www.coupangplay.com/search?q=${e(q)}` },
  { id: "youtube", name: "유튜브", aliases: ["유튜브", "youtube"], group: "ott", media: ["film", "drama", "book"], category: "예고편·해설", search: (q) => `https://www.youtube.com/results?search_query=${e(q)}` },
  { id: "naverwebtoon", name: "네이버웹툰", aliases: ["네이버웹툰", "네이버 웹툰", "naver"], group: "webtoon", media: ["webtoon"], category: "웹툰 연재", search: (q) => `https://comic.naver.com/search?keyword=${e(q)}` },
  { id: "kakaopage", name: "카카오페이지", aliases: ["카카오페이지", "카카오 페이지", "kakaopage"], group: "webtoon", media: ["webtoon", "book"], category: "웹툰·웹소설", search: (q) => `https://page.kakao.com/search/result?keyword=${e(q)}` },
  { id: "lezhin", name: "레진코믹스", aliases: ["레진코믹스", "레진", "lezhin"], group: "webtoon", media: ["webtoon"], category: "웹툰 연재", search: (q) => `https://www.lezhin.com/ko/search?keyword=${e(q)}` },
  { id: "kakaowebtoon", name: "카카오웹툰", aliases: ["카카오웹툰", "카카오 웹툰"], group: "webtoon", media: ["webtoon"], category: "웹툰 연재", search: (q) => `https://webtoon.kakao.com/search?keyword=${e(q)}` },
];

export const PLATFORM_BY_ID: Record<string, Platform> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export const GROUP_LABEL: Record<PlatformGroup, string> = {
  bookstore: "서점 · 전자책 · 열람처",
  ott: "OTT · 유튜브",
  webtoon: "웹툰 플랫폼",
};

export type PlatformLink = { id: string; name: string; category: string; url: string; isRecommended: boolean };

/** 작품 하나에 대한 감상처 링크 목록. 추천 플랫폼이 앞에 옵니다. */
export function buildPlatformLinks(title: string, creator: string, media: Media, recommended: string[] = []): PlatformLink[] {
  const recs = recommended.map((p) => p.toLowerCase().trim()).filter(Boolean);
  const clean = title.trim();
  const query = media === "book" && creator ? `${clean} ${creator}` : clean;
  return PLATFORMS.filter((p) => p.media.includes(media))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      url: p.search(p.id === "youtube" ? `${clean} ${media === "book" ? "북트레일러 리뷰" : "공식 예고편"}` : query),
      native: PLATFORM_BY_ID[p.id]?.group === MEDIA_GROUP[media],
      isRecommended: recs.some((r) => p.aliases.some((a) => r.includes(a) || a.includes(r))),
    }))
    .sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended) || Number(b.native) - Number(a.native))
    .map(({ native: _native, ...rest }) => rest);
}

export function trailerUrl(title: string, media: Media): string {
  const suffix = media === "book" ? "책 소개 북트레일러" : media === "webtoon" ? "웹툰 PV 소개" : "공식 예고편";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${suffix}`)}`;
}

/** 필터 패널에서 고른 플랫폼 id → 한국어 이름 */
export function platformNames(ids: string[]): string[] {
  return ids.map((id) => PLATFORM_BY_ID[id]?.name).filter((n): n is string => Boolean(n));
}
