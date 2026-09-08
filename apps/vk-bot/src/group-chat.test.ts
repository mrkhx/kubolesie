import { describe, expect, it } from 'vitest';
import { VK_CHAT_PEER_OFFSET } from './config';
import {
  classifyChat,
  communityDmKeyboard,
  communityWriteUrl,
  compactGroupText,
  extractAddress,
  formatDmUnavailableNotice,
  formatGroupSocialEvent,
  formatPlayerStartNotice,
  isGroupPeer,
  resolveGroupText,
} from './group-chat';
import { tryCommandFromText } from './commands';

describe('classifyChat', () => {
  it('treats peer_id === from_id below chat offset as a DM', () => {
    expect(classifyChat(9001, 9001)).toBe('direct_message');
    expect(classifyChat(1, 1)).toBe('direct_message');
  });

  it('treats peer_id >= 2e9 as a group conversation', () => {
    expect(classifyChat(9001, VK_CHAT_PEER_OFFSET + 1)).toBe('group_chat');
    expect(isGroupPeer(2_000_000_001)).toBe(true);
    expect(isGroupPeer(9001)).toBe(false);
  });

  it('rejects community, zero, NaN and cross-user DM destinations', () => {
    expect(classifyChat(-111, -111)).toBeNull();
    expect(classifyChat(9001, 0)).toBeNull();
    expect(classifyChat(9001, Number.NaN)).toBeNull();
    expect(classifyChat(9001, 9002)).toBeNull();
    expect(classifyChat(0, 2000000001)).toBeNull();
  });
});

describe('extractAddress', () => {
  it('strips a Куболесье prefix with optional comma', () => {
    expect(extractAddress('Куболесье, начать', 111)).toEqual({ addressed: true, rest: 'начать' });
    expect(extractAddress('Куболесье начать', 111)).toEqual({ addressed: true, rest: 'начать' });
    expect(extractAddress('куболесье, профиль', 111)).toEqual({ addressed: true, rest: 'профиль' });
  });

  it('strips @kubolesie and VK club mentions for this community', () => {
    expect(extractAddress('@kubolesie начать', 111)).toEqual({ addressed: true, rest: 'начать' });
    expect(extractAddress('[club111|Куболесье] начать', 111)).toEqual({
      addressed: true,
      rest: 'начать',
    });
    expect(extractAddress('[public111|@kubolesie] профиль', 111)).toEqual({
      addressed: true,
      rest: 'профиль',
    });
    expect(extractAddress('@club111 меню', 111)).toEqual({ addressed: true, rest: 'меню' });
  });

  it('does not treat a mention of another community as addressed', () => {
    expect(extractAddress('[club999|Другой] начать', 111)).toEqual({
      addressed: false,
      rest: '[club999|Другой] начать',
    });
  });

  it('leaves plain chatter unaddressed', () => {
    expect(extractAddress('кто сегодня играет?', 111)).toEqual({
      addressed: false,
      rest: 'кто сегодня играет?',
    });
  });
});

describe('resolveGroupText', () => {
  it('accepts only the public group commands', () => {
    expect(resolveGroupText('Начать', 111)).toMatchObject({
      kind: 'command',
      command: { type: 'START_GAME' },
    });
    expect(resolveGroupText('Старт', 111)).toMatchObject({
      kind: 'command',
      command: { type: 'START_GAME' },
    });
    expect(resolveGroupText('играть', 111)).toMatchObject({
      kind: 'command',
      command: { type: 'START_GAME' },
    });
    expect(resolveGroupText('профиль', 111)).toMatchObject({
      kind: 'command',
      command: { type: 'OPEN_PROFILE' },
    });
    expect(resolveGroupText('Помощь', 111)?.kind).toBe('help');
    expect(resolveGroupText('меню', 111)).toBeNull();
    expect(resolveGroupText('рубить', 111)).toBeNull();
    expect(resolveGroupText('рынок', 111)).toBeNull();
    expect(resolveGroupText('аукцион', 111)).toBeNull();
  });

  it('accepts addressed public commands and ignores gameplay aliases', () => {
    expect(resolveGroupText('Куболесье, начать', 111)).toMatchObject({
      kind: 'command',
      command: { type: 'START_GAME' },
    });
    expect(resolveGroupText('Куболесье, профиль', 111)).toMatchObject({
      kind: 'command',
      command: { type: 'OPEN_PROFILE' },
    });
    expect(resolveGroupText('Куболесье, рубить', 111)).toBeNull();
    expect(resolveGroupText('Куболесье, меню', 111)).toBeNull();
    expect(resolveGroupText('кто сегодня играет?', 111)).toBeNull();
    expect(resolveGroupText('привет всем', 111)).toBeNull();
  });

  it('shows help when the bot is addressed with no command', () => {
    expect(resolveGroupText('Куболесье', 111)?.kind).toBe('help');
    expect(resolveGroupText('Куболесье,', 111)?.kind).toBe('help');
  });
});

describe('tryCommandFromText', () => {
  it('does not default unknown text to START_GAME', () => {
    expect(tryCommandFromText('привет всем')).toBeNull();
    expect(tryCommandFromText('играть')?.type).toBe('START_GAME');
    expect(tryCommandFromText('начать')?.type).toBe('START_GAME');
  });
});

describe('group social helpers', () => {
  it('formats a compact player-start notice and DM link keyboard', () => {
    expect(formatPlayerStartNotice()).toContain('Путник отправляется в Куболесье');
    expect(formatPlayerStartNotice('Виктор')).toContain('Виктор отправляется в Куболесье');
    expect(formatPlayerStartNotice()).toContain('личных сообщениях');
    expect(communityWriteUrl(111)).toBe('https://vk.me/club111');
    const keyboard = communityDmKeyboard(111, '✉ Продолжить в личке');
    expect(keyboard.buttons[0]![0]!.action).toMatchObject({
      type: 'open_link',
      label: '✉ Продолжить в личке',
      link: 'https://vk.me/club111',
    });
    expect(formatDmUnavailableNotice()).toMatch(/Начать/);
    expect(formatGroupSocialEvent({ kind: 'player_start', peerId: 1, userId: '1' }).text).toContain(
      'отправляется в Куболесье',
    );
    expect(compactGroupText('просто текст')).toBe('просто текст');
  });
});
