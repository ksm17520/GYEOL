import { resolveCoverUrl } from "./cover";
import type { RecItem } from "./item";

/**
 * AI가 만든 추천이 실제 작품인지 외부 출처(서점·TMDB·IMDb·네이버웹툰 등)에서 조회해 확인합니다.
 * 찾으면 표지도 함께 채우고 verified=true 로 표시합니다. 못 찾은 작품도 걸러 내지는 않습니다
 * (카카오페이지 웹툰처럼 조회 출처가 없는 실제 작품이 있기 때문). 전체 대기 시간은 제한합니다.
 */
export async function verifyItems(items: RecItem[], budgetMs = 9000): Promise<RecItem[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budgetMs); });
  const done = await Promise.all(
    items.map(async (item) => {
      try {
        const url = await Promise.race([
          resolveCoverUrl({ title: item.title, originalTitle: item.originalTitle, englishTitle: item.englishTitle, creator: item.creator, media: item.media, releaseYear: item.releaseYear }),
          deadline,
        ]);
        return url ? { ...item, coverImageUrl: url, verified: true } : item;
      } catch {
        return item;
      }
    }),
  );
  clearTimeout(timer);
  return done;
}
