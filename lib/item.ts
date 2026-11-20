import { MEDIA_LABEL, MOODS, type Media, type Work } from "./data";
import { PLATFORM_BY_ID } from "./platforms";

export type AccentTone = "lapis" | "forest" | "slate" | "bronze" | "plum";
export const ACCENT_TONES: AccentTone[] = ["lapis", "forest", "slate", "bronze", "plum"];

/** 화면에 보여 주는 추천 작품 한 건 (AI 추천·샘플 추천 공통) */
export type RecItem = {
  id: string;
  title: string;
  originalTitle?: string;
  englishTitle?: string;
  /** 표지 프록시 경로(/api/cover-proxy?...) — 조회 전에는 비어 있음 */
  coverImageUrl?: string;
  creator: string;
  cast: string[];
  characters: string[];
  media: Media;
  releaseYear: string;
  catalogCode: string;
  logline: string;
  matchReason: string;
  crossoverBridge?: string;
  appreciationPoints: string[];
  moodTags: string[];
  lengthInfo: string;
  completionStatus: string;
  /** 추천 플랫폼 한국어 이름 */
  recommendedPlatforms: string[];
  previewExcerpt: string;
  crossoverHint: string;
  accentTone: AccentTone;
  source: "ai" | "sample";
  /** 외부 출처(서점·TMDB 등)에서 실제 작품으로 확인되었는지. AI 추천에만 서버가 채웁니다. */
  verified?: boolean;
  /** 영화·드라마: 지금 한국 OTT에서 볼 수 없으면 "discontinued"(서비스가 중단된 콘텐츠) */
  availability?: "available" | "discontinued";
};

export const itemKey = (i: { media: Media; title: string }) => `${i.media}::${i.title.trim().toLowerCase()}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const s = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const list = (v: unknown, n: number, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean).slice(0, n) : [];

export function normalizeMedia(v: unknown): Media | null {
  const t = String(v ?? "").toLowerCase().trim();
  if (t === "book" || t === "책") return "book";
  if (t === "movie" || t === "film" || t === "영화") return "film";
  if (t === "drama" || t === "series" || t === "드라마") return "drama";
  if (t === "webtoon" || t === "웹툰") return "webtoon";
  return null;
}

/** 서버 응답·저장소·가져오기 파일에서 읽은 값을 안전한 RecItem으로 정리합니다. */
export function sanitizeItem(raw: unknown, fallbackId: string, source: "ai" | "sample" = "ai"): RecItem | null {
  if (!isObj(raw)) return null;
  const title = s(raw.title, 100);
  const media = normalizeMedia(raw.media ?? raw.mediaType);
  if (!title || !media) return null;
  const tone = ACCENT_TONES.find((t) => t === String(raw.accentTone ?? "").toLowerCase().trim()) ?? "lapis";
  const cover = typeof raw.coverImageUrl === "string" && raw.coverImageUrl.startsWith("/api/cover-proxy?url=") && raw.coverImageUrl.length < 800 ? raw.coverImageUrl : undefined;
  return {
    id: s(raw.id, 60) || fallbackId,
    title,
    originalTitle: s(raw.originalTitle, 100) || undefined,
    englishTitle: s(raw.englishTitle, 100) || undefined,
    coverImageUrl: cover,
    creator: s(raw.creator, 100),
    cast: list(raw.cast, 4, 40),
    characters: list(raw.characters, 4, 60),
    media,
    releaseYear: s(raw.releaseYear, 10),
    catalogCode: s(raw.catalogCode, 12),
    logline: s(raw.logline, 400),
    matchReason: s(raw.matchReason, 600),
    crossoverBridge: s(raw.crossoverBridge, 600) || undefined,
    appreciationPoints: list(raw.appreciationPoints, 3, 300),
    moodTags: list(raw.moodTags, 4, 30),
    lengthInfo: s(raw.lengthInfo, 40),
    completionStatus: s(raw.completionStatus, 20),
    recommendedPlatforms: list(raw.recommendedPlatforms, 5, 30),
    previewExcerpt: s(raw.previewExcerpt, 500),
    crossoverHint: s(raw.crossoverHint, 300),
    accentTone: tone,
    source: raw.source === "sample" ? "sample" : source,
    verified: raw.verified === true ? true : undefined,
    availability: raw.availability === "discontinued" ? "discontinued" : raw.availability === "available" ? "available" : undefined,
  };
}

const TONE_BY_MEDIA: Record<Media, AccentTone> = { book: "lapis", film: "plum", drama: "forest", webtoon: "bronze" };
const CODE_PREFIX: Record<Media, string> = { book: "BK", film: "FL", drama: "DR", webtoon: "WT" };

/** 시험용 작품 목록(Work)을 화면용 RecItem으로 변환 */
export function workToItem(w: Work, index: number): RecItem {
  const labels = w.moods.map((m) => MOODS.find((x) => x.id === m)?.label ?? m);
  return {
    id: w.id,
    title: w.title,
    creator: w.creator,
    cast: w.cast ?? [],
    characters: [],
    media: w.media,
    releaseYear: String(w.year),
    catalogCode: `${CODE_PREFIX[w.media]}-${String(index + 1).padStart(2, "0")}`,
    logline: w.reason,
    matchReason: w.reason,
    appreciationPoints: [],
    moodTags: labels.slice(0, 4),
    lengthInfo: w.length ?? "",
    completionStatus: w.finished ? "완결" : "연재·방영 중",
    recommendedPlatforms: w.platforms.map((id) => PLATFORM_BY_ID[id]?.name ?? "").filter(Boolean),
    previewExcerpt: "",
    crossoverHint: "",
    accentTone: TONE_BY_MEDIA[w.media],
    source: "sample",
  };
}

export const mediaLabel = (m: Media) => MEDIA_LABEL[m];
