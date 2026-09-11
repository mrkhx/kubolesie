import {
  ENERGY_PER_INTERVAL,
  ENERGY_REGEN_INTERVAL_MS,
  RESOURCE_TYPES,
  type GameButton,
  type GameCommandType,
  type GameResponse,
  type NormalizedIncomingEvent,
  type ResourceType,
} from '@kubolesie/shared';
import { CRAFT_RECIPES, LOCATIONS, MINING_SITES, getLocation } from '@kubolesie/content';
import { MemoryGameStore } from './memory-store';
import { CRAFT_MENU_GROUPS } from './menus';
import { GameRuntime } from './runtime';
import type { PlayerRecord } from './store';

const PRODUCTIVE_ACTIONS = new Set<string>([
  'GATHER_WOOD',
  'GATHER_STONE',
  'GATHER_IRON',
  'GATHER_COAL',
  'MINE_ACT',
  'CRAFT_ITEM',
  'FURNACE_ACT',
  'START_PVE',
  'START_PVP',
  'JOB_ACT',
  'PROD_ACT',
  'MARKET_ACT',
]);

const TEXT_INPUT_ACTIONS = new Set<string>(['PROMPT_HERO_NAME']);

const UNIQUE_ITEMS = ['rusty_token', 'broken_lantern', 'stumpfang_tooth', 'wenzel_plate'] as const;
const UNIQUE_RESOURCES: ResourceType[] = [
  'SEAL_SHARD_6',
  'SEAL_SHARD_5',
  'SEAL_SHARD_4',
  'SEAL_SHARD_3',
  'SEAL_SHARD_2',
];

export class SimClock {
  private t: number;

  constructor(start = Date.parse('2026-09-11T12:00:00.000Z')) {
    this.t = start;
  }

  now = (): Date => new Date(this.t);

  advance(ms: number): void {
    this.t += Math.max(0, ms);
  }

