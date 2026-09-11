import type { GameResponse, ResourceType } from '@kubolesie/shared';
import { SimSession, type SimSnapshot } from './simulation';

export interface JourneyStep {
  step: number;
  day: number;
  state: string;
  location: string;
  button: string;
  energy: number;
  hp: number;
  coins: number;
  resources: Partial<Record<ResourceType, number>>;
  items: string[];
  flags: string[];
}

export interface JourneyReport {
  ok: boolean;
  days: number[];
  steps: number;
  flags: Record<string, string>;
  items: string[];
  missing?: string;
  week6Complete: boolean;
  beginDay43Visible: boolean;
  overflow: number;
}

export class MissingPlayerAction extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MISSING_PLAYER_ACTION';
  }
}

function labelsOf(response: GameResponse): string[] {
  return response.buttons.map((button) => button.label);
}

function matchLabel(labels: string[], part: string): string | undefined {
  const needle = part.toLowerCase();
  const exact = labels.find((label) => label === part);
  if (exact) return exact;
  const hits = labels.filter((label) => label.toLowerCase().includes(needle));
  if (!hits.length) return undefined;
  hits.sort((a, b) => a.length - b.length);
  return hits[0];
}

const PAGE_NAV = ['➡ Ещё', 'Ещё'];
const EXIT_NAV = ['Назад', 'Отойти', 'Возвращаться', 'Вернуться', 'Выйти', 'Уйти', 'К Рему'];
const LOOK_NAV = ['🏕 Стан', 'Осмотреться', 'Оглядеться'];
const WORK_NAV = ['⛏ Добыча', '🔨 Крафт', 'Инвентарь', 'Печь', 'Грядка'];
const WEEK_NAV = [
  'Чаща',
  'Тропа',
  'Топь',
  'Пост',
  'Клин',
  'Кромка',
  'Низина',
  'Карьер',
  'Роща',
  'Чаша',
  'Припас',
  'Подготов',
  'Свод',
  'Корнеплёт',
  'яме',
  'Чернокорн',
  'Топежор',
  'Скрежетник',
];
const RETURN_NAV = [
  'Низина',
  'Карьер',
  'Роща',
  'Чаша',
  'Следы',
  'Группа',
  'Путники',
  'Галереи',
  'К узлу',
  'К знаку',
  'К своду',
  'К мосту',
];

function navFor(part: string): string[] {
  if (/Печь|Костёр|Освещение/i.test(part)) {
    return ['🏕 Стан', 'Печь', 'Костёр', ...PAGE_NAV, ...EXIT_NAV];
  }
  if (/Доски|Палки|Верстак|кирка|меч|мотыг|🪵 Настил|Верёвка|ведро|щит|Лук|шлем|кираса/i.test(part)) {
    return ['🔨 Крафт', '🏕 Стан', ...PAGE_NAV, ...LOOK_NAV, ...WORK_NAV, ...EXIT_NAV];
  }
  if (/Рубить|булыж|железо|уголь|Лес|Каменоломня|Добыть|⛏ Добыча|Поверхность|Шахт/i.test(part)) {
    return ['⛏ Добыча', 'Поверхность', 'Шахт', ...LOOK_NAV, ...WORK_NAV, ...PAGE_NAV, ...EXIT_NAV];
  }
  return ['🏕 Стан', ...WEEK_NAV, ...PAGE_NAV, ...RETURN_NAV, ...LOOK_NAV, ...EXIT_NAV];
}

export class Journey {
  readonly session: SimSession;
  readonly trace: JourneyStep[] = [];
  readonly days: number[] = [];
  day = 1;

  constructor(session: SimSession) {
    this.session = session;
  }

  static async start(vkUserId = `fresh-${Math.random().toString(16).slice(2, 10)}`): Promise<Journey> {
    const session = await SimSession.boot({ vkUserId });
    return new Journey(session);
  }

  labels(): string[] {
    return labelsOf(this.session.last);
  }

  match(part: string): string | undefined {
    return matchLabel(this.labels(), part);
  }

  has(part: string): boolean {
    return Boolean(this.match(part));
  }

  private fingerprint(): string {
    return `${this.session.history.at(-1)?.location ?? ''}|${this.session.history.at(-1)?.currentState ?? ''}|${this.labels().join('~')}`;
  }

  private async record(button: string): Promise<void> {
    const snap = await this.session.snapshot();
    this.trace.push({
      step: this.trace.length,
      day: this.day,
      state: snap.currentState,
      location: snap.location,
      button,
      energy: snap.energy,
      hp: snap.hp,
      coins: snap.coins,
      resources: snap.resources,
      items: snap.items,
      flags: Object.keys(snap.flags).filter((key) => snap.flags[key]),
    });
  }

