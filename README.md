# GYEOL (결)

취향·상황·분위기 기반 크로스미디어(책·영화·드라마·웹툰) 큐레이션 & 감상처 연결 서비스.

- 기획: [`PRD.md`](./PRD.md) · 디자인 명세: [`디자인.md`](./디자인.md)
- 스택: Next.js (App Router) + TypeScript, 순수 CSS 토큰(라이트/다크), Vercel 배포

## 로컬 실행

```bash
npm install
npm run dev   # http://localhost:3000
```

## 현재 상태

- **큐레이션 / 인생작 매칭:** `GEMINI_API_KEY`가 있으면 Gemini가 실제 작품 6편을 추천합니다(`/api/recommend/mood`, `/api/recommend/crossover`). 키가 없거나 호출이 실패하면 시험용 작품 목록(`lib/data.ts`)과 규칙 기반 점수로 대체하고, 화면에 안내를 띄웁니다.
- **표지:** 추천 결과가 뜬 뒤 작품별로 `/api/works/cover`가 공개 API(Open Library · Apple iTunes · TVmaze · AniList · Wikipedia)에서 표지를 찾고, `/api/cover-proxy`(허용 호스트만)로 보여 줍니다. 못 찾으면 타이포 커버를 보여 줍니다.
- **작품 상세 모달:** 감상 포인트, 도입부 미리보기, 전체 플랫폼 링크(검색 결과로 연결), 감상 상태·별점·메모, **실시간 감상처 확인**(`/api/works/access`, Gemini + Google 검색 근거).
- **내 보관함 (`/archive`):** 감상 상태·별점·메모, 인생작 시드, 큐레이션 기록(다시 보기), JSON 내보내기/불러오기. 데이터는 브라우저(localStorage)에 저장되며 이전 버전 데이터는 자동 변환됩니다.
- **취향 프로필 (`/profile`):** 보관함·인생작 기반 취향 분석 (Gemini 또는 규칙 기반 대체).
- **요금제 (`/pricing`):** 월 ₩1,000 / 연 ₩10,000. 결제(Groble) 연결 전이라 버튼은 `준비 중`입니다.
- 아직 없는 것: 로그인·기기 간 동기화, 결제

## 환경 변수

`.env.example` 참고. 모두 선택 사항이며 서버에서만 사용됩니다 (`NEXT_PUBLIC_` 접두사 금지).

| 이름 | 설명 |
| :--- | :--- |
| `GEMINI_API_KEY` | AI 추천 · 취향 분석 · 감상처 확인 |
| `GEMINI_MODEL` | 사용할 모델 ID (기본 `gemini-3.6-flash`) |
| `GEMINI_FALLBACK_MODEL` | 기본 모델이 없거나 혼잡할 때 쓸 보조 모델 (기본 `gemini-3.8-flash`) |
| `TMDB_API_KEY` | (선택) 영화·드라마 포스터 조회용 TMDB 무료 API 키. 있으면 가장 먼저 사용 |
| `COVER_EXTENDED_SOURCES` | 표지 조회 확장 출처(예스24·알라딘 검색 페이지 파싱, IMDb 비공식 검색, 네이버웹툰 비공식 API) 사용 여부. 기본 `on`(무료 서비스 단계), 유료 결제를 열 때는 `off` |

## 운영 전 확인할 것

- AI 호출 API에는 IP당 분당 호출 제한이 있지만 서버리스 인스턴스별 메모리 기준이라 완전한 방어가 아닙니다. 공개 전에 Upstash Redis 등으로 교체하세요.
- AI 추천은 실제와 다른 작품 정보를 만들 수 있습니다. 화면에 안내 문구가 있으며, 출시 전 검증 방식(외부 메타데이터 대조)을 정하세요.
- **유료 결제를 열기 전에 `COVER_EXTENDED_SOURCES=off`로 바꾸세요.** 이 출처들은 공식 API가 아니라 해당 사이트 약관에 어긋날 수 있고 사이트 구조가 바뀌면 동작하지 않을 수 있습니다.
- 표지·포스터는 저작권이 있는 이미지입니다. 유료 서비스에서 쓰기 전에 각 API(Apple, TMDB 등)의 이용 조건을 확인하세요.
- Vercel 함수 실행 시간(추천 최대 60초)은 요금제별 한도를 확인하세요.

## Vercel 배포

저장소를 Vercel에서 Import하면 Framework Preset이 Next.js로 자동 인식됩니다. 환경 변수는 선택 사항입니다(위 표 참고). Vercel 프로젝트 Settings → Environment Variables에서 설정하세요.
