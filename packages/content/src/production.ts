import type { ResourceType } from '@kubolesie/shared';
import { jobProfessionBonusBps, type JobProfession } from './jobs';

export const PRODUCTION = {
  unlockFlag: 'week_1_complete',
  maxLevel: 10,
  maxElapsedMs: 36 * 60 * 60 * 1000,
  milli: 1_000,
} as const;

export const PRODUCTION_BUILDINGS = [
  'WHEAT_FARM',
  'SAWMILL',
  'QUARRY',
  'MINE',
  'FISHERY',
  'PEN',
] as const;

export type ProductionBuildingType = (typeof PRODUCTION_BUILDINGS)[number];

/** L1=1.0x … L10=4.6x. Not 20x. */
export const PRODUCTION_LEVEL_MULT = [0, 1, 1.25, 1.5, 1.75, 2, 2.4, 2.8, 3.3, 3.9, 4.6] as const;

export const PRODUCTION_LABELS: Record<ProductionBuildingType, string> = {
  WHEAT_FARM: '🌾 Пшеничная ферма',
  SAWMILL: '🌲 Лесопилка',
  QUARRY: '🪨 Каменоломня',
  MINE: '⛏ Шахта',
  FISHERY: '🎣 Рыбное хозяйство',
  PEN: '🐾 Загон',
};

export interface ProductionDef {
  type: ProductionBuildingType;
  primary: ResourceType;
  secondary: ResourceType | null;
  /** Whole resources per hour at L1, before profession bonus. */
  basePrimaryPerHour: number;
  baseSecondaryPerHour: number;
  secondaryFromLevel: number;
  /** Hours to fill at L1 ≈ 8–12. */
  baseCap: number;
  secondaryCapRatio: number;
  build: Partial<Record<ResourceType, number>>;
  buildCoins: number;
  profession: JobProfession | null;
}

export const PRODUCTION_DEFS: Record<ProductionBuildingType, ProductionDef> = {
  WHEAT_FARM: {
    type: 'WHEAT_FARM',
    primary: 'WHEAT',
    secondary: 'SEED',
    basePrimaryPerHour: 1.5,
    baseSecondaryPerHour: 0.15,
    secondaryFromLevel: 1,
    baseCap: 16,
    secondaryCapRatio: 0.2,
    build: { LOG: 20, PLANK: 20, COBBLESTONE: 10 },
    buildCoins: 80,
    profession: 'FARMER',
  },
  SAWMILL: {
    type: 'SAWMILL',
    primary: 'LOG',
    secondary: null,
    basePrimaryPerHour: 2,
    baseSecondaryPerHour: 0,
    secondaryFromLevel: 99,
    baseCap: 20,
    secondaryCapRatio: 0,
    build: { LOG: 30, COBBLESTONE: 20, IRON_INGOT: 2 },
    buildCoins: 120,
    profession: 'LOGGER',
  },
  QUARRY: {
    type: 'QUARRY',
    primary: 'COBBLESTONE',
    secondary: null,
    basePrimaryPerHour: 1.5,
    baseSecondaryPerHour: 0,
    secondaryFromLevel: 99,
    baseCap: 16,
    secondaryCapRatio: 0,
    build: { LOG: 20, COBBLESTONE: 40, IRON_INGOT: 3 },
    buildCoins: 140,
    profession: 'MINER',
  },
  MINE: {
    type: 'MINE',
    primary: 'COAL',
    secondary: 'IRON_ORE',
    basePrimaryPerHour: 1.2,
    /** Slow enough that L10+job20 stays a side stream, not the iron source. */
    baseSecondaryPerHour: 0.08,
    secondaryFromLevel: 4,
    baseCap: 14,
    secondaryCapRatio: 0.15,
    build: { LOG: 30, COBBLESTONE: 50, IRON_INGOT: 5 },
    buildCoins: 200,
    profession: 'MINER',
  },
  FISHERY: {
    type: 'FISHERY',
    primary: 'RAW_FISH',
    secondary: null,
    basePrimaryPerHour: 1,
    baseSecondaryPerHour: 0,
    secondaryFromLevel: 99,
    baseCap: 12,
    secondaryCapRatio: 0,
    build: { LOG: 25, PLANK: 20, IRON_INGOT: 2 },
    buildCoins: 120,
    profession: 'FISHER',
  },
  PEN: {
    type: 'PEN',
    primary: 'FOOD',
    secondary: 'HIDE',
    basePrimaryPerHour: 1,
    baseSecondaryPerHour: 0.5,
    secondaryFromLevel: 1,
    baseCap: 10,
    secondaryCapRatio: 0.5,
    build: { LOG: 30, PLANK: 30, COBBLESTONE: 15 },
    buildCoins: 120,
    profession: 'HUNTER',
  },
};

export interface ProductionRates {
  primaryPerHour: number;
  secondaryPerHour: number;
  capPrimary: number;
  capSecondary: number;
}

export interface ProductionSnapshot {
  level: number;
  storedPrimary: number;
  storedSecondary: number;
  accPrimaryMilli: number;
  accSecondaryMilli: number;
  lastCalculatedAt: Date;
}

export interface ProductionTickResult extends ProductionSnapshot {
  producedPrimary: number;
  producedSecondary: number;
  hours: number;
  full: boolean;
}

