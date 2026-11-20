"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Media } from "@/lib/data";
import { itemKey, type RecItem } from "@/lib/item";
import {
  EMPTY_STORE, sanitizeStore,
  type ArchiveStore, type Bookmark, type HistorySession, type TasteProfile, type VerifiedAccess, type WatchStatus,
} from "@/lib/archive-types";

const KEY = "gyeol-archive-v2";
const V1_KEY = "gyeol-archive-v1"; // 작품 id 기반 이전 버전
const LEGACY_SAVED_KEY = "gyeol-saved"; // 이전 버전의 보관함(작품 id 배열)

type Ctx = ArchiveStore & {
  ready: boolean;
  getBookmark: (item: RecItem) => Bookmark | undefined;
  isBookmarked: (item: RecItem) => boolean;
  toggleBookmark: (item: RecItem) => void;
  /** 이미 담긴 작품이면 상태만, 아니면 해당 상태로 새로 담습니다. */
  upsertStatus: (item: RecItem, status: WatchStatus) => void;
  updateBookmark: (key: string, patch: Partial<Pick<Bookmark, "status" | "rating" | "memo">>) => void;
  saveVerifiedAccess: (key: string, access: VerifiedAccess) => void;
  removeBookmark: (key: string) => void;
  addFavoriteSeed: (title: string, media: Media, whyLiked: string) => void;
  removeFavoriteSeed: (id: string) => void;
  addHistory: (s: Omit<HistorySession, "id" | "createdAt">) => void;
  removeHistory: (id: string) => void;
  setTasteProfile: (p: TasteProfile | null) => void;
  /** 보관함의 영화·시리즈 감독·출연진·분량·상영/방영 상태를 TMDB 정보로 갱신합니다(12시간에 한 번). */
  syncArchive: () => Promise<void>;
  exportJson: () => string;
  importJson: (raw: string) => { ok: boolean; error?: string };
};

const ArchiveContext = createContext<Ctx | null>(null);

