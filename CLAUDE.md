# CLAUDE.md — GYEOL(결) 작업 규칙

Claude Code가 매번 가장 먼저 읽는 작업 규칙입니다. 문서 우선순위: **PRD.md(무엇을) → CLAUDE.md(어떻게) → PLAN.md(어떤 순서로) → QA.md(잘 됐는지)**.
서비스 기준이 헷갈리면 PRD.md를 따르고, 결정이 바뀌면 PRD.md부터 고칩니다. 코드는 다시 써도 되지만 이 문서들은 사람이 정한 것입니다.

## 1. 서비스 한 줄 요약
책·영화·드라마·웹툰을 기분·상황·인생작으로 연결해 추천하고, 서점·OTT·웹툰 플랫폼으로 바로 이동하게 하는 한국어 큐레이션 서비스. 화면 기준은 `디자인.md`.

## 2. 기술 스택
- Next.js 15 App Router + React 19 + TypeScript, 일반 CSS(`app/globals.css`의 디자인 토큰, `data-theme`로 라이트/다크). Tailwind 사용 안 함.
- 배포: Vercel. `main`에 push하면 자동 배포됩니다.
- AI: Google Gemini(`lib/gemini.ts`)와 네이버 HyperCLOVA X(`lib/clova.ts`)를 REST로 호출하고, 실패하면 다음 제공자로 넘어갑니다. 키는 서버에서만 사용. 실시간 감상처 확인은 검색 근거가 필요해 Gemini 전용.
- 보관함·취향 프로필: 브라우저 localStorage(`gyeol-archive-v2`). 로그인·기기 간 동기화는 아직 없음.
- 결제: Groble 예정(미연동, 요금제 화면 CTA는 `준비 중`). 월간 ₩1,000 / 연간 ₩10,000.

## 3. 폴더 구조
- `app/` 페이지와 API 라우트 (`api/recommend/*`, `api/works/*`, `api/cover-proxy`, `api/profile/analyze`)
- `components/` 공용 컴포넌트 (TopBar, Cover, RecCard, WorkDetailModal)
- `lib/` 로직 (data, recommend, recommend-api, gemini, cover, platforms, item, archive-types, taste, ratelimit, theme)
- `public/images/` 히어로·매체별 표지 이미지

## 4. 환경 변수
| 이름 | 설명 |
|---|---|
| `GEMINI_API_KEY` | AI 추천 (없으면 샘플 데이터 기반 추천으로 대체) |
| `GEMINI_MODEL` | 기본 `gemini-3.6-flash` |
| `CLOVASTUDIO_API_KEY` | (선택) 네이버 CLOVA Studio(HyperCLOVA X). 있으면 Gemini 실패 시 이어서 사용 (`AI_PROVIDERS`로 순서 조정) |
| `TMDB_API_KEY` | 영화·드라마 포스터 (선택) |
| `COVER_EXTENDED_SOURCES` | 예스24·알라딘·IMDb·네이버 비공식 출처. **유료 결제를 열기 전에 `off`** |

## 5. 작업 규칙
- 응답과 화면 문구는 한국어. 말투는 간결하고 담백하게.
- 요청받은 것만 바꿉니다. 관련 없는 파일을 정리하거나 구조를 바꾸지 않습니다.
- 비밀 값(API 키 등)은 코드·커밋·채팅에 넣지 않습니다. `.env.example`에는 이름만 둡니다.
- 외부 이미지는 반드시 `/api/cover-proxy`(허용 호스트 목록, 이미지 형식만, 5MB 제한)를 거칩니다. 새 출처를 추가하면 `lib/cover.ts`의 허용 호스트도 함께 갱신합니다.
- API 라우트는 `runtime = "nodejs"`, 속도 제한(`lib/ratelimit.ts`)을 적용합니다. 지금은 인메모리라 서버리스에서 완전하지 않으므로 Upstash로 교체 예정입니다.
- AI 응답은 항상 스키마로 검증(`sanitizeItem` 등)하고, 실패하면 규칙 기반 추천으로 대체합니다. AI 추천은 `lib/verify.ts`로 외부 출처에서 조회해 `verified`를 채우고, 못 찾은 작품은 카드에 `출처 미확인`으로 표시합니다(걸러내지는 않음).
- 감상처 링크는 https만 허용합니다.
- 로컬에서 빌드·설치가 막힌 환경일 수 있습니다. 빌드를 못 돌렸다면 "검증하지 못했다"고 명시하고 Vercel 배포 결과를 확인하도록 안내합니다.

## 6. Git 규칙
- 사용자가 "지금까지 바뀐 내용을 ‘OO’라는 설명으로 커밋하고 GitHub에 올려줘"라고 하면, 변경분을 `OO`를 메시지로 커밋하고 `main`에 push합니다. 말하지 않으면 커밋·push하지 않습니다.
- 한 번에 한 가지 변경만 커밋하고 메시지는 한국어로 무엇을 바꿨는지 씁니다.
- 커밋·push까지 끝내면 이어서 **로컬에서 빌드하고 검증**합니다: `npm ci`(또는 `npm install`) → `npx tsc --noEmit` → `npm run build`. 이 규칙은 사용자가 따로 요청하지 않아도 적용합니다. 설치·빌드가 막힌 환경이면 "검증하지 못했다"고 적고 Vercel 배포 결과를 확인하도록 안내합니다(5장). 빌드 결과는 QA.md 3장(회귀 점검)에 기록합니다.

## 7. 작업 흐름
1. `PLAN.md`에서 지금 단계를 확인하고, 시작 전 해당 단계를 `진행 중`으로 표시합니다.
2. 작업 후 `PLAN.md` 체크 칸을 갱신하고 `QA.md`에 테스트 케이스와 결과를 기록합니다.
3. 막히거나 결정이 필요하면 추측하지 말고 사용자에게 묻습니다.
