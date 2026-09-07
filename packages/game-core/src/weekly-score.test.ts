import { describe, expect, it } from 'vitest';
import { MemoryGameStore } from './memory-store';

describe('weekly score increment', () => {
  it('adds two concurrent awards instead of last-write-wins', async () => {
    const store = new MemoryGameStore();
    const player = await store.createPlayer({ vkUserId: 'w1', name: 'Путник' });
    await store.incrementWeeklyScore(player.id, '2026-W37', 4);
    await Promise.all([
      store.incrementWeeklyScore(player.id, '2026-W37', 5),
      store.incrementWeeklyScore(player.id, '2026-W37', 7),
    ]);
    expect(await store.getWeeklyScore(player.id, '2026-W37')).toBe(16);
  });
});
