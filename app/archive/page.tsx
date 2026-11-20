"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { TopBar } from "@/components/TopBar";
import { useArchive } from "@/app/providers";
import { MEDIA_LABEL, WORKS, type Media } from "@/lib/data";
import { PLATFORM_BY_ID } from "@/lib/platforms";
import { STATUS_LABEL, type WatchStatus } from "@/lib/archive-types";

const MEDIA_LIST = Object.keys(MEDIA_LABEL) as Media[];
const STATUS_TABS: { id: "all" | WatchStatus; label: string }[] = [
  { id: "all", label: "전체 상태" }, { id: "want", label: STATUS_LABEL.want },
  { id: "in_progress", label: STATUS_LABEL.in_progress }, { id: "completed", label: STATUS_LABEL.completed },
];

export default function ArchivePage() {
  const a = useArchive();
  const [status, setStatus] = useState<"all" | WatchStatus>("all");
  const [media, setMedia] = useState<"all" | Media>("all");
  const [openMemo, setOpenMemo] = useState<string | null>(null);
  const [seedTitle, setSeedTitle] = useState("");
  const [seedMedia, setSeedMedia] = useState<Media>("book");
  const [seedWhy, setSeedWhy] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = a.bookmarks.flatMap((b) => {
    const work = WORKS.find((w) => w.id === b.workId);
    return work ? [{ b, work }] : [];
  }).filter(({ b, work }) => (status === "all" || b.status === status) && (media === "all" || work.media === media));

  function exportFile() {
    const blob = new Blob([a.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `gyeol-archive-${new Date().toISOString().slice(0, 10)}.json`;
    el.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) { setMessage("파일이 너무 큽니다. (최대 2MB)"); return; }
    const r = a.importJson(await file.text());
    setMessage(r.ok ? "아카이브를 불러왔습니다. 기존 보관함 내용은 불러온 내용으로 바뀌었어요." : r.error ?? "불러오기에 실패했습니다.");
    if (fileRef.current) fileRef.current.value = "";
  }

  function addSeed(e: FormEvent) {
    e.preventDefault();
    if (!seedTitle.trim()) return;
    a.addFavoriteSeed(seedTitle, seedMedia, seedWhy);
    setSeedTitle(""); setSeedWhy("");
  }

  return (
    <>
      <TopBar active="archive" />
      <main className="wrap page">
        <div className="page-head">
          <div>
            <div className="mono muted">PERSONAL ARCHIVE · 내 보관함</div>
            <h1 className="font-editorial">저장한 작품과 감상 기록</h1>
            <p className="desc">보관함에 담은 작품을 바로 열람하거나 감상 상태와 별점을 기록하세요. JSON 백업으로 다른 기기로도 옮길 수 있습니다.</p>
          </div>
          <div className="chips">
            <button className="chip" onClick={exportFile}>아카이브 내보내기</button>
            <button className="chip" onClick={() => fileRef.current?.click()}>불러오기</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </div>
        </div>
        {message && <div className="msg" role="status">{message}</div>}

        <section className="section">
          <div className="filters">
            <div className="chips">
              {STATUS_TABS.map((t) => <button key={t.id} className={`chip ${status === t.id ? "on" : ""}`} onClick={() => setStatus(t.id)}>{t.label}</button>)}
            </div>
            <div className="chips">
              <button className={`chip ${media === "all" ? "on" : ""}`} onClick={() => setMedia("all")}>전체</button>
              {MEDIA_LIST.map((m) => <button key={m} className={`chip ${media === m ? "on" : ""}`} onClick={() => setMedia(m)}>{MEDIA_LABEL[m]}</button>)}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="empty">
              <p>{a.bookmarks.length === 0 ? "아직 보관함에 저장된 작품이 없습니다. 오늘의 기분에 맞는 작품을 추천받아 담아 보세요." : "선택한 필터 조건에 해당하는 작품이 없습니다."}</p>
              <Link className="cta" href="/">큐레이션 탐색하러 가기</Link>
            </div>
          ) : (
            <div className="shelf">
              {items.map(({ b, work }) => (
                <div className="shelf-card" key={b.workId}>
                  <div className="shelf-top">
                    <div>
                      <div className="mono muted">{MEDIA_LABEL[work.media]} · {work.year}{work.length ? ` · ${work.length}` : ""}</div>
                      <h3 className="font-editorial">{work.title}</h3>
                      <div className="by">{work.creator}{work.cast ? ` · ${work.cast.slice(0, 3).join(", ")}` : ""}</div>
                    </div>
                    <button className="icon" aria-label="보관함에서 삭제" onClick={() => a.removeBookmark(b.workId)}>🗑</button>
                  </div>
                  <p className="reason">{b.memo ? `메모: ${b.memo}` : work.reason}</p>
                  <div className="links">
                    {work.platforms.slice(0, 3).map((pid) => {
                      const p = PLATFORM_BY_ID[pid];
                      return p ? <a key={pid} className="linkchip" href={p.search(work.title)} target="_blank" rel="noopener noreferrer">{p.name} ↗</a> : null;
                    })}
                  </div>
                  <div className="shelf-foot">
                    <div className="chips">
                      <select aria-label="감상 상태" value={b.status} onChange={(e) => a.updateBookmark(b.workId, { status: e.target.value as WatchStatus })}>
                        {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                      <span className="stars">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} aria-label={`${n}점`} aria-pressed={n <= b.rating} className={n <= b.rating ? "star on" : "star"} onClick={() => a.updateBookmark(b.workId, { rating: b.rating === n ? 0 : n })}>★</button>
                        ))}
                      </span>
                    </div>
                    <button className="chip" onClick={() => setOpenMemo(openMemo === b.workId ? null : b.workId)}>{openMemo === b.workId ? "메모 닫기" : "메모"}</button>
                  </div>
                  {openMemo === b.workId && (
                    <textarea rows={3} maxLength={1000} value={b.memo} placeholder="감상 메모를 남겨 보세요." onChange={(e) => a.updateBookmark(b.workId, { memo: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <h2 className="font-editorial">나의 인생작 시드 목록</h2>
          <p className="desc">여기에 등록한 작품은 취향 프로필 분석에 반영되고, 인생작 매칭의 시작점으로 쓸 수 있습니다.</p>
          <form className="seed-form" onSubmit={addSeed}>
            <select aria-label="매체" value={seedMedia} onChange={(e) => setSeedMedia(e.target.value as Media)}>
              {MEDIA_LIST.map((m) => <option key={m} value={m}>{MEDIA_LABEL[m]}</option>)}
            </select>
            <input type="text" maxLength={100} value={seedTitle} onChange={(e) => setSeedTitle(e.target.value)} placeholder="인생작 제목" />
            <input type="text" maxLength={300} value={seedWhy} onChange={(e) => setSeedWhy(e.target.value)} placeholder="좋았던 포인트 (선택)" />
            <button className="cta" type="submit" disabled={!seedTitle.trim()}>등록</button>
          </form>
          {a.favoriteSeeds.length > 0 && (
            <div className="rows">
              {a.favoriteSeeds.map((s) => (
                <div className="row" key={s.id}>
                  <div>
                    <span className="mono muted">{MEDIA_LABEL[s.media]}</span> <b>{s.title}</b>
                    {s.whyLiked && <div className="by">{s.whyLiked}</div>}
                  </div>
                  <div className="chips">
                    <Link className="chip" href={`/?mode=crossover&seed=${encodeURIComponent(s.id)}`}>이 작품으로 매칭</Link>
                    <button className="icon" aria-label="인생작 삭제" onClick={() => a.removeFavoriteSeed(s.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {a.history.length > 0 && (
          <section className="section">
            <h2 className="font-editorial">최근 큐레이션 기록</h2>
            <div className="rows">
              {a.history.map((h) => (
                <div className="row" key={h.id}>
                  <div>
                    <div className="mono muted">{h.mode === "mood" ? "기분·상황 큐레이션" : "인생작 크로스오버"} · {new Date(h.createdAt).toLocaleDateString("ko-KR")}</div>
                    <b>{h.querySummary || h.headline}</b>
                    <div className="by">{h.workIds.map((id) => WORKS.find((w) => w.id === id)?.title).filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="chips">
                    <Link className="chip" href={`/?restore=${encodeURIComponent(h.id)}`}>다시 보기</Link>
                    <button className="icon" aria-label="기록 삭제" onClick={() => a.removeHistory(h.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
