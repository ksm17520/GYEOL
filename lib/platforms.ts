export type PlatformGroup = "bookstore" | "ott" | "webtoon";

export type Platform = {
  id: string;
  name: string;
  group: PlatformGroup;
  /** 작품 제목으로 검색 결과 페이지를 여는 링크 */
  search: (q: string) => string;
};

const enc = encodeURIComponent;

export const PLATFORMS: Platform[] = [
  { id: "yes24", name: "예스24", group: "bookstore", search: (q) => `https://www.yes24.com/Product/Search?query=${enc(q)}` },
  { id: "kyobo", name: "교보문고", group: "bookstore", search: (q) => `https://search.kyobobook.co.kr/search?keyword=${enc(q)}` },
  { id: "aladin", name: "알라딘", group: "bookstore", search: (q) => `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchWord=${enc(q)}` },
  { id: "netflix", name: "넷플릭스", group: "ott", search: (q) => `https://www.netflix.com/search?q=${enc(q)}` },
  { id: "tving", name: "티빙", group: "ott", search: (q) => `https://www.tving.com/search?keyword=${enc(q)}` },
  { id: "watcha", name: "왓챠", group: "ott", search: (q) => `https://watcha.com/search?query=${enc(q)}` },
  { id: "wavve", name: "웨이브", group: "ott", search: (q) => `https://www.wavve.com/search?searchWord=${enc(q)}` },
  { id: "youtube", name: "유튜브", group: "ott", search: (q) => `https://www.youtube.com/results?search_query=${enc(q)}` },
  { id: "naverwebtoon", name: "네이버웹툰", group: "webtoon", search: (q) => `https://comic.naver.com/search?keyword=${enc(q)}` },
  { id: "kakaopage", name: "카카오페이지", group: "webtoon", search: (q) => `https://page.kakao.com/search/result?keyword=${enc(q)}` },
];

export const PLATFORM_BY_ID: Record<string, Platform> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p]),
);

export const GROUP_LABEL: Record<PlatformGroup, string> = {
  bookstore: "서점 · 전자책",
  ott: "OTT · 유튜브",
  webtoon: "웹툰 플랫폼",
};
