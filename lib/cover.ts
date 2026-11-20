import type { Media } from "./data";

export type CoverTarget = { title: string; originalTitle?: string; englishTitle?: string; creator: string; media: Media; releaseYear?: string };

// 공개 API가 제공하는 이미지 호스트만 허용합니다.
const EXACT_HOSTS = new Set(["covers.openlibrary.org", "upload.wikimedia.org", "static.tvmaze.com", "s4.anilist.co"]);
const SUFFIX_HOSTS = [".mzstatic.com", ".archive.org"];

export function isAllowedCoverHost(host: string): boolean {
  return EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s));
}

const cache = new Map<string, string | null>();

const norm = (v: string) => v.toLowerCase().replace(/[\s\-_.,!?:'"()[\]·~]/g, "").trim();
function close(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || (y.length >= 2 && (x.includes(y) || y.includes(x)));
}

async function getJson(url: string, init: RequestInit = {}, ms = 2800): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": "GyeolArchive/1.0", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
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
    raw = (await openLibrary(t.englishTitle || t.originalTitle || t.title)) || (await itunes([t.title, t.englishTitle ?? ""], "ebook")) || (await wikipedia([`${t.title} ${t.creator}`.trim(), t.title]));
  } else if (t.media === "film") {
    raw = (await itunes([t.title, t.englishTitle ?? ""], "movie")) || (await wikipedia([`${t.title} 영화`, t.englishTitle || t.title]));
  } else if (t.media === "drama") {
    raw = (await tvmaze(intl)) || (await wikipedia([`${t.title} 드라마`, t.englishTitle || t.title]));
  } else {
    raw = (await anilist([t.title, t.englishTitle ?? ""])) || (await wikipedia([t.title, t.englishTitle ?? ""]));
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
