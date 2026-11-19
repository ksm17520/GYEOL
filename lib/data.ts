export type Media = "book" | "film" | "drama" | "webtoon";

export const MEDIA_LABEL: Record<Media, string> = {
  book: "책",
  film: "영화",
  drama: "드라마",
  webtoon: "웹툰",
};

export const MEDIA_STAMP: Record<Media, string> = {
  book: "BOOK",
  film: "FILM",
  drama: "DRAMA",
  webtoon: "WEBTOON",
};

export const MOODS = [
  { id: "cold", label: "서늘하고 치밀한 몰입" },
  { id: "warm", label: "잔잔하고 따뜻한 위로" },
  { id: "epic", label: "압도적 세계관과 스케일" },
  { id: "poetic", label: "여운이 길게 남는 시적 감성" },
  { id: "witty", label: "위트 있고 경쾌한 템포" },
  { id: "psych", label: "인간 내면을 파고드는 심리전" },
  { id: "intense", label: "도파민 터지는 강렬한 전개" },
  { id: "youth", label: "계절감 있는 청춘·성장" },
] as const;

export const SITUATIONS = [
  { id: "rainy", label: "비 오는 늦은 밤, 혼자 조용히" },
  { id: "binge", label: "주말 내내 침대에서 정주행" },
  { id: "commute", label: "출퇴근길 이동 중 가볍게" },
  { id: "clear", label: "머리가 복잡할 때 생각 비우기" },
  { id: "think", label: "오랜만에 지적 자극이 필요할 때" },
  { id: "together", label: "친구·연인과 함께 보고 이야기 나누기" },
] as const;

export type MoodId = (typeof MOODS)[number]["id"];
export type SituationId = (typeof SITUATIONS)[number]["id"];

export type Work = {
  id: string;
  media: Media;
  title: string;
  creator: string;
  /** 분량 표기 (예: 332쪽 / 138분 / 16부작) — 확실한 값만 기입 */
  length?: string;
  lengthClass: "light" | "mid" | "long";
  finished: boolean;
  year: number;
  /** 영화·드라마: 주연배우 이름만 */
  cast?: string[];
  reason: string;
  moods: MoodId[];
  situations: SituationId[];
  platforms: string[];
};

const BOOKSTORES = ["yes24", "kyobo", "aladin"];
const OTT = ["netflix", "tving", "watcha", "wavve", "youtube"];
const WEBTOON = ["naverwebtoon", "kakaopage"];

/**
 * MVP 시드 데이터입니다. 이후 AI(Gemini) 추천과 외부 메타데이터로 대체됩니다.
 * 감상처 링크는 '검색 결과' 링크이며, 실제 이용 가능 여부는 각 플랫폼에서 확인해야 합니다.
 */
