import { MOODS, WORKS, type Media, type MoodId, type SituationId, type Work } from "./data";

export type Filters = {
  media: Media[]; // 빈 배열 = 전체 매체
  length: "all" | "light" | "mid" | "long";
  finishedOnly: boolean;
  era: "all" | "recent5" | "since2010" | "classic";
  platforms: string[]; // 우선 추천할 구독 플랫폼
};

export const DEFAULT_FILTERS: Filters = {
  media: [],
  length: "all",
  finishedOnly: false,
  era: "all",
  platforms: [],
};

export function activeFilterCount(f: Filters): number {
  return (
    (f.length !== "all" ? 1 : 0) +
    (f.finishedOnly ? 1 : 0) +
    (f.era !== "all" ? 1 : 0) +
    f.platforms.length
  );
}

const THIS_YEAR = new Date().getFullYear();

function passesFilters(w: Work, f: Filters): boolean {
  if (f.media.length > 0 && !f.media.includes(w.media)) return false;
  if (f.length !== "all" && w.lengthClass !== f.length) return false;
  if (f.finishedOnly && !w.finished) return false;
  if (f.era === "recent5" && w.year < THIS_YEAR - 5) return false;
  if (f.era === "since2010" && w.year < 2010) return false;
  if (f.era === "classic" && w.year >= 2010) return false;
  return true;
}

/** 자유 문장·이유에서 분위기 신호를 읽는 간단한 키워드 사전 (규칙 기반 대체 로직) */
const MOOD_KEYWORDS: Record<MoodId, string[]> = {
  cold: ["서늘", "치밀", "미스터리", "스릴러", "긴장", "추리"],
  warm: ["따뜻", "위로", "잔잔", "힐링", "다정", "포근", "가족"],
  epic: ["세계관", "스케일", "판타지", "웅장", "대서사", "모험"],
  poetic: ["여운", "시적", "문장", "감성", "쓸쓸", "서정"],
  witty: ["위트", "유쾌", "경쾌", "코미디", "웃음", "재치"],
  psych: ["심리", "내면", "인간", "관계", "대화", "상처", "불안"],
  intense: ["강렬", "몰입", "반전", "통쾌", "빠른", "도파민", "액션"],
  youth: ["청춘", "성장", "학창", "계절", "첫사랑", "사랑", "로맨스"],
};

export function moodsFromText(text: string): MoodId[] {
  const found: MoodId[] = [];
  for (const m of MOODS) {
    if (MOOD_KEYWORDS[m.id].some((k) => text.includes(k))) found.push(m.id);
  }
  return found;
}

function platformBoost(w: Work, prefer: string[]): number {
  if (prefer.length === 0) return 0;
  return w.platforms.some((p) => prefer.includes(p)) ? 1.5 : 0;
}

export type Result = { work: Work; score: number };

export function recommendByMood(input: {
  moods: MoodId[];
  situation: SituationId | null;
  text: string;
  filters: Filters;
  limit?: number;
}): Result[] {
  const textMoods = moodsFromText(input.text);
  const words = input.text.split(/\s+/).filter((t) => t.length >= 2);
  return WORKS.filter((w) => passesFilters(w, input.filters))
    .map((work) => {
      let score = 0;
      for (const m of work.moods) {
        if (input.moods.includes(m)) score += 3;
        if (textMoods.includes(m)) score += 1.5;
      }
      if (input.situation && work.situations.includes(input.situation)) score += 2;
      const hay = `${work.title} ${work.reason}`;
      for (const t of words) if (hay.includes(t)) score += 0.5;
      score += platformBoost(work, input.filters.platforms);
      return { work, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 6);
}

export function recommendByFavorite(input: {
  title: string;
  media: Media;
  reasons: string[];
  filters: Filters;
  limit?: number;
}): Result[] {
  const title = input.title.trim();
  const known = WORKS.find((w) => w.title === title);
  const reasonMoods = moodsFromText(input.reasons.join(" "));
  const moods = new Set<MoodId>([...(known?.moods ?? []), ...reasonMoods]);
  const situations = new Set<SituationId>(known?.situations ?? []);
  return WORKS.filter(
    (w) => w.media !== input.media && w.title !== title && passesFilters(w, input.filters),
  )
    .map((work) => {
      let score = 0;
      for (const m of work.moods) if (moods.has(m)) score += 3;
      for (const s of work.situations) if (situations.has(s)) score += 1;
      score += platformBoost(work, input.filters.platforms);
      return { work, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 6);
}

function withObjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasBatchim ? "을" : "를"}`;
}

export function headlineFor(moods: MoodId[]): string {
  const labels: Record<MoodId, string> = {
    cold: "서늘한 몰입", warm: "따뜻한 위로", epic: "압도적인 스케일", poetic: "시적인 여운",
    witty: "경쾌한 위트", psych: "내면을 파고드는 시선", intense: "강렬한 전개", youth: "청춘의 계절감",
  };
  if (moods.length === 0) return "지금의 결에 어울리는 작품들";
  return `${withObjectParticle(labels[moods[0]])} 닮은 작품들`;
}
