import type { EnemyTemplate } from './enemies';

export const PVP_RIVALS: EnemyTemplate[] = [
  {
    id: 'yara_trace',
    name: 'След Яры',
    hp: 70,
    minDamage: 6,
    maxDamage: 9,
    defense: 2,
    speed: 9,
    dodge: 6,
    accuracy: 90,
    critChance: 6,
    critDamage: 150,
  },
  {
    id: 'wedge_scout',
    name: 'Разведчик клина',
    hp: 62,
    minDamage: 5,
    maxDamage: 8,
    defense: 1,
    speed: 11,
    dodge: 8,
    accuracy: 88,
    critChance: 5,
    critDamage: 150,
  },
  {
    id: 'foreign_post',
    name: 'Чужой заступ',
    hp: 80,
    minDamage: 6,
    maxDamage: 10,
    defense: 3,
    speed: 7,
    dodge: 4,
    accuracy: 90,
    critChance: 4,
    critDamage: 150,
  },
];

export function getPvpRival(id: string): EnemyTemplate | undefined {
  return PVP_RIVALS.find((row) => row.id === id);
}

export function nextPvpRival(index: number): EnemyTemplate {
  return PVP_RIVALS[index % PVP_RIVALS.length]!;
}
