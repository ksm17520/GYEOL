import { MEDIA_LABEL, WORKS, type Media } from "./data";
import { itemKey, sanitizeItem, workToItem, type RecItem } from "./item";

export type WatchStatus = "want" | "in_progress" | "completed";

export const STATUS_LABEL: Record<WatchStatus, string> = {
  want: "보고 싶음",
  in_progress: "감상 중",
  completed: "감상 완료",
};

export type VerifiedAccess = {
  summary: string;
  sources: { title: string; uri: string }[];
  verifiedAt: string;
};

export type Bookmark = {
  /** 매체+제목 기반 식별자 (itemKey) */
  key: string;
  item: RecItem;
  status: WatchStatus;
  rating: number; // 0 = 미평가, 1~5
  memo: string;
  verifiedAccess?: VerifiedAccess;
  /** 영화·시리즈의 감독·상태를 TMDB 정보로 마지막으로 갱신한 시각 */
  screenSyncedAt?: string;
  /** 갱신 규칙 버전. 규칙이 바뀌면 올려서 이미 갱신된 항목도 다시 갱신합니다. */
  screenSyncVer?: number;
  /** 표지를 다시 조회한 규칙 버전(다르면 보관함을 열 때 한 번 다시 조회) */
  coverSyncVer?: number;
  savedAt: string;
  updatedAt: string;
};

export type FavoriteSeed = {
  id: string;
  title: string;
  media: Media;
  whyLiked: string;
  createdAt: string;
};

export type HistorySession = {
  id: string;
  mode: "mood" | "crossover";
  querySummary: string;
  headline: string;
  note: string;
  items: RecItem[];
  createdAt: string;
};

export type TasteProfile = {
  personaTitle: string;
  editorialSummary: string;
  coreMoods: string[];
  narrativePreferences: string[];
  crossMediaInsight: string;
  nextDiscoveryPrompt: string;
  updatedAt: string;
  /** ai = Gemini 분석, rule = 규칙 기반 대체 분석 */
  source: "ai" | "rule";
};

export type ArchiveStore = {
  bookmarks: Bookmark[];
  favoriteSeeds: FavoriteSeed[];
  history: HistorySession[];
  tasteProfile: TasteProfile | null;
};

export const EMPTY_STORE: ArchiveStore = { bookmarks: [], favoriteSeeds: [], history: [], tasteProfile: null };