export function isProductionBuildingType(value: string): value is ProductionBuildingType {
  return (PRODUCTION_BUILDINGS as readonly string[]).includes(value);
}

export function productionMult(level: number): number {
  if (level < 1) return 0;
  const lv = Math.min(PRODUCTION.maxLevel, Math.floor(level));
  return PRODUCTION_LEVEL_MULT[lv] ?? 0;
}

export function productionRates(
  type: ProductionBuildingType,
  level: number,
  jobLevel = 0,
): ProductionRates {
  const def = PRODUCTION_DEFS[type];
  const mult = productionMult(level);
  const bonus = 1 + jobProfessionBonusBps(jobLevel) / 10_000;
  const secondaryOn = level >= def.secondaryFromLevel;
  return {
    primaryPerHour: def.basePrimaryPerHour * mult * bonus,
    secondaryPerHour: secondaryOn ? def.baseSecondaryPerHour * mult * bonus : 0,
    capPrimary: Math.max(1, Math.round(def.baseCap * Math.max(mult, 1))),
    capSecondary: secondaryOn
      ? Math.max(1, Math.round(def.baseCap * def.secondaryCapRatio * Math.max(mult, 1)))
      : 0,
  };
}

export function productionHoursToFill(rates: ProductionRates): number | null {
  if (rates.primaryPerHour <= 0) return null;
  return rates.capPrimary / rates.primaryPerHour;
}

export interface ProductionCost {
  resources: Partial<Record<ResourceType, number>>;
  coins: number;
}

/** Build L1 uses base. Upgrade from `fromLevel` → fromLevel+1. */
export function productionCost(type: ProductionBuildingType, fromLevel: number): ProductionCost {
  const def = PRODUCTION_DEFS[type];
  const step = Math.max(0, Math.floor(fromLevel));
  const resFactor = Math.pow(1.35, step);
  const coinFactor = Math.pow(1.3, step);
  const resources: Partial<Record<ResourceType, number>> = {};
  for (const [key, value] of Object.entries(def.build)) {
    resources[key as ResourceType] = Math.max(1, Math.ceil((value ?? 0) * resFactor));
  }
  if (step >= 5) {
    resources.MIST_RESIN = (resources.MIST_RESIN ?? 0) + (step - 4);
  }
  return {
    resources,
    coins: Math.max(1, Math.ceil(def.buildCoins * coinFactor)),
  };
}

function applyGain(
  stored: number,
  accMilli: number,
  gain: number,
  cap: number,
): { stored: number; accMilli: number; produced: number } {
  if (cap <= 0 || stored >= cap || gain <= 0) {
    return { stored: Math.min(stored, cap), accMilli: stored >= cap ? 0 : accMilli, produced: 0 };
  }
  const total = stored + accMilli / PRODUCTION.milli + gain;
  const capped = Math.min(total, cap);
  const whole = Math.floor(capped);
  const frac = capped - whole;
  return {
    stored: whole,
    accMilli: stored >= cap || whole >= cap ? 0 : Math.round(frac * PRODUCTION.milli),
    produced: Math.max(0, whole - stored),
  };
}

export function tickProduction(
  type: ProductionBuildingType,
  state: ProductionSnapshot,
  now: Date,
  jobLevel = 0,
): ProductionTickResult {
  const level = Math.max(0, Math.min(PRODUCTION.maxLevel, Math.floor(state.level)));
  if (level < 1) {
    return {
      ...state,
      level,
      producedPrimary: 0,
      producedSecondary: 0,
      hours: 0,
      full: false,
      lastCalculatedAt: now,
    };
  }
  const rates = productionRates(type, level, jobLevel);
  let elapsed = now.getTime() - state.lastCalculatedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) elapsed = 0;
  if (elapsed > PRODUCTION.maxElapsedMs) elapsed = PRODUCTION.maxElapsedMs;
  const hours = elapsed / 3_600_000;
  const primary = applyGain(
    state.storedPrimary,
    state.accPrimaryMilli,
    hours * rates.primaryPerHour,
    rates.capPrimary,
  );
  const secondary = applyGain(
    state.storedSecondary,
    state.accSecondaryMilli,
    hours * rates.secondaryPerHour,
    rates.capSecondary,
  );
  const full = primary.stored >= rates.capPrimary;
  return {
    level,
    storedPrimary: primary.stored,
    storedSecondary: secondary.stored,
    accPrimaryMilli: full ? 0 : primary.accMilli,
    accSecondaryMilli: secondary.stored >= rates.capSecondary ? 0 : secondary.accMilli,
    lastCalculatedAt: now,
    producedPrimary: primary.produced,
    producedSecondary: secondary.produced,
    hours,
    full,
  };
}

export function dailyPrimaryAt(type: ProductionBuildingType, level: number, jobLevel = 0): number {
  const rates = productionRates(type, level, jobLevel);
  return Math.min(rates.capPrimary, rates.primaryPerHour * 24);
}

export function dailySecondaryAt(type: ProductionBuildingType, level: number, jobLevel = 0): number {
  const rates = productionRates(type, level, jobLevel);
  if (rates.capSecondary <= 0) return 0;
  return Math.min(rates.capSecondary, rates.secondaryPerHour * 24);
}
