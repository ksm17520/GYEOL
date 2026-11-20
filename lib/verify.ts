import { findWebtoonOfficial, resolveCoverUrl } from "./cover";
import { itemKey, type RecItem } from "./item";

async function check(item: RecItem): Promise<RecItem> {
  // 후보 목록(플랫폼 검색)에서 고른 웹툰은 이미 확인됐으므로 표지만 채웁니다.
  if (item.media === "webtoon" && item.verified) {
    if (item.coverImageUrl) return item;
    const cover = await resolveCoverUrl({ title: item.title, originalTitle: item.originalTitle, englishTitle: item.englishTitle, creator: item.creator, media: item.media, releaseYear: item.releaseYear });
    return cover ? { ...item, coverImageUrl: cover } : item;
  }
  // 웹툰: 네이버웹툰에 올라 있는 공식 제목과 거의 같으면 제목을 공식 표기로 바로잡고 표지를 채웁니다.
  if (item.media === "webtoon") {
    const official = await findWebtoonOfficial(item.title);
    if (official) {
      const fixed = { ...item, title: official.title, verified: true };
      if (official.coverImageUrl) return { ...fixed, coverImageUrl: official.coverImageUrl };
      // 카카오 쪽에서만 확인된 작품은 표지를 다른 출처(AniList·위키백과, 제목 일치 확인)에서 찾아봅니다.
      const cover = await resolveCoverUrl({ title: official.title, originalTitle: item.originalTitle, englishTitle: item.englishTitle, creator: item.creator, media: item.media, releaseYear: item.releaseYear });
      return cover ? { ...fixed, coverImageUrl: cover } : fixed;
    }
  }
  const url = await resolveCoverUrl({ title: item.title, originalTitle: item.originalTitle, englishTitle: item.englishTitle, creator: item.creator, media: item.media, releaseYear: item.releaseYear });
  return url ? { ...item, coverImageUrl: url, verified: true } : item;
}

/**
 * AI가 만든 추천이 실제 작품인지 외부 출처(서점·TMDB·IMDb·네이버웹툰 등)에서 조회해 확인합니다.
 * 찾으면 표지도 함께 채우고 verified=true 로 표시하며, 웹툰은 공식 제목(네이버웹툰·카카오페이지·카카오웹툰)으로 바로잡습니다.
 * 못 찾은 작품도 걸러 내지는 않습니다(카카오페이지 웹툰처럼 조회 출처가 없는 실제 작품이 있기 때문).
 * 전체 대기 시간은 제한합니다.
 */
export async function verifyItems(items: RecItem[], budgetMs = 9000): Promise<RecItem[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budgetMs); });
  const done = await Promise.all(
    items.map(async (item) => {
      try {
        return (await Promise.race([check(item), deadline])) ?? item;
      } catch {
        return item;
      }
    }),
  );
  clearTimeout(timer);
  // 제목을 바로잡은 뒤 같은 작품이 두 번 나오면 하나만 남깁니다.
  const seen = new Set<string>();
  return done.filter((i) => !seen.has(itemKey(i)) && seen.add(itemKey(i)));
}
