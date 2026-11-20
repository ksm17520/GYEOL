import { getJson, sameTitle } from "./cover";

/**
 * 영화진흥위원회 KOBIS 오픈 API(공식, 무료) — 국내 개봉 영화의 감독·배우·극중 이름을 한글로 가져옵니다.
 * KOBIS_API_KEY(https://www.kobis.or.kr 오픈 API 메뉴에서 발급)가 없으면 건너뜁니다. 영화만 지원합니다(드라마 없음).
 * 응답 필드는 KOBIS 공개 규격(movieList: movieCd·movieNm·movieNmEn·prdtYear·openDt, movieInfo: directors[].peopleNm, actors[].peopleNm·cast)을 기준으로 하며, 필드가 없으면 조용히 건너뜁니다.
 */
export type KobisMovie = { directors: string[]; actors: string[]; /** "극중이름(배우)" */ characters: string[] };

const BASE = "https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie";
const cache = new Map<string, KobisMovie | null>();
type Person = { peopleNm?: string; cast?: string };
const names = (list: Person[] | undefined) => (list ?? []).map((p) => (p.peopleNm ?? "").trim()).filter(Boolean);

export async function kobisMovie(title: string, year: string, altTitles: string[] = []): Promise<KobisMovie | null> {
  const key = process.env.KOBIS_API_KEY;
  if (!key || !title.trim()) return null;
  const ck = `${title}::${year}`;
  if (cache.has(ck)) return cache.get(ck) ?? null;
  const y = Number(year) || 0;
  let found: KobisMovie | null = null;
  try {
    const k = encodeURIComponent(key);
    const list = (await getJson(`${BASE}/searchMovieList.json?key=${k}&movieNm=${encodeURIComponent(title)}&itemPerPage=30`, {}, 3000)) as {
      movieListResult?: { movieList?: { movieCd?: string; movieNm?: string; movieNmEn?: string; prdtYear?: string; openDt?: string }[] };
    };
    const wanted = [title, ...altTitles].filter(Boolean);
    const hits = (list.movieListResult?.movieList ?? []).filter((m) => {
      const my = Number((m.openDt || "").slice(0, 4)) || Number(m.prdtYear) || 0;
      const nameOk = [m.movieNm, m.movieNmEn].some((n) => n && wanted.some((t) => sameTitle(n, t)));
      return m.movieCd && nameOk && (!y || !my || Math.abs(my - y) <= 1);
    });
    const hit = hits[0];
    if (hit?.movieCd) {
      const info = (await getJson(`${BASE}/searchMovieInfo.json?key=${k}&movieCd=${encodeURIComponent(hit.movieCd)}`, {}, 3000)) as {
        movieInfoResult?: { movieInfo?: { directors?: Person[]; actors?: Person[] } };
      };
      const mi = info.movieInfoResult?.movieInfo;
      const directors = names(mi?.directors);
      const actors = (mi?.actors ?? []).filter((a) => a.peopleNm?.trim());
      const characters = actors.slice(0, 4).filter((a) => a.cast?.trim()).map((a) => `${(a.cast as string).trim().slice(0, 30)}(${(a.peopleNm as string).trim()})`);
      if (directors.length || actors.length) found = { directors, actors: names(actors), characters };
    }
  } catch { /* 키 오류·한도·시간 초과: TMDB 정보만 씁니다 */ }
  if (cache.size >= 500) cache.clear();
  cache.set(ck, found);
  return found;
}
