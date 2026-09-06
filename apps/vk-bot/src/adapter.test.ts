import { describe, expect, it } from 'vitest';
import { parseMockVkEvent, toVkKeyboard } from './index';

describe('vk adapter', () => {
  it('extracts vk_user_id, event_id and command from a mock event', () => {
    const normalized = parseMockVkEvent({
      event_id: 'e-1',
      vk_user_id: 777,
      action: 'START_GAME',
      name: 'Игрок',
    });
    expect(normalized.eventId).toBe('e-1');
    expect(normalized.identity.provider).toBe('vk');
    expect(normalized.identity.providerUserId).toBe('777');
    expect(normalized.command.type).toBe('START_GAME');
  });

  it('maps GameResponse buttons to VK keyboard JSON outside of game-core', () => {
    const keyboard = toVkKeyboard([
      { label: 'Осмотреть ящик', action: 'OPEN_CRATE' },
      { label: 'Пойти к дыму', action: 'DIALOGUE_CHOICE', payload: { nodeId: 'start', choiceId: 'go_smoke' } },
    ]);
    expect(keyboard.inline).toBe(true);
    expect(keyboard.buttons[0][0].action.type).toBe('callback');
    expect(JSON.parse(keyboard.buttons[0][0].action.payload).action).toBe('OPEN_CRATE');
  });
});
