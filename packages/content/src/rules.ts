import type { GameCommandType } from '@kubolesie/shared';
import { STONE_TIER_PICKS, WOOD_TIER_PICKS } from './mining';

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
  threadling: 16,
  reed_stalker: 22,
  bog_gnawer: 18,
  pitch_carapace: 28,
  smolnik: 50,
  mist_warden: 90,
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
  GATHER_WOOD: { locations: ['forest_clearing', 'rem_camp', 'player_camp', 'ashen_wedge', 'mist_border'] },
  GATHER_STONE: {
    locations: ['stone_scree'],
    itemsAny: [...WOOD_TIER_PICKS],
  },
  GATHER_IRON: {
    locations: ['old_adit'],
    itemsAny: [...STONE_TIER_PICKS],
    quest: { id: 'iron_for_gate', statuses: ['ACTIVE', 'CLAIMED', 'COMPLETED'] },
  },
  GATHER_COAL: {
    locations: ['soot_fissure', 'old_adit'],
    itemsAny: [...WOOD_TIER_PICKS],
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
  BEGIN_DAY_8: { flagsAll: ['week_1_complete'] },
  BEGIN_DAY_9: { flagsAll: ['day_8_complete'] },
  BEGIN_DAY_10: { flagsAll: ['day_9_complete'] },
  BEGIN_DAY_11: { flagsAll: ['day_10_complete'] },
  BEGIN_DAY_12: { flagsAll: ['day_11_complete'] },
  BEGIN_DAY_13: { flagsAll: ['day_12_complete'] },
  BEGIN_DAY_14: { flagsAll: ['day_13_complete'] },
  COMPLETE_DAY_8: { flagsAll: ['visited_mist_border'] },
  COMPLETE_DAY_9: { flagsAny: ['crop_planted', 'first_harvest'] },
  COMPLETE_DAY_10: { flagsAll: ['first_string'] },
  COMPLETE_DAY_11: { flagsAll: ['met_mira'] },
  COMPLETE_DAY_12: { flagsAll: ['quarry_chamber'] },
  COMPLETE_DAY_13: { flagsAll: ['defeated_smolnik'] },
  COMPLETE_DAY_14: { flagsAll: ['mist_warden_defeated'] },
  BEGIN_DAY_15: { flagsAll: ['week_2_complete'] },
  BEGIN_DAY_16: { flagsAll: ['day_15_complete'] },
  BEGIN_DAY_17: { flagsAll: ['day_16_complete'] },
  BEGIN_DAY_18: { flagsAll: ['day_17_complete'] },
  BEGIN_DAY_19: { flagsAll: ['day_18_complete'] },
  BEGIN_DAY_20: { flagsAll: ['day_19_complete'] },
  BEGIN_DAY_21: { flagsAll: ['day_20_complete'] },
  COMPLETE_DAY_15: { flagsAll: ['inspected_root_mark'] },
  COMPLETE_DAY_16: { flagsAll: ['tangle_cleared'] },
  COMPLETE_DAY_17: { flagsAll: ['visited_hollow_grove'] },
  COMPLETE_DAY_18: { flagsAny: ['root_mechanism_examined', 'root_mechanism_skipped'] },
  COMPLETE_DAY_19: { flagsAll: ['root_pack_ready'] },
  COMPLETE_DAY_20: { flagsAll: ['defeated_rootlasher'] },
  COMPLETE_DAY_21: { flagsAll: ['vyazen_defeated'] },
  FARM_ACT: { flagsAny: ['farming_unlocked', 'week_1_complete'] },
  WEEK2_ACT: { flagsAll: ['week_1_complete'] },
  WEEK3_ACT: { flagsAll: ['week_2_complete'] },
  BEGIN_DAY_22: { flagsAll: ['week_3_complete'] },
  BEGIN_DAY_23: { flagsAll: ['day_22_complete'] },
  BEGIN_DAY_24: { flagsAll: ['day_23_complete'] },
  BEGIN_DAY_25: { flagsAll: ['day_24_complete'] },
  BEGIN_DAY_26: { flagsAll: ['day_25_complete'] },
  BEGIN_DAY_27: { flagsAll: ['day_26_complete'] },
  BEGIN_DAY_28: { flagsAll: ['day_27_complete'] },
  COMPLETE_DAY_22: { flagsAll: ['week4_marker_examined'] },
  COMPLETE_DAY_23: { flagsAny: ['week4_path_beast', 'week4_path_ravine', 'week4_path_plank'] },
  COMPLETE_DAY_24: { flagsAll: ['visited_rot_hollow'] },
  COMPLETE_DAY_25: { flagsAny: ['missing_camp_examined', 'missing_camp_skipped'] },
  COMPLETE_DAY_26: { flagsAll: ['defeated_blackroot'] },
  COMPLETE_DAY_27: { flagsAll: ['warped_network_seen'] },
  COMPLETE_DAY_28: { flagsAll: ['tlennik_defeated'] },
  WEEK4_ACT: { flagsAll: ['week_3_complete'] },
  BEGIN_DAY_29: { flagsAll: ['week_4_complete'] },
  BEGIN_DAY_30: { flagsAll: ['day_29_complete'] },
  BEGIN_DAY_31: { flagsAll: ['day_30_complete'] },
  BEGIN_DAY_32: { flagsAll: ['day_31_complete'] },
  BEGIN_DAY_33: { flagsAll: ['day_32_complete'] },
  BEGIN_DAY_34: { flagsAll: ['day_33_complete'] },
  BEGIN_DAY_35: { flagsAll: ['day_34_complete'] },
  COMPLETE_DAY_29: { flagsAll: ['week5_fresh_marks_seen'] },
  COMPLETE_DAY_30: { flagsAny: ['week5_path_plank', 'week5_path_stone', 'week5_path_reed'] },
  COMPLETE_DAY_31: { flagsAll: ['visited_black_reed'] },
  COMPLETE_DAY_32: { flagsAny: ['week5_outpost_examined', 'week5_outpost_skipped'] },
  COMPLETE_DAY_33: { flagsAll: ['defeated_miremaw'] },
  COMPLETE_DAY_34: { flagsAll: ['network_changed_during_week5'] },
  COMPLETE_DAY_35: { flagsAll: ['bezdonnik_defeated'] },
  WEEK5_ACT: { flagsAll: ['week_4_complete'] },
  BEGIN_DAY_36: { flagsAll: ['week_5_complete'] },
  BEGIN_DAY_37: { flagsAll: ['day_36_complete'] },
  BEGIN_DAY_38: { flagsAll: ['day_37_complete'] },
  BEGIN_DAY_39: { flagsAll: ['day_38_complete'] },
  BEGIN_DAY_40: { flagsAll: ['day_39_complete'] },
  BEGIN_DAY_41: { flagsAll: ['day_40_complete'] },
  BEGIN_DAY_42: { flagsAll: ['day_41_complete'] },
  COMPLETE_DAY_36: { flagsAll: ['week6_recent_presence'] },
  COMPLETE_DAY_37: { flagsAny: ['week6_path_clear', 'week6_path_weight', 'week6_path_catwalk'] },
  COMPLETE_DAY_38: { flagsAll: ['visited_lower_gallery'] },
  COMPLETE_DAY_39: { flagsAny: ['week6_switch_restored', 'week6_switch_left'] },
  COMPLETE_DAY_40: { flagsAll: ['defeated_skrezhetnik'] },
  COMPLETE_DAY_41: { flagsAll: ['week6_direct_contact'] },
  COMPLETE_DAY_42: { flagsAll: ['zatvornik_defeated'] },
  WEEK6_ACT: { flagsAll: ['week_5_complete'] },
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
  mine_crawler: { locations: ['old_adit'], itemsAny: [...STONE_TIER_PICKS] },
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
  threadling: { flagsAll: ['week_1_complete'] },
  reed_stalker: { flagsAny: ['day_8_complete', 'visited_mist_lowland'] },
  bog_gnawer: { flagsAny: ['visited_drowned_quarry', 'day_11_complete'] },
  pitch_carapace: { flagsAny: ['quarry_drained', 'quarry_workings', 'day_11_complete'] },
  smolnik: {
    flagsAny: ['day_12_complete', 'smolnik_failed', 'defeated_smolnik'],
  },
  mist_warden: {
    flagsAny: ['day_13_complete', 'mist_warden_seen', 'mist_warden_failed', 'mist_warden_defeated'],
  },
  root_crawler: { flagsAny: ['tangle_cleared', 'day_16_complete', 'visited_hollow_grove'] },
  bark_hound: { flagsAny: ['tangle_cleared', 'day_16_complete', 'visited_hollow_grove'] },
  sap_stinger: { flagsAny: ['tangle_cleared', 'day_16_complete', 'visited_root_pit'] },
  rootlasher: {
    flagsAny: ['day_19_complete', 'rootlasher_failed', 'defeated_rootlasher'],
  },
  vyazen: {
    flagsAny: ['day_20_complete', 'vyazen_seen', 'vyazen_failed', 'vyazen_defeated'],
  },
  rot_scuttler: { flagsAny: ['visited_rot_hollow', 'day_23_complete', 'week4_path_beast', 'week4_path_ravine', 'week4_path_plank'] },
  mire_stalker: { flagsAny: ['visited_rot_hollow', 'day_23_complete', 'week4_path_beast', 'week4_path_ravine', 'week4_path_plank'] },
  bark_reaper: { flagsAny: ['visited_rot_hollow', 'day_23_complete', 'week4_path_beast', 'week4_path_ravine', 'week4_path_plank'] },
  blackroot: {
    flagsAny: ['day_25_complete', 'blackroot_failed', 'defeated_blackroot'],
  },
  tlennik: {
    flagsAny: ['day_27_complete', 'tlennik_seen', 'tlennik_failed', 'tlennik_defeated'],
  },
  reed_lurker: { flagsAny: ['visited_black_reed', 'day_30_complete', 'week5_path_plank', 'week5_path_stone', 'week5_path_reed'] },
  mire_claw: { flagsAny: ['visited_black_reed', 'day_30_complete', 'week5_path_plank', 'week5_path_stone', 'week5_path_reed'] },
  drowned_shell: { flagsAny: ['visited_black_reed', 'day_30_complete', 'week5_path_plank', 'week5_path_stone', 'week5_path_reed'] },
  miremaw: {
    flagsAny: ['day_32_complete', 'miremaw_failed', 'defeated_miremaw'],
  },
  bezdonnik: {
    flagsAny: ['day_34_complete', 'bezdonnik_seen', 'bezdonnik_failed', 'bezdonnik_defeated'],
  },
  rail_scuttler: {
    flagsAny: ['visited_lower_gallery', 'day_37_complete', 'week6_path_clear', 'week6_path_weight', 'week6_path_catwalk'],
  },
  dust_hound: {
    flagsAny: ['visited_lower_gallery', 'day_37_complete', 'week6_path_clear', 'week6_path_weight', 'week6_path_catwalk'],
  },
  ironback_brute: {
    flagsAny: ['visited_lower_gallery', 'day_37_complete', 'week6_path_clear', 'week6_path_weight', 'week6_path_catwalk'],
  },
  skrezhetnik: {
    flagsAny: ['day_39_complete', 'skrezhetnik_failed', 'defeated_skrezhetnik'],
  },
  zatvornik: {
    flagsAny: ['day_41_complete', 'zatvornik_seen', 'zatvornik_failed', 'zatvornik_defeated'],
  },
};
