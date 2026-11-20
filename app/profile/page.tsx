"use client";

import Link from "next/link";
import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useArchive } from "@/app/providers";
import { MEDIA_LABEL, type Media } from "@/lib/data";
import type { TasteProfile } from "@/lib/archive-types";

const MEDIA_LIST = Object.keys(MEDIA_LABEL) as Media[];

export default function ProfilePage() {
  const { bookmarks, favoriteSeeds, tasteProfile, setTasteProfile, ready } = useArchive();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const total = bookmarks.length + favoriteSeeds.length;
  const completed = bookmarks.filter((b) => b.status === "completed").length;
  const counts = Object.fromEntries(MEDIA_LIST.map((m) => [m, bookmarks.filter((b) => b.item.media === m).length + favoriteSeeds.filter((s) => s.media === m).length])) as Record<Media, number>;

  async function analyze() {
    setLoading(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/profile/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookmarks: bookmarks.slice(0, 60).map((b) => ({
            title: b.item.title, media: b.item.media, status: b.status, rating: b.rating, memo: b.memo, moods: b.item.moodTags,
          })),
          favoriteSeeds: favoriteSeeds.map((s) => ({ title: s.title, media: s.media, whyLiked: s.whyLiked })),
        }),
      });
      const data: { profile?: TasteProfile; notice?: string; error?: string } = await res.json();
      if (!res.ok || !data.profile) throw new Error(data.error || "취향 분석에 실패했습니다.");
      setTasteProfile(data.profile);
      if (data.notice) setNotice(data.notice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopBar active="profile" />
      <main className="wrap page">
        <div className="page-head">
          <div>
            <div className="mono muted">TASTE DNA PROFILE · 취향 프로필</div>
            <h1 className="font-editorial">나의 문화적 취향 지형도</h1>
            <p className="desc">보관함에 담은 작품, 별점, 감상 메모, 인생작 데이터를 종합해 나만의 서사·분위기 DNA를 도출합니다.</p>
          </div>
          <button className="cta" onClick={analyze} disabled={loading || total === 0}>
            {loading ? "취향 분석 중…" : tasteProfile ? "취향 프로필 업데이트" : "취향 프로필 분석하기"}
          </button>
        </div>

        <div className="metrics">
          <div className="metric"><div className="muted">누적 작품 수</div><div className="mono num">{ready ? total : "–"}</div></div>
          <div className="metric"><div className="muted">감상 완료</div><div className="mono num">{ready ? completed : "–"}</div></div>
          {MEDIA_LIST.map((m) => <div className="metric" key={m}><div className="muted">{MEDIA_LABEL[m]}</div><div className="mono num">{ready ? counts[m] : "–"}</div></div>)}
        </div>

        {error && <div className="msg err" role="alert">{error}</div>}
        {notice && <div className="msg" role="status">{notice}</div>}

        {ready && total === 0 ? (
          <div className="empty">
            <p>취향 프로필을 분석하려면 최소 1개 이상의 작품을 보관함에 담거나 인생작으로 등록해야 합니다.</p>
            <Link className="cta" href="/archive">보관함에서 인생작 등록하기</Link>
          </div>
        ) : tasteProfile ? (
          <div className="panel portrait">
            <div className="mono accent-text">EDITORIAL TASTE PORTRAIT{tasteProfile.source === "rule" ? " · 기본 분석" : ""}</div>
            <h2 className="font-editorial">{tasteProfile.personaTitle}</h2>
            <p className="lead">{tasteProfile.editorialSummary}</p>
            <div className="two">
              <div>
                <h4>핵심 분위기 결</h4>
                <p className="strong">{tasteProfile.coreMoods.join(" · ") || "—"}</p>
                <h4>선호하는 서사 패턴</h4>
                <ol>{tasteProfile.narrativePreferences.map((p, i) => <li key={i}><span className="mono accent-text">0{i + 1}.</span> {p}</li>)}</ol>
              </div>
              <div>
                <h4>크로스미디어 연결 인사이트</h4>
                <p>{tasteProfile.crossMediaInsight}</p>
                <div className="next">
                  <div className="muted">다음 추천 탐색 제안</div>
                  <p className="strong">“{tasteProfile.nextDiscoveryPrompt}”</p>
                  <Link className="cta" href={`/?prompt=${encodeURIComponent(tasteProfile.nextDiscoveryPrompt)}`}>이 제안으로 큐레이션 받기 →</Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          ready && <div className="empty"><p>현재 {total}개의 작품 데이터가 쌓여 있습니다. 상단의 “취향 프로필 분석하기” 버튼을 눌러 맞춤 리포트를 생성해 보세요.</p></div>
        )}
      </main>
    </>
  );
}