  advanceTicks(ticks: number): void {
    this.advance(Math.max(0, Math.floor(ticks)) * ENERGY_REGEN_INTERVAL_MS);
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimStep {
  n: number;
  type: string;
  payload: Record<string, unknown>;
  eventId: string;
  text: string;
  labels: string[];
  energy: number;
  location: string;
  currentState: string;
  rejected: boolean;
  quiet: boolean;
}

export interface SimSnapshot {
  energy: number;
  maxEnergy: number;
  coins: number;
  hp: number;
  xp: number;
  level: number;
  location: string;
  currentState: string;
  resources: Partial<Record<ResourceType, number>>;
  items: string[];
  flags: Record<string, string>;
}

export interface SimInvariantFailure {
  reason: string;
  location: string;
  currentState: string;
  step: number;
  count?: number;
  labels?: string[];
}

export interface SoftlockReport {
  found: boolean;
  reason?: string;
  fingerprint?: string;
  step?: number;
}

export interface EconomySample {
  goal: string;
  actions: number;
  energySpent: number;
  mines: number;
  smelts: number;
  crafts: number;
}

export interface RandomWalkReport {
  seed: number;
  steps: number;
  crashes: string[];
  softlock: SoftlockReport;
  historyTail: SimStep[];
  location: string;
  currentState: string;
}

function labelsOf(response: GameResponse): string[] {
  return response.buttons.map((button) => button.label);
}

export function formatButtonOverflow(failure: SimInvariantFailure): string {
  const labels = failure.labels ?? [];
  return [
    'UI button overflow:',
    `state=${failure.currentState}`,
    `location=${failure.location}`,
    `count=${failure.count ?? 0}`,
    `labels=[${labels.join(', ')}]`,
  ].join('\n');
}

function isRejectedText(text: string): boolean {
  if (/\+\d+/.test(text) || /Скрафчено:|Выплавлено:|Забрано|Лот выставлен|Собрано:/.test(text)) {
    return false;
  }
  return /нельзя|Не хватает|Нужна |Нужен |Нужно |Нет[: ]|уже есть|Такого рецепта нет|ещё закрыт|Откроется/i.test(
    text,
  );
}

function fingerprint(location: string, state: string, buttons: GameButton[]): string {
  const acts = buttons
    .map((button) => `${button.action}:${JSON.stringify(button.payload ?? {})}`)
    .sort()
    .join('|');
  return `${location}#${state}#${acts}`;
}

function hasProductive(buttons: GameButton[]): boolean {
  return buttons.some((button) => {
    if (PRODUCTIVE_ACTIONS.has(button.action)) return true;
    const menu = String(button.payload?.menu ?? '');
    return menu === 'gather' || menu === 'craft' || menu === 'tools' || menu === 'materials';
  });
}

export class SimSession {
  readonly store: MemoryGameStore;
  readonly runtime: GameRuntime;
  readonly clock: SimClock;
  readonly vkUserId: string;
  playerId = '';
  last: GameResponse = { text: '', buttons: [] };
  readonly history: SimStep[] = [];
  readonly invariantFailures: SimInvariantFailure[] = [];
  readonly buttonOverflows: SimInvariantFailure[] = [];
  readonly softlocks: SoftlockReport[] = [];
  energySpent = 0;
  mines = 0;
  smelts = 0;
  crafts = 0;
  private seq = 0;
  private lastFingerprint = '';
  private fingerprintStreak = 0;
  private progressHash = '';

  private constructor(store: MemoryGameStore, runtime: GameRuntime, clock: SimClock, vkUserId: string) {
    this.store = store;
    this.runtime = runtime;
    this.clock = clock;
    this.vkUserId = vkUserId;
  }

  static async boot(opts: { vkUserId?: string; clock?: SimClock; skipStart?: boolean } = {}): Promise<SimSession> {
    const clock = opts.clock ?? new SimClock();
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store, clock.now);
    const vkUserId = opts.vkUserId ?? `sim-${Math.random().toString(16).slice(2, 10)}`;
    const session = new SimSession(store, runtime, clock, vkUserId);
    if (opts.skipStart) return session;
    const started = await session.act('START_GAME');
    session.playerId = started.state?.playerId ?? '';
    if (!session.playerId) throw new Error('START_GAME did not return playerId');
    return session;
  }

  event(
    type: GameCommandType,
    payload: Record<string, unknown> = {},
    eventId?: string,
  ): NormalizedIncomingEvent {
    return {
      eventId: eventId ?? `sim-${this.vkUserId}-${++this.seq}`,
      identity: { provider: 'vk', providerUserId: this.vkUserId, displayName: 'Симулянт' },
      command: { type, payload },
    };
  }

  async reload(): Promise<PlayerRecord> {
    if (!this.playerId) {
      const created = await this.store.findPlayerByVkUserId(this.vkUserId);
      if (!created) throw new Error('player missing');
      this.playerId = created.id;
      return created;
    }
    const player = await this.store.findPlayerById(this.playerId);
    if (!player) throw new Error('player missing');
    return player;
  }

  async snapshot(): Promise<SimSnapshot> {
    const player = await this.reload();
    const [resources, items, flags] = await Promise.all([
      this.store.getResources(player.id),
      this.store.listItems(player.id),
      this.store.getFlags(player.id),
    ]);
    return {
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      coins: player.coins,
      hp: player.hp,
      xp: player.xp,
      level: player.level,
      location: player.currentLocation,
      currentState: player.currentState,
      resources,
      items: items.map((item) => item.templateId),
      flags,
    };
  }

  async act(
    type: GameCommandType,
    payload: Record<string, unknown> = {},
    eventId?: string,
    opts: { quiet?: boolean } = {},
  ): Promise<GameResponse> {
    const before = this.playerId ? await this.reload().catch(() => null) : null;
    const energyBefore = before?.energy ?? 0;
    const incoming = this.event(type, payload, eventId);
    const response = await this.runtime.handle(incoming);
    this.last = response;
    if (response.state?.playerId) this.playerId = response.state.playerId;
    const after = this.playerId ? await this.reload().catch(() => null) : null;
    const energyAfter = after?.energy ?? energyBefore;
    if (!opts.quiet && energyAfter < energyBefore) {
      this.energySpent += energyBefore - energyAfter;
    }
    if (!opts.quiet && type === 'MINE_ACT' && payload.act === 'mine' && !isRejectedText(response.text)) {
      this.mines += 1;
    }
    if (
      !opts.quiet &&
      type === 'FURNACE_ACT' &&
      (payload.act === 'smelt' || payload.act === 'smelt_ore') &&
      !isRejectedText(response.text)
    ) {
      this.smelts += 1;
    }
    if (!opts.quiet && type === 'CRAFT_ITEM' && !isRejectedText(response.text)) {
      this.crafts += 1;
    }
    const step: SimStep = {
      n: this.history.length,
      type,
      payload,
      eventId: incoming.eventId,
      text: response.text,
      labels: labelsOf(response),
      energy: after?.energy ?? 0,
      location: after?.currentLocation ?? '',
      currentState: after?.currentState ?? '',
      rejected: isRejectedText(response.text),
      quiet: Boolean(opts.quiet),
    };
    if (!opts.quiet) this.history.push(step);
    if (!opts.quiet) {
      if (response.buttons.length > 5) {
        this.buttonOverflows.push({
          reason: `buttons ${response.buttons.length} > 5`,
          location: after?.currentLocation ?? '',
          currentState: after?.currentState ?? '',
          step: this.history.length,
          count: response.buttons.length,
          labels: labelsOf(response),
        });
      }
      await this.checkInvariants();
      this.noteSoftlock(after, response);
    }
    return response;
  }

  async press(part: string): Promise<GameResponse> {
    const button = this.last.buttons.find((row) => row.label.includes(part));
    if (!button) {
      throw new Error(`no button matching "${part}". have: ${labelsOf(this.last).join(', ')}`);
    }
    return this.act(button.action as GameCommandType, button.payload ?? {});
  }

  async collectPagedLabels(maxPages = 8): Promise<string[]> {
    const seen = new Set(labelsOf(this.last));
    for (let page = 0; page < maxPages && this.last.buttons.some((button) => button.label.includes('Ещё')); page += 1) {
      await this.press('Ещё');
      for (const label of labelsOf(this.last)) seen.add(label);
    }
    return [...seen];
  }

  async pressOnPages(part: string, maxPages = 8): Promise<GameResponse> {
    for (let page = 0; page < maxPages; page += 1) {
      if (this.last.buttons.some((button) => button.label.includes(part))) {
        return this.press(part);
      }
      if (!this.last.buttons.some((button) => button.label.includes('Ещё'))) break;
      await this.press('Ещё');
    }
    throw new Error(`no button matching "${part}" across pages. have: ${labelsOf(this.last).join(', ')}`);
  }

  async openCraftGroup(group: 'items' | 'tools' | 'weapons' | 'materials'): Promise<GameResponse> {
    return this.act('OPEN_MENU', { menu: group });
  }

  async craftViaUi(part: string): Promise<GameResponse> {
    const groups = ['items', 'tools', 'weapons', 'materials'] as const;
    for (const group of groups) {
      await this.openCraftGroup(group);
      for (let page = 0; page < 8; page += 1) {
        if (this.last.buttons.some((button) => button.label.includes(part))) {
          return this.press(part);
        }
        if (!this.last.buttons.some((button) => button.label.includes('Ещё'))) break;
        await this.press('Ещё');
      }
    }
    throw new Error(`recipe "${part}" is not visible in craft UI`);
  }

  async mine(site: string): Promise<GameResponse> {
    const energy = MINING_SITES[site]?.energy ?? 1;
    await this.ensureEnergy(energy);
    return this.act('MINE_ACT', { act: 'mine', site });
  }

  async craft(recipeId: string): Promise<GameResponse> {
    return this.act('CRAFT_ITEM', { recipeId });
  }

  async smeltIron(times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      const fuel = Number((await this.store.getFlags(this.playerId)).furnace_fuel ?? 0);
      if (fuel < 1) {
        const coal = (await this.store.getResources(this.playerId)).COAL ?? 0;
        if (coal < 1) {
          await this.mine('coal');
        }
        await this.act('FURNACE_ACT', { act: 'add_coal' });
      }
      await this.act('FURNACE_ACT', { act: 'smelt' });
    }
    await this.act('FURNACE_ACT', { act: 'take' });
  }

