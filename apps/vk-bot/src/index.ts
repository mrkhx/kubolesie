import {
  isGameCommandType,
  type GameButton,
  type GameCommand,
  type GameCommandType,
  type GameResponse,
  type NormalizedIncomingEvent,
} from '@kubolesie/shared';
import type { GameRuntime } from '@kubolesie/game-core';

export interface MockVkEvent {
  event_id: string;
  vk_user_id: string | number;
  action?: string;
  payload?: Record<string, unknown>;
  text?: string;
  name?: string;
}

export interface VkKeyboard {
  one_time: boolean;
  inline: boolean;
  buttons: Array<
    Array<{
      action: {
        type: 'callback' | 'text';
        label: string;
        payload: string;
      };
      color: 'secondary' | 'primary' | 'positive' | 'negative';
    }>
  >;
}

const TEXT_ALIASES: Record<string, GameCommandType> = {
  '/start': 'START_GAME',
  старт: 'START_GAME',
  начать: 'START_GAME',
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
};

const TEXT_MENU_ALIASES: Record<string, string> = {
  добыча: 'gather',
  крафт: 'craft',
  инструменты: 'tools',
  оружие: 'weapons',
  предметы: 'items',
  стан: 'camp',
  назад: 'hub',
};

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

export function toVkKeyboard(buttons: GameButton[]): VkKeyboard {
  const rows: VkKeyboard['buttons'] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const slice = buttons.slice(i, i + 2).map((button) => ({
      action: {
        type: 'callback' as const,
        label: button.label.slice(0, 40),
        payload: JSON.stringify({
          action: button.action,
          ...(button.payload ?? {}),
        }),
      },
      color: 'secondary' as const,
    }));
    rows.push(slice);
  }
  return { one_time: false, inline: true, buttons: rows };
}

export class VkAdapter {
  constructor(private readonly runtime: GameRuntime) {}

  async handleMockEvent(input: MockVkEvent): Promise<{
    game: GameResponse;
    vkKeyboard: VkKeyboard;
  }> {
    const normalized = parseMockVkEvent(input);
    const game = await this.runtime.handle(normalized);
    return {
      game,
      vkKeyboard: toVkKeyboard(game.buttons),
    };
  }
}

export type { GameResponse };