function loadStore(): ArchiveStore {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY) ?? localStorage.getItem(V1_KEY);
    if (raw) return sanitizeStore(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_SAVED_KEY);
    if (legacy) {
      const ids: unknown = JSON.parse(legacy);
      if (Array.isArray(ids)) {
        const now = new Date().toISOString();
        return sanitizeStore({ bookmarks: ids.map((workId) => ({ workId, status: "want", rating: 0, memo: "", savedAt: now, updatedAt: now })) });
      }
    }
  } catch {
    // 손상된 저장값은 새로 시작하되, 곧 덮어써지므로 원본을 다른 키에 한 번 보관합니다.
    try { if (raw) localStorage.setItem(`${KEY}-corrupt`, raw); } catch { /* 보관 실패는 무시 */ }
  }
  return EMPTY_STORE;
}

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<ArchiveStore>(EMPTY_STORE);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const lastWritten = useRef<string | null>(null);
  const storeRef = useRef<ArchiveStore>(EMPTY_STORE);
  const syncing = useRef(false);
  storeRef.current = store;

  useEffect(() => {
    setStore(loadStore());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      const json = JSON.stringify(store);
      localStorage.setItem(KEY, json);
      lastWritten.current = json;
      setSaveError(false);
    } catch { setSaveError(true); } // 저장 공간 부족·시크릿 모드 등: 화면에 알립니다.
  }, [store, ready]);

  // 다른 탭에서 보관함이 바뀌면 다시 읽어, 오래된 탭이 새 내용을 덮어쓰지 않게 합니다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue === null || e.newValue === lastWritten.current) return;
      setStore(loadStore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const now = () => new Date().toISOString();

  const getBookmark = useCallback((item: RecItem) => store.bookmarks.find((b) => b.key === itemKey(item)), [store.bookmarks]);
  const isBookmarked = useCallback((item: RecItem) => store.bookmarks.some((b) => b.key === itemKey(item)), [store.bookmarks]);

  const newBookmark = (item: RecItem, status: WatchStatus): Bookmark => {
    const t = now();
    return { key: itemKey(item), item, status, rating: 0, memo: "", savedAt: t, updatedAt: t };
  };

  const toggleBookmark = useCallback((item: RecItem) => {
    const key = itemKey(item);
    setStore((p) => {
      if (p.bookmarks.some((b) => b.key === key)) return { ...p, bookmarks: p.bookmarks.filter((b) => b.key !== key) };
      if (p.bookmarks.length >= 500) return p;
      return { ...p, bookmarks: [newBookmark(item, "want"), ...p.bookmarks] };
    });
  }, []);

  const upsertStatus = useCallback((item: RecItem, status: WatchStatus) => {
    const key = itemKey(item);
    setStore((p) => {
      if (p.bookmarks.some((b) => b.key === key)) {
        return { ...p, bookmarks: p.bookmarks.map((b) => (b.key === key ? { ...b, status, updatedAt: now() } : b)) };
      }
      if (p.bookmarks.length >= 500) return p;
      return { ...p, bookmarks: [newBookmark(item, status), ...p.bookmarks] };
    });
  }, []);

  const updateBookmark: Ctx["updateBookmark"] = useCallback((key, patch) => {
    setStore((p) => ({ ...p, bookmarks: p.bookmarks.map((b) => (b.key === key ? { ...b, ...patch, memo: patch.memo !== undefined ? patch.memo.slice(0, 1000) : b.memo, updatedAt: now() } : b)) }));
  }, []);

  const saveVerifiedAccess = useCallback((key: string, access: VerifiedAccess) => {
    setStore((p) => ({ ...p, bookmarks: p.bookmarks.map((b) => (b.key === key ? { ...b, verifiedAccess: access, updatedAt: now() } : b)) }));
  }, []);

  /**
   * 보관함 반영 규칙: 보관함을 열 때마다 저장된 모든 작품(책·영화·시리즈·웹툰)을 최신 정보로 다시 읽어 바뀐 내용을 그대로 반영합니다.
   * - 같은 작품을 10분 안에 다시 읽지는 않습니다(호출량). 단, 아래 ARCHIVE_SYNC_VER가 바뀌면 모든 작품을 한 번 다시 읽습니다.
   * - 새 정보를 찾으면 비어 있지 않은 값으로 덮어쓰고, 못 찾은 작품은 저장된 값을 그대로 둡니다(일시 오류 포함).
   * - 표지는 이번에 찾지 못했고 규칙 버전이 바뀐 경우에만 지웁니다(제목이 비슷한 다른 작품의 표지가 남는 것을 막기 위해).
   * 제목 매칭·표기·출처 규칙을 바꾸면 ARCHIVE_SYNC_VER를 올립니다.
   */
  const ARCHIVE_SYNC_VER = 4; // 2: 인물·극중 이름 한글화, 3: 한글 제목 조회·원제 저장, 4: 전 매체 갱신·표지 제목/저자 일치
  const ARCHIVE_STALE_MS = 10 * 60 * 1000;
  type Patch = { originalTitle?: string; creator: string; cast: string[]; characters: string[]; lengthInfo: string; completionStatus: string; releaseYear?: string; sourceUrl?: string; coverImageUrl?: string };
  const syncArchive = useCallback(async () => {
    if (syncing.current) return;
    const targets = storeRef.current.bookmarks.filter((b) => !(b.syncVer === ARCHIVE_SYNC_VER && b.syncedAt && Date.now() - Date.parse(b.syncedAt) < ARCHIVE_STALE_MS));
    if (targets.length === 0) return;
    syncing.current = true;
    try {
      for (let i = 0; i < targets.length; i += 10) {
        const chunk = targets.slice(i, i + 10);
        let results: (Patch | null)[];
        try {
          const res = await fetch("/api/works/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: chunk.map((b) => ({ media: b.item.media, title: b.item.title, year: b.item.releaseYear, creator: b.item.creator, originalTitle: b.item.originalTitle, englishTitle: b.item.englishTitle })) }) });
          if (!res.ok) break;
          results = ((await res.json()) as { results?: (Patch | null)[] }).results ?? [];
        } catch { break; }
        // 갱신에서 표지를 못 받은 작품은 표지 조회(제목·저자가 맞는 표지만)로 다시 찾습니다.
        const covers = await Promise.all(chunk.map(async (b, idx) => {
          if (results[idx]?.coverImageUrl) return results[idx]?.coverImageUrl;
          try {
            const res = await fetch("/api/works/cover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: b.item.title, originalTitle: b.item.originalTitle, englishTitle: b.item.englishTitle, creator: b.item.creator, media: b.item.media, releaseYear: b.item.releaseYear }) });
            if (!res.ok) return undefined; // 일시 오류: 저장된 표지 유지
            return ((await res.json()) as { coverImageUrl?: string | null }).coverImageUrl ?? null;
          } catch { return undefined; }
        }));
        const stamp = new Date().toISOString();
        setStore((p) => ({
          ...p,
          bookmarks: p.bookmarks.map((b) => {
            const idx = chunk.findIndex((c) => c.key === b.key);
            if (idx < 0) return b;
            const it = b.item, r = results[idx], c = covers[idx];
            const versionChanged = b.syncVer !== ARCHIVE_SYNC_VER;
            const cover = c ? c : c === null && versionChanged ? undefined : it.coverImageUrl;
            const next = r
              ? { ...it, originalTitle: it.originalTitle || (r.originalTitle && r.originalTitle !== it.title ? r.originalTitle : undefined), creator: r.creator || it.creator, cast: r.cast.length ? r.cast : it.cast, characters: r.characters.length ? r.characters : it.characters, lengthInfo: r.lengthInfo || it.lengthInfo, completionStatus: r.completionStatus || it.completionStatus, releaseYear: r.releaseYear || it.releaseYear, sourceUrl: r.sourceUrl || it.sourceUrl, coverImageUrl: cover }
              : { ...it, coverImageUrl: cover };
            return { ...b, syncedAt: stamp, syncVer: ARCHIVE_SYNC_VER, item: next };
          }),
        }));
      }
    } finally { syncing.current = false; }
  }, []);

  const removeBookmark = useCallback((key: string) => {
    setStore((p) => ({ ...p, bookmarks: p.bookmarks.filter((b) => b.key !== key) }));
  }, []);

  const addFavoriteSeed = useCallback((title: string, media: Media, whyLiked: string) => {
    const clean = title.trim().slice(0, 100);
    if (!clean) return;
    setStore((p) => {
      if (p.favoriteSeeds.some((s) => s.title.toLowerCase() === clean.toLowerCase() && s.media === media)) return p;
      if (p.favoriteSeeds.length >= 100) return p;
      return { ...p, favoriteSeeds: [{ id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: clean, media, whyLiked: whyLiked.trim().slice(0, 300), createdAt: now() }, ...p.favoriteSeeds] };
    });
  }, []);

  const removeFavoriteSeed = useCallback((id: string) => {
    setStore((p) => ({ ...p, favoriteSeeds: p.favoriteSeeds.filter((s) => s.id !== id) }));
  }, []);

  const addHistory = useCallback((s: Omit<HistorySession, "id" | "createdAt">) => {
    setStore((p) => ({ ...p, history: [{ ...s, id: `hist-${Date.now()}`, createdAt: now() }, ...p.history].slice(0, 20) }));
  }, []);

  const removeHistory = useCallback((id: string) => {
    setStore((p) => ({ ...p, history: p.history.filter((h) => h.id !== id) }));
  }, []);

  const setTasteProfile = useCallback((tasteProfile: TasteProfile | null) => setStore((p) => ({ ...p, tasteProfile })), []);

  const exportJson = useCallback(() => JSON.stringify(store, null, 2), [store]);

  const importJson = useCallback((raw: string) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      const known = ["bookmarks", "favoriteSeeds", "history", "tasteProfile"];
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !known.some((k) => k in parsed)) {
        return { ok: false, error: "올바른 아카이브 파일이 아닙니다. 기존 보관함은 그대로 두었어요." };
      }
      setStore(sanitizeStore(parsed));
      return { ok: true };
    } catch {
      return { ok: false, error: "파일을 읽는 중 오류가 발생했습니다. JSON 형식을 확인해 주세요." };
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...store, ready, getBookmark, isBookmarked, toggleBookmark, upsertStatus, updateBookmark, saveVerifiedAccess, removeBookmark, addFavoriteSeed, removeFavoriteSeed, addHistory, removeHistory, setTasteProfile, syncArchive, exportJson, importJson }),
    [store, ready, getBookmark, isBookmarked, toggleBookmark, upsertStatus, updateBookmark, saveVerifiedAccess, removeBookmark, addFavoriteSeed, removeFavoriteSeed, addHistory, removeHistory, setTasteProfile, syncArchive, exportJson, importJson],
  );

  return (
    <ArchiveContext.Provider value={value}>
      {children}
      {saveError && <div className="toast" role="alert">브라우저에 저장하지 못했어요. 이 상태로 새로고침하면 방금 한 변경이 사라질 수 있어요.</div>}
    </ArchiveContext.Provider>
  );
}

export function useArchive(): Ctx {
  const ctx = useContext(ArchiveContext);
  if (!ctx) throw new Error("useArchive는 ArchiveProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
