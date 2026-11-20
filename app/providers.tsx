"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Media } from "@/lib/data";
import {
  EMPTY_STORE, sanitizeStore,
  type ArchiveStore, type Bookmark, type HistorySession, type TasteProfile, type WatchStatus,
} from "@/lib/archive-types";

const KEY = "gyeol-archive-v1";
const LEGACY_SAVED_KEY = "gyeol-saved"; // 이전 버전의 보관함(작품 id 배열)

type Ctx = ArchiveStore & {
  ready: boolean;
  isBookmarked: (workId: string) => boolean;
  toggleBookmark: (workId: string) => void;
  updateBookmark: (workId: string, patch: Partial<Pick<Bookmark, "status" | "rating" | "memo">>) => void;
  removeBookmark: (workId: string) => void;
  addFavoriteSeed: (title: string, media: Media, whyLiked: string) => void;
  removeFavoriteSeed: (id: string) => void;
  addHistory: (s: Omit<HistorySession, "id" | "createdAt">) => void;
  removeHistory: (id: string) => void;
  setTasteProfile: (p: TasteProfile | null) => void;
  exportJson: () => string;
  importJson: (raw: string) => { ok: boolean; error?: string };
};

const ArchiveContext = createContext<Ctx | null>(null);

function loadStore(): ArchiveStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeStore(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_SAVED_KEY);
    if (legacy) {
      const ids: unknown = JSON.parse(legacy);
      if (Array.isArray(ids)) {
        const now = new Date().toISOString();
        return sanitizeStore({ bookmarks: ids.map((workId) => ({ workId, status: "want", rating: 0, memo: "", savedAt: now, updatedAt: now })) });
      }
    }
  } catch { /* 손상된 저장값은 무시하고 새로 시작 */ }
  return EMPTY_STORE;
}

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<ArchiveStore>(EMPTY_STORE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStore(loadStore());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* 저장 공간 부족 등은 무시 */ }
  }, [store, ready]);

  const now = () => new Date().toISOString();

  const isBookmarked = useCallback((id: string) => store.bookmarks.some((b) => b.workId === id), [store.bookmarks]);

  const toggleBookmark = useCallback((workId: string) => {
    setStore((p) => {
      if (p.bookmarks.some((b) => b.workId === workId)) return { ...p, bookmarks: p.bookmarks.filter((b) => b.workId !== workId) };
      const t = now();
      return { ...p, bookmarks: [{ workId, status: "want" as WatchStatus, rating: 0, memo: "", savedAt: t, updatedAt: t }, ...p.bookmarks] };
    });
  }, []);

  const updateBookmark: Ctx["updateBookmark"] = useCallback((workId, patch) => {
    setStore((p) => ({ ...p, bookmarks: p.bookmarks.map((b) => (b.workId === workId ? { ...b, ...patch, memo: patch.memo !== undefined ? patch.memo.slice(0, 1000) : b.memo, updatedAt: now() } : b)) }));
  }, []);

  const removeBookmark = useCallback((workId: string) => {
    setStore((p) => ({ ...p, bookmarks: p.bookmarks.filter((b) => b.workId !== workId) }));
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
      if (typeof parsed !== "object" || parsed === null) return { ok: false, error: "올바른 아카이브 파일이 아닙니다." };
      setStore(sanitizeStore(parsed));
      return { ok: true };
    } catch {
      return { ok: false, error: "파일을 읽는 중 오류가 발생했습니다. JSON 형식을 확인해 주세요." };
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...store, ready, isBookmarked, toggleBookmark, updateBookmark, removeBookmark, addFavoriteSeed, removeFavoriteSeed, addHistory, removeHistory, setTasteProfile, exportJson, importJson }),
    [store, ready, isBookmarked, toggleBookmark, updateBookmark, removeBookmark, addFavoriteSeed, removeFavoriteSeed, addHistory, removeHistory, setTasteProfile, exportJson, importJson],
  );

  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
}

export function useArchive(): Ctx {
  const ctx = useContext(ArchiveContext);
  if (!ctx) throw new Error("useArchive는 ArchiveProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
