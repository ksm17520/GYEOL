import { sameTitle } from "./cover";

/**
 * 예스24 Open API — 실제 판매 중인 책을 찾습니다. 환경 변수 `Yes24_API_Key`가 없으면 모두 빈 결과(기존 방식으로 대체).
 * 제목·저자·출간 연도·분야·소개·표지·쪽수·ISBN·상품 링크는 예스24 응답 값을 그대로 씁니다.
 * 이용약관: 데이터는 일시 저장만 허용(대량 수집 금지), 화면에 예스24를 출처로 표기하고 상품 상세 페이지 링크를 제공해야 합니다.
 */
const BASE = "https://apis.yes24.com/v1";
const key = () => process.env.Yes24_API_Key?.trim() ?? "";

type RawItem = {
  itemId?: number; title?: string; subTitle?: string | null; author?: string; publisher?: string; publishDate?: string; isbn13?: string;
  goodsType?: string; goodsSortNm?: string; adultYn?: string; itemStatus?: string; cover?: string; link?: string; pages?: number | null;
  contentDetail?: { bookIntroduction?: string | null; bookSummary?: string | null } | null;
};

/** 후보 한 권. AI는 이 목록에서만 고릅니다. */
export type BookCandidate = {
  id: string; // "b1" 형식
  title: string;
  author: string;
  publisher: string;
  year: string;
  category: string;
  description: string;
  isbn13: string;
  pages: number;
  coverImageUrl: string | null;
  /** 예스24 상품 상세 페이지(출처 표기용) */
  link: string;
};

async function search(query: string, sort: "RELATION" | "RECENT" | "DEFAULT", pageSize: number, ms = 4500): Promise<RawItem[]> {
  const k = key();
  if (!k || !query.trim()) return [];
  try {
    const qs = new URLSearchParams({ query, category: "BOOK", sort, page: "1", pageSize: String(pageSize), detail: "Y" });
    const res = await fetch(`${BASE}/goods/itemList?${qs}`, { headers: { "X-Api-Key": k, "User-Agent": "GyeolArchive/1.0" }, signal: AbortSignal.timeout(ms) });
    if (!res.ok) return [];
    const d = (await res.json()) as { success?: boolean; data?: { items?: RawItem[] } };
    return d.success === false || !Array.isArray(d.data?.items) ? [] : (d.data?.items as RawItem[]);
  } catch { return []; }
}

/** 예스24 저자 표기("로버트 C. 마틴 저 | 김아무개 역")에서 지은이만 앞의 두 명까지 남깁니다. */
export function cleanAuthor(v: string): string {
  const people = v.split(/[|,·]/).map((x) => x.trim()).filter(Boolean);
  const main = people.filter((p) => !/\s(역|옮김|번역|감수|편역)$/.test(p));
  return (main.length ? main : people).slice(0, 2).map((p) => p.replace(/\s+(저|글|그림|지음|저자|엮음|편|공저)$/, "").trim()).filter(Boolean).join(", ").slice(0, 100);
}

/** "여름, 안녕 - 부제" → "여름, 안녕" */
export const mainTitle = (v: string) => v.split(/\s+-\s+/)[0].trim();

const plain = (v: string | null | undefined) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

const toCandidate = (x: RawItem): Omit<BookCandidate, "id"> | null => {
  const title = String(x.title ?? "").trim();
  const isbn13 = String(x.isbn13 ?? "").trim();
  const itemId = Number(x.itemId);
  if (!title || !isbn13 || !itemId) return null;
  const sort = `${x.goodsType ?? ""} ${x.goodsSortNm ?? ""}`;
  // 성인물·품절·절판, 만화(웹툰과 별개)·전집/세트·학습서는 후보에서 뺍니다.
  if (x.adultYn === "Y" || /품절|절판|판매중지/.test(String(x.itemStatus ?? ""))) return null;
  if (/만화|코믹|학습|참고서|수험|문제집/.test(sort) || /세트|전집/.test(title)) return null;
  const cover = String(x.cover ?? "");
  const link = String(x.link ?? "");
  return {
    title: title.slice(0, 120),
    author: cleanAuthor(String(x.author ?? "")),
    publisher: String(x.publisher ?? "").slice(0, 60),
    year: String(x.publishDate ?? "").slice(0, 4),
    category: String(x.goodsSortNm ?? "").slice(0, 40),
    description: plain(x.contentDetail?.bookIntroduction || x.contentDetail?.bookSummary).slice(0, 220),
    isbn13,
    pages: Number(x.pages) > 0 ? Number(x.pages) : 0,
    coverImageUrl: /^https:\/\/image\.yes24\.com\/goods\/\d+\//.test(cover) ? cover : null,
    link: /^https:\/\/(www|m)\.yes24\.com\//.test(link) ? link : `https://www.yes24.com/product/goods/${itemId}`,
  };
};

