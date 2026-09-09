import {
  isGameCommandType,
  presentButton,
  BACK_LABEL,
  type GameButton,
  type GameCommand,
  type GameCommandType,
  type NormalizedIncomingEvent,
} from '@kubolesie/shared';
import { serializeButtonPayload } from './payload';

export interface MockVkEvent {
  event_id: string;
  vk_user_id: string | number;
  action?: string;
  payload?: Record<string, unknown>;
  text?: string;
  name?: string;
}

export type VkKeyboardButton =
  | {
      action: {
        type: 'callback' | 'text';
        label: string;
        payload: string;
      };
      color?: 'secondary' | 'primary' | 'positive' | 'negative';
    }
  | {
      action: {
        type: 'open_link';
        label: string;
        link: string;
      };
      color?: 'secondary' | 'primary' | 'positive' | 'negative';
    };

export interface VkKeyboard {
  one_time: boolean;
  inline: boolean;
  buttons: Array<Array<VkKeyboardButton>>;
}

const TEXT_ALIASES: Record<string, GameCommandType> = {
  '/start': 'START_GAME',
  старт: 'START_GAME',
  начать: 'START_GAME',
  играть: 'START_GAME',
  инвентарь: 'OPEN_INVENTORY',
  лагерь: 'OPEN_CAMP',
  меню: 'OPEN_CAMP',
  рубить: 'GATHER_WOOD',
  дерево: 'GATHER_WOOD',
  осмотреться: 'EXPLORE',
  оглядеться: 'EXPLORE',
  камень: 'GATHER_STONE',
  булыжник: 'GATHER_STONE',
  железо: 'GATHER_IRON',
  уголь: 'GATHER_COAL',
  жетон: 'INSPECT_TOKEN',
  укрытие: 'BUILD_TEMP_SHELTER',
  ночь: 'REST_NIGHT',
  профиль: 'OPEN_PROFILE',
  'назвать героя': 'PROMPT_HERO_NAME',
  'сменить имя': 'PROMPT_HERO_NAME',
};

const TEXT_MENU_ALIASES: Record<string, string> = {
  добыча: 'gather',
  крафт: 'craft',
  инструменты: 'tools',
  оружие: 'weapons',
  предметы: 'items',
  стан: 'camp',
  назад: 'hub',
  клин: 'wedge',
  ежедневки: 'daily',
  печь: 'furnace',
  торговля: 'trade',
  весы: 'trade',
  стычка: 'pvp',
  осыпь: 'pvp',
  подготовка: 'prep',
  герой: 'hero',
  клан: 'clan',
  рейтинг: 'ratings',
  рейтинги: 'ratings',
  пвп: 'pvp_hub',
  статистика: 'stats',
  достижения: 'achievements',
  рынок: 'market',
  лоты: 'market_mine',
  аукцион: 'market_auc',
  работы: 'jobs',
  хозяйство: 'work',
  дворы: 'production',
  производство: 'production',
  грядка: 'farm',
  низина: 'lowland',
  карьер: 'quarry',
  кромка: 'mist',
  чаща: 'rootwood',
  корни: 'rootwood',
  роща: 'grove',
  тропа: 'trail',
  гниль: 'trail',
  гнилая: 'hollow',
};

export function normalizeCommandText(text: string): string {
  return text.trim().toLowerCase();
}

