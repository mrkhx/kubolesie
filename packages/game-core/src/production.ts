import {
  PRODUCTION,
  PRODUCTION_DEFS,
  PRODUCTION_LABELS,
  isProductionBuildingType,
  productionCost,
  productionHoursToFill,
  productionRates,
  tickProduction,
  type ProductionBuildingType,
} from '@kubolesie/content';
import { ActionRejectedError } from './errors';
import type { GameStore, PlayerProductionBuildingRecord, ProductionCollectResult } from './store';

export { PRODUCTION, PRODUCTION_DEFS, PRODUCTION_LABELS, isProductionBuildingType };

export function isProductionUnlocked(flags: Record<string, string>): boolean {
  return Boolean(flags[PRODUCTION.unlockFlag]);
}

export function assertBuildingType(value: string): ProductionBuildingType {
  if (!isProductionBuildingType(value)) throw new ActionRejectedError('Нет такой постройки.');
  return value;
}

export async function snapshotBuilding(
  store: GameStore,
  playerId: string,
  buildingType: ProductionBuildingType,
  now: Date,
  jobLevel = 0,
): Promise<PlayerProductionBuildingRecord | null> {
  return store.tickProductionBuilding({ playerId, buildingType, jobLevel, now });
}

export async function buildBuilding(
  store: GameStore,
  playerId: string,
  buildingType: ProductionBuildingType,
  now: Date,
  requestId?: string,
): Promise<PlayerProductionBuildingRecord> {
  return store.buildProductionBuilding({ playerId, buildingType, now, requestId });
}

export async function collectBuilding(
  store: GameStore,
  playerId: string,
  buildingType: ProductionBuildingType,
  now: Date,
  jobLevel = 0,
  requestId?: string,
): Promise<ProductionCollectResult> {
  return store.collectProductionBuilding({ playerId, buildingType, jobLevel, now, requestId });
}

export async function upgradeBuilding(
  store: GameStore,
  playerId: string,
  buildingType: ProductionBuildingType,
  now: Date,
  jobLevel = 0,
  requestId?: string,
): Promise<PlayerProductionBuildingRecord> {
  return store.upgradeProductionBuilding({ playerId, buildingType, jobLevel, now, requestId });
}

export function buildingView(
  type: ProductionBuildingType,
  building: PlayerProductionBuildingRecord | null,
  jobLevel = 0,
): {
  level: number;
  rates: ReturnType<typeof productionRates>;
  hoursToFill: number | null;
  storedPrimary: number;
  storedSecondary: number;
  cost: ReturnType<typeof productionCost>;
  nextCost: ReturnType<typeof productionCost> | null;
} {
  const level = building?.level ?? 0;
  const rates = productionRates(type, Math.max(1, level), jobLevel);
  return {
    level,
    rates: level < 1 ? { primaryPerHour: 0, secondaryPerHour: 0, capPrimary: 0, capSecondary: 0 } : rates,
    hoursToFill: level < 1 ? null : productionHoursToFill(rates),
    storedPrimary: building?.storedPrimary ?? 0,
    storedSecondary: building?.storedSecondary ?? 0,
    cost: productionCost(type, level),
    nextCost: level >= PRODUCTION.maxLevel || level < 1 ? null : productionCost(type, level),
  };
}

export function etaLabel(hours: number | null, full: boolean): string {
  if (full) return 'Хранилище полное.';
  if (hours == null || !Number.isFinite(hours)) return 'Не работает.';
  if (hours <= 0) return 'Хранилище полное.';
  if (hours < 1) return `До заполнения: ~${Math.max(1, Math.round(hours * 60))} мин`;
  const rounded = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return `До заполнения: ~${rounded}ч`;
}

export { tickProduction, productionRates, productionCost, productionHoursToFill };
