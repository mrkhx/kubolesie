import { describe, expect, it } from 'vitest';
import {
  classifyCommand,
  commandNeedsLock,
  DEFAULT_LIMITS,
  loadAbusePolicy,
  rlKey,
  sanitizeId,
} from './abuse-policy';

describe('command classification', () => {
  it('classifies gather/craft/furnace/trade as GAMEPLAY', () => {
    expect(classifyCommand({ type: 'GATHER_WOOD' })).toBe('GAMEPLAY');
    expect(classifyCommand({ type: 'CRAFT_ITEM' })).toBe('GAMEPLAY');
    expect(classifyCommand({ type: 'FURNACE_ACT' })).toBe('GAMEPLAY');
    expect(classifyCommand({ type: 'TRADE_ACT' })).toBe('GAMEPLAY');
    expect(classifyCommand({ type: 'START_PVE' })).toBe('GAMEPLAY');
  });

  it('classifies profile/inventory/camp/menu as READ', () => {
    expect(classifyCommand({ type: 'OPEN_PROFILE' })).toBe('READ');
    expect(classifyCommand({ type: 'OPEN_INVENTORY' })).toBe('READ');
    expect(classifyCommand({ type: 'OPEN_CAMP' })).toBe('READ');
    expect(classifyCommand({ type: 'OPEN_MENU', payload: { menu: 'gather' } })).toBe('READ');
  });

  it('classifies leaderboard and ratings as EXPENSIVE_READ', () => {
    expect(classifyCommand({ type: 'LEADERBOARD_PAGE' })).toBe('EXPENSIVE_READ');
    expect(classifyCommand({ type: 'OPEN_MENU', payload: { menu: 'ratings' } })).toBe('EXPENSIVE_READ');
    expect(classifyCommand({ type: 'CLAN_ACT', payload: { act: 'find' } })).toBe('EXPENSIVE_READ');
  });

  it('classifies clan mutations separately from clan reads', () => {
    expect(classifyCommand({ type: 'CLAN_ACT', payload: { act: 'create' } })).toBe('CLAN_MUTATION');
    expect(classifyCommand({ type: 'CLAN_ACT', payload: { act: 'kick' } })).toBe('CLAN_MUTATION');
    expect(classifyCommand({ type: 'CLAN_ACT', payload: { act: 'disband' } })).toBe('CLAN_MUTATION');
    expect(classifyCommand({ type: 'CLAN_ACT', payload: { act: 'my_apps' } })).toBe('READ');
  });

  it('classifies PvP attempts separately from the daily Game Core cap', () => {
    expect(classifyCommand({ type: 'START_PVP' })).toBe('PVP');
  });

  it('classifies market reads, writes and bids separately', () => {
    expect(classifyCommand({ type: 'MARKET_ACT', payload: { act: 'hub' } })).toBe('MARKET_READ');
    expect(classifyCommand({ type: 'OPEN_MENU', payload: { menu: 'market' } })).toBe('MARKET_READ');
    expect(classifyCommand({ type: 'MARKET_ACT', payload: { act: 'buy' } })).toBe('MARKET_WRITE');
    expect(classifyCommand({ type: 'MARKET_ACT', payload: { act: 'confirm_sell' } })).toBe('MARKET_WRITE');
    expect(classifyCommand({ type: 'MARKET_ACT', payload: { act: 'bid' } })).toBe('AUCTION_BID');
    expect(commandNeedsLock({ type: 'MARKET_ACT', payload: { act: 'hub' } })).toBe(false);
    expect(commandNeedsLock({ type: 'MARKET_ACT', payload: { act: 'buy' } })).toBe(true);
    expect(commandNeedsLock({ type: 'MARKET_ACT', payload: { act: 'bid' } })).toBe(true);
  });

  it('classifies START_GAME and unknown types as SYSTEM so they do not spend gameplay energy quota', () => {
    expect(classifyCommand({ type: 'START_GAME' })).toBe('SYSTEM');
    expect(commandNeedsLock({ type: 'OPEN_PROFILE' })).toBe(false);
    expect(commandNeedsLock({ type: 'GATHER_WOOD' })).toBe(true);
    expect(commandNeedsLock({ type: 'START_GAME' })).toBe(true);
  });

  it('uses the documented default limits', () => {
    expect(DEFAULT_LIMITS.GAMEPLAY).toMatchObject({ perMinute: 30, burst: 8, burstTtlMs: 5_000 });
    expect(DEFAULT_LIMITS.READ.perMinute).toBe(60);
    expect(DEFAULT_LIMITS.EXPENSIVE_READ.perMinute).toBe(15);
    expect(DEFAULT_LIMITS.CLAN_MUTATION).toMatchObject({ perMinute: 10, burst: 3, burstTtlMs: 10_000 });
    expect(DEFAULT_LIMITS.PVP.perMinute).toBe(10);
    expect(DEFAULT_LIMITS.callback).toMatchObject({ perMinute: 60, burst: 15 });
  });

  it('loads env-overridable limits without scattering numbers', () => {
    const policy = loadAbusePolicy({
      RATE_LIMIT_GAMEPLAY_PER_MIN: '12',
      RATE_LIMIT_READ_PER_MIN: '40',
    });
    expect(policy.limits.GAMEPLAY.perMinute).toBe(12);
    expect(policy.limits.READ.perMinute).toBe(40);
    expect(policy.limits.PVP.perMinute).toBe(10);
  });

  it('sanitizes identifiers so keys never contain secrets or raw player text', () => {
    const key = rlKey('callback', 'vk:9001', 'm');
    expect(key).toBe('kubolesie:rl:callback:vk:9001:m');
    expect(sanitizeId('secret-token-value')).toBe('secret-token-value');
    expect(rlKey('gameplay', 'hello world\nVK_GROUP_TOKEN', 'm')).not.toContain(' ');
    expect(rlKey('gameplay', 'hello world\nVK_GROUP_TOKEN', 'm')).not.toContain('\n');
  });
});