  dump(expected: string): string {
    const last = this.trace.at(-1);
    const labels = this.labels();
    const res = last?.resources ?? {};
    const tail = this.trace.slice(-50).map((row) => {
      return `#${row.step} d${row.day} ${row.state}@${row.location} [${row.button}] hp=${row.hp} en=${row.energy}`;
    });
    return [
      'MISSING_PLAYER_ACTION:',
      `day=${this.day}`,
      `state=${last?.state ?? this.session.last.text.slice(0, 40)}`,
      `location=${last?.location ?? ''}`,
      `expected=${expected}`,
      `visible_buttons=[${labels.join(', ')}]`,
      `text=${this.session.last.text.replace(/\n/g, ' | ').slice(0, 280)}`,
      `res=LOG:${res.LOG ?? 0} PLANK:${res.PLANK ?? 0} STICK:${res.STICK ?? 0} COBBLE:${res.COBBLESTONE ?? 0} IRON:${res.IRON_ORE ?? 0} INGOT:${res.IRON_INGOT ?? 0} COAL:${res.COAL ?? 0} FOOD:${res.FOOD ?? 0} SEED:${res.SEED ?? 0} STRING:${res.STRING ?? 0}`,
      `items=${(last?.items ?? []).join(',')}`,
      'trace_tail:',
      ...tail,
    ].join('\n');
  }

  async recover(): Promise<void> {
    const player = await this.session.reload();
    if (player.energy < 6) {
      this.session.clock.advanceTicks(player.maxEnergy + 2);
    }
    const want = Math.max(40, Math.floor(player.maxHp * 0.95));
    if (player.hp < want) {
      const missing = want - player.hp;
      this.session.clock.advanceTicks(Math.ceil(missing / 5) + 2);
    }
  }

  async click(part: string): Promise<GameResponse> {
    await this.recover();
    const label = this.match(part);
    if (!label) throw new MissingPlayerAction(this.dump(part));
    const response = await this.session.press(label);
    await this.record(label);
    return response;
  }

  async pressIf(part: string): Promise<boolean> {
    if (!this.has(part)) return false;
    await this.click(part);
    return true;
  }

  async clickAny(parts: string[]): Promise<boolean> {
    for (const part of parts) {
      if (this.has(part)) {
        await this.click(part);
        return true;
      }
    }
    return false;
  }

