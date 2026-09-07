export const BALANCE_VERSION = '0.0.5';
export const PROTOTYPE_VERSION = '0.0.5';

export const ENERGY_REGEN_INTERVAL_MS = 10 * 60 * 1000;
export const ENERGY_PER_INTERVAL = 1;
export const STARTING_HP = 100;
export const STARTING_ENERGY = 20;
export const XP_TO_LEVEL_2 = 40;
/** Cumulative XP to reach the indexed level. L2=40 … L8=640. */
export const XP_THRESHOLDS = [0, 0, 40, 90, 160, 250, 360, 490, 640] as const;
export const STARTING_STATS = {
  attack: 5,
  defense: 0,
  speed: 10,
  critChance: 5,
  critDamage: 150,
  dodge: 3,
  accuracy: 95,
  luck: 0,
} as const;

export const GAME_COMMANDS = [
  'START_GAME',
  'EXPLORE',
  'OPEN_INVENTORY',
  'OPEN_CAMP',
  'OPEN_MENU',
  'GATHER_WOOD',
  'GATHER_STONE',
  'GATHER_IRON',
  'GATHER_COAL',
  'CRAFT_ITEM',
  'EQUIP_ITEM',
  'USE_ITEM',
  'TALK_NPC',
  'START_PVE',
  'CLAIM_REWARD',
  'OPEN_CRATE',
  'DIALOGUE_CHOICE',
  'INSPECT_TOKEN',
  'BUILD_TEMP_SHELTER',
  'FEED_SCAVENGER',
  'RETURN_IRON',
  'OPEN_SECRET_CHEST',
  'MINE_BLUE_MINERAL',
  'REST_NIGHT',
  'BEGIN_DAY_2',
  'FOUND_CAMP',
  'PLACE_CAMP_TABLE',
  'LIGHT_CAMP',
  'COMPLETE_DAY_2',
  'BEGIN_DAY_3',
  'BEGIN_DAY_4',
  'BEGIN_DAY_5',
  'BEGIN_DAY_6',
  'BEGIN_DAY_7',
  'COMPLETE_DAY_3',
  'COMPLETE_DAY_4',
  'COMPLETE_DAY_5',
  'COMPLETE_DAY_6',
  'COMPLETE_DAY_7',
  'FURNACE_ACT',
  'TRADE_ACT',
  'PAY_TRIBUTE',
  'START_PVP',
  'PVP_ACT',
  'BUILD_BARRICADE',
  'HELP_PET',
  'REPAIR_LANTERN',
  'SALVAGE_ITEM',
  'OPEN_PROFILE',
  'CLAN_ACT',
  'COSMETIC_ACT',
  'LEADERBOARD_PAGE',
  'PROMPT_HERO_NAME',
  'CANCEL_HERO_NAME',
  'BEGIN_DAY_8',
  'BEGIN_DAY_9',
  'BEGIN_DAY_10',
  'BEGIN_DAY_11',
  'BEGIN_DAY_12',
  'BEGIN_DAY_13',
  'BEGIN_DAY_14',
  'COMPLETE_DAY_8',
  'COMPLETE_DAY_9',
  'COMPLETE_DAY_10',
  'COMPLETE_DAY_11',
  'COMPLETE_DAY_12',
  'COMPLETE_DAY_13',
  'COMPLETE_DAY_14',
  'FARM_ACT',
  'WEEK2_ACT',
] as const;

export type GameCommandType = (typeof GAME_COMMANDS)[number];

export interface GameCommand {
  type: GameCommandType;
  payload?: Record<string, unknown>;
}

export interface GameButton {
  label: string;
  action: GameCommandType | string;
  payload?: Record<string, unknown>;
  color?: 'primary' | 'positive' | 'negative' | 'secondary';
}

export interface GameAttachment {
  type: 'image' | 'card';
  url?: string;
  title?: string;
}

export interface GameStateView {
  playerId?: string;
  location?: string;
  node?: string;
  hp?: number;
  maxHp?: number;
  energy?: number;
  maxEnergy?: number;
  coins?: number;
  level?: number;
  xp?: number;
}

export interface GameResponse {
  text: string;
  buttons: GameButton[];
  attachments?: GameAttachment[];
  state?: GameStateView;
}

export type ResourceType =
  | 'WOOD'
  | 'STONE'
  | 'IRON_ORE'
  | 'FIBER'
  | 'HIDE'
  | 'HERBS'
  | 'COAL'
  | 'RAW_MEAT'
  | 'SHREW_FUR'
  | 'CHITIN_PLATE'
  | 'SHINY_STONE'
  | 'FOOD'
  | 'LOG'
  | 'PLANK'
  | 'STICK'
  | 'COBBLESTONE'
  | 'IRON_INGOT'
  | 'SEED'
  | 'WHEAT'
  | 'STRING'
  | 'REED'
  | 'CLAY'
  | 'RAW_FISH'
  | 'COOKED_FISH'
  | 'MIST_RESIN'
  | 'BOG_CORE'
  | 'SEAL_SHARD_6';

export const RESOURCE_TYPES: ResourceType[] = [
  'WOOD',
  'STONE',
  'IRON_ORE',
  'FIBER',
  'HIDE',
  'HERBS',
  'COAL',
  'RAW_MEAT',
  'SHREW_FUR',
  'CHITIN_PLATE',
  'SHINY_STONE',
  'FOOD',
  'LOG',
  'PLANK',
  'STICK',
  'COBBLESTONE',
  'IRON_INGOT',
  'SEED',
  'WHEAT',
  'STRING',
  'REED',
  'CLAY',
  'RAW_FISH',
  'COOKED_FISH',
  'MIST_RESIN',
  'BOG_CORE',
  'SEAL_SHARD_6',
];

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export type EquipmentSlot =
  | 'WEAPON'
  | 'HEAD'
  | 'CHEST'
  | 'HANDS'
  | 'LEGS'
  | 'FEET'
  | 'AMULET'
  | 'RING';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  'WEAPON',
  'HEAD',
  'CHEST',
  'HANDS',
  'LEGS',
  'FEET',
  'AMULET',
  'RING',
];

export type QuestStatus = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'COMPLETED' | 'CLAIMED';

export type ItemHistoryType = 'CREATED' | 'LOOTED' | 'EQUIPPED' | 'SALVAGED' | 'SOLD' | 'DESTROYED';

export type BattleEventType = 'HIT' | 'CRIT' | 'DODGE' | 'DEFEAT';

export type CombatMode = 'PVE' | 'PVP';
export type CombatResult = 'WIN' | 'LOSS' | 'DRAW';

export type CurrencyCode = 'COINS' | 'PREMIUM';

export type ClanRole = 'LEADER' | 'OFFICER' | 'MEMBER';
export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export interface PlayerStatsView {
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
  dodge: number;
  accuracy: number;
  luck: number;
}

export interface ExternalIdentity {
  provider: 'vk';
  providerUserId: string;
  displayName?: string;
}

export interface NormalizedIncomingEvent {
  eventId: string;
  identity: ExternalIdentity;
  command: GameCommand;
  text?: string;
}

export function isGameCommandType(value: string): value is GameCommandType {
  return (GAME_COMMANDS as readonly string[]).includes(value);
}

export * from './ui';
