import type { GameCommand, GameResponse } from '@kubolesie/shared';
import { validateHeroName } from '@kubolesie/shared';
import { VK_CHAT_PEER_OFFSET } from './config';
import { tryCommandFromText } from './commands';

export type ChatContext = 'direct_message' | 'group_chat';

export const GROUP_HELP_TEXT = [
  'Я работаю в беседе только по команде.',
  'Попробуй:',
  '• Куболесье, начать',
  '• Куболесье, профиль',
  '• Куболесье, меню',
].join('\n');

export const BOT_SCREEN_NAME = 'kubolesie';

const HELP_TOKENS = new Set(['помощь', 'help', '/help']);

const BARE_START: GameCommand = { type: 'START_GAME', payload: {} };
const BARE_PROFILE: GameCommand = { type: 'OPEN_PROFILE', payload: {} };
const BARE_MENU: GameCommand = { type: 'OPEN_CAMP', payload: {} };

const BARE_INVOCATIONS: Record<string, GameCommand> = {
  начать: BARE_START,
  старт: BARE_START,
  '/start': BARE_START,
  start: BARE_START,
  играть: BARE_START,
  профиль: BARE_PROFILE,
  меню: BARE_MENU,
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

function isHelpToken(value: string): boolean {
  return HELP_TOKENS.has(value.trim().toLowerCase());
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

  if (!addressed) {
    const bare = BARE_INVOCATIONS[normalized];
    if (bare) return { kind: 'command', command: { ...bare, payload: { ...bare.payload } }, text: commandSource };
    return null;
  }

  const parsed = tryCommandFromText(rest);
  if (parsed) return { kind: 'command', command: parsed, text: rest };

  if (validateHeroName(rest).ok) {
    return { kind: 'command', command: { type: 'START_GAME', payload: {} }, text: rest };
  }
  return null;
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
