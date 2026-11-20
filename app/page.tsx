"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useArchive } from "./providers";
import { useTheme } from "@/lib/theme";
import { MEDIA_LABEL, MEDIA_STAMP, MOODS, SITUATIONS, WORKS, type Media, type MoodId, type SituationId, type Work } from "@/lib/data";
import { GROUP_LABEL, PLATFORMS, PLATFORM_BY_ID, type PlatformGroup } from "@/lib/platforms";
import {
  DEFAULT_FILTERS, activeFilterCount, headlineFor, recommendByFavorite, recommendByMood,
  type Filters, type Result,
} from "@/lib/recommend";

type Mode = "mood" | "crossover";
const MEDIA_LIST: Media[] = ["book", "film", "drama", "webtoon"];

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* 저장소를 쓸 수 없어도 동작 */ }
}

export default function Home() {
  const { theme, toggle: toggleTheme } = useTheme();
  const arch = useArchive();
  const [mode, setMode] = useState<Mode>("mood");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const [moods, setMoods] = useState<MoodId[]>([]);
  const [situation, setSituation] = useState<SituationId | null>(null);
  const [text, setText] = useState("");

  const [favTitle, setFavTitle] = useState("");
  const [favMedia, setFavMedia] = useState<Media>("film");
  const [favReasons, setFavReasons] = useState<string[]>(["", "", ""]);

  const [results, setResults] = useState<Result[] | null>(null);
  const [headline, setHeadline] = useState("");
  const [note, setNote] = useState("");
  const [bannerOpen, setBannerOpen] = useState(true);
  const workspace = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (safeGet("gyeol-banner") === "closed") setBannerOpen(false);
  }, []);

  function pickMedia(m: Media | "all") {
    setFilters((f) => {
      if (m === "all") return { ...f, media: [] };
      const has = f.media.includes(m);
      let media = f.media.length === 0 ? [m] : has ? f.media.filter((x) => x !== m) : [...f.media, m];
      if (media.length === 0 || media.length === MEDIA_LIST.length) media = [];
      return { ...f, media };
    });
  }

  function toggleMood(id: MoodId) {
    setMoods((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));
  }

  const canMood = moods.length > 0 || situation !== null || text.trim().length > 0;
  const canFav = favTitle.trim().length > 0 && favReasons.some((r) => r.trim().length > 0);

  function platformNote(): string {
    const names = filters.platforms.map((p) => PLATFORM_BY_ID[p]?.name).filter(Boolean);
    return names.length > 0 ? `선택한 플랫폼(${names.join(" · ")})에서 볼 수 있는 작품을 우선 연결했어요.` : "원하는 플랫폼은 '세부 조건 · 플랫폼'에서 고르면 우선 추천에 반영돼요.";
  }

  function showResults(r: Result[], title: string, extra: string, summary: string, kind: Mode) {
    setResults(r);
    setHeadline(title);
    setNote(`${extra} ${platformNote()}`);
    if (r.length > 0) arch.addHistory({ mode: kind, querySummary: summary, headline: title, workIds: r.map((x) => x.work.id) });
    setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function submitMood() {
    const r = recommendByMood({ moods, situation, text, filters });
    const sit = SITUATIONS.find((s) => s.id === situation)?.label;
    const summary = [moods.map((m) => MOODS.find((x) => x.id === m)?.label).filter(Boolean).join(", "), sit, text.trim().slice(0, 60)].filter(Boolean).join(" / ");
    showResults(r, headlineFor(moods), [sit ? `상황: ${sit}.` : "", moods.length ? `분위기 ${moods.length}개를 반영했어요.` : ""].filter(Boolean).join(" "), summary, "mood");
  }

  function submitFav() {
    const r = recommendByFavorite({ title: favTitle, media: favMedia, reasons: favReasons, filters });
    showResults(r, `「${favTitle.trim()}」의 결을 닮은 다른 매체의 작품들`, `${MEDIA_LABEL[favMedia]} 외 다른 매체에서 골랐어요.`, `인생작 「${favTitle.trim()}」(${MEDIA_LABEL[favMedia]})`, "crossover");
  }

  function crossover(work: Work) {
    const r = recommendByFavorite({ title: work.title, media: work.media, reasons: [], filters });
    showResults(r, `「${work.title}」에서 이어지는 다른 매체의 작품들`, `${MEDIA_LABEL[work.media]} 외 다른 매체에서 골랐어요.`, `「${work.title}」에서 이어 보기`, "crossover");
  }

  function goPanel(m: Mode) {
    setMode(m);
    workspace.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filterCount = activeFilterCount(filters);

  // 다른 화면에서 넘어온 요청(?mode, ?seed, ?prompt, ?restore)을 한 번만 반영
  const handledParams = useRef(false);
  useEffect(() => {
    if (handledParams.current || !arch.ready) return;
    handledParams.current = true;
    const q = new URLSearchParams(window.location.search);
    const seed = q.get("seed");
    const prompt = q.get("prompt");
    const restore = q.get("restore");
    if (q.get("mode") === "crossover" || seed) setMode("crossover");
    if (seed) {
      const s = arch.favoriteSeeds.find((x) => x.id === seed);
      if (s) { setFavTitle(s.title); setFavMedia(s.media); setFavReasons([s.whyLiked, "", ""]); }
    }
    if (prompt) { setMode("mood"); setText(prompt.slice(0, 500)); }
    if (restore) {
      const h = arch.history.find((x) => x.id === restore);
      if (h) {
        const found = h.workIds.flatMap((id) => WORKS.filter((w) => w.id === id).map((work) => ({ work, score: 0 })));
        setMode(h.mode);
        setResults(found);
        setHeadline(h.headline);
        setNote("이전 큐레이션 기록을 다시 불러왔어요.");
      }
    }
    if (q.toString()) window.history.replaceState(null, "", window.location.pathname);
  }, [arch.ready, arch.favoriteSeeds, arch.history]);

  return (
    <>
      <TopBar active={mode === "mood" ? "curation" : "crossover"} onMode={goPanel} showTheme={false} />

      <main>
        <section className="wrap hero">
          <div>
            <div className="kicker mono">CURATION &amp; ACCESS ARCHIVE · 책 · 영화 · 드라마 · 웹툰</div>
            <h1 className="font-editorial">지금의 기분과 인생작의 결로 만나는 네 가지 매체</h1>
            <p>단순한 별점 순위가 아니라 당신이 놓인 상황과 마음의 온도를 읽고, 책·영화·드라마·웹툰을 연결합니다. 마음에 드는 작품은 서점, OTT, 웹툰 플랫폼으로 즉시 이동해 바로 감상할 수 있습니다.</p>
            <div className="hero-actions">
              <button className={`btn ${mode === "mood" ? "active" : ""}`} onClick={() => goPanel("mood")}>기분·상황 큐레이션</button>
              <button className={`btn ${mode === "crossover" ? "active" : ""}`} onClick={() => goPanel("crossover")}>인생작 크로스오버 매칭</button>
              <button className="btn accent" onClick={() => goPanel(mode)}>큐레이션 시작하기 ↘</button>
            </div>
            <div className="support">
              <div><b>연동 서점</b> · 예스24 · 교보문고 · 알라딘</div>
              <div><b>OTT</b> · 넷플릭스 · 티빙 · 왓챠 · 웨이브 · 유튜브</div>
              <div><b>웹툰</b> · 네이버웹툰 · 카카오페이지</div>
            </div>
          </div>
          <div className="fig" aria-hidden="true">
            <ArchiveArt />
            <div className="fig-scrim mono"><span>Fig. 01 — 취향의 결 아카이브</span><span>4 MEDIA · 10+ PLATFORMS</span></div>
          </div>
        </section>

        <section className="toolbar">
          <div className="wrap" style={{ padding: 0 }}>
            <div className="toolbar-row">
              <div className="chips">
                <span className="label">추천 매체</span>
                <button className={`chip ${filters.media.length === 0 ? "on" : ""}`} onClick={() => pickMedia("all")}>전체 매체</button>
                {MEDIA_LIST.map((m) => (
                  <button key={m} className={`chip ${filters.media.includes(m) ? "on" : ""}`} onClick={() => pickMedia(m)}>{MEDIA_LABEL[m]}</button>
                ))}
              </div>
              <div className="chips">
                <button className={`chip ${filterCount > 0 ? "on" : ""}`} aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)}>
                  세부 조건 · 플랫폼{filterCount > 0 ? ` (${filterCount})` : ""}
                </button>
                <button className="chip" onClick={toggleTheme}>{theme === "dark" ? "라이트 모드" : "다크 모드"}</button>
              </div>
            </div>
          </div>
        </section>

        <div className="wrap">
          {filterOpen && <FilterPanel filters={filters} setFilters={setFilters} />}

          <section ref={workspace} className="panel" id="workspace">
            <div className="chips" role="tablist" style={{ marginBottom: 16 }}>
              <button role="tab" aria-selected={mode === "mood"} className={`btn ${mode === "mood" ? "active" : ""}`} onClick={() => setMode("mood")}>기분·상황 큐레이션</button>
              <button role="tab" aria-selected={mode === "crossover"} className={`btn ${mode === "crossover" ? "active" : ""}`} onClick={() => setMode("crossover")}>인생작 크로스오버 매칭</button>
            </div>

            {mode === "mood" ? (
              <>
                <div className="mono" style={{ color: "var(--text-muted)" }}>01 · MOOD &amp; SITUATION CURATION</div>
                <h2 className="font-editorial">지금 당신의 상황과 기분의 결</h2>
                <p className="desc">분위기 키워드와 현재 상황을 고르거나, 자유 문장으로 원하는 감상 경험을 들려주세요.</p>
                <div className="field">
                  <div className="field-head"><span>원하는 분위기 (최대 4개 선택)</span><span className="mono">{moods.length}/4</span></div>
                  <div className="stack">
                    {MOODS.map((m) => (
                      <button key={m.id} className={`chip ${moods.includes(m.id) ? "on" : ""}`} aria-pressed={moods.includes(m.id)} onClick={() => toggleMood(m.id)}>{m.label}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <div className="field-head"><span>현재 놓인 상황</span></div>
                  <div className="stack">
                    {SITUATIONS.map((s) => (
                      <button key={s.id} className={`chip ${situation === s.id ? "on" : ""}`} aria-pressed={situation === s.id} onClick={() => setSituation(situation === s.id ? null : s.id)}>{s.label}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <div className="field-head"><span>구체적인 바람이나 상황 설명 (선택)</span></div>
                  <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 뻔한 로맨스보다는 인물 간 대화가 밀도 높고, 가을 밤 공기와 어울리는 완결작을 찾고 있어요." />
                </div>
                <div className="cta-row">
                  <p>추천 결과는 서점(예스24·교보문고·알라딘), OTT(넷플릭스·티빙·왓챠 등), 웹툰 플랫폼과 바로 연결됩니다.</p>
                  <button className="cta" disabled={!canMood} onClick={submitMood}>맞춤 작품 추천받기 →</button>
                </div>
              </>
            ) : (
              <>
                <div className="mono" style={{ color: "var(--text-muted)" }}>02 · LIFE WORK CROSSOVER</div>
                <h2 className="font-editorial">인생작의 결이 닮은 다른 매체</h2>
                <p className="desc">가장 좋아하는 작품과 좋았던 이유를 알려 주세요. 다른 매체에서 결이 닮은 작품을 찾아 드려요.</p>
                <div className="field">
                  <div className="field-head"><span>인생작 제목</span></div>
                  <input type="text" value={favTitle} onChange={(e) => setFavTitle(e.target.value)} placeholder="예: 헤어질 결심" />
                </div>
                <div className="field">
                  <div className="field-head"><span>매체</span></div>
                  <div className="stack">
                    {MEDIA_LIST.map((m) => (
                      <button key={m} className={`chip ${favMedia === m ? "on" : ""}`} aria-pressed={favMedia === m} onClick={() => setFavMedia(m)}>{MEDIA_LABEL[m]}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <div className="field-head"><span>좋았던 이유 (1~3개)</span></div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {favReasons.map((r, i) => (
                      <input key={i} type="text" value={r} onChange={(e) => setFavReasons((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} placeholder={["예: 인물의 심리를 파고드는 대화", "예: 서늘하지만 여운이 긴 분위기", "(선택)"][i]} />
                    ))}
                  </div>
                </div>
                <div className="cta-row">
                  <p>입력한 작품이 목록에 있으면 그 작품의 결을, 없으면 적어 주신 이유의 키워드를 기준으로 찾아요.</p>
                  <button className="cta" disabled={!canFav} onClick={submitFav}>결이 닮은 작품 찾기 →</button>
                </div>
              </>
            )}
          </section>

          {results && (
            <section className="results" id="results">
              <div className="mono" style={{ color: "var(--text-muted)" }}>CURATED EDITION · {results.length} WORKS</div>
              <h2 className="font-editorial">{headline}</h2>
              <p className="note">{note}</p>
              {results.length === 0 ? (
                <div className="empty">조건에 맞는 작품을 찾지 못했어요. 세부 조건을 줄이거나 분위기 키워드를 바꿔 보세요.</div>
              ) : (
                <div className="cards">
                  {results.map(({ work }) => (
                    <Card key={work.id} work={work} prefer={filters.platforms} saved={arch.isBookmarked(work.id)} onSave={() => arch.toggleBookmark(work.id)} onCross={() => crossover(work)} />
                  ))}
                </div>
              )}
              <p className="disclaimer">현재는 시험용 큐레이션 목록에서 추천합니다. 감상처 버튼은 각 플랫폼의 검색 결과로 연결되며, 실제 이용 가능 여부는 플랫폼에서 확인해 주세요.</p>
              {bannerOpen && (
                <div className="banner">
                  <Link href="/pricing">프리미엄 요금제 보기 →</Link>
                  <button aria-label="닫기" onClick={() => { setBannerOpen(false); safeSet("gyeol-banner", "closed"); }} style={{ background: "none", border: 0 }}>✕</button>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="wrap">GYEOL (결) · 취향·상황·분위기 큐레이션 아카이브 · 작품 정보는 시험용 데이터입니다.</div>
      </footer>
    </>
  );
}

function ArchiveArt() {
  const books = [
    [20, 150, 34], [58, 120, 28], [90, 170, 40], [134, 135, 30], [168, 160, 36],
    [208, 125, 32], [244, 175, 38], [286, 140, 30], [320, 165, 36], [360, 130, 30],
  ];
  return (
    <svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMid slice">
      <rect width="400" height="340" fill="var(--hero-mat)" />
      {[0, 1].map((row) => (
        <g key={row} transform={`translate(0 ${row * 150})`}>
          <rect x="0" y="190" width="400" height="6" fill="var(--border)" />
          {books.map(([x, h, w], i) => (
            <rect key={i} x={x + (row ? 12 : 0)} y={190 - h + (row ? (i % 3) * 6 : 0)} width={w} height={h - (row ? (i % 3) * 6 : 0)} rx="2" fill="var(--accent)" opacity={0.18 + ((i + row * 3) % 5) * 0.12} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function FilterPanel({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const groups: PlatformGroup[] = ["bookstore", "ott", "webtoon"];
  const togglePlatform = (id: string) =>
    setFilters({ ...filters, platforms: filters.platforms.includes(id) ? filters.platforms.filter((x) => x !== id) : [...filters.platforms, id] });
  const opt = <K extends "length" | "era">(key: K, value: Filters[K], label: string) => (
    <button key={String(value)} className={`chip ${filters[key] === value ? "on" : ""}`} onClick={() => setFilters({ ...filters, [key]: value })}>{label}</button>
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>탐색 세부 조건 &amp; 구독 중인 플랫폼</h3>
          <p>분량과 완결 여부, 이용 중인 플랫폼을 선택하면 바로 감상할 수 있는 작품을 우선 추천합니다.</p>
        </div>
        <button className="reset" onClick={() => setFilters({ ...DEFAULT_FILTERS, media: filters.media })}>조건 초기화</button>
      </div>
      <div className="rows3">
        <div><h4>선호 분량</h4><div className="stack">
          {opt("length", "all", "전체 분량")}{opt("length", "light", "가볍게 (단편/영화)")}{opt("length", "mid", "적당한 호흡")}{opt("length", "long", "긴 호흡 (장편/시리즈)")}
        </div></div>
        <div><h4>완결 상태</h4><div className="stack">
          <button className={`chip ${!filters.finishedOnly ? "on" : ""}`} onClick={() => setFilters({ ...filters, finishedOnly: false })}>전체</button>
          <button className={`chip ${filters.finishedOnly ? "on" : ""}`} onClick={() => setFilters({ ...filters, finishedOnly: true })}>완결작만</button>
        </div></div>
        <div><h4>제작·출간 시기</h4><div className="stack">
          {opt("era", "all", "모든 시기")}{opt("era", "recent5", "최근 5년 이내")}{opt("era", "since2010", "2010년대 이후")}{opt("era", "classic", "2010년 이전 고전·명작")}
        </div></div>
      </div>
      <div className="divider" />
      <div className="grid3">
        {groups.map((g) => (
          <div key={g}><h4>{GROUP_LABEL[g]}</h4><div className="stack">
            {PLATFORMS.filter((p) => p.group === g).map((p) => (
              <button key={p.id} className={`chip ${filters.platforms.includes(p.id) ? "on" : ""}`} aria-pressed={filters.platforms.includes(p.id)} onClick={() => togglePlatform(p.id)}>{p.name}</button>
            ))}
          </div></div>
        ))}
      </div>
    </section>
  );
}

function Card({ work, prefer, saved, onSave, onCross }: { work: Work; prefer: string[]; saved: boolean; onSave: () => void; onCross: () => void }) {
  const idx = WORKS.findIndex((w) => w.id === work.id) + 1;
  const stamp = `${MEDIA_STAMP[work.media]} · ${work.id.slice(0, 2).toUpperCase()}-${String(idx).padStart(2, "0")}`;
  return (
    <article className="card">
      <div className="cover-box">
        <div className="stamp mono">{stamp}</div>
        <div className={`cover c-${work.media}`}>
          <div className="t font-editorial">{work.title}</div>
          <div className="c">{work.creator}</div>
        </div>
        <div className="castband">{work.cast ? work.cast.join(" · ") : " "}</div>
      </div>
      <div className="rec-body">
        <div className="meta"><b>{MEDIA_LABEL[work.media]}</b> · {work.length ? `${work.length} · ` : ""}{work.finished ? "완결" : "연재·방영 중"}</div>
        <h3 className="font-editorial">{work.title}</h3>
        <p className="by">{work.creator}</p>
        <p className="reason">{work.reason}</p>
        <div className="tags">{work.moods.map((m) => <span className="tag" key={m}>{MOODS.find((x) => x.id === m)?.label}</span>)}</div>
      </div>
      <div className="rec-footer">
        <div className="links">
          {work.platforms.map((pid) => {
            const p = PLATFORM_BY_ID[pid];
            if (!p) return null;
            return <a key={pid} className={`linkchip ${prefer.includes(pid) ? "pref" : ""}`} href={p.search(work.title)} target="_blank" rel="noopener noreferrer">{p.name}</a>;
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="icon" title="다른 매체 크로스오버 추천" aria-label="다른 매체 크로스오버 추천" onClick={onCross}>⇄</button>
          <button className={`icon ${saved ? "on" : ""}`} title="보관함 저장" aria-label="보관함 저장" aria-pressed={saved} onClick={onSave}>🔖</button>
        </div>
      </div>
    </article>
  );
}
