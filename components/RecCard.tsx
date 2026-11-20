"use client";

import { MEDIA_LABEL } from "@/lib/data";
import type { RecItem } from "@/lib/item";
import { buildPlatformLinks } from "@/lib/platforms";
import { Cover } from "./Cover";

export function RecCard({ item, prefer, saved, onSave, onCross, onOpen, onTrack }: {
  item: RecItem; prefer: string[]; saved: boolean;
  onSave: () => void; onCross: () => void; onOpen: () => void; onTrack: (platformName: string) => void;
}) {
  const links = buildPlatformLinks(item.title, item.creator, item.media, item.recommendedPlatforms).slice(0, 3);
  const creator = item.media === "film" || item.media === "drama" ? `감독 ${item.creator.replace(/^감독\s*/, "")}` : item.creator;
  return (
    <article className="card">
      <Cover item={item} />
      <div className="rec-body">
        <div className="meta"><b>{MEDIA_LABEL[item.media]}</b>{item.lengthInfo ? ` · ${item.lengthInfo}` : ""}{item.completionStatus ? ` · ${item.completionStatus}` : ""}</div>
        <h3 className="font-editorial"><button className="title-btn" onClick={onOpen}>{item.title}</button></h3>
        <p className="by">{creator}</p>
        <p className="reason">{item.matchReason || item.logline}</p>
        <div className="tags">{item.moodTags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
      </div>
      <div className="rec-footer">
        <div className="links">
          {links.map((l) => (
            <a key={l.id} className={`linkchip ${l.isRecommended || prefer.includes(l.id) ? "pref" : ""}`} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onTrack(l.name)}>{l.name}</a>
          ))}
          <button className="linkchip" onClick={onOpen}>감상 포인트 · 전체 플랫폼</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="icon" title="다른 매체 크로스오버 추천" aria-label="다른 매체 크로스오버 추천" onClick={onCross}>⇄</button>
          <button className={`icon ${saved ? "on" : ""}`} title="보관함 저장" aria-label="보관함 저장" aria-pressed={saved} onClick={onSave}>🔖</button>
        </div>
      </div>
    </article>
  );
}