/** 분위기 낱말 → 예스24 검색어. 서버가 상황 글에서 뽑습니다. */
const KEYWORD_RULES: [RegExp, string[]][] = [
  [/따뜻|위로|힐링|포근|다정/, ["위로 소설", "따뜻한 에세이"]],
  [/설렘|로맨스|연애|사랑|연인/, ["로맨스 소설", "사랑 에세이"]],
  [/SF|미래|우주|과학|AI|로봇|안드로이드/i, ["SF 소설"]],
  [/스릴|긴장|미스터리|추리|범죄|반전/, ["미스터리 소설", "스릴러 소설"]],
  [/공포|무서|오싹/, ["공포 소설"]],
  [/성장|청춘|학교|십대/, ["성장 소설"]],
  [/잔잔|일상|여유|평온|쉬|주말/, ["일상 에세이", "잔잔한 소설"]],
  [/판타지|마법|환상/, ["판타지 소설"]],
  [/슬픔|눈물|이별|상실|애도|우울/, ["상실 소설", "이별 에세이"]],
  [/유쾌|웃음|코믹|가볍/, ["유쾌한 소설", "유머 에세이"]],
  [/여행|떠나|낯선/, ["여행 에세이"]],
  [/역사|시대|조선|전쟁/, ["역사 소설"]],
];
export function pickBookQueries(context: string): string[] {
  const out: string[] = [];
  for (const [re, ks] of KEYWORD_RULES) if (re.test(context)) for (const k of ks) if (!out.includes(k)) out.push(k);
  for (const k of ["소설", "에세이"]) if (out.length < 2 && !out.includes(k)) out.push(k);
  return out.slice(0, 4);
}

/** 책 후보를 모읍니다. 키가 없거나 못 모으면 빈 목록(기존 방식으로 대체). 최대 40권. */
export async function gatherBookCandidates(context: string, opts: { era?: "all" | "recent5" | "since2010" | "classic" } = {}): Promise<BookCandidate[]> {
  if (!key()) return [];
  const queries = pickBookQueries(context);
  // 검색어마다 관련도 순 + 최신순을 함께 읽어(초당 10회 한도 안), 인기작에만 쏠리지 않게 합니다.
  const lists = await Promise.all([
    ...queries.map((q) => search(q, "RELATION", 20)),
    ...queries.slice(0, 2).map((q) => search(q, "RECENT", 15)),
  ]);
  const thisYear = new Date().getFullYear();
  const eraOk = (y: string) => {
    const n = Number(y);
    if (!n || !opts.era || opts.era === "all") return true;
    return opts.era === "recent5" ? n >= thisYear - 5 : opts.era === "since2010" ? n >= 2010 : n < 2010;
  };
  // 검색 결과를 번갈아 담아(분위기에 맞는 결과가 먼저) 중복(ISBN)을 뺍니다.
  const seen = new Set<string>();
  const out: BookCandidate[] = [];
  for (let i = 0; i < 20 && out.length < 40; i++) {
    for (const list of lists) {
      const c = list[i] ? toCandidate(list[i]) : null;
      if (!c || seen.has(c.isbn13) || !c.description || !eraOk(c.year)) continue;
      seen.add(c.isbn13);
      out.push({ id: `b${out.length + 1}`, ...c });
      if (out.length >= 40) break;
    }
  }
  return out;
}

/** 표지 조회용: 제목이 같은(부제·시즌 표기 제외) 책의 표지만 돌려줍니다. 저자가 있으면 저자도 겹쳐야 합니다. */
export async function yes24Cover(title: string, author: string): Promise<string | null> {
  if (!key()) return null;
  const items = await search(title, "RELATION", 10);
  const wantAuthor = author.replace(/\s+/g, "");
  for (const x of items) {
    const c = toCandidate(x);
    if (!c?.coverImageUrl || !sameTitle(mainTitle(c.title), title)) continue;
    if (!wantAuthor || c.author.split(",").some((a) => a.replace(/\s+/g, "") && wantAuthor.includes(a.replace(/\s+/g, "")))) return c.coverImageUrl;
  }
  return null;
}