  async seek(part: string, maxSteps = 64): Promise<GameResponse> {
    const seen = new Set<string>();
    for (let i = 0; i < maxSteps; i += 1) {
      if (this.has(part)) return this.click(part);
      const navs = navFor(part).filter((nav) => nav !== part && this.has(nav));
      let moved = false;
      for (const nav of navs) {
        const key = `${this.fingerprint()}>${nav}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await this.click(nav);
        moved = true;
        break;
      }
      if (!moved) break;
    }
    throw new MissingPlayerAction(this.dump(part));
  }

  async mustPress(part: string): Promise<GameResponse> {
    return this.seek(part);
  }

  async goHub(): Promise<void> {
    for (let i = 0; i < 16; i += 1) {
      if (this.has('⛏ Добыча') && this.has('🔨 Крафт')) return;
      if (this.has('🏕 Стан') && this.has('⛏ Добыча')) return;
      if (
        !(await this.clickAny([
          'Назад',
          'Отойти',
          'стану',
          '🏕 Стан',
          'Инвентарь',
          'карьер',
          'Низина',
          'чаще',
          'рощ',
          'троп',
          'топи',
          'Чаща',
          'Роща',
          'Осмотреться',
        ]))
      ) {
        break;
      }
    }
  }

  async begin(day: number): Promise<void> {
    this.day = day;
    if (await this.flag(`day_${day}_complete`)) {
      if (!this.days.includes(day)) this.days.push(day);
      return;
    }
    if (this.has(`Начать День ${day}`)) {
      await this.click(`Начать День ${day}`);
      return;
    }
    const startLabel = this.labels().find(
      (label) => label.includes(`День ${day}`) && !label.includes('Завершить'),
    );
    if (startLabel) {
      await this.click(startLabel);
      return;
    }
    const state = this.session.history.at(-1)?.currentState ?? '';
    if (state === `day${day}_start` || state.startsWith(`day${day}_`)) return;
    await this.seek(`Начать День ${day}`);
  }

  async complete(day: number, extra: string[] = []): Promise<void> {
    const already = await this.flag(`day_${day}_complete`);
    if (already) {
      if (!this.days.includes(day)) this.days.push(day);
      return;
    }
    const labels = [...extra];
    if (day === 2) labels.push('обустройств');
    if (day === 7) labels.push('двери', 'К двери');
    labels.push(`Завершить День ${day}`, 'К карте');
    const tryComplete = async (): Promise<boolean> => {
      for (const label of labels) {
        if (this.has(label)) {
          await this.click(label);
          return true;
        }
      }
      return false;
    };
    let pressed = await tryComplete();
    if (!pressed) {
      await this.clickAny(RETURN_NAV);
      pressed = await tryComplete();
    }
    if (!pressed) {
      for (const label of labels) {
        try {
          await this.seek(label);
          pressed = true;
          break;
        } catch {
          /* try next alias */
        }
      }
    }
    await this.clickAny(['карте', 'знаков', 'Отойти']);
    const flag = await this.flag(`day_${day}_complete`);
    if (!flag) {
      throw new MissingPlayerAction(this.dump(`Завершить День ${day}${pressed ? ' (pressed, flag missing)' : ''}`));
    }
    this.days.push(day);
  }

  async flag(name: string): Promise<string | undefined> {
    return this.session.flag(name);
  }

  async equipped(templateId: string): Promise<boolean> {
    if (!this.session.playerId) return false;
    const [eq, items] = await Promise.all([
      this.session.store.getEquipment(this.session.playerId),
      this.session.store.listItems(this.session.playerId),
    ]);
    const worn = new Set(Object.values(eq).filter((id): id is string => Boolean(id)));
    return items.some((item) => item.templateId === templateId && worn.has(item.id));
  }

  async ensureEquipped(namePart: string, templateId: string): Promise<boolean> {
    if (await this.equipped(templateId)) return true;
    if (!(await this.session.hasItem(templateId))) return false;
    const wearNow = this.labels().find(
      (label) => /надеть|экипировать/i.test(label) && label.toLowerCase().includes(namePart.toLowerCase()),
    );
    if (wearNow) {
      await this.click(wearNow);
      return this.equipped(templateId);
    }
    await this.goHub();
    if (this.has('Инвентарь')) await this.click('Инвентарь');
    else await this.seek('Инвентарь');
    for (let page = 0; page < 10; page += 1) {
      const label = this.labels().find(
        (row) => /надеть|экипировать/i.test(row) && row.toLowerCase().includes(namePart.toLowerCase()),
      );
      if (label) {
        await this.click(label);
        return this.equipped(templateId);
      }
      if (!this.has('Ещё')) break;
      await this.click('Ещё');
    }
    return this.equipped(templateId);
  }

  async openSeal(): Promise<void> {
    if (this.has('Бить узел') || this.has('Бить ядро')) return;
    if (this.has('Подготов')) {
      await this.click('Подготов');
      return;
    }
    await this.goHub();
    if (this.has('🏕 Стан')) await this.click('🏕 Стан');
    for (let page = 0; page < 4 && !this.has('Чаща') && !this.has('Тропа') && !this.has('Топь') && !this.has('Пост') && !this.has('Свод'); page += 1) {
      if (!this.has('Ещё')) break;
      await this.click('Ещё');
    }
    await this.clickAny(['Чаща', 'Тропа', 'Топь', 'Пост']);
    if (this.has('Подготов')) await this.click('Подготов');
    else if (this.has('Свод')) await this.click('Свод');
    else await this.seek('Свод');
  }

  async fight(part: string, tries = 80): Promise<GameResponse> {
    let last: GameResponse | null = null;
    for (let i = 0; i < tries; i += 1) {
      await this.recover();
      if (i === 1 || i === 8) {
        await this.ensureEquipped('Щит', 'shield');
        await this.ensureEquipped('меч', 'iron_sword');
      }
      if (i >= 3 && this.has('Настил') && !(await this.session.hasItem('root_brace'))) {
        try {
          await this.prepBrace();
        } catch {
          /* keep retrying the fight */
        }
        continue;
      }
      const bite = this.labels().find(
        (label) => label.includes('Бить') && label.toLowerCase().includes(part.toLowerCase()),
      );
      const anyBite = this.labels().find((label) => label.includes('Бить'));
      if (bite) {
        last = await this.click(bite);
      } else if (this.has(part)) {
        last = await this.click(part);
      } else if (anyBite && /ядро|узел|Смольн|Корнеплёт|Чернокорн|Топежор|Скрежетник/i.test(part)) {
        last = await this.click(anyBite);
      } else {
        try {
          last = await this.seek(part);
        } catch {
          if (this.has('Осмотреться') || this.has('Оглядеться')) {
            await this.clickAny(['Осмотреться', 'Оглядеться']);
            continue;
          }
          throw new MissingPlayerAction(this.dump(part));
        }
      }
      if (last.text.includes('Победа')) return last;
      if (this.has('Щит') && !(await this.session.hasItem('shield'))) {
        await this.click('Щит');
        try {
          await this.gearUp();
        } catch {
          /* keep retrying the fight */
        }
        continue;
      }
      await this.clickAny([
        'Ещё раз',
        'Подготов',
        'Клин',
        'петлям',
        'Осмотреться',
        'Оглядеться',
        'Назад',
      ]);
    }
    throw new MissingPlayerAction(this.dump(`${part} → Победа`));
  }

  async craft(part: string): Promise<GameResponse> {
    const tryClick = async (): Promise<GameResponse | null> => {
      if (!this.has(part)) return null;
      const made = await this.click(part);
      if (/Не хватает|нельзя скрафтить|нужен верстак/i.test(made.text)) {
        return null;
      }
      await this.clickAny(['Надеть', 'Экипировать']);
      return made;
    };
    for (let page = 0; page < 8; page += 1) {
      const made = await tryClick();
      if (made) return made;
      if (!this.has('Ещё')) break;
      await this.click('Ещё');
    }
    await this.goHub();
    if (!this.has('🔨 Крафт')) await this.seek('🔨 Крафт');
    else await this.click('🔨 Крафт');
    const groups = ['Базовый', 'Инструменты', 'Снаряжение', 'Материалы'];
    for (const group of groups) {
      if (!this.has(group)) {
        if (this.has('🔨 Крафт')) await this.click('🔨 Крафт');
        if (!this.has(group)) continue;
      }
      await this.click(group);
      for (let page = 0; page < 8; page += 1) {
        const made = await tryClick();
        if (made) return made;
        if (!this.has('Ещё')) break;
        await this.click('Ещё');
      }
      if (this.has('Назад')) await this.click('Назад');
    }
    throw new MissingPlayerAction(this.dump(`craft ${part}`));
  }

  async openGather(): Promise<void> {
    if (
      this.has('Рубить') ||
      this.has('Добыть булыж') ||
      this.has('Добыть железо') ||
      this.has('Добыть уголь') ||
      this.has('Поверхность')
    ) {
      return;
    }
    if (this.has('Региональн') || this.has('Охота')) {
      await this.clickAny(['Назад']);
      if (
        this.has('Рубить') ||
        this.has('Добыть булыж') ||
        this.has('Добыть железо') ||
        this.has('Добыть уголь') ||
        this.has('Поверхность')
      ) {
        return;
      }
    }
    if (this.has('⛏ Добыча')) {
      await this.click('⛏ Добыча');
      return;
    }
    await this.goHub();
    await this.seek('⛏ Добыча');
  }

  async gatherShortcut(part: string): Promise<GameResponse> {
    await this.recover();
    await this.openGather();
    if (this.has(part)) return this.click(part);
    throw new MissingPlayerAction(this.dump(part));
  }

  async mineSite(sitePart: string): Promise<GameResponse> {
    await this.recover();
    await this.openGather();
    const surface = /Лес|Каменоломня/i.test(sitePart);
    const group = surface ? 'Поверхность' : /Уголь|Желез/i.test(sitePart) ? 'Шахт' : 'Поверхность';
    if (!this.has(sitePart)) {
      if (!this.has(group) && this.has('Назад')) await this.click('Назад');
      if (!this.has(group) && this.has('⛏ Добыча')) await this.click('⛏ Добыча');
      if (this.has(group)) await this.click(group);
    }
    for (let page = 0; page < 6; page += 1) {
      if (this.has(sitePart)) {
        await this.click(sitePart);
        if (this.has('Добыть')) return this.click('Добыть');
        return this.session.last;
      }
      if (!this.has('Ещё')) break;
      await this.click('Ещё');
    }
    throw new MissingPlayerAction(this.dump(sitePart));
  }

  async untilResource(type: ResourceType, need: number, gather: () => Promise<void>): Promise<void> {
    for (let i = 0; i < 80; i += 1) {
      if ((await this.session.resource(type)) >= need) return;
      await gather();
    }
    throw new MissingPlayerAction(this.dump(`${type}>=${need}`));
  }

  async chop(times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      try {
        await this.gatherShortcut('Рубить');
      } catch {
        await this.mineSite('Лес');
      }
    }
  }

  async cobble(times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      try {
        await this.gatherShortcut('булыж');
      } catch {
        await this.mineSite('Каменоломня');
      }
    }
  }

  async coal(times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      try {
        await this.gatherShortcut('уголь');
      } catch {
        await this.mineSite('Уголь');
      }
    }
  }

  async smeltIron(times: number): Promise<void> {
    const openFurnace = async () => {
      if (this.has('Положить руду') || this.has('Положить уголь') || this.has('Выплавить')) return;
      await this.goHub();
      if (this.has('🏕 Стан')) await this.click('🏕 Стан');
      if (this.has('Печь')) await this.click('Печь');
      else await this.seek('Печь');
    };
    await openFurnace();
    let retries = 0;
    for (let i = 0; i < times; i += 1) {
      await openFurnace();
      const fuel = Number((await this.session.flag('furnace_fuel')) ?? 0);
      if (fuel < 1) {
        if ((await this.session.resource('COAL')) < 1) {
          await this.untilResource('COAL', 1, async () => this.coal(1));
          await openFurnace();
        }
        if (!this.has('уголь') && this.has('Ещё')) await this.click('Ещё');
        if (this.has('уголь')) await this.click('уголь');
        else await this.seek('уголь');
      }
      await openFurnace();
      if (this.has('Положить руду')) await this.click('Положить руду');
      else if (this.has('Выплавить')) await this.click('Выплавить');
      else await this.seek('руду');
      if (/топлива|Нет железной/i.test(this.session.last.text)) {
        retries += 1;
        if (retries > times + 8) throw new MissingPlayerAction(this.dump('smelt retry'));
        i -= 1;
        if (/топлива/i.test(this.session.last.text)) {
          await openFurnace();
          if (!this.has('уголь') && this.has('Ещё')) await this.click('Ещё');
          if (this.has('уголь')) await this.click('уголь');
        }
      }
    }
    await openFurnace();
    if (!this.has('Забрать') && this.has('Ещё')) await this.click('Ещё');
    if (this.has('Забрать')) await this.click('Забрать');
    else {
      try {
        await this.seek('Забрать');
      } catch {
        /* output may already be empty */
      }
    }
  }

  async needSticks(n: number): Promise<void> {
    if ((await this.session.resource('STICK')) >= n) return;
    await this.untilResource('LOG', 2, async () => this.chop(1));
    if ((await this.session.resource('PLANK')) < 2) await this.craft('Доски');
    await this.craft('Палки');
  }

  async needIngots(n: number): Promise<void> {
    const have = await this.session.resource('IRON_INGOT');
    if (have >= n) return;
    const missing = n - have;
    await this.untilResource('IRON_ORE', missing, async () => {
      try {
        await this.gatherShortcut('Добыть железо');
      } catch {
        await this.mineSite('Желез');
      }
    });
    await this.untilResource('COAL', Math.max(1, missing), async () => this.coal(1));
    await this.smeltIron(missing);
    if ((await this.session.resource('IRON_INGOT')) < n) {
      throw new MissingPlayerAction(this.dump(`IRON_INGOT>=${n}`));
    }
  }

  async prepBrace(): Promise<void> {
    if (await this.session.hasItem('root_brace')) return;
    if (!(await this.flag('week_2_complete'))) return;
    await this.needIngots(1);
    await this.untilResource('LOG', 6, async () => this.chop(1));
    await this.untilResource('COBBLESTONE', 4, async () => this.cobble(1));
    await this.goHub();
    await this.craft('🪵 Настил');
  }

  async gearUp(): Promise<void> {
    if (!(await this.session.hasItem('iron_sword'))) {
      await this.needIngots(2);
      await this.needSticks(1);
      await this.craft('Железный меч');
      if (!(await this.session.hasItem('iron_sword'))) {
        throw new MissingPlayerAction(this.dump('iron_sword'));
      }
    }
    await this.ensureEquipped('меч', 'iron_sword');
    if (
      !(await this.session.hasItem('shield')) &&
      (Boolean(await this.flag('day_12_complete')) || Boolean(await this.flag('quarry_chamber')))
    ) {
      await this.needIngots(1);
      await this.untilResource('LOG', 4, async () => this.chop(1));
      while ((await this.session.resource('PLANK')) < 6) await this.craft('Доски');
      await this.craft('Щит');
    }
    await this.ensureEquipped('Щит', 'shield');
    if (!(await this.session.hasItem('bow')) && (await this.session.resource('STRING')) >= 3) {
      await this.needSticks(3);
      await this.craft('Лук');
    }
    if (await this.flag('week_2_complete')) {
      await this.prepBrace();
    }
  }

  async pickRoute(): Promise<void> {
    await this.pressIf('Выбрать путь');
    await this.clickAny([
      'Старый след',
      'Свежие',
      'деревьям',
      'Островки',
      'тележки',
      'Платформа',
      'Двор',
      'Камень',
      'Камыш',
      'Настил',
    ]);
  }

  async socialPass(): Promise<void> {
    await this.clickAny(['Следы', 'Чужая', 'Группа', 'Путники']);
    await this.clickAny(['тихо', 'мимо', 'Помочь', 'Пройти', 'Обменяться', 'Договориться']);
  }

  async playDay1(): Promise<void> {
    this.day = 1;
    await this.seek('ящик');
    await this.clickAny(['нож']);
    await this.clickAny(['Экипировать', 'Надеть']);
    if (!(await this.session.hasItem('rusty_token'))) {
      if (this.has('Рубить')) await this.click('Рубить');
      else {
        await this.clickAny(['Оглядеться', 'Осмотреться']);
        await this.chop(1);
      }
    }
    if (!(await this.session.hasItem('rusty_token'))) {
      throw new MissingPlayerAction(this.dump('rusty_token after first chop'));
    }
    if (!this.has('жетон')) {
      if (this.has('Инвентарь')) await this.click('Инвентарь');
      else await this.seek('жетон');
    }
    await this.seek('жетон');
    await this.seek('дыму');
    await this.seek('камнями');
    await this.seek('решётку');
    await this.seek('Кивнуть');

    const needLogs = async (n: number) => {
      await this.untilResource('LOG', n, async () => this.chop(1));
    };
    await needLogs(4);
    if (!(await this.session.hasItem('crafting_table'))) {
      await this.craft('Доски');
      await this.craft('Верстак');
    }
    if (!(await this.session.hasItem('wooden_pickaxe'))) {
      await needLogs(3);
      if ((await this.session.resource('PLANK')) < 5) await this.craft('Доски');
      if ((await this.session.resource('STICK')) < 2) await this.craft('Палки');
      if ((await this.session.resource('PLANK')) < 3) await this.craft('Доски');
      await this.craft('Деревянная кирка');
    }
    await this.goHub();
    if (!this.has('осыпь')) {
      await this.clickAny(['Назад', 'Оглядеться', 'Осмотреться', 'Ещё']);
    }
    await this.seek('осыпь');
    await this.untilResource('COBBLESTONE', 3, async () => this.cobble(1));
    if (!(await this.session.hasItem('stone_pickaxe'))) {
      if ((await this.session.resource('STICK')) < 2) {
        await needLogs(1);
        if ((await this.session.resource('PLANK')) < 2) await this.craft('Доски');
        await this.craft('Палки');
      }
      await this.craft('Каменная кирка');
    }
    await this.goHub();
    await this.seek('штольн');
    await this.untilResource('IRON_ORE', 8, async () => {
      try {
        await this.gatherShortcut('железо');
      } catch {
        await this.mineSite('Желез');
      }
    });
    await this.clickAny(['Возвращаться', 'Уйти']);
    if (this.has('Выйти')) await this.click('Выйти');
    await this.clickAny(['➡ Ещё', 'Ещё']);
    if (!this.has('Отдать железо')) await this.clickAny(['➡ Ещё', 'Ещё']);
    await this.seek('Отдать железо');
    await this.seek('Остаться');
    await this.clickAny(['Подслушать', 'спишь']);
    await this.seek('утра');
    if (!(await this.flag('day_1_complete'))) {
      throw new MissingPlayerAction(this.dump('flag day_1_complete'));
    }
    this.days.push(1);
  }

  async playDay2(): Promise<void> {
    await this.begin(2);
    await this.clickAny(['пустую', 'клетку']);
    if (!(await this.flag('player_camp_founded'))) {
      await this.seek('клетку');
    }
    if (!(await this.flag('camp_table_placed'))) {
      await this.goHub();
      if (this.has('🏕 Стан')) await this.click('🏕 Стан');
      await this.pressIf('верстак');
    }
    if (!(await this.flag('camp_fire_built'))) {
      if ((await this.session.resource('STICK')) < 3) {
        await this.untilResource('LOG', 2, async () => this.chop(1));
        if ((await this.session.resource('PLANK')) < 2) await this.craft('Доски');
        await this.craft('Палки');
      }
      if ((await this.session.resource('LOG')) < 3) {
        await this.untilResource('LOG', 3, async () => this.chop(1));
      }
      if ((await this.session.resource('COAL')) < 1) {
        await this.goHub();
        await this.seek('Осмотреться');
        await this.seek('сажи');
        await this.pressIf('расселине');
        await this.untilResource('COAL', 1, async () => this.coal(1));
      }
      await this.seek('стану');
      await this.goHub();
      if (this.has('🏕 Стан')) await this.click('🏕 Стан');
      else await this.seek('🏕 Стан');
      if (this.has('Костёр')) await this.click('Костёр');
      else await this.seek('Костёр');
    }
    await this.goHub();
    if (this.has('🏕 Стан')) await this.click('🏕 Стан');
    await this.pressIf('Освещение');
    await this.complete(2, ['обустройств']);
  }

  async playDay3(): Promise<void> {
    await this.begin(3);
    if ((await this.session.itemCount('stone_sword')) < 1) {
      if (this.has('стану')) await this.click('стану');
      await this.untilResource('COBBLESTONE', 2, async () => this.cobble(1));
      if ((await this.session.resource('STICK')) < 1) {
        await this.untilResource('LOG', 1, async () => this.chop(1));
        if ((await this.session.resource('PLANK')) < 2) await this.craft('Доски');
        await this.craft('Палки');
      }
      await this.craft('Каменный меч');
    }
    await this.fight('тропу');
    await this.complete(3);
  }

  async playDay4(): Promise<void> {
    await this.begin(4);
    await this.clickAny(['Вычистить', 'Прогнать', 'Оставить']);
    if (this.has('стану')) await this.click('стану');
    if (!(await this.flag('furnace_placed'))) {
      await this.untilResource('COBBLESTONE', 8, async () => this.cobble(1));
      if (this.has('печь') || this.has('Печь')) await this.clickAny(['печь', 'Печь']);
      else await this.craft('Печь');
    }
    await this.untilResource('IRON_ORE', 3, async () => {
      try {
        await this.gatherShortcut('железо');
      } catch {
        await this.mineSite('Желез');
      }
    });
    await this.untilResource('COAL', 2, async () => this.coal(1));
    await this.smeltIron(3);
    if ((await this.session.resource('STICK')) < 2) {
      await this.untilResource('LOG', 1, async () => this.chop(1));
      if ((await this.session.resource('PLANK')) < 2) await this.craft('Доски');
      await this.craft('Палки');
    }
    if (
      !(await this.session.hasItem('iron_pickaxe')) &&
      !(await this.session.hasItem('iron_axe')) &&
      !(await this.session.hasItem('iron_sword'))
    ) {
      await this.craft('Железная кирка');
    }
    await this.complete(4);
  }

  async playDay5(): Promise<void> {
    await this.begin(5);
    await this.seek('Торговать');
    if (this.has('Отказаться')) await this.click('Отказаться');
    await this.complete(5);
  }

  async playDay6(): Promise<void> {
    await this.begin(6);
    await this.seek('дань');
    if ((await this.session.reload()).coins >= 20 && this.has('монет')) await this.click('монет');
    else await this.seek('булыж');
    await this.complete(6);
  }

  async playDay7(): Promise<void> {
    await this.begin(7);
    await this.clickAny(['Подготов']);
    if (this.has('Назад')) await this.click('Назад');
    await this.goHub();
    await this.untilResource('LOG', 4, async () => this.chop(1));
    await this.untilResource('COBBLESTONE', 4, async () => this.cobble(1));
    await this.seek('баррикаду');
    await this.pressIf('Подготов');
    if (this.has('киркой')) await this.fight('киркой');
    else await this.fight('шарнир');
    await this.complete(7, ['двери', 'К двери']);
    await this.clickAny(['знаков', 'Отойти']);
  }

  async playDay8(): Promise<void> {
    await this.begin(8);
    await this.seek('кромке');
    await this.seek('след');
    await this.complete(8);
  }

  async playDay9(): Promise<void> {
    await this.begin(9);
    if (!(await this.session.hasItem('stone_hoe')) && !(await this.session.hasItem('iron_hoe'))) {
      if (this.has('стану')) await this.click('стану');
      await this.untilResource('COBBLESTONE', 2, async () => this.cobble(1));
      if ((await this.session.resource('STICK')) < 2) {
        await this.untilResource('LOG', 1, async () => this.chop(1));
        if ((await this.session.resource('PLANK')) < 2) await this.craft('Доски');
        await this.craft('Палки');
      }
      await this.craft('мотыга');
    }
    await this.seek('грядк');
    await this.pressIf('Вскопать');
    await this.pressIf('Посадить');
    await this.complete(9);
  }

  async playDay10(): Promise<void> {
    await this.begin(10);
    await this.seek('низину');
    await this.fight('Нитник');
    await this.clickAny(['Низина']);
    await this.complete(10);
  }

  async playDay11(): Promise<void> {
    await this.begin(11);
    await this.seek('низину');
    await this.seek('силуэт');
    await this.seek('Помочь');
    await this.complete(11);
  }

  async playDay12(): Promise<void> {
    await this.begin(12);
    await this.seek('карьер');
    if (!(this.has('Вброд') || this.has('Слить') || this.has('ведр'))) {
      await this.seek('проход');
    }
    await this.clickAny(['Вброд', 'Слить', 'ведр']);
    if (this.has('Выработка')) await this.click('Выработка');
    await this.seek('камер');
    await this.complete(12);
  }

  async playDay13(): Promise<void> {
    await this.begin(13);
    await this.clickAny(['карьер', 'стану', 'Назад']);
    await this.goHub();
    await this.gearUp();
    await this.goHub();
    await this.clickAny(['Осмотреться', 'карьер']);
    await this.seek('Смольник');
    await this.fight('Смольн');
    await this.complete(13);
  }

  async playDay14(): Promise<void> {
    await this.begin(14);
    await this.goHub();
    await this.gearUp();
    await this.goHub();
    if (!this.has('Бить') && !this.has('ядро')) {
      await this.clickAny(['печат', 'Подготов']);
      if (!this.has('Бить') && !this.has('ядро')) await this.seek('печат');
    }
    await this.pressIf('сердцевин');
    await this.fight('ядро');
    await this.complete(14, ['карте']);
    await this.clickAny(['Отойти']);
  }

  async playInspectDay(day: number, go: string, inspect: string): Promise<void> {
    await this.begin(day);
    await this.seek(go);
    await this.seek(inspect);
    await this.pickRoute();
    await this.complete(day);
  }

  async playVisitDay(day: number, go: string): Promise<void> {
    await this.begin(day);
    await this.seek(go);
    await this.complete(day);
  }

  async playBossDay(day: number, go: string, fight: string, extra: string[] = []): Promise<void> {
    await this.begin(day);
    if (this.has('Бить')) {
      await this.fight(fight);
      await this.complete(day, extra);
      return;
    }
    if (this.has(go)) {
      await this.click(go);
    } else {
      await this.goHub();
      await this.gearUp();
      await this.goHub();
      if (this.has(go)) await this.click(go);
      else await this.seek(go);
    }
    await this.fight(fight);
    await this.complete(day, extra);
  }

  async stockForPack(): Promise<void> {
    await this.goHub();
    if (!this.has('⛏ Добыча')) {
      await this.clickAny(['стану', 'чаще', 'рощ', 'Назад']);
      await this.goHub();
    }
    await this.untilResource('LOG', 12, async () => this.chop(1));
    await this.untilResource('COBBLESTONE', 10, async () => this.cobble(1));
    await this.untilResource('COAL', 4, async () => this.coal(1));
  }

  async playWeek3(): Promise<void> {
    await this.playInspectDay(15, 'маркеру', 'знак');
    await this.begin(16);
    await this.clickAny(['стану']);
    await this.stockForPack();
    await this.seek('завал');
    await this.untilResource('COBBLESTONE', 6, async () => this.cobble(1));
    await this.seek('жила');
    await this.complete(16);
    await this.playVisitDay(17, 'рощ');
    await this.begin(18);
    await this.seek('узел');
    if (this.has('Осмотреть')) await this.click('Осмотреть');
    else await this.clickAny(['мимо']);
    await this.clickAny(['Взять', 'Оставить', 'мимо']);
    await this.complete(18);
    await this.begin(19);
    await this.clickAny(['стану']);
    await this.stockForPack();
    await this.goHub();
    if (this.has('🏕 Стан')) await this.click('🏕 Стан');
    await this.clickAny(['Чаща', 'Припас']);
    await this.seek('Припас');
    await this.pressIf('Рема');
    await this.pressIf('роще');
    await this.seek('запас');
    await this.complete(19);
    await this.begin(20);
    await this.goHub();
    await this.gearUp();
    await this.goHub();
    if (this.has('🏕 Стан')) await this.click('🏕 Стан');
    await this.clickAny(['Чаща', 'Корнеплёт', 'яме']);
    await this.seek('Корнеплёт');
    await this.fight('Корнеплёт');
    await this.socialPass();
    await this.complete(20);
    await this.begin(21);
    if (this.has('Подготов')) await this.click('Подготов');
    else {
      await this.goHub();
      await this.gearUp();
      await this.openSeal();
    }
    await this.fight('узел');
    await this.complete(21, ['карте']);
    await this.clickAny(['Отойти']);
  }

  async playWeek4(): Promise<void> {
    await this.playInspectDay(22, 'маркеру', 'знак');
    await this.begin(23);
    await this.seek('развилк');
    await this.seek('Овраг');
    await this.complete(23);
    await this.begin(24);
    await this.seek('низину');
    await this.complete(24);
    await this.begin(25);
    await this.seek('остаткам');
    await this.clickAny(['мимо', 'Осмотреть']);
    await this.clickAny(['Оставить', 'Забрать', 'мимо']);
    await this.complete(25);
    await this.playBossDay(26, 'Чернокорн', 'Чернокорн');
    await this.begin(27);
    await this.seek('узел');
    await this.clickAny(['Осмотреть']);
    await this.socialPass();
    await this.complete(27);
    await this.begin(28);
    if (this.has('Подготов')) await this.click('Подготов');
    else {
      await this.goHub();
      await this.gearUp();
      await this.openSeal();
    }
    await this.fight('ядро');
    await this.complete(28, ['карте']);
    await this.clickAny(['Отойти']);
  }

  async playWeek5(): Promise<void> {
    await this.playInspectDay(29, 'столб', 'столб');
    await this.begin(30);
    await this.seek('переправ');
    await this.seek('Настил');
    await this.complete(30);
    await this.begin(31);
    await this.seek('чашу');
    await this.complete(31);
    await this.begin(32);
    await this.seek('затопленн');
    await this.clickAny(['мимо', 'Осмотреть']);
    await this.clickAny(['Оставить', 'Забрать', 'мимо']);
    await this.complete(32);
    await this.playBossDay(33, 'Топежор', 'Топежор');
    await this.begin(34);
    await this.seek('знаку');
    await this.clickAny(['Осмотреть']);
    await this.clickAny(['силуэт', 'рез', 'Старый путь']);
    await this.complete(34);
    await this.begin(35);
    if (this.has('Подготов')) await this.click('Подготов');
    else {
      await this.goHub();
      await this.gearUp();
      await this.openSeal();
    }
    await this.fight('ядро');
    await this.complete(35, ['карте']);
    await this.clickAny(['Отойти']);
  }

  async playWeek6(): Promise<void> {
    await this.playInspectDay(36, 'двор', 'двор');
    await this.begin(37);
    await this.seek('сортировк');
    await this.seek('Расчистить');
    await this.complete(37);
    await this.begin(38);
    await this.seek('Галере');
    await this.complete(38);
    await this.begin(39);
    await this.seek('рычаг');
    await this.clickAny(['Изучить']);
    await this.clickAny(['Не трогать', 'Вернуть']);
    await this.complete(39);
    await this.playBossDay(40, 'Скрежетник', 'Скрежетник');
    await this.begin(41);
    await this.seek('мосту');
    await this.clickAny(['Окликнуть']);
    await this.clickAny(['Догнать', 'механизм', 'Рема']);
    await this.complete(41);
    await this.begin(42);
    if (this.has('Подготов')) await this.click('Подготов');
    else {
      await this.goHub();
      await this.gearUp();
      await this.openSeal();
    }
    await this.fight('ядро');
    await this.complete(42, ['карте']);
    await this.clickAny(['Отойти']);
  }

  async freePlay(n: number): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      await this.recover();
      await this.goHub();
      if (this.has('⛏ Добыча')) {
        await this.click('⛏ Добыча');
        if (this.has('Рубить')) await this.pressIf('Рубить');
        else if (this.has('Поверхность')) {
          await this.click('Поверхность');
          if (this.has('Лес')) {
            await this.click('Лес');
            await this.pressIf('Добыть');
          }
        }
      } else if (this.has('Назад')) {
        await this.click('Назад');
      }
    }
  }
}

export async function playFresh42(): Promise<JourneyReport> {
  const journey = await Journey.start('fresh42');
  try {
    await journey.playDay1();
    await journey.playDay2();
    await journey.playDay3();
    await journey.playDay4();
    await journey.playDay5();
    await journey.playDay6();
    await journey.playDay7();
    await journey.playDay8();
    await journey.playDay9();
    await journey.playDay10();
    await journey.playDay11();
    await journey.playDay12();
    await journey.playDay13();
    await journey.playDay14();
    await journey.playWeek3();
    await journey.playWeek4();
    await journey.playWeek5();
    await journey.playWeek6();
    const snap: SimSnapshot = await journey.session.snapshot();
    await journey.freePlay(500);
    const beginDay43Visible = journey.labels().some((label) => /43|Недел[яю] 7/i.test(label));
    journey.session.assertHealthy();
    return {
      ok: Boolean(snap.flags.week_6_complete) && journey.days.length >= 42,
      days: journey.days,
      steps: journey.trace.length,
      flags: snap.flags,
      items: snap.items,
      week6Complete: Boolean(snap.flags.week_6_complete),
      beginDay43Visible,
      overflow: journey.session.buttonOverflows.length,
    };
  } catch (error) {
    const snap = await journey.session.snapshot().catch(() => null);
    return {
      ok: false,
      days: journey.days,
      steps: journey.trace.length,
      flags: snap?.flags ?? {},
      items: snap?.items ?? [],
      missing: error instanceof Error ? error.message : String(error),
      week6Complete: Boolean(snap?.flags.week_6_complete),
      beginDay43Visible: false,
      overflow: journey.session.buttonOverflows.length,
    };
  }
}
