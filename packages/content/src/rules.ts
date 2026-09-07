import type { GameCommandType } from '@kubolesie/shared';

export const GATHER_WOOD = {
  energyCost: 2,
  baseYield: 6,
  axeBonus: 0.25,
} as const;

export const GATHER_STONE = {
  energyCost: 2,
  minYield: 2,
  maxYield: 3,
  pickaxeBonus: 0.3,
} as const;

export const GATHER_IRON = {
  energyCost: 2,
  minYield: 2,
  maxYield: 4,
  pickaxeBonus: 0.3,
  collapseChance: 15,
  collapseMinHp: 5,
  collapseMaxHp: 10,
} as const;

export const GATHER_COAL = {
  energyCost: 2,
  minYield: 2,
  maxYield: 4,
} as const;

export const START_CRATE = {
  log: 2,
} as const;

export const SHELTER = {
  woodCost: 6,
  nightEnergyBonus: 6,
} as const;

export const NIGHT_REST = {
  energyBase: 10,
  hpToFull: true,
} as const;

export const LEVEL_UP = {
  maxHpGain: 5,
  maxEnergyGain: 1,
  /** HP fills to the new maximum. Energy gains the extra point, capped. */
  fillHpToMax: true,
} as const;

export const COMBAT_XP = {
  wild_shrew: 18,
  mine_crawler: 24,
  stone_scavenger: 12,
  moss_boar: 16,
  needle_runner: 14,
  pitch_mite: 20,
  resin_brute: 28,
  stumpfang: 40,
  soot_mite: 8,
  wenzel_warden: 80,
} as const;

export interface CommandRequirement {
  locations?: string[];
  flagsAny?: string[];
  flagsAll?: string[];
  quest?: { id: string; statuses: string[] };
  itemsAny?: string[];
  once?: { rewardType: string; rewardRef: string };
  enemies?: string[];
}

export const COMMAND_REQUIREMENTS: Partial<Record<GameCommandType, CommandRequirement>> = {
  GATHER_WOOD: { locations: ['forest_clearing', 'rem_camp', 'player_camp', 'ashen_wedge'] },
  GATHER_STONE: {
    locations: ['stone_scree'],
    itemsAny: ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe'],
  },
  GATHER_IRON: {
    locations: ['old_adit'],
    itemsAny: ['stone_pickaxe', 'iron_pickaxe'],
    quest: { id: 'iron_for_gate', statuses: ['ACTIVE', 'CLAIMED', 'COMPLETED'] },
  },
  GATHER_COAL: {
    locations: ['soot_fissure', 'old_adit'],
    itemsAny: ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe'],
  },
  BUILD_TEMP_SHELTER: { locations: ['forest_clearing'], once: { rewardType: 'structure', rewardRef: 'temp_shelter' } },
  FEED_SCAVENGER: { locations: ['stone_scree'] },
  RETURN_IRON: { quest: { id: 'iron_for_gate', statuses: ['ACTIVE'] } },
  OPEN_SECRET_CHEST: {
    locations: ['secret_chamber'],
    once: { rewardType: 'chest', rewardRef: 'adit_secret' },
  },
  MINE_BLUE_MINERAL: { locations: ['secret_chamber'], flagsAll: ['found_blue_light'] },
  REST_NIGHT: { quest: { id: 'iron_for_gate', statuses: ['CLAIMED'] } },
  BEGIN_DAY_2: { flagsAll: ['day_1_complete'] },
  FOUND_CAMP: { flagsAll: ['day_1_complete'] },
  PLACE_CAMP_TABLE: { locations: ['player_camp'], flagsAll: ['player_camp_founded'] },
  LIGHT_CAMP: { locations: ['player_camp'], flagsAll: ['player_camp_founded'] },
  COMPLETE_DAY_2: { flagsAll: ['player_camp_founded'] },
  BEGIN_DAY_3: { flagsAll: ['day_2_complete'] },
  BEGIN_DAY_4: { flagsAll: ['day_3_complete'] },
  BEGIN_DAY_5: { flagsAll: ['day_4_complete'] },
  BEGIN_DAY_6: { flagsAll: ['day_5_complete'] },
  BEGIN_DAY_7: { flagsAll: ['day_6_complete'] },
  COMPLETE_DAY_3: { flagsAll: ['visited_ashen_wedge'] },
  COMPLETE_DAY_4: { flagsAll: ['furnace_placed'] },
  COMPLETE_DAY_5: { flagsAll: ['met_vel'] },
  COMPLETE_DAY_6: { flagsAll: ['yara_claim_seen'] },
  COMPLETE_DAY_7: { flagsAll: ['wenzel_defeated'] },
  FURNACE_ACT: { flagsAny: ['furnace_placed', 'furnace_built'] },
  TRADE_ACT: { flagsAll: ['met_vel'] },
  PAY_TRIBUTE: { flagsAll: ['yara_claim_seen'] },
  START_PVP: { flagsAll: ['yara_claim_seen'] },
  BUILD_BARRICADE: { flagsAll: ['day_6_complete'] },
  REPAIR_LANTERN: { flagsAll: ['met_vel'] },
  SALVAGE_ITEM: { flagsAny: ['met_vel', 'salvage_unlocked'] },
  INSPECT_TOKEN: { itemsAny: ['rusty_token'] },
  OPEN_CRATE: { locations: ['forest_clearing'] },
};

export const COMBAT_REQUIREMENTS: Record<string, CommandRequirement> = {
  wild_shrew: { locations: ['forest_clearing'] },
  stone_scavenger: { locations: ['stone_scree'] },
  mine_crawler: { locations: ['old_adit'], itemsAny: ['stone_pickaxe', 'iron_pickaxe'] },
  soot_mite: { locations: ['soot_fissure'] },
  moss_boar: { locations: ['ashen_wedge'] },
  needle_runner: { locations: ['ashen_wedge'] },
  pitch_mite: { locations: ['ashen_wedge'] },
  resin_brute: { locations: ['ashen_wedge'] },
  stumpfang: { locations: ['ashen_wedge'] },
  yara_trace: { locations: ['stone_scree', 'rival_camp_edge'] },
  wedge_scout: { locations: ['stone_scree', 'rival_camp_edge'] },
  foreign_post: { locations: ['stone_scree', 'rival_camp_edge'] },
  wenzel_warden: {
    locations: ['seal_forecourt', 'node_7'],
    flagsAny: ['day_6_complete', 'gate_failing', 'wenzel_seen'],
  },
};
