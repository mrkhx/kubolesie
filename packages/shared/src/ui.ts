import type { GameButton, GameResponse, Rarity } from './index';

export type ButtonColor = 'primary' | 'positive' | 'negative' | 'secondary';

export const BACK_LABEL = '⬅ Назад';
export const DEFAULT_HERO_NAME = 'Путник';
export const AWAITING_NAME_FLAG = 'awaiting_character_name';
export const INVALID_NAME_TEXT =
  'Такое имя не подойдёт. Используй 2–20 символов: буквы, цифры, пробел или дефис.';
export const NAME_PROMPT_TEXT = 'Как тебя будут звать в Куболесье? Напиши имя сообщением.';

export const RARITY_LABELS: Record<Rarity, string> = {
  COMMON: 'Обычный',
  UNCOMMON: 'Необычный',
  RARE: 'Редкий',
  EPIC: 'Эпический',
  LEGENDARY: 'Легендарный',
  MYTHIC: 'Мифический',
};

const RESERVED_NAMES = [
  'админ',
  'admin',
  'vk',
  'вконтакте',
  'куболесье',
  'система',
  'system',
  'bot',
  'бот',
  'модератор',
  'moderator',
];

const PROFANITY = ['хуй', 'пизд', 'ебан', 'fuck', 'shit', 'bitch'];

const START_ALIASES = new Set(['начать', 'старт', '/start', 'start']);

export function isStartAlias(text: string | undefined): boolean {
  if (!text) return false;
  return START_ALIASES.has(text.trim().toLowerCase());
}

export function rarityLabel(rarity: string | undefined): string {
  if (!rarity) return RARITY_LABELS.COMMON;
  return RARITY_LABELS[rarity as Rarity] ?? rarity;
}

export function formatItemLine(name: string, rarity: string, equipped = false): string {
  const mark = equipped ? ' [экип.]' : '';
  return `${name} · ${rarityLabel(rarity)}${mark}`;
}

export function isDefaultHeroName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? '';
  return !trimmed || trimmed.toLowerCase() === DEFAULT_HERO_NAME.toLowerCase();
}

export function visibleLength(value: string): number {
  return [...value].length;
}

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'length' | 'charset' | 'reserved' | 'unsafe' };

