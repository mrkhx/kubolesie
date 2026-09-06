export const BALANCE_VERSION = '0.0.3';
export const PROTOTYPE_VERSION = '0.0.3';

export const ENERGY_REGEN_INTERVAL_MS = 10 * 60 * 1000;
export const ENERGY_PER_INTERVAL = 1;
export const STARTING_HP = 100;
export const STARTING_ENERGY = 20;
export const XP_TO_LEVEL_2 = 40;
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
  | 'COBBLESTONE';

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

export type CombatMode = 'PVE';
export type CombatResult = 'WIN' | 'LOSS' | 'DRAW';

export type CurrencyCode = 'COINS';

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
