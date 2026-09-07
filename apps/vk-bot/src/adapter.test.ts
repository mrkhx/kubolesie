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

  it('maps nested menu buttons including payload.menu', () => {
    const keyboard = toVkKeyboard([
      { label: '⛏ Добыча', action: 'OPEN_MENU', payload: { menu: 'gather' } },
      { label: '🔙 Назад', action: 'OPEN_MENU', payload: { menu: 'craft' } },
    ]);
    expect(JSON.parse(keyboard.buttons[0][0].action.payload)).toMatchObject({
      action: 'OPEN_MENU',
      menu: 'gather',
    });
    expect(JSON.parse(keyboard.buttons[1][0].action.payload).menu).toBe('craft');
    expect(keyboard.buttons[0][0].color).toBe('primary');
    expect(keyboard.buttons[1][0].color).toBe('secondary');
    expect(keyboard.buttons[1][0].action.label).toBe('⬅ Назад');
  });

  it('parses text aliases for craft categories as OPEN_MENU', () => {
    const craft = parseMockVkEvent({ event_id: 'e-craft', vk_user_id: 1, text: 'крафт' });
    expect(craft.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'craft' } });
    const gather = parseMockVkEvent({ event_id: 'e-g', vk_user_id: 1, text: 'добыча' });
    expect(gather.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'gather' } });
    const camp = parseMockVkEvent({ event_id: 'e-c', vk_user_id: 1, text: 'лагерь' });
    expect(camp.command.type).toBe('OPEN_CAMP');
    const station = parseMockVkEvent({ event_id: 'e-st', vk_user_id: 1, text: 'стан' });
    expect(station.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'camp' } });
    const coal = parseMockVkEvent({ event_id: 'e-coal', vk_user_id: 1, text: 'уголь' });
    expect(coal.command.type).toBe('GATHER_COAL');
    const wedge = parseMockVkEvent({ event_id: 'e-w', vk_user_id: 1, text: 'клин' });
    expect(wedge.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'wedge' } });
    const furnace = parseMockVkEvent({ event_id: 'e-f', vk_user_id: 1, text: 'печь' });
    expect(furnace.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'furnace' } });
    const vel = parseMockVkEvent({ event_id: 'e-vel', vk_user_id: 1, text: 'вел' });
    expect(vel.command).toEqual({ type: 'TALK_NPC', payload: { npcId: 'vel' } });
    const yara = parseMockVkEvent({ event_id: 'e-y', vk_user_id: 1, text: 'яра' });
    expect(yara.command).toEqual({ type: 'TALK_NPC', payload: { npcId: 'yara' } });
    const tribute = parseMockVkEvent({ event_id: 'e-t', vk_user_id: 1, text: 'дань' });
    expect(tribute.command.type).toBe('PAY_TRIBUTE');
    const hero = parseMockVkEvent({ event_id: 'e-hero', vk_user_id: 1, text: 'герой' });
    expect(hero.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'hero' } });
    const profile = parseMockVkEvent({ event_id: 'e-p', vk_user_id: 1, text: 'профиль' });
    expect(profile.command.type).toBe('OPEN_PROFILE');
    const clan = parseMockVkEvent({ event_id: 'e-cl', vk_user_id: 1, text: 'клан' });
    expect(clan.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'clan' } });
    const rating = parseMockVkEvent({ event_id: 'e-r', vk_user_id: 1, text: 'рейтинг' });
    expect(rating.command).toEqual({ type: 'OPEN_MENU', payload: { menu: 'ratings' } });
  });
});
