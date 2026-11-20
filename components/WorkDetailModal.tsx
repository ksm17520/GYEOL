"use client";

import { useEffect, useRef, useState } from "react";
import { useArchive } from "@/app/providers";
import { MEDIA_LABEL } from "@/lib/data";
import { STATUS_LABEL, sanitizeAccess, type VerifiedAccess, type WatchStatus } from "@/lib/archive-types";
import { itemKey, type RecItem } from "@/lib/item";
import { buildPlatformLinks, trailerUrl } from "@/lib/platforms";
import { Cover } from "./Cover";

export function WorkDetailModal({ item, onClose, onCross, onTrack }: {
  item: RecItem; onClose: () => void; onCross: (item: RecItem) => void; onTrack: (item: RecItem, platformName: string) => void;
}) {
  const a = useArchive();
  const bookmark = a.getBookmark(item);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifiedAccess | null>(bookmark?.verifiedAccess ?? null);
  const [memo, setMemo] = useState(bookmark?.memo ?? "");
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // 부모가 다시 그려져도 포커스·스크롤 잠금 효과가 다시 실행되지 않도록 최신 함수만 보관

  // 열릴 때 포커스 이동, 닫힐 때 원래 위치로 복귀, 배경 스크롤 잠금, Esc 닫기, Tab 순환
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab" || !dialog.current) return;
      const f = Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,select,input'));
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);

  useEffect(() => { setMemo(bookmark?.memo ?? ""); }, [bookmark?.memo]);
  useEffect(() => { if (bookmark?.verifiedAccess) setVerified(bookmark.verifiedAccess); }, [bookmark?.verifiedAccess]);

  const links = buildPlatformLinks(item.title, item.creator, item.media, item.recommendedPlatforms);
  const screen = item.media === "film" || item.media === "drama";

  async function verify() {
    setVerifying(true); setVerifyError(null);
    try {
      const res = await fetch("/api/works/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: item.title, creator: item.creator, media: item.media }) });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error((data as { error?: string })?.error || "감상처 확인 중 오류가 발생했습니다.");
      const access = sanitizeAccess(data);
      if (!access) throw new Error("확인 결과를 읽지 못했어요.");
      setVerified(access);
      if (bookmark) a.saveVerifiedAccess(itemKey(item), access);
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "감상처 확인에 실패했습니다.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-label={`${item.title} 상세 및 열람 허브`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mono muted">{MEDIA_LABEL[item.media]}{item.catalogCode ? ` · ${item.catalogCode}` : ""}{item.releaseYear ? ` · ${item.releaseYear}` : ""}</div>
          <div className="chips">
            <button className={`chip ${bookmark ? "on" : ""}`} aria-pressed={Boolean(bookmark)} onClick={() => a.toggleBookmark(item)}>{bookmark ? "보관함 저장됨" : "보관함에 담기"}</button>
            <button ref={closeBtn} className="icon" aria-label="닫기" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-split">
            <div>
              <Cover item={item} hideCast />
              <dl className="meta-list">
                <div><dt>{screen ? "감독 · 연출" : "창작자"}</dt><dd>{item.creator}</dd></div>
                {(item.characters.length > 0 || item.cast.length > 0) && <div><dt>주요 등장인물</dt><dd>{(item.characters.length > 0 ? item.characters : item.cast).join(" · ")}</dd></div>}
                {item.lengthInfo && <div><dt>분량 · 호흡</dt><dd>{item.lengthInfo}</dd></div>}
                {item.completionStatus && <div><dt>완결 상태</dt><dd>{item.completionStatus}</dd></div>}
                {item.moodTags.length > 0 && <div><dt>분위기 결</dt><dd>{item.moodTags.join(" · ")}</dd></div>}
              </dl>
            </div>

            <div className="modal-main">
              <h2 className="font-editorial">{item.title}</h2>
              {item.originalTitle && item.originalTitle !== item.title && <p className="by">{item.originalTitle}</p>}
              <p className="lead2">{item.logline}</p>

              <div className="block">
                <div className="block-head">
                  <div>
                    <h3>어디서 볼 수 있나요 · 바로 열람하기</h3>
                    <p className="muted small">원하는 플랫폼을 선택하면 해당 플랫폼의 검색 결과로 연결됩니다.</p>
                  </div>
                  <button className="chip" onClick={verify} disabled={verifying}>{verifying ? "실시간 확인 중…" : "실시간 감상처 확인"}</button>
                </div>
                <div className="links">
                  {links.map((l) => (
                    <a key={l.id} className={`linkchip big ${l.isRecommended ? "pref" : ""}`} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onTrack(item, l.name)}>{l.name} ↗</a>
                  ))}
                  <a className="linkchip big" href={trailerUrl(item.title, item.media)} target="_blank" rel="noopener noreferrer">▶ {item.media === "book" ? "북트레일러·리뷰" : "공식 예고편"}</a>
                </div>
                {verifyError && <p className="msg err" role="alert">{verifyError}</p>}
                {verified && (
                  <div className="verified">
                    <div className="mono muted">실시간 웹 검색 감상처 확인 결과 · {new Date(verified.verifiedAt).toLocaleDateString("ko-KR")}</div>
                    <p>{verified.summary}</p>
                    {verified.sources.length > 0 && (
                      <div className="links">
                        {verified.sources.map((s, i) => <a key={`${s.uri}-${i}`} className="linkchip" href={s.uri} target="_blank" rel="noopener noreferrer">{s.title} ↗</a>)}
                      </div>
                    )}
                    <p className="muted small">AI가 웹 검색 결과를 요약한 내용이라 실제와 다를 수 있어요. 결제 전에 각 플랫폼에서 확인해 주세요.</p>
                  </div>
                )}
              </div>

              <div className="block">
                <h3>큐레이션 노트</h3>
                <p>{item.matchReason || item.logline}</p>
                {item.crossoverBridge && <p className="bridge">인생작 연결고리: {item.crossoverBridge}</p>}
              </div>
            </div>
          </div>

          {(item.appreciationPoints.length > 0 || item.previewExcerpt) && (
            <div className="modal-two">
              {item.appreciationPoints.length > 0 && (
                <div className="block">
                  <h3>놓치지 말아야 할 감상 포인트</h3>
                  <ol className="points">{item.appreciationPoints.map((p, i) => <li key={i}><span className="mono accent-text">0{i + 1}.</span> {p}</li>)}</ol>
                </div>
              )}
              <div className="block">
                {item.previewExcerpt && (<><h3>도입부 분위기 미리보기</h3><p className="quote">“{item.previewExcerpt}”</p></>)}
                {item.crossoverHint && <p className="muted small">{item.crossoverHint}</p>}
                <button className="chip" onClick={() => onCross(item)}>이 작품으로 다른 매체 매칭 ⇄</button>
              </div>
            </div>
          )}

          <div className="block">
            <h3>나의 감상 기록</h3>
            {bookmark ? (
              <>
                <div className="chips">
                  <select aria-label="감상 상태" value={bookmark.status} onChange={(e) => a.updateBookmark(bookmark.key, { status: e.target.value as WatchStatus })}>
                    {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  <span className="stars">
                    {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n}점`} aria-pressed={n <= bookmark.rating} className={n <= bookmark.rating ? "star on" : "star"} onClick={() => a.updateBookmark(bookmark.key, { rating: bookmark.rating === n ? 0 : n })}>★</button>)}
                  </span>
                </div>
                <textarea rows={3} maxLength={1000} value={memo} placeholder="감상 메모를 남겨 보세요." onChange={(e) => setMemo(e.target.value)} onBlur={() => { if (memo !== bookmark.memo) a.updateBookmark(bookmark.key, { memo }); }} />
              </>
            ) : (
              <p className="muted small">보관함에 담으면 감상 상태, 별점, 메모를 기록할 수 있어요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