const MEDIA_IDS = Object.keys(MEDIA_LABEL) as Media[];
const STATUSES: WatchStatus[] = ["want", "in_progress", "completed"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const iso = (v: unknown): string => {
  const s = typeof v === "string" ? v : "";
  return Number.isNaN(Date.parse(s)) ? new Date().toISOString() : s;
};

/** 저장소·가져오기 파일에서 읽은 값을 검증해 안전한 형태로 정리합니다. (v1: workId 기반 보관함도 변환) */
export function sanitizeStore(raw: unknown): ArchiveStore {
  if (!isObj(raw)) return EMPTY_STORE;

  const toItem = (x: unknown, id: string): RecItem | null => {
    if (!isObj(x)) return null;
    if (typeof x.workId === "string") {
      const idx = WORKS.findIndex((w) => w.id === x.workId);
      return idx >= 0 ? workToItem(WORKS[idx], idx) : null;
    }
    return sanitizeItem(x.item ?? x, id);
  };

  const seen = new Set<string>();
  const bookmarks: Bookmark[] = [];
  if (Array.isArray(raw.bookmarks)) {
    for (const b of raw.bookmarks.slice(0, 500)) {
      if (!isObj(b)) continue;
      const item = toItem(b, `bm-${bookmarks.length}`);
      if (!item) continue;
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      const status = STATUSES.find((s) => s === b.status) ?? "want";
      const rating = typeof b.rating === "number" && b.rating >= 0 && b.rating <= 5 ? Math.round(b.rating) : 0;
      bookmarks.push({ key, item, status, rating, memo: str(b.memo, 1000), verifiedAccess: sanitizeAccess(b.verifiedAccess), screenSyncVer: typeof b.screenSyncVer === "number" ? b.screenSyncVer : undefined, coverSyncVer: typeof b.coverSyncVer === "number" ? b.coverSyncVer : undefined, screenSyncedAt: typeof b.screenSyncedAt === "string" && !Number.isNaN(Date.parse(b.screenSyncedAt)) ? b.screenSyncedAt : undefined, savedAt: iso(b.savedAt), updatedAt: iso(b.updatedAt) });
    }
  }
  const favoriteSeeds: FavoriteSeed[] = [];
  if (Array.isArray(raw.favoriteSeeds)) {
    for (const s of raw.favoriteSeeds.slice(0, 100)) {
      if (!isObj(s)) continue;
      const media = MEDIA_IDS.find((m) => m === s.media) ?? (s.mediaType === "movie" ? "film" : MEDIA_IDS.find((m) => m === s.mediaType));
      const title = str(s.title, 100).trim();
      if (!media || !title) continue;
      favoriteSeeds.push({ id: str(s.id, 60) || `seed-${favoriteSeeds.length}-${Date.now()}`, title, media, whyLiked: str(s.whyLiked, 300), createdAt: iso(s.createdAt) });
    }
  }
  const history: HistorySession[] = [];
  if (Array.isArray(raw.history)) {
    for (const h of raw.history.slice(0, 20)) {
      if (!isObj(h)) continue;
      let items: RecItem[] = [];
      if (Array.isArray(h.items)) {
        items = h.items.slice(0, 8).map((x, i) => sanitizeItem(x, `h-${i}`)).filter((x): x is RecItem => x !== null);
      } else if (Array.isArray(h.workIds)) {
        items = h.workIds.flatMap((id) => {
          const idx = WORKS.findIndex((w) => w.id === id);
          return idx >= 0 ? [workToItem(WORKS[idx], idx)] : [];
        }).slice(0, 8);
      }
      history.push({
        id: str(h.id, 60) || `hist-${history.length}-${Date.now()}`,
        mode: h.mode === "crossover" ? "crossover" : "mood",
        querySummary: str(h.querySummary, 300),
        headline: str(h.headline, 200),
        note: str(h.note, 600),
        items,
        createdAt: iso(h.createdAt),
      });
    }
  }
  let tasteProfile: TasteProfile | null = null;
  const t = raw.tasteProfile;
  if (isObj(t) && typeof t.personaTitle === "string" && typeof t.editorialSummary === "string") {
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8).map((x) => x.slice(0, 200)) : []);
    tasteProfile = {
      personaTitle: str(t.personaTitle, 200), editorialSummary: str(t.editorialSummary, 1500),
      coreMoods: list(t.coreMoods), narrativePreferences: list(t.narrativePreferences),
      crossMediaInsight: str(t.crossMediaInsight, 1500), nextDiscoveryPrompt: str(t.nextDiscoveryPrompt, 500),
      updatedAt: iso(t.updatedAt), source: t.source === "ai" ? "ai" : "rule",
    };
  }
  return { bookmarks, favoriteSeeds, history, tasteProfile };
}

/** 감상처 확인 결과 검증: 링크는 https 주소만 허용 */
export function sanitizeAccess(v: unknown): VerifiedAccess | undefined {
  if (!isObj(v) || typeof v.summary !== "string") return undefined;
  const sources = Array.isArray(v.sources)
    ? v.sources.flatMap((x) => {
        if (!isObj(x) || typeof x.uri !== "string") return [];
        try {
          const u = new URL(x.uri);
          return u.protocol === "https:" ? [{ title: str(x.title, 120) || u.hostname, uri: u.toString().slice(0, 1000) }] : [];
        } catch { return []; }
      }).slice(0, 6)
    : [];
  return { summary: str(v.summary, 1200), sources, verifiedAt: iso(v.verifiedAt) };
}