  async smeltOre(ore: string, times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      const fuel = Number((await this.store.getFlags(this.playerId)).furnace_fuel ?? 0);
      if (fuel < 1) {
        const coal = (await this.store.getResources(this.playerId)).COAL ?? 0;
        if (coal < 1) await this.mine('coal');
        await this.act('FURNACE_ACT', { act: 'add_coal' });
      }
      await this.act('FURNACE_ACT', { act: 'smelt_ore', ore });
    }
  }

  async ensureEnergy(need: number): Promise<void> {
    const player = await this.reload();
    if (player.energy >= need) return;
    const missing = Math.max(1, need - player.energy);
    this.clock.advanceTicks(missing + 1);
    await this.act('OPEN_INVENTORY', {}, undefined, { quiet: true });
    const after = await this.reload();
    if (after.energy < need) {
      this.clock.advanceTicks(after.maxEnergy + 2);
      await this.act('OPEN_MENU', { menu: 'hub' }, undefined, { quiet: true });
    }
  }

  async resource(type: ResourceType): Promise<number> {
    return (await this.store.getResources(this.playerId))[type] ?? 0;
  }

  async itemCount(templateId: string): Promise<number> {
    return (await this.store.listItems(this.playerId)).filter((item) => item.templateId === templateId).length;
  }

  async hasItem(templateId: string): Promise<boolean> {
    return (await this.itemCount(templateId)) > 0;
  }

  async flag(name: string): Promise<string | undefined> {
    return (await this.store.getFlags(this.playerId))[name];
  }

  async grantFlags(flags: readonly string[]): Promise<void> {
    for (const flag of flags) await this.store.setFlag(this.playerId, flag, '1');
  }

  async moveTo(location: string, state?: string): Promise<void> {
    const player = await this.reload();
    player.currentLocation = location;
    if (state) player.currentState = state;
    await this.store.savePlayer(player);
  }

  async giveItem(templateId: string, rarity: 'COMMON' | 'UNCOMMON' | 'RARE' = 'COMMON'): Promise<void> {
    await this.store.createItem({ playerId: this.playerId, templateId, rarity });
  }

  beginEconomy(): { startSpent: number; startMines: number; startSmelts: number; startCrafts: number; startActions: number } {
    return {
      startSpent: this.energySpent,
      startMines: this.mines,
      startSmelts: this.smelts,
      startCrafts: this.crafts,
      startActions: this.history.length,
    };
  }

  endEconomy(goal: string, mark: ReturnType<SimSession['beginEconomy']>): EconomySample {
    return {
      goal,
      actions: this.history.length - mark.startActions,
      energySpent: this.energySpent - mark.startSpent,
      mines: this.mines - mark.startMines,
      smelts: this.smelts - mark.startSmelts,
      crafts: this.crafts - mark.startCrafts,
    };
  }

  private async checkInvariants(): Promise<void> {
    if (!this.playerId) return;
    const snap = await this.snapshot();
    const fail = (reason: string) => {
      this.invariantFailures.push({
        reason,
        location: snap.location,
        currentState: snap.currentState,
        step: this.history.length,
      });
    };
    if (!Number.isFinite(snap.energy) || snap.energy < 0) fail(`energy ${snap.energy}`);
    if (!Number.isFinite(snap.maxEnergy) || snap.maxEnergy <= 0) fail(`maxEnergy ${snap.maxEnergy}`);
    if (snap.energy > snap.maxEnergy + 8) fail(`energy ${snap.energy} > max ${snap.maxEnergy}`);
    if (!Number.isFinite(snap.coins) || snap.coins < 0) fail(`coins ${snap.coins}`);
    if (!Number.isFinite(snap.hp) || snap.hp < 0) fail(`hp ${snap.hp}`);
    if (!Number.isFinite(snap.xp) || snap.xp < 0) fail(`xp ${snap.xp}`);
    if (!snap.currentState) fail('undefined currentState');
    if (!snap.location) fail('empty location');
    if (snap.location && !getLocation(snap.location) && !(snap.location in LOCATIONS)) {
      fail(`unknown location ${snap.location}`);
    }
    for (const [key, amount] of Object.entries(snap.resources)) {
      if (!Number.isFinite(amount) || (amount ?? 0) < 0) fail(`resource ${key}=${amount}`);
      if (Number.isNaN(amount)) fail(`NaN resource ${key}`);
    }
    if (snap.items.length < 0) fail('inventory count');
    for (const item of UNIQUE_ITEMS) {
      const count = snap.items.filter((id) => id === item).length;
      if (count > 1) fail(`duplicate unique item ${item} x${count}`);
    }
    for (const resource of UNIQUE_RESOURCES) {
      const amount = snap.resources[resource] ?? 0;
      if (amount > 1) fail(`duplicate story shard ${resource}=${amount}`);
    }
    for (const type of RESOURCE_TYPES) {
      const amount = snap.resources[type];
      if (amount != null && !Number.isFinite(amount)) fail(`non-finite ${type}`);
    }
  }

  private noteSoftlock(player: PlayerRecord | null, response: GameResponse): void {
    if (!player) return;
    if (response.skipSend) return;
    const flags = this.history.length;
    void flags;
    if (response.buttons.length === 0 && !/конец|победа|неделя 6/i.test(response.text)) {
      this.softlocks.push({
        found: true,
        reason: 'empty buttons',
        step: this.history.length,
        fingerprint: `${player.currentLocation}#${player.currentState}`,
      });
      return;
    }
    const fp = fingerprint(player.currentLocation, player.currentState, response.buttons);
    const progress = `${player.energy}|${player.coins}|${player.hp}`;
    if (fp === this.lastFingerprint && progress === this.progressHash) {
      this.fingerprintStreak += 1;
    } else {
      this.fingerprintStreak = 0;
      this.lastFingerprint = fp;
      this.progressHash = progress;
    }
    if (this.fingerprintStreak >= 12 && !hasProductive(response.buttons)) {
      this.softlocks.push({
        found: true,
        reason: 'state+actions loop without productive buttons',
        fingerprint: fp,
        step: this.history.length,
      });
    }
  }

  async mineUntil(site: string, resource: ResourceType, need: number, maxTries = 80): Promise<void> {
    for (let i = 0; i < maxTries; i += 1) {
      if ((await this.resource(resource)) >= need) return;
      const response = await this.mine(site);
      if (this.history.at(-1)?.rejected && (await this.resource(resource)) < need) {
        throw new Error(`cannot mine ${site} for ${resource}: ${response.text}`);
      }
    }
    const have = await this.resource(resource);
    if (have < need) throw new Error(`mineUntil ${site} ${resource}: have ${have} need ${need}`);
  }

  async gatherWood(): Promise<GameResponse> {
    await this.ensureEnergy(2);
    return this.act('GATHER_WOOD');
  }

  async ensureResource(type: ResourceType, need: number): Promise<void> {
    if (type === 'LOG') {
      while ((await this.resource('LOG')) < need) await this.gatherWood();
      return;
    }
    if (type === 'PLANK') {
      while ((await this.resource('PLANK')) < need) {
        if ((await this.resource('LOG')) < 1) await this.gatherWood();
        const made = await this.craft('planks');
        if (this.history.at(-1)?.rejected) throw new Error(`planks failed: ${made.text}`);
      }
      return;
    }
    if (type === 'STICK') {
      while ((await this.resource('STICK')) < need) {
        await this.ensureResource('PLANK', 2);
        const made = await this.craft('sticks');
        if (this.history.at(-1)?.rejected) throw new Error(`sticks failed: ${made.text}`);
      }
      return;
    }
    throw new Error(`ensureResource unsupported ${type}`);
  }

  assertHealthy(): void {
    const overflow = this.buttonOverflows[0];
    if (overflow) {
      throw new Error(formatButtonOverflow(overflow));
    }
    const invariant = this.firstInvariant();
    if (invariant) {
      throw new Error(
        `invariant: ${invariant.reason} @ ${invariant.location}/${invariant.currentState} step ${invariant.step}`,
      );
    }
    const lock = this.firstSoftlock();
    if (lock.found) {
      throw new Error(`softlock: ${lock.reason} @ ${lock.fingerprint} step ${lock.step}`);
    }
  }

  firstSoftlock(): SoftlockReport {
    return this.softlocks[0] ?? { found: false };
  }

  firstInvariant(): SimInvariantFailure | undefined {
    return this.invariantFailures[0];
  }
}

