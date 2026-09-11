import type { GameButton } from '@kubolesie/shared';

export function pagedButtons(
  items: GameButton[],
  page: number,
  makeMore: (nextPage: number) => GameButton,
  back: GameButton,
  pageSize = 3,
): GameButton[] {
  const size = Math.max(1, Math.floor(pageSize));
  const safe = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
  const maxPage = Math.max(0, Math.ceil(items.length / size) - 1);
  const used = Math.min(safe, maxPage);
  const slice = items.slice(used * size, used * size + size);
  const out = [...slice];
  if (used < maxPage) out.push(makeMore(used + 1));
  out.push(back);
  return out;
}
