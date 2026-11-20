import { NextResponse } from "next/server";
import { resolveCoverUrl } from "@/lib/cover";
import { normalizeMedia } from "@/lib/item";
import { rateLimited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);

export async function POST(req: Request) {
  if (rateLimited(req, "cover", 60)) return NextResponse.json({ coverImageUrl: null }, { status: 429 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ coverImageUrl: null }, { status: 400 }); }
  const title = clip(b?.title, 100);
  const media = normalizeMedia(b?.media);
  if (!title || !media) return NextResponse.json({ coverImageUrl: null }, { status: 400 });
  try {
    const url = await resolveCoverUrl({ title, originalTitle: clip(b.originalTitle, 100), englishTitle: clip(b.englishTitle, 100), creator: clip(b.creator, 100) ?? "", media, releaseYear: clip(b.releaseYear, 10) });
    return NextResponse.json({ coverImageUrl: url }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch {
    return NextResponse.json({ coverImageUrl: null });
  }
}
