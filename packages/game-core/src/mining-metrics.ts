/** Process-local mining counters. No VK IDs. Reset on restart. */

export interface MiningMetricsSnapshot {
  manualMiningActions: number;
  deepMiningActions: number;
  bronzeCrafts: number;
  yieldsByResource: Record<string, number>;
  smeltsByOre: Record<string, number>;
  recipeCrafts: Record<string, number>;
  miningUnlocks: Record<string, number>;
}

const counts: MiningMetricsSnapshot = {
  manualMiningActions: 0,
  deepMiningActions: 0,
  bronzeCrafts: 0,
  yieldsByResource: {},
  smeltsByOre: {},
  recipeCrafts: {},
  miningUnlocks: {},
};

function bumpMap(map: Record<string, number>, key: string, by: number): void {
  map[key] = (map[key] ?? 0) + by;
}

export function noteManualMine(resource: string, amount: number, siteId?: string): void {
  counts.manualMiningActions += 1;
  bumpMap(counts.yieldsByResource, resource, amount);
  if (siteId === 'deep' || resource === 'DEEP_CRYSTAL') counts.deepMiningActions += 1;
}

export function noteSmelt(ore: string, amount = 1): void {
  bumpMap(counts.smeltsByOre, ore, amount);
}

export function noteRecipeCraft(recipeId: string, amount = 1): void {
  bumpMap(counts.recipeCrafts, recipeId, amount);
  if (recipeId.startsWith('bronze_') || recipeId === 'bronze_ingot') {
    counts.bronzeCrafts += amount;
  }
}

export function noteMiningUnlock(siteId: string): void {
  bumpMap(counts.miningUnlocks, siteId, 1);
}

export function snapshotMiningMetrics(): MiningMetricsSnapshot {
  return {
    manualMiningActions: counts.manualMiningActions,
    deepMiningActions: counts.deepMiningActions,
    bronzeCrafts: counts.bronzeCrafts,
    yieldsByResource: { ...counts.yieldsByResource },
    smeltsByOre: { ...counts.smeltsByOre },
    recipeCrafts: { ...counts.recipeCrafts },
    miningUnlocks: { ...counts.miningUnlocks },
  };
}

export function resetMiningMetricsForTests(): void {
  counts.manualMiningActions = 0;
  counts.deepMiningActions = 0;
  counts.bronzeCrafts = 0;
  counts.yieldsByResource = {};
  counts.smeltsByOre = {};
  counts.recipeCrafts = {};
  counts.miningUnlocks = {};
}
