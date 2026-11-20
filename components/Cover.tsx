"use client";

import { useEffect, useState } from "react";
import { MEDIA_LABEL, MEDIA_STAMP } from "@/lib/data";
import type { RecItem } from "@/lib/item";

// 같은 작품의 표지를 반복 조회하지 않도록 브라우저 메모리에 보관합니다.
const coverCache = new Map<string, string | null>();

export function Cover({ item, hideCast = false }: { item: RecItem; hideCast?: boolean }) {
  const cacheKey = `${item.media}::${item.title}::${item.creator}`;
  const [url, setUrl] = useState<string | undefined>(item.coverImageUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (item.coverImageUrl) { setUrl(item.coverImageUrl); return; }
    const cached = coverCache.get(cacheKey);
    if (cached !== undefined) { setUrl(cached ?? undefined); return; }
    setUrl(undefined);
    let cancelled = false;
    fetch("/api/works/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: item.title, originalTitle: item.originalTitle, englishTitle: item.englishTitle, creator: item.creator, media: item.media, releaseYear: item.releaseYear }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { coverImageUrl?: string | null } | null) => {
        const found = d?.coverImageUrl ?? null;
        coverCache.set(cacheKey, found);
        if (!cancelled && found) setUrl(found);
      })
      .catch(() => { /* 조회 실패 시 에디토리얼 커버를 그대로 사용 */ });
    return () => { cancelled = true; };
  }, [cacheKey, item.coverImageUrl, item.title, item.originalTitle, item.englishTitle, item.creator, item.media, item.releaseYear]);

  const stamp = `${MEDIA_STAMP[item.media]}${item.catalogCode ? ` · ${item.catalogCode}` : ""}`;
  const screen = item.media === "film" || item.media === "drama";
  const cast = !hideCast && screen && item.cast.length > 0 ? item.cast.slice(0, 3).join(" · ") : "";
  const real = Boolean(url) && !failed;

  return (
    <div className="cover-box">
      <div className="stamp mono">{stamp}</div>
      {real ? (
        <div className="cover-real">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${item.title} ${item.media === "book" ? "표지" : item.media === "webtoon" ? "썸네일" : "포스터"}`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        </div>
      ) : (
        <div className={`cover c-${item.media} tone-${item.accentTone}`}>
          <div className="mono cover-kicker">{MEDIA_LABEL[item.media]}{item.releaseYear ? ` · ${item.releaseYear}` : ""}</div>
          <div className="t font-editorial">{item.title}</div>
          <div className="c">{item.creator}</div>
        </div>
      )}
      <div className="castband">{cast || " "}</div>
    </div>
  );
}
