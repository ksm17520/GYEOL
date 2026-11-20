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

- **큐레이션 / 인생작 매칭:** 히어로 · 매체 필터 · 세부 조건·플랫폼 · 기분·상황 입력 · 인생작 크로스오버 · 추천 결과 (시험용 작품 목록 + 규칙 기반 점수)
- **내 보관함 (`/archive`):** 저장한 작품의 감상 상태·별점·메모, 인생작 시드 등록, 최근 큐레이션 기록(다시 보기), JSON 내보내기/불러오기. 데이터는 브라우저(localStorage)에 저장됩니다.
- **취향 프로필 (`/profile`):** 보관함·인생작 기반 취향 DNA 분석. `GEMINI_API_KEY`가 있으면 Gemini로, 없거나 실패하면 규칙 기반 기본 분석으로 동작합니다.
- **요금제 (`/pricing`):** 월 ₩1,000 / 연 ₩10,000. 결제(Groble) 연결 전이라 버튼은 `준비 중`입니다.
- 아직 없는 것: 로그인·기기 간 동기화, 결제, AI 추천(Gemini)·표지 이미지, 작품 상세 모달

## 환경 변수

`.env.example` 참고. 모두 선택 사항이며 서버에서만 사용됩니다 (`NEXT_PUBLIC_` 접두사 금지).

| 이름 | 설명 |
| :--- | :--- |
| `GEMINI_API_KEY` | 취향 프로필 AI 분석 |
| `GEMINI_MODEL` | 사용할 모델 ID (기본 `gemini-2.5-flash`) |

## Vercel 배포

저장소를 Vercel에서 Import하면 Framework Preset이 Next.js로 자동 인식됩니다. 환경 변수는 선택 사항입니다(위 표 참고). Vercel 프로젝트 Settings → Environment Variables에서 설정하세요.
