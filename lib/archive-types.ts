import { MEDIA_LABEL, WORKS, type Media } from "./data";

export type WatchStatus = "want" | "in_progress" | "completed";

export const STATUS_LABEL: Record<WatchStatus, string> = {
  want: "보고 싶음",
  in_progress: "감상 중",
  completed: "감상 완료",
};

export type Bookmark = {
  workId: string;
  status: WatchStatus;
  rating: number; // 0 = 미평가, 1~5
  memo: string;
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
  workIds: string[];
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
const WORK_IDS = new Set(WORKS.map((w) => w.id));
const STATUSES: WatchStatus[] = ["want", "in_progress", "completed"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const iso = (v: unknown): string => {
  const s = typeof v === "string" ? v : "";
  return Number.isNaN(Date.parse(s)) ? new Date().toISOString() : s;
};

/** 저장소·가져오기 파일에서 읽은 값을 검증해 안전한 형태로 정리합니다. */
export function sanitizeStore(raw: unknown): ArchiveStore {
  if (!isObj(raw)) return EMPTY_STORE;
  const seen = new Set<string>();
  const bookmarks: Bookmark[] = [];
  if (Array.isArray(raw.bookmarks)) {
    for (const b of raw.bookmarks) {
      if (!isObj(b) || typeof b.workId !== "string" || !WORK_IDS.has(b.workId) || seen.has(b.workId)) continue;
      seen.add(b.workId);
      const status = STATUSES.find((s) => s === b.status) ?? "want";
      const rating = typeof b.rating === "number" && b.rating >= 0 && b.rating <= 5 ? Math.round(b.rating) : 0;
      bookmarks.push({ workId: b.workId, status, rating, memo: str(b.memo, 1000), savedAt: iso(b.savedAt), updatedAt: iso(b.updatedAt) });
    }
  }
  const favoriteSeeds: FavoriteSeed[] = [];
  if (Array.isArray(raw.favoriteSeeds)) {
    for (const s of raw.favoriteSeeds.slice(0, 100)) {
      if (!isObj(s)) continue;
      const media = MEDIA_IDS.find((m) => m === s.media);
      const title = str(s.title, 100).trim();
      if (!media || !title) continue;
      favoriteSeeds.push({ id: str(s.id, 60) || `seed-${favoriteSeeds.length}-${Date.now()}`, title, media, whyLiked: str(s.whyLiked, 300), createdAt: iso(s.createdAt) });
    }
  }
  const history: HistorySession[] = [];
  if (Array.isArray(raw.history)) {
    for (const h of raw.history.slice(0, 20)) {
      if (!isObj(h) || !Array.isArray(h.workIds)) continue;
      history.push({
        id: str(h.id, 60) || `hist-${history.length}-${Date.now()}`,
        mode: h.mode === "crossover" ? "crossover" : "mood",
        querySummary: str(h.querySummary, 300),
        headline: str(h.headline, 200),
        workIds: h.workIds.filter((x): x is string => typeof x === "string" && WORK_IDS.has(x)).slice(0, 12),
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
