"use client";

import Link from "next/link";
import { useArchive } from "@/app/providers";
import { useTheme } from "@/lib/theme";

export type NavId = "curation" | "crossover" | "archive" | "profile" | "pricing";

/** 홈 화면에서는 큐레이션/인생작 매칭을 화면 안에서 전환하도록 onMode를 넘깁니다. */
export function TopBar({ active, onMode, showTheme = true }: { active: NavId; onMode?: (m: "mood" | "crossover") => void; showTheme?: boolean }) {
  const { bookmarks } = useArchive();
  const { theme, toggle } = useTheme();
  const item = (id: NavId, label: string, href: string, mode?: "mood" | "crossover") => {
    const cls = active === id ? "active" : "";
    if (onMode && mode) return <button className={cls} onClick={() => onMode(mode)}>{label}</button>;
    return <Link className={cls} href={href}>{label}</Link>;
  };
  return (
    <header className="topbar">
      <div className="wrap topbar-row">
        <Link href="/" className="logo font-editorial">GYEOL · 결</Link>
        <nav className="nav" aria-label="주요 메뉴">
          {item("curation", "큐레이션", "/", "mood")}
          {item("crossover", "인생작 매칭", "/?mode=crossover", "crossover")}
          {item("archive", "보관함", "/archive")}
          {item("profile", "취향 프로필", "/profile")}
        </nav>
        <div className="utils">
          {showTheme && <button className="link plain" onClick={toggle}>{theme === "dark" ? "라이트" : "다크"}</button>}
          <Link className="link" href="/pricing">프리미엄</Link>
          <Link className="btn-dark" href="/archive">내 보관함 ({bookmarks.length})</Link>
        </div>
      </div>
    </header>
  );
}
