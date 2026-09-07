import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameCommandType, NormalizedIncomingEvent } from '@kubolesie/shared';
import { AWAITING_NAME_FLAG, BACK_LABEL, DEFAULT_HERO_NAME } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';

function event(
  type: GameCommandType,
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-name',
  text?: string,
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: DEFAULT_HERO_NAME },
    command: { type, payload },
    text,
  };
}

async function boot(vkUserId = `vk-${Math.random().toString(16).slice(2)}`) {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const started = await runtime.handle(event('START_GAME', {}, `start-${vkUserId}`, vkUserId));
  const player = (await store.findPlayerByVkUserId(vkUserId))!;
  return { store, runtime, player, vkUserId, started };
}

describe('hero naming', () => {
  it('lets a default player enter name mode from the start scene', async () => {
    const { started, runtime, vkUserId, store, player } = await boot();
    expect(started.buttons.some((button) => button.action === 'PROMPT_HERO_NAME')).toBe(true);
    expect(player.name).toBe(DEFAULT_HERO_NAME);
    const prompt = await runtime.handle(event('PROMPT_HERO_NAME', {}, 'prompt-1', vkUserId));
    expect(prompt.text).toMatch(/звать/);
    expect((await store.getFlags(player.id))[AWAITING_NAME_FLAG]).toBe('1');
    expect(prompt.buttons.some((button) => button.action === 'CANCEL_HERO_NAME')).toBe(true);
  });

  it('accepts a valid Cyrillic name and a valid Latin name', async () => {
    const a = await boot('vk-cyr');
    await a.runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-cyr', 'vk-cyr'));
    const named = await a.runtime.handle(event('START_GAME', {}, 'n-cyr', 'vk-cyr', 'Виктор'));
    expect(named.text).toContain('Виктор');
    expect((await a.store.findPlayerByVkUserId('vk-cyr'))!.name).toBe('Виктор');

    const b = await boot('vk-lat');
    await b.runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-lat', 'vk-lat'));
    await b.runtime.handle(event('START_GAME', {}, 'n-lat', 'vk-lat', 'Viktor'));
    expect((await b.store.findPlayerByVkUserId('vk-lat'))!.name).toBe('Viktor');
  });

  it('rejects 1-char, over-20, reserved and control-char names while staying in name mode', async () => {
    const { runtime, vkUserId, store, player } = await boot();
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p1', vkUserId));
    const tooShort = await runtime.handle(event('START_GAME', {}, 'bad-1', vkUserId, 'Я'));
    const tooLong = await runtime.handle(event('START_GAME', {}, 'bad-2', vkUserId, 'А'.repeat(21)));
    const reserved = await runtime.handle(event('START_GAME', {}, 'bad-3', vkUserId, 'Admin'));
    const control = await runtime.handle(event('START_GAME', {}, 'bad-4', vkUserId, 'Вик\nтор'));
    for (const response of [tooShort, tooLong, reserved, control]) {
      expect(response.text).toMatch(/не подойдёт/);
    }
    expect((await store.findPlayerById(player.id))!.name).toBe(DEFAULT_HERO_NAME);
    expect((await store.getFlags(player.id))[AWAITING_NAME_FLAG]).toBe('1');
  });

  it('cancel preserves the previous name', async () => {
    const { runtime, vkUserId, store, player } = await boot();
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-c', vkUserId));
    const cancelled = await runtime.handle(event('CANCEL_HERO_NAME', {}, 'c1', vkUserId));
    expect((await store.findPlayerById(player.id))!.name).toBe(DEFAULT_HERO_NAME);
    expect((await store.getFlags(player.id))[AWAITING_NAME_FLAG]).not.toBe('1');
    expect(cancelled.buttons.some((button) => button.label === BACK_LABEL || button.action === 'OPEN_MENU')).toBe(
      true,
    );
  });

  it('rename works for an already named hero', async () => {
    const { runtime, vkUserId, store } = await boot();
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-r', vkUserId));
    await runtime.handle(event('START_GAME', {}, 'n-r', vkUserId, 'Виктор'));
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-r2', vkUserId));
    await runtime.handle(event('START_GAME', {}, 'n-r2', vkUserId, 'Яра'));
    expect((await store.findPlayerByVkUserId(vkUserId))!.name).toBe('Яра');
  });

  it('persists the name across a store restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kubolesie-name-'));
    const path = join(dir, 'store.json');
    try {
      const store = new MemoryGameStore(path);
      const runtime = new GameRuntime(store);
      await runtime.handle(event('START_GAME', {}, 's1', 'vk-persist'));
      await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p1', 'vk-persist'));
      await runtime.handle(event('START_GAME', {}, 'n1', 'vk-persist', 'Виктор'));
      const reloaded = await MemoryGameStore.load(path);
      expect((await reloaded.findPlayerByVkUserId('vk-persist'))!.name).toBe('Виктор');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('allows duplicate display names because identity is player.id', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 's-a', 'vk-a'));
    await runtime.handle(event('START_GAME', {}, 's-b', 'vk-b'));
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-a', 'vk-a'));
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-b', 'vk-b'));
    await runtime.handle(event('START_GAME', {}, 'n-a', 'vk-a', 'Виктор'));
    await runtime.handle(event('START_GAME', {}, 'n-b', 'vk-b', 'Виктор'));
    const a = (await store.findPlayerByVkUserId('vk-a'))!;
    const b = (await store.findPlayerByVkUserId('vk-b'))!;
    expect(a.name).toBe('Виктор');
    expect(b.name).toBe('Виктор');
    expect(a.id).not.toBe(b.id);
  });

  it('does not treat ordinary text as a name outside name-mode', async () => {
    const { runtime, vkUserId, store, player } = await boot();
    const energy = player.energy;
    await runtime.handle(event('START_GAME', {}, 'plain', vkUserId, 'Виктор'));
    expect((await store.findPlayerById(player.id))!.name).toBe(DEFAULT_HERO_NAME);
    expect((await store.getFlags(player.id))[AWAITING_NAME_FLAG]).not.toBe('1');
    expect((await store.findPlayerById(player.id))!.energy).toBe(energy);
  });

  it('keeps name update idempotent on duplicate event_id', async () => {
    const { runtime, vkUserId, store } = await boot();
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-dup', vkUserId));
    const first = await runtime.handle(event('START_GAME', {}, 'same-evt', vkUserId, 'Виктор'));
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-dup2', vkUserId));
    const second = await runtime.handle(event('START_GAME', {}, 'same-evt', vkUserId, 'Яра'));
    expect(second.text).toBe(first.text);
    expect((await store.findPlayerByVkUserId(vkUserId))!.name).toBe('Виктор');
  });

  it('offers rename in profile after a name is set', async () => {
    const { runtime, vkUserId } = await boot();
    await runtime.handle(event('PROMPT_HERO_NAME', {}, 'p-pr', vkUserId));
    await runtime.handle(event('START_GAME', {}, 'n-pr', vkUserId, 'Виктор'));
    const profile = await runtime.handle(event('OPEN_MENU', { menu: 'profile' }, 'prof', vkUserId));
    expect(profile.text).toContain('Виктор');
    expect(
      profile.buttons.some((button) => button.action === 'PROMPT_HERO_NAME' && /Сменить имя/.test(button.label)),
    ).toBe(true);
    expect(profile.text).not.toMatch(/COMMON|UNCOMMON|BACK/);
  });
});
