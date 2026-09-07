import type { GameCommand, GameResponse } from '@kubolesie/shared';
import { DEFAULT_HERO_NAME } from '@kubolesie/shared';
import { VK_CHAT_PEER_OFFSET } from './config';
import type { VkKeyboard } from './commands';

export type ChatContext = 'direct_message' | 'group_chat';

export type GroupSocialKind = 'player_start' | 'level_up' | 'rare_item' | 'boss' | 'pvp' | 'clan';

export interface GroupSocialEvent {
  kind: GroupSocialKind;
  peerId: number;
  userId: string;
  playerName?: string;
  text?: string;
}

export const GROUP_HELP_TEXT = [
  '🌲 Куболесье — чат-RPG.',
  'Напиши «Начать», а приключение продолжится в личных сообщениях.',
].join('\n');

export const GROUP_PROFILE_SENT = '👤 Профиль отправлен в личные сообщения.';
export const GROUP_PROFILE_UNAVAILABLE =
  '👤 Открой личные сообщения Куболесья, чтобы посмотреть профиль.';
export const GROUP_CONTINUE_IN_DM = '✉ Продолжи игру в личных сообщениях Куболесья.';

export const BOT_SCREEN_NAME = 'kubolesie';

const HELP_TOKENS = new Set(['помощь', 'help', '/help']);

const BARE_START: GameCommand = { type: 'START_GAME', payload: {} };
const BARE_PROFILE: GameCommand = { type: 'OPEN_PROFILE', payload: {} };

/** Only these text commands are public in a group conversation. */
const PUBLIC_INVOCATIONS: Record<string, GameCommand> = {
  начать: BARE_START,
  старт: BARE_START,
  '/start': BARE_START,
  start: BARE_START,
  играть: BARE_START,
  профиль: BARE_PROFILE,
};

export type GroupInvocation =
  | { kind: 'help'; text: string }
  | { kind: 'command'; command: GameCommand; text: string };

export function classifyChat(fromId: number, peerId: number): ChatContext | null {
  if (!Number.isFinite(fromId) || fromId <= 0) return null;
  if (!Number.isFinite(peerId) || peerId <= 0) return null;
  if (peerId >= VK_CHAT_PEER_OFFSET) return 'group_chat';
  if (peerId === fromId) return 'direct_message';
  return null;
}

export function isGroupPeer(peerId: number): boolean {
  return Number.isFinite(peerId) && peerId >= VK_CHAT_PEER_OFFSET;
}

export function dmPeerId(userId: string | number): number {
  return Number(userId);
}

function isHelpToken(value: string): boolean {
  return HELP_TOKENS.has(value.trim().toLowerCase());
}

export function isGroupStartCommand(command: GameCommand): boolean {
  return command.type === 'START_GAME';
}

export function isGroupProfileCommand(command: GameCommand): boolean {
  return command.type === 'OPEN_PROFILE';
}

/**
 * Detect a community mention / "Куболесье" address and return the remaining command text.
 * Mentions of *other* communities are left in place and do not count as addressed.
 */
export function extractAddress(
  text: string,
  groupId: number | null,
): { addressed: boolean; rest: string } {
  let rest = text.replace(/\u00a0/g, ' ').trim();
  let addressed = false;

  const mentionPattern =
    /\[(?:club|public)(\d+)\|[^\]]*\]|\[id-(\d+)\|[^\]]*\]|@(?:club|public)(\d+)\b|@([A-Za-z][A-Za-z0-9_.]*)/gi;

  rest = rest.replace(mentionPattern, (full, clubId, idNeg, atId, screen) => {
    const numeric = Number(clubId || idNeg || atId || '');
    if (groupId != null && Number.isFinite(numeric) && numeric === groupId) {
      addressed = true;
      return ' ';
    }
    if (screen && screen.toLowerCase() === BOT_SCREEN_NAME) {
      addressed = true;
      return ' ';
    }
    return full;
  });

  const namePrefix = rest.match(/^куболесье(?:\s*[,:]?\s+|\s*[,:]?\s*$)/iu);
  if (namePrefix) {
    addressed = true;
    rest = rest.slice(namePrefix[0].length);
  }

  rest = rest.replace(/\s+/g, ' ').trim().replace(/^[,:;.\-–—]+/, '').trim();
  return { addressed, rest };
}

export function resolveGroupText(text: string, groupId: number | null): GroupInvocation | null {
  const raw = text.replace(/\u00a0/g, ' ').trim();
  if (!raw) return null;

  const { addressed, rest } = extractAddress(raw, groupId);
  const commandSource = addressed ? rest : raw;
  const normalized = commandSource.trim().toLowerCase();

  if (addressed && !rest) return { kind: 'help', text: raw };
  if (isHelpToken(normalized)) return { kind: 'help', text: commandSource };

  const publicCommand = PUBLIC_INVOCATIONS[normalized];
  if (publicCommand) {
    return {
      kind: 'command',
      command: { type: publicCommand.type, payload: { ...publicCommand.payload } },
      text: commandSource,
    };
  }
  return null;
}

export function communityWriteUrl(groupId: number): string {
  return `https://vk.me/club${groupId}`;
}

export function communityDmKeyboard(groupId: number, label: string): VkKeyboard {
  return {
    one_time: false,
    inline: true,
    buttons: [
      [
        {
          action: {
            type: 'open_link',
            label,
            link: communityWriteUrl(groupId),
          },
        },
      ],
    ],
  };
}

export function playerDisplayName(playerName?: string): string {
  const trimmed = playerName?.trim();
  return trimmed || DEFAULT_HERO_NAME;
}

export function formatPlayerStartNotice(playerName?: string): string {
  return [
    `🌲 ${playerDisplayName(playerName)} отправляется в Куболесье.`,
    'Продолжение приключения — в личных сообщениях.',
  ].join('\n');
}

export function formatDmUnavailableNotice(playerName?: string): string {
  return [
    `🌲 ${playerDisplayName(playerName)}, открой личные сообщения сообщества «Куболесье» и напиши:`,
    'Начать',
  ].join('\n');
}

/** Presentation helper for rare future public events. Only `player_start` is auto-published today. */
export function formatGroupSocialEvent(
  event: GroupSocialEvent,
): { text: string; kind: GroupSocialKind } {
  if (event.kind === 'player_start') {
    return { kind: event.kind, text: event.text ?? formatPlayerStartNotice(event.playerName) };
  }
  return { kind: event.kind, text: event.text ?? '' };
}

const HUD_RE = /^(?:❤️ HP[^\n]*\n)(?:🎒[^\n]*\n)?\n?/u;

export function compactGroupText(text: string): string {
  return text.replace(HUD_RE, '').trim();
}

export function presentGroupChatResponse(response: GameResponse, userId: string): GameResponse {
  const compact = compactGroupText(response.text ?? '');
  const mention = `[id${userId}|игрок]`;
  const text = compact ? `${mention}\n${compact}` : mention;
  return {
    ...response,
    text,
    buttons: response.buttons ?? [],
  };
}