export const WORKS: Work[] = [
  {
    id: "bk-01", media: "book", title: "작별하지 않는다", creator: "한강", length: "332쪽",
    lengthClass: "mid", finished: true, year: 2021,
    reason: "눈 내리는 기억의 풍경을 따라가는 문장이 오래 남는, 조용하지만 깊은 애도의 소설.",
    moods: ["poetic", "psych"], situations: ["rainy", "think"], platforms: BOOKSTORES,
  },
  {
    id: "bk-02", media: "book", title: "채식주의자", creator: "한강",
    lengthClass: "mid", finished: true, year: 2007,
    reason: "한 사람의 선택이 가족과 일상을 흔드는 과정을 서늘하게 파고드는 작품.",
    moods: ["psych", "cold"], situations: ["think", "rainy"], platforms: BOOKSTORES,
  },
  {
    id: "bk-03", media: "book", title: "아몬드", creator: "손원평",
    lengthClass: "mid", finished: true, year: 2017,
    reason: "감정을 느끼지 못하는 소년이 사람과 부딪히며 자라는 이야기. 담백한 문장으로 빠르게 읽힙니다.",
    moods: ["youth", "warm", "psych"], situations: ["commute", "think"], platforms: BOOKSTORES,
  },
  {
    id: "fl-01", media: "film", title: "헤어질 결심", creator: "감독 박찬욱", length: "138분",
    lengthClass: "light", finished: true, year: 2022, cast: ["박해일", "탕웨이", "이정현"],
    reason: "안개와 바다의 이미지, 말과 마음이 어긋나는 사랑을 미스터리의 호흡으로 끌고 가는 영화.",
    moods: ["cold", "psych", "poetic"], situations: ["rainy", "clear"], platforms: OTT,
  },
  {
    id: "fl-02", media: "film", title: "패스트 라이브즈", creator: "감독 셀린 송", length: "106분",
    lengthClass: "light", finished: true, year: 2023, cast: ["그레타 리", "유태오", "존 마가로"],
    reason: "스쳐 간 인연과 시간의 거리를 담담하게 그려 여운이 길게 남는 영화.",
    moods: ["poetic", "warm", "youth"], situations: ["rainy", "together"], platforms: OTT,
  },
  {
    id: "fl-03", media: "film", title: "리틀 포레스트", creator: "감독 임순례", length: "103분",
    lengthClass: "light", finished: true, year: 2018, cast: ["김태리", "류준열", "문소리"],
    reason: "계절마다 바뀌는 밥상과 풍경으로 지친 마음을 천천히 풀어 주는 영화.",
    moods: ["warm", "youth"], situations: ["clear", "commute"], platforms: OTT,
  },
  {
    id: "fl-04", media: "film", title: "기생충", creator: "감독 봉준호", length: "132분",
    lengthClass: "light", finished: true, year: 2019, cast: ["송강호", "이선균", "조여정"],
    reason: "웃음과 긴장이 교차하며 끝까지 몰아치는 전개. 보고 나서 이야기 나눌 거리가 많습니다.",
    moods: ["intense", "psych", "witty"], situations: ["together", "clear"], platforms: OTT,
  },
  {
    id: "dr-01", media: "drama", title: "나의 아저씨", creator: "tvN", length: "16부작",
    lengthClass: "long", finished: true, year: 2018, cast: ["이선균", "아이유"],
    reason: "서로의 상처를 말없이 알아보는 두 사람의 이야기. 조용한 위로가 필요한 밤에 어울립니다.",
    moods: ["warm", "psych"], situations: ["binge", "rainy"], platforms: OTT,
  },
  {
    id: "dr-02", media: "drama", title: "미생", creator: "tvN", length: "20부작",
    lengthClass: "long", finished: true, year: 2014, cast: ["임시완", "이성민", "강소라"],
    reason: "사회 초년생의 하루를 현실감 있게 따라가며 작은 용기를 건네는 드라마.",
    moods: ["warm", "youth"], situations: ["commute", "together"], platforms: OTT,
  },
  {
    id: "dr-03", media: "drama", title: "응답하라 1988", creator: "tvN", length: "20부작",
    lengthClass: "long", finished: true, year: 2015, cast: ["혜리", "박보검", "류준열"],
    reason: "골목 이웃들의 웃음과 눈물로 채운 따뜻하고 경쾌한 정주행용 드라마.",
    moods: ["warm", "witty", "youth"], situations: ["binge", "together"], platforms: OTT,
  },
  {
    id: "wt-01", media: "webtoon", title: "이끼", creator: "윤태호",
    lengthClass: "long", finished: true, year: 2007,
    reason: "외딴 마을에 감도는 의심과 긴장이 쉼 없이 이어지는 스릴러 웹툰.",
    moods: ["cold", "intense", "psych"], situations: ["binge", "rainy"], platforms: WEBTOON,
  },
  {
    id: "wt-02", media: "webtoon", title: "유미의 세포들", creator: "이동건",
    lengthClass: "long", finished: true, year: 2015,
    reason: "일상의 감정을 세포 캐릭터로 풀어낸 경쾌하고 다정한 연애·성장 이야기.",
    moods: ["warm", "witty", "youth"], situations: ["commute", "together"], platforms: WEBTOON,
  },
  {
    id: "wt-03", media: "webtoon", title: "죽음에 관하여", creator: "시니 / 혀노", length: "완결 67화",
    lengthClass: "mid", finished: true, year: 2019,
    reason: "죽음을 둘러싼 이야기들을 차분히 따라가며 삶의 결을 돌아보게 하는 웹툰.",
    moods: ["poetic", "psych"], situations: ["think", "rainy"], platforms: WEBTOON,
  },
  {
    id: "wt-04", media: "webtoon", title: "나 혼자만 레벨업", creator: "추공 원작 · DUBU 작화",
    lengthClass: "long", finished: true, year: 2018,
    reason: "압도적인 성장과 스케일, 막힘없는 전개로 정주행하기 좋은 판타지 액션.",
    moods: ["epic", "intense"], situations: ["binge", "commute"], platforms: WEBTOON,
  },
  {
    id: "wt-05", media: "webtoon", title: "치즈인더트랩", creator: "순끼",
    lengthClass: "long", finished: true, year: 2010,
    reason: "캠퍼스 인물들의 미묘한 심리와 거리를 섬세하게 그린 청춘 로맨스 스릴러.",
    moods: ["youth", "psych"], situations: ["binge"], platforms: WEBTOON,
  },
];
