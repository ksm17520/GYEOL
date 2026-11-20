import { getJson, sameTitle } from "./cover";

/**
 * KMDb(한국영화데이터베이스, 한국영상자료원) 오픈 API — 국내 개봉·수입 영화의 감독·배우를 한글로 가져옵니다.
 * KMDB_API_KEY가 없으면 건너뜁니다. 영화만 지원하고, 극중 이름은 제공하지 않습니다(극중 이름은 TMDB 기준).
 * 응답 규격(Data[0].Result[]: title·titleEng·prodYear·repRlsDate·directors.director[].directorNm·actors.actor[].actorNm)은 공개 안내를 기준으로 하며,
 * 필드가 다르거나 오류가 나면 조용히 TMDB 정보로 대체됩니다.
 */
export type KmdbMovie = { directors: string[]; actors: string[]; /** 분 단위 숫자 문자열 */ runtime: string; /** 국내 최초 개봉(없으면 제작) 연도 */ year: string; /** 추천 근거용 한 줄(장르·관람등급·키워드·줄거리). 없으면 빈 문자열 */ brief: string };
/** 확인용: no-key(키 없음) · ok(찾음) · no-match(응답은 왔으나 일치 작품 없음) · empty(응답에 Data/Result 없음) · error:… (호출 실패) */
export type KmdbResult = { movie: KmdbMovie | null; status: string };

const ENDPOINTS = ["https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp", "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp"];
const cache = new Map<string, KmdbResult>();
// 인증 오류(승인 전·잘못된 키)가 나면 한동안 호출하지 않아 응답 시간을 아낍니다.
let blockedUntil = 0;
// 제목 강조 표시(!HS ... !HE)와 공백을 제거
const clean = (s: string | undefined) => (s ?? "").replace(/!HS|!HE/g, "").replace(/\s+/g, " ").trim();
type Row = { genre?: string; rating?: string; keywords?: string; plots?: { plot?: { plotText?: string }[] }; runtime?: string; title?: string; titleEng?: string; titleOrg?: string; prodYear?: string; repRlsDate?: string; directors?: { director?: { directorNm?: string }[] }; actors?: { actor?: { actorNm?: string }[] } };

export async function kmdbMovie(title: string, year: string, altTitles: string[] = []): Promise<KmdbResult> {
  const raw = process.env.KMDB_API_KEY;
  if (!raw || !title.trim()) return { movie: null, status: "no-key" };
  const ck = `${title}::${year}`;
  const cached = cache.get(ck);
  if (cached) return cached;
  if (Date.now() < blockedUntil) return { movie: null, status: "error:auth-paused" };
  // 공공데이터포털 키는 이미 인코딩된 형태(%2B 등)로 복사되는 경우가 있어 한 번 풀고 다시 인코딩합니다.
  let key = raw.trim();
  try { if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key); } catch { /* 그대로 사용 */ }
  const y = Number(year) || 0;
  const wanted = [title, ...altTitles].filter(Boolean);
  let found: KmdbMovie | null = null;
  let status = "no-match";
  for (const base of ENDPOINTS) {
    try {
      const d = (await getJson(`${base}?collection=kmdb_new2&detail=Y&listCount=20&ServiceKey=${encodeURIComponent(key)}&title=${encodeURIComponent(title)}`, {}, 3500)) as { Data?: { Result?: Row[] }[] };
      const rows = (d.Data ?? []).flatMap((x) => x.Result ?? []);
      if (rows.length === 0) status = "empty";
      const hit = rows.find((r) => {
        const ry = Number((r.repRlsDate || "").slice(0, 4)) || Number(r.prodYear) || 0;
        const nameOk = [clean(r.title), clean(r.titleEng), clean(r.titleOrg)].some((n) => n && wanted.some((t) => sameTitle(n, t)));
        return nameOk && (!y || !ry || Math.abs(ry - y) <= 1);
      });
      if (hit) {
        const directors = (hit.directors?.director ?? []).map((p) => clean(p.directorNm)).filter(Boolean);
        const actors = (hit.actors?.actor ?? []).map((p) => clean(p.actorNm)).filter(Boolean);
        const runtime = String(hit.runtime ?? "").replace(/\D/g, "");
        const year = (hit.repRlsDate || "").slice(0, 4) || String(hit.prodYear ?? "").slice(0, 4);
        const plot = clean(hit.plots?.plot?.[0]?.plotText).slice(0, 90);
        const brief = [clean(hit.genre), clean(hit.rating), clean(hit.keywords).split(",").slice(0, 4).join(","), plot].filter(Boolean).join(" · ").slice(0, 200);
        if (directors.length || actors.length || runtime || brief) { found = { directors, actors, runtime: Number(runtime) > 0 ? runtime : "", year, brief }; status = "ok"; }
      }
      break; // 응답을 받았으면(찾았든 못 찾았든) 다른 주소로 다시 묻지 않습니다
    } catch (e) { if (/인증키|^401$|^403$/.test(String((e as Error)?.message ?? e))) blockedUntil = Date.now() + 10 * 60_000; status = `error:${String((e as Error)?.message ?? e).replace(/ServiceKey=[^&\s]*/g, "ServiceKey=***").slice(0, 60)}`; /* 다음 주소 */ }
  }
  if (cache.size >= 500) cache.clear();
  const out = { movie: found, status };
  if (!status.startsWith("error")) cache.set(ck, out); // 일시 오류는 캐시하지 않습니다
  return out;
}
