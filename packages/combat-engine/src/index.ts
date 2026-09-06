import { BALANCE_VERSION, type BattleEventType } from '@kubolesie/shared';

export interface CombatantSnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
  dodge: number;
  accuracy: number;
  luck: number;
  minDamage?: number;
  maxDamage?: number;
}

export interface BattleEvent {
  turn: number;
  actor: string;
  type: BattleEventType;
  value: number;
}

export interface BattleInput {
  player: CombatantSnapshot;
  enemy: CombatantSnapshot;
  seed: number | string;
  balanceVersion?: string;
}

export interface BattleResult {
  winnerId: string | null;
  result: 'WIN' | 'LOSS' | 'DRAW';
  events: BattleEvent[];
  playerHp: number;
  enemyHp: number;
  turns: number;
  seed: number;
  balanceVersion: string;
  playerSnapshot: CombatantSnapshot;
  enemySnapshot: CombatantSnapshot;
}

export function seedToUint(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDamage(attacker: CombatantSnapshot, rng: () => number): number {
  if (attacker.minDamage != null && attacker.maxDamage != null) {
    const min = attacker.minDamage;
    const max = attacker.maxDamage;
    return min + Math.floor(rng() * (max - min + 1));
  }
  return Math.max(1, attacker.attack);
}

function resolveHit(
  attacker: CombatantSnapshot,
  defender: CombatantSnapshot,
  rng: () => number,
): { type: BattleEventType; value: number } {
  if (rng() * 100 < defender.dodge) {
    return { type: 'DODGE', value: 0 };
  }
  if (rng() * 100 > attacker.accuracy) {
    return { type: 'DODGE', value: 0 };
  }
  let damage = Math.max(1, rollDamage(attacker, rng) - defender.defense);
  const isCrit = rng() * 100 < attacker.critChance;
  if (isCrit) {
    damage = Math.max(1, Math.floor((damage * attacker.critDamage) / 100));
    return { type: 'CRIT', value: damage };
  }
  return { type: 'HIT', value: damage };
}

export function simulateBattle(input: BattleInput): BattleResult {
  const balanceVersion = input.balanceVersion ?? BALANCE_VERSION;
  const seed = seedToUint(input.seed);
  const rng = mulberry32(seed);
  const player: CombatantSnapshot = { ...input.player };
  const enemy: CombatantSnapshot = { ...input.enemy };
  const events: BattleEvent[] = [];
  const order =
    player.speed >= enemy.speed ? [player, enemy] : [enemy, player];

  let turn = 0;
  const maxTurns = 64;

  while (player.hp > 0 && enemy.hp > 0 && turn < maxTurns) {
    turn += 1;
    for (const actor of order) {
      if (player.hp <= 0 || enemy.hp <= 0) break;
      const attacker = actor.id === player.id ? player : enemy;
      const defender = actor.id === player.id ? enemy : player;
      const hit = resolveHit(attacker, defender, rng);
      events.push({
        turn,
        actor: attacker.id,
        type: hit.type,
        value: hit.value,
      });
      if (hit.type !== 'DODGE') {
        defender.hp = Math.max(0, defender.hp - hit.value);
      }
    }
  }

  let winnerId: string | null = null;
  let result: BattleResult['result'] = 'DRAW';
  if (player.hp <= 0 && enemy.hp <= 0) {
    result = 'DRAW';
  } else if (enemy.hp <= 0) {
    winnerId = player.id;
    result = 'WIN';
  } else if (player.hp <= 0) {
    winnerId = enemy.id;
    result = 'LOSS';
  }

  if (winnerId) {
    events.push({ turn: Math.max(turn, 1), actor: winnerId, type: 'DEFEAT', value: 0 });
  }

  return {
    winnerId,
    result,
    events,
    playerHp: player.hp,
    enemyHp: enemy.hp,
    turns: turn,
    seed,
    balanceVersion,
    playerSnapshot: { ...input.player },
    enemySnapshot: { ...input.enemy },
  };
}