export const STORY_FLAGS_DAY4 = [
  'day_1_complete',
  'day_2_complete',
  'day_3_complete',
  'day_4_complete',
  'met_rem',
  'player_camp_founded',
  'camp_table_placed',
  'node7_gate_closed',
  'activated_node7_token',
] as const;

export const STORY_FLAGS_WEEK1 = [...STORY_FLAGS_DAY4, 'day_5_complete', 'day_6_complete', 'day_7_complete', 'week_1_complete'] as const;

export const STORY_FLAGS_WEEK6 = [
  ...STORY_FLAGS_WEEK1,
  'day_8_complete',
  'day_9_complete',
  'day_10_complete',
  'day_11_complete',
  'day_12_complete',
  'day_13_complete',
  'day_14_complete',
  'week_2_complete',
  'day_15_complete',
  'day_16_complete',
  'day_17_complete',
  'day_18_complete',
  'day_19_complete',
  'day_20_complete',
  'day_21_complete',
  'week_3_complete',
  'day_22_complete',
  'day_23_complete',
  'day_24_complete',
  'day_25_complete',
  'day_26_complete',
  'day_27_complete',
  'day_28_complete',
  'week_4_complete',
  'day_29_complete',
  'day_30_complete',
  'day_31_complete',
  'day_32_complete',
  'day_33_complete',
  'day_34_complete',
  'day_35_complete',
  'week_5_complete',
  'day_36_complete',
  'day_37_complete',
  'day_38_complete',
  'day_39_complete',
  'day_40_complete',
  'day_41_complete',
  'day_42_complete',
  'week_6_complete',
  'furnace_placed',
  'furnace_built',
  'first_ingot',
] as const;

