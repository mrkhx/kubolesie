import { describe, expect, it } from 'vitest';
import { simulateBattle, type CombatantSnapshot } from './index';

const player: CombatantSnapshot = {
  id: 'player-1',
  name: 'Путник',
  hp: 100,
  maxHp: 100,
  attack: 5,
  defense: 0,
  speed: 10,
  critChance: 5,
  critDamage: 150,
  dodge: 3,
  accuracy: 95,
  luck: 0,
};

const shrew: CombatantSnapshot = {
  id: 'wild_shrew',
  name: 'Дикая землеройка',
  hp: 32,
  maxHp: 32,
  attack: 5,
  defense: 0,
  speed: 8,
  critChance: 3,
  critDamage: 150,
  dodge: 5,
  accuracy: 90,
  luck: 0,
  minDamage: 4,
  maxDamage: 7,
};

describe('combat-engine', () => {
  it('is deterministic for the same snapshot + seed', () => {
    const a = simulateBattle({ player, enemy: shrew, seed: 42, balanceVersion: '0.0.1' });
    const b = simulateBattle({ player, enemy: shrew, seed: 42, balanceVersion: '0.0.1' });
    expect(a).toEqual(b);
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.events.some((event) => event.type === 'DEFEAT' || a.result !== 'DRAW')).toBe(true);
  });

  it('changes outcome stream when seed changes', () => {
    const a = simulateBattle({ player, enemy: shrew, seed: 1 });
    const b = simulateBattle({ player, enemy: shrew, seed: 2 });
    expect(a.events).not.toEqual(b.events);
  });

  it('emits only known event types', () => {
    const result = simulateBattle({ player, enemy: shrew, seed: 99 });
    for (const event of result.events) {
      expect(['HIT', 'CRIT', 'DODGE', 'DEFEAT']).toContain(event.type);
      expect(event.turn).toBeGreaterThan(0);
      expect(event.actor).toBeTruthy();
    }
  });
});