/** Strict parser: unknown chat text is `null`, never silently START_GAME. */
export function tryCommandFromText(text: string, payload: Record<string, unknown> = {}): GameCommand | null {
  const normalized = normalizeCommandText(text);
  if (!normalized) return null;
  if (normalized === 'вел') return { type: 'TALK_NPC', payload: { npcId: 'vel' } };
  if (normalized === 'яра') return { type: 'TALK_NPC', payload: { npcId: 'yara' } };
  if (normalized === 'мира') return { type: 'TALK_NPC', payload: { npcId: 'mira' } };
  if (normalized === 'дань') return { type: 'PAY_TRIBUTE', payload };
  if (TEXT_MENU_ALIASES[normalized]) {
    return { type: 'OPEN_MENU', payload: { menu: TEXT_MENU_ALIASES[normalized] } };
  }
  if (TEXT_ALIASES[normalized]) {
    return { type: TEXT_ALIASES[normalized], payload };
  }
  if (normalized === 'осмотреть ящик' || normalized === 'осмотреть разбитый ящик') {
    return { type: 'OPEN_CRATE', payload };
  }
  return null;
}

export function commandFromText(text: string, payload: Record<string, unknown> = {}): GameCommand {
  return tryCommandFromText(text, payload) ?? { type: 'START_GAME', payload };
}

export function parseMockVkEvent(input: MockVkEvent): NormalizedIncomingEvent {
  if (!input.event_id) {
    throw new Error('event_id is required');
  }
  if (input.vk_user_id == null || String(input.vk_user_id).trim() === '') {
    throw new Error('vk_user_id is required');
  }

  const payload = { ...(input.payload ?? {}) };
  const action = String(input.action ?? payload.action ?? '').trim();
  const text = (input.text ?? '').trim().toLowerCase();

  let command: GameCommand;
  if (action && isGameCommandType(action)) {
    command = { type: action, payload };
  } else if (text === 'вел') {
    command = { type: 'TALK_NPC', payload: { npcId: 'vel' } };
  } else if (text === 'яра') {
    command = { type: 'TALK_NPC', payload: { npcId: 'yara' } };
  } else if (text === 'дань') {
    command = { type: 'PAY_TRIBUTE', payload };
  } else if (text && TEXT_MENU_ALIASES[text]) {
    command = { type: 'OPEN_MENU', payload: { menu: TEXT_MENU_ALIASES[text] } };
  } else if (text && TEXT_ALIASES[text]) {
    command = { type: TEXT_ALIASES[text], payload };
  } else if (
    text === 'осмотреть ящик' ||
    text === 'осмотреть разбитый ящик' ||
    action === 'OPEN_CRATE'
  ) {
    command = { type: 'OPEN_CRATE', payload };
  } else {
    command = { type: 'START_GAME', payload };
  }

  return {
    eventId: String(input.event_id),
    identity: {
      provider: 'vk',
      providerUserId: String(input.vk_user_id),
      displayName: input.name,
    },
    command,
    text: input.text,
  };
}

export function callbackPayload(button: VkKeyboardButton): string {
  return button.action.type === 'open_link' ? '' : button.action.payload;
}

export function toVkKeyboard(buttons: GameButton[]): VkKeyboard {
  const styled = buttons.map(presentButton).filter((button) => button.label.trim().length > 0);
  const usable = styled.slice(0, 10);
  const rows: VkKeyboard['buttons'] = [];
  let i = 0;
  while (i < usable.length) {
    const current = usable[i]!;
    const isSolo =
      current.label === BACK_LABEL ||
      current.action === 'CANCEL_HERO_NAME' ||
      [...current.label].length > 18;
    const next = usable[i + 1];
    const nextSolo =
      !next ||
      next.label === BACK_LABEL ||
      next.action === 'CANCEL_HERO_NAME' ||
      [...next.label].length > 18;
    if (isSolo || nextSolo) {
      rows.push([toVkButton(current)]);
      i += 1;
      continue;
    }
    rows.push([toVkButton(current), toVkButton(next)]);
    i += 2;
  }
  return { one_time: false, inline: true, buttons: rows };
}

function toVkButton(button: GameButton): VkKeyboardButton {
  const styled = presentButton(button);
  return {
    action: {
      type: 'callback' as const,
      label: styled.label.slice(0, 40),
      payload: serializeButtonPayload(String(styled.action), styled.payload),
    },
    color: styled.color ?? 'primary',
  };
}