export function validateHeroName(raw: string): NameValidation {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return { ok: false, reason: 'empty' };
  const len = visibleLength(collapsed);
  if (len < 2 || len > 20) return { ok: false, reason: 'length' };
  if (/[\u0000-\u001F\u007F\n\r\t]/.test(raw)) return { ok: false, reason: 'unsafe' };
  if (/https?:\/\/|www\.|<.*>|[{}\[\]<>]|["'`\\]/.test(collapsed)) return { ok: false, reason: 'unsafe' };
  if (collapsed.startsWith('{') || collapsed.startsWith('[')) return { ok: false, reason: 'unsafe' };
  if (!/^[\p{L}\p{N} _\-]+$/u.test(collapsed)) return { ok: false, reason: 'charset' };
  const lower = collapsed.toLowerCase();
  if (RESERVED_NAMES.includes(lower)) return { ok: false, reason: 'reserved' };
  if (PROFANITY.some((word) => lower.includes(word))) return { ok: false, reason: 'unsafe' };
  return { ok: true, name: collapsed };
}

export function isBackLabel(label: string): boolean {
  const stripped = stripDecor(label);
  if (/назад/i.test(stripped) || /назад/i.test(label)) return true;
  if (!stripped) return /back/i.test(label);
  return /^(back\s*)?назад$/i.test(stripped) || stripped.toLowerCase() === 'back';
}

function stripDecor(label: string): string {
  return label
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\bBACK\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLeadingEmoji(label: string): boolean {
  return /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/u.test(label.trim());
}

function withEmoji(emoji: string, label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return `${emoji}`;
  if (hasLeadingEmoji(trimmed)) return trimmed;
  return `${emoji} ${trimmed}`;
}

const LABEL_REWRITE: Array<{ match: RegExp; label: string; color: ButtonColor }> = [
  { match: /разбит.*ящик|осмотреть ящик/i, label: '📦 Осмотреть ящик', color: 'primary' },
  { match: /пойти к дыму|^к дыму/i, label: '🔥 Пойти к дыму', color: 'primary' },
  { match: /проверить куст|^к кустам/i, label: '🌿 Проверить кусты', color: 'primary' },
  { match: /рубить дерево|рубить ещё/i, label: '🪓 Рубить дерево', color: 'primary' },
  { match: /добывать камень|добыть булыжник/i, label: '🪨 Добыть булыжник', color: 'primary' },
  { match: /добывать руду|добыть железо/i, label: '⛏ Добыть железо', color: 'primary' },
  { match: /добывать уголь|добыть уголь/i, label: '⚫ Добыть уголь', color: 'primary' },
  { match: /осмотреть жетон/i, label: '🪙 Осмотреть жетон', color: 'primary' },
  { match: /осмотреть нож/i, label: '🔪 Осмотреть нож', color: 'primary' },
  { match: /к дереву/i, label: '🪵 К дереву', color: 'primary' },
  { match: /к лагерю|к стану|к стану/i, label: '🏕 К лагерю', color: 'primary' },
  { match: /к рему/i, label: '👤 К Рему', color: 'primary' },
  { match: /осмотреться|оглядеться/i, label: '👁 Осмотреться', color: 'primary' },
  { match: /инвентарь/i, label: '🎒 Инвентарь', color: 'primary' },
  { match: /^добыча$/i, label: '⛏ Добыча', color: 'primary' },
  { match: /^крафт$/i, label: '🔨 Крафт', color: 'primary' },
  { match: /^предметы$/i, label: '📦 Предметы', color: 'primary' },
  { match: /^отмена$/i, label: '❌ Отмена', color: 'secondary' },
  { match: /схватить ветку|драться/i, label: '⚔ Драться', color: 'negative' },
  { match: /поджечь смолу|сжечь факел/i, label: '🔥 Сжечь факел', color: 'negative' },
  { match: /^атаковать/i, label: '⚔ Атаковать', color: 'negative' },
  { match: /отступить/i, label: '🛡 Отступить', color: 'secondary' },
];

const ACTION_STYLE: Partial<Record<string, { emoji?: string; label?: string; color: ButtonColor }>> = {
  EXPLORE: { emoji: '👁', label: 'Осмотреться', color: 'primary' },
  OPEN_INVENTORY: { emoji: '🎒', label: 'Инвентарь', color: 'primary' },
  OPEN_CRATE: { emoji: '📦', label: 'Осмотреть ящик', color: 'primary' },
  GATHER_WOOD: { emoji: '🪓', label: 'Рубить дерево', color: 'primary' },
  GATHER_STONE: { emoji: '🪨', label: 'Добыть булыжник', color: 'primary' },
  GATHER_IRON: { emoji: '⛏', label: 'Добыть железо', color: 'primary' },
  GATHER_COAL: { emoji: '⚫', label: 'Добыть уголь', color: 'primary' },
  INSPECT_TOKEN: { emoji: '🪙', label: 'Осмотреть жетон', color: 'primary' },
  BUILD_TEMP_SHELTER: { emoji: '🏕', color: 'positive' },
  START_PVE: { emoji: '⚔', color: 'negative' },
  START_PVP: { emoji: '⚔', color: 'negative' },
  FEED_SCAVENGER: { emoji: '🍞', color: 'positive' },
  RETURN_IRON: { emoji: '⛓', color: 'positive' },
  OPEN_SECRET_CHEST: { emoji: '📦', color: 'positive' },
  MINE_BLUE_MINERAL: { emoji: '💎', color: 'primary' },
  REST_NIGHT: { emoji: '🌙', color: 'primary' },
  BEGIN_DAY_2: { emoji: '▶', color: 'positive' },
  BEGIN_DAY_3: { emoji: '▶', color: 'positive' },
  BEGIN_DAY_4: { emoji: '▶', color: 'positive' },
  BEGIN_DAY_5: { emoji: '▶', color: 'positive' },
  BEGIN_DAY_6: { emoji: '▶', color: 'positive' },
  BEGIN_DAY_7: { emoji: '▶', color: 'positive' },
  FOUND_CAMP: { emoji: '🏕', color: 'positive' },
  PLACE_CAMP_TABLE: { emoji: '🛠', color: 'positive' },
  LIGHT_CAMP: { emoji: '💡', color: 'positive' },
  COMPLETE_DAY_2: { emoji: '✅', color: 'positive' },
  CLAIM_REWARD: { emoji: '🎁', color: 'positive' },
  EQUIP_ITEM: { emoji: '⚔', color: 'positive' },
  USE_ITEM: { emoji: '🍖', color: 'positive' },
  HELP_PET: { color: 'positive' },
  PROMPT_HERO_NAME: { emoji: '✏', color: 'primary' },
  CANCEL_HERO_NAME: { emoji: '❌', label: 'Отмена', color: 'secondary' },
  OPEN_CAMP: { emoji: '🏕', color: 'primary' },
  OPEN_PROFILE: { emoji: '👤', color: 'primary' },
};

const MENU_STYLE: Record<string, { label: string; color: ButtonColor }> = {
  gather: { label: '⛏ Добыча', color: 'primary' },
  craft: { label: '🔨 Крафт', color: 'primary' },
  tools: { label: '🛠 Инструменты', color: 'primary' },
  weapons: { label: '⚔ Оружие', color: 'primary' },
  items: { label: '📦 Предметы', color: 'primary' },
  hub: { label: '🏕 Стан', color: 'primary' },
  camp: { label: '🏕 Стан', color: 'primary' },
  wedge: { label: '🌲 Клин', color: 'primary' },
  hero: { label: '👤 Герой', color: 'primary' },
  profile: { label: '👤 Профиль', color: 'primary' },
  stats: { label: '📊 Статистика', color: 'primary' },
  ratings: { label: '🏆 Рейтинги', color: 'primary' },
  ratings_global: { label: '🌍 Общий', color: 'primary' },
  ratings_pvp: { label: '⚔ PvP', color: 'primary' },
  ratings_weekly: { label: '📅 Недельный', color: 'primary' },
  ratings_clans: { label: '🛡 Кланы', color: 'primary' },
  clan: { label: '🛡 Клан', color: 'primary' },
  daily: { label: '📋 Ежедневки', color: 'primary' },
  furnace: { label: '🔥 Печь', color: 'primary' },
  trade: { label: '⚖ Торговля', color: 'primary' },
  pvp: { label: '⚔ Стычка', color: 'negative' },
  prep: { label: '🛡 Подготовка', color: 'primary' },
  cosmetics: { label: '🎨 Оформление', color: 'primary' },
  achievements: { label: '🏅 Достижения', color: 'primary' },
};

function inferColor(button: GameButton, label: string): ButtonColor {
  if (button.color) return button.color;
  if (button.action === 'CANCEL_HERO_NAME' || isBackLabel(label)) return 'secondary';
  if (button.action === 'LEADERBOARD_PAGE') return 'secondary';
  const stripped = stripDecor(label).toLowerCase();
  if (/(уйти|отойти|оставить|отмена|закрыть|замолчать)/.test(stripped)) return 'secondary';
  if (button.action === 'START_PVE' || button.action === 'START_PVP') return 'negative';
  if (/(атаковать|драться|ударить|сжечь|поджечь|преследовать|вызвать след)/.test(stripped)) {
    return 'negative';
  }
  if (button.action === 'HELP_PET' && String(button.payload?.act ?? '') === 'reject') return 'negative';
  if (
    /(взять|получить|помочь|приручить|покормить|вытащить|подтвердить|надеть|съесть)/.test(stripped) ||
    button.action === 'CLAIM_REWARD' ||
    String(button.action).startsWith('BEGIN_DAY')
  ) {
    return 'positive';
  }
  return 'primary';
}

export function presentButton(button: GameButton): GameButton {
  const original = button.label ?? '';
  const action = String(button.action ?? '');
  const menu = String(button.payload?.menu ?? '');

  if (action === 'LEADERBOARD_PAGE') {
    const label = /ещё/i.test(original) ? 'Ещё ▶' : '◀ Ранее';
    return { ...button, label, color: 'secondary' };
  }

  if (action === 'CANCEL_HERO_NAME' || isBackLabel(original)) {
    const label = action === 'CANCEL_HERO_NAME' ? '❌ Отмена' : BACK_LABEL;
    return { ...button, label, color: 'secondary' };
  }

  const stripped = stripDecor(original);
  for (const rule of LABEL_REWRITE) {
    if (rule.match.test(stripped) || rule.match.test(original)) {
      return { ...button, label: rule.label, color: inferColor(button, rule.label) };
    }
  }

  if (action === 'OPEN_MENU' && MENU_STYLE[menu] && !isBackLabel(original)) {
    const style = MENU_STYLE[menu]!;
    // Keep contextual destination labels like «К клину» rather than flattening every OPEN_MENU.
    if (!stripped || /^(добыча|крафт|инвентарь|герой|профиль|статистика|рейтинги|клан|стан|предметы|инструменты|оружие)$/i.test(stripped)) {
      return { ...button, label: style.label, color: style.color };
    }
  }

  const actionStyle = ACTION_STYLE[action];
  let label = original.trim() || actionStyle?.label || action;
  if (actionStyle?.label && (!stripped || stripped.toLowerCase() === actionStyle.label.toLowerCase())) {
    label = withEmoji(actionStyle.emoji ?? '', actionStyle.label);
  } else if (actionStyle?.emoji) {
    label = withEmoji(actionStyle.emoji, label);
  } else if (!hasLeadingEmoji(label)) {
    label = maybeEmojiFromText(label);
  }

  if (visibleLength(label) > 40) label = [...label].slice(0, 40).join('');
  return { ...button, label, color: inferColor(button, label) };
}

function maybeEmojiFromText(label: string): string {
  const lower = stripDecor(label).toLowerCase();
  if (/ящик|сундук/.test(lower)) return withEmoji('📦', label);
  if (/дым|костёр|печь|факел/.test(lower)) return withEmoji('🔥', label);
  if (/куст|трава/.test(lower)) return withEmoji('🌿', label);
  if (/дерев|брев/.test(lower)) return withEmoji('🪓', label);
  if (/камен|булыж/.test(lower)) return withEmoji('🪨', label);
  if (/желез|руд/.test(lower)) return withEmoji('⛏', label);
  if (/рему|герой|профил/.test(lower)) return withEmoji('👤', label);
  if (/клад|лагер/.test(lower)) return withEmoji('🏕', label);
  if (/клан/.test(lower)) return withEmoji('🛡', label);
  if (/рейтинг/.test(lower)) return withEmoji('🏆', label);
  if (/крафт/.test(lower)) return withEmoji('🔨', label);
  if (/добыч/.test(lower)) return withEmoji('⛏', label);
  return label;
}

export function presentButtons(buttons: GameButton[]): GameButton[] {
  return buttons.map(presentButton);
}

const ENUM_LEAKS: Array<[RegExp, string]> = [
  [/\bCOMMON\b/g, 'Обычный'],
  [/\bUNCOMMON\b/g, 'Необычный'],
  [/\bRARE\b/g, 'Редкий'],
  [/\bEPIC\b/g, 'Эпический'],
  [/\bLEGENDARY\b/g, 'Легендарный'],
  [/\bMYTHIC\b/g, 'Мифический'],
  [/\bUNKNOWN\b/g, 'Неизвестно'],
  [/\bINACTIVE\b/g, 'неактивен'],
];

export function scrubTechnicalText(text: string): string {
  let next = text;
  for (const [pattern, replacement] of ENUM_LEAKS) {
    next = next.replace(pattern, replacement);
  }
  next = next.replace(/🔙\s*BACK\s*/gi, '⬅ ');
  next = next.replace(/\bBACK\b/g, 'Назад');
  return next;
}

export function presentGameResponse(response: GameResponse): GameResponse {
  return {
    ...response,
    text: scrubTechnicalText(response.text ?? ''),
    buttons: presentButtons(response.buttons ?? []),
  };
}

export function buttonColor(button: GameButton): ButtonColor {
  return presentButton(button).color ?? 'primary';
}
