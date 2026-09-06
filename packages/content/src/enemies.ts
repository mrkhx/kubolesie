export interface EnemyTemplate {
  id: string;
  name: string;
  hp: number;
  minDamage: number;
  maxDamage: number;
  defense: number;
  speed: number;
  dodge: number;
  accuracy: number;
  critChance: number;
  critDamage: number;
}

export const ENEMIES: Record<string, EnemyTemplate> = {
  wild_shrew: {
    id: 'wild_shrew',
    name: 'Дикая землеройка',
    hp: 32,
    minDamage: 4,
    maxDamage: 7,
    defense: 0,
    speed: 8,
    dodge: 5,
    accuracy: 90,
    critChance: 3,
    critDamage: 150,
  },
  stone_scavenger: {
    id: 'stone_scavenger',
    name: 'Каменный падальщик',
    hp: 44,
    minDamage: 5,
    maxDamage: 8,
    defense: 1,
    speed: 7,
    dodge: 4,
    accuracy: 88,
    critChance: 4,
    critDamage: 150,
  },
  mine_crawler: {
    id: 'mine_crawler',
    name: 'Шахтный ползун',
    hp: 55,
    minDamage: 4,
    maxDamage: 7,
    defense: 2,
    speed: 6,
    dodge: 2,
    accuracy: 88,
    critChance: 4,
    critDamage: 150,
  },
};

export const UNKNOWN_NODE7_CREATURE = {
  id: 'unknown_node7_creature',
  name: '???',
} as const;

export function getEnemy(id: string): EnemyTemplate | undefined {
  return ENEMIES[id];
}