export async function seedCamp(session: SimSession, extra: readonly string[] = []): Promise<void> {
  await session.grantFlags(['player_camp_founded', 'met_rem', 'camp_table_placed', ...extra]);
  await session.moveTo('player_camp', 'camp_look');
}

export function pickRandomButton(buttons: GameButton[], rand: () => number): GameButton | undefined {
  const usable = buttons.filter((button) => {
    if (TEXT_INPUT_ACTIONS.has(button.action)) return false;
    if (button.action === 'MARKET_ACT' && ['sell', 'price', 'auc_new', 'confirm_sell', 'auc_res'].includes(String(button.payload?.act ?? ''))) {
      return false;
    }
    if (button.action === 'CLAN_ACT' && ['create', 'rename'].includes(String(button.payload?.act ?? ''))) {
      return false;
    }
    return true;
  });
  if (!usable.length) return undefined;
  return usable[Math.floor(rand() * usable.length)]!;
}

export async function randomWalk(session: SimSession, seed: number, steps: number): Promise<RandomWalkReport> {
  const rand = mulberry32(seed);
  const crashes: string[] = [];
  await session.act('OPEN_CAMP');
  for (let i = 0; i < steps; i += 1) {
    const player = await session.reload();
    if (player.energy < 2) await session.ensureEnergy(4);
    const button = pickRandomButton(session.last.buttons, rand);
    if (!button) {
      await session.act('OPEN_CAMP');
      continue;
    }
    try {
      await session.act(button.action as GameCommandType, button.payload ?? {});
    } catch (error) {
      crashes.push(`step ${i}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  const snap = await session.snapshot();
  return {
    seed,
    steps,
    crashes,
    softlock: session.firstSoftlock(),
    historyTail: session.history.slice(-12),
    location: snap.location,
    currentState: snap.currentState,
  };
}

export { ENERGY_PER_INTERVAL, ENERGY_REGEN_INTERVAL_MS };

const SKIP_CRAWL_ACTIONS = new Set([
  'PROMPT_HERO_NAME',
  'CANCEL_HERO_NAME',
  'START_PVE',
  'START_PVP',
  'COMPLETE_DAY_2',
  'COMPLETE_DAY_3',
  'COMPLETE_DAY_7',
  'COMPLETE_DAY_14',
  'COMPLETE_DAY_21',
  'COMPLETE_DAY_28',
  'COMPLETE_DAY_35',
  'COMPLETE_DAY_42',
  'BEGIN_DAY_2',
  'BEGIN_DAY_3',
  'BEGIN_DAY_8',
  'BEGIN_DAY_15',
  'BEGIN_DAY_22',
  'BEGIN_DAY_29',
  'BEGIN_DAY_36',
  'FOUND_CAMP',
  'REST_NIGHT',
]);

function crawlSkip(button: GameButton): boolean {
  if (SKIP_CRAWL_ACTIONS.has(button.action)) return true;
  if (TEXT_INPUT_ACTIONS.has(button.action)) return true;
  const act = String(button.payload?.act ?? '');
  if (button.action === 'MARKET_ACT' && ['sell', 'price', 'auc_new', 'confirm_sell', 'auc_res', 'bid'].includes(act)) {
    return true;
  }
  if (button.action === 'CLAN_ACT' && ['create', 'rename', 'disband', 'leave'].includes(act)) return true;
  return false;
}

export interface CrawlReport {
  screens: number;
  presses: number;
  errors: string[];
  overflows: number;
  empty: number;
}

export async function crawlButtons(session: SimSession, maxScreens = 40): Promise<CrawlReport> {
  const seen = new Set<string>();
  const errors: string[] = [];
  let screens = 0;
  let presses = 0;
  let empty = 0;
  await session.act('OPEN_CAMP');
  const queue: Array<{ type: GameCommandType; payload: Record<string, unknown> }> = [
    { type: 'OPEN_CAMP', payload: {} },
    { type: 'OPEN_MENU', payload: { menu: 'hub' } },
    { type: 'OPEN_MENU', payload: { menu: 'gather' } },
    { type: 'OPEN_MENU', payload: { menu: 'craft' } },
    { type: 'OPEN_MENU', payload: { menu: 'items' } },
    { type: 'OPEN_MENU', payload: { menu: 'tools' } },
    { type: 'OPEN_MENU', payload: { menu: 'weapons' } },
    { type: 'OPEN_MENU', payload: { menu: 'materials' } },
    { type: 'OPEN_INVENTORY', payload: {} },
    { type: 'OPEN_MENU', payload: { menu: 'hero' } },
    { type: 'OPEN_PROFILE', payload: {} },
    { type: 'EXPLORE', payload: {} },
  ];
  while (queue.length && screens < maxScreens) {
    const next = queue.shift()!;
    try {
      await session.act(next.type, next.payload);
    } catch (error) {
      errors.push(`${next.type}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    screens += 1;
    if (session.last.buttons.length === 0) empty += 1;
    if (session.last.buttons.length > 5) {
      errors.push(formatButtonOverflow(session.buttonOverflows.at(-1) ?? {
        reason: 'overflow',
        location: '',
        currentState: '',
        step: session.history.length,
        count: session.last.buttons.length,
        labels: labelsOf(session.last),
      }));
    }
    const fp = fingerprint(
      (await session.reload().catch(() => null))?.currentLocation ?? '',
      (await session.reload().catch(() => null))?.currentState ?? '',
      session.last.buttons,
    );
    if (seen.has(fp)) continue;
    seen.add(fp);
    const buttons = [...session.last.buttons];
    for (const button of buttons) {
      if (crawlSkip(button)) continue;
      presses += 1;
      try {
        await session.act(button.action as GameCommandType, button.payload ?? {});
        session.assertHealthy();
        if (
          !SKIP_CRAWL_ACTIONS.has(button.action) &&
          session.last.buttons.length > 0 &&
          session.last.buttons.length <= 5
        ) {
          const child = fingerprint(
            (await session.reload().catch(() => null))?.currentLocation ?? '',
            (await session.reload().catch(() => null))?.currentState ?? '',
            session.last.buttons,
          );
          if (!seen.has(child) && queue.length < maxScreens * 3) {
            queue.push({ type: 'OPEN_MENU', payload: { menu: 'hub' } });
          }
        }
      } catch (error) {
        errors.push(
          `${button.action}/${button.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return {
    screens,
    presses,
    errors,
    overflows: session.buttonOverflows.length,
    empty,
  };
}

export function deadRecipeIds(): string[] {
  const grouped = new Set<string>([
    ...CRAFT_MENU_GROUPS.tools,
    ...CRAFT_MENU_GROUPS.weapons,
    ...CRAFT_MENU_GROUPS.items,
    ...CRAFT_MENU_GROUPS.materials,
    'campfire',
  ]);
  return Object.keys(CRAFT_RECIPES).filter((id) => !grouped.has(id));
}
