import { timingSafeEqual } from 'node:crypto';
import type { GameCommand } from '@kubolesie/shared';
import { commandFromText, tryCommandFromText } from './commands';
import type { VkConfig } from './config';
import {
  classifyChat,
  resolveGroupText,
  type ChatContext,
} from './group-chat';
import { decodeButtonPayload } from './payload';
import { isStartAlias } from '@kubolesie/shared';

export type CallbackAuth = 'ok' | 'secret' | 'group' | 'misconfigured';

export type ParsedGameplay =
  | { kind: 'ignore'; reason: string; eventId: string }
  | { kind: 'malformed'; reason: string }
  | {
      kind: 'tampered';
      eventId: string;
      userId: string;
      peerId: number;
      chat: ChatContext;
      callbackEventId?: string;
    }
  | {
      kind: 'help';
      eventId: string;
      userId: string;
      peerId: number;
      chat: ChatContext;
      callbackEventId?: string;
    }
  | {
      kind: 'command';
      type: 'message_new' | 'message_event';
      eventId: string;
      userId: string;
      peerId: number;
      chat: ChatContext;
      command: GameCommand;
      text?: string;
      callbackEventId?: string;
    };

export interface ParseGameplayOptions {
  groupId?: number | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

export function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyConfirmation(payload: Record<string, unknown>, config: VkConfig): CallbackAuth {
  if (!config.confirmationCode || config.groupId == null) return 'misconfigured';
  const gid = Number(payload.group_id);
  if (!Number.isFinite(gid) || gid !== config.groupId) return 'group';
  // Real VK confirmation is `{ type: "confirmation", group_id }` with no `secret`.
  // Gameplay events (`message_new`, `message_event`) still require VK_CALLBACK_SECRET.
  return 'ok';
}

export function verifyCallbackAuth(payload: Record<string, unknown>, config: VkConfig): CallbackAuth {
  if (!config.callbackSecret || config.groupId == null || !config.groupToken) return 'misconfigured';
  if (typeof payload.secret !== 'string' || !secretsEqual(payload.secret, config.callbackSecret)) {
    return 'secret';
  }
  const gid = Number(payload.group_id);
  if (!Number.isFinite(gid) || gid !== config.groupId) return 'group';
  return 'ok';
}

export function internalEventId(type: string, payload: Record<string, unknown>): string {
  const root = payload.event_id;
  if (root !== undefined && root !== null && String(root).length > 0) {
    return `vk:${type}:${String(root)}`;
  }
  if (type === 'message_new') {
    const message = messageFromPayload(payload);
    const peer = message?.peer_id ?? 'x';
    const mid = message?.conversation_message_id ?? message?.id ?? 'x';
    return `vk:message_new:${peer}:${mid}`;
  }
  if (type === 'message_event') {
    const object = asRecord(payload.object);
    const ev = object?.event_id;
    if (ev !== undefined && ev !== null && String(ev).length > 0) {
      return `vk:message_event:${String(ev)}`;
    }
    return `vk:message_event:${object?.user_id ?? 'x'}:${object?.peer_id ?? 'x'}:${object?.conversation_message_id ?? 'x'}`;
  }
  return `vk:${type}:unknown`;
}

function messageFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const object = asRecord(payload.object);
  if (!object) return null;
  return asRecord(object.message) ?? object;
}

function positiveId(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function groupIdFrom(payload: Record<string, unknown>, options?: ParseGameplayOptions): number | null {
  if (options?.groupId != null && Number.isFinite(options.groupId) && options.groupId > 0) {
    return options.groupId;
  }
  const gid = Number(payload.group_id);
  return Number.isFinite(gid) && gid > 0 ? gid : null;
}

export function parseGameplayEvent(
  payload: Record<string, unknown>,
  type: 'message_new' | 'message_event',
  options?: ParseGameplayOptions,
): ParsedGameplay {
  const eventId = internalEventId(type, payload);
  if (type === 'message_new') return parseMessageNew(payload, eventId, options);
  return parseMessageEvent(payload, eventId);
}

function parseMessageNew(
  payload: Record<string, unknown>,
  eventId: string,
  options?: ParseGameplayOptions,
): ParsedGameplay {
  const message = messageFromPayload(payload);
  if (!message) return { kind: 'malformed', reason: 'no_message' };
  if (message.out === 1 || message.out === '1') {
    return { kind: 'ignore', reason: 'outgoing', eventId };
  }
  if (message.action && typeof message.action === 'object') {
    return { kind: 'ignore', reason: 'service', eventId };
  }
  const fromId = Number(message.from_id);
  const peerId = Number(message.peer_id ?? message.from_id);
  if (!Number.isFinite(fromId) || fromId <= 0) {
    return { kind: 'ignore', reason: 'community', eventId };
  }
  const chat = classifyChat(fromId, peerId);
  if (!chat) {
    return { kind: 'ignore', reason: 'bad_peer', eventId };
  }

  const userId = String(fromId);
  const text = typeof message.text === 'string' ? message.text : '';
  const rawPayload = message.payload;
  const groupId = groupIdFrom(payload, options);

  if (rawPayload != null && String(rawPayload).trim() !== '') {
    const decoded = decodeButtonPayload(rawPayload);
    if (decoded.ok) {
      return {
        kind: 'command',
        type: 'message_new',
        eventId,
        userId,
        peerId,
        chat,
        command: decoded.command,
        text,
      };
    }
    const fromText = tryCommandFromText(text);
    if (fromText?.type === 'START_GAME' && isStartAlias(text)) {
      return {
        kind: 'command',
        type: 'message_new',
        eventId,
        userId,
        peerId,
        chat,
        command: fromText,
        text,
      };
    }
    if (chat === 'group_chat') {
      return resolveGroupOrIgnore(text, groupId, eventId, userId, peerId, chat);
    }
    return { kind: 'tampered', eventId, userId, peerId, chat };
  }

  if (!text.trim()) return { kind: 'ignore', reason: 'empty', eventId };

  if (chat === 'group_chat') {
    return resolveGroupOrIgnore(text, groupId, eventId, userId, peerId, chat);
  }

  return {
    kind: 'command',
    type: 'message_new',
    eventId,
    userId,
    peerId,
    chat,
    command: commandFromText(text),
    text,
  };
}

function resolveGroupOrIgnore(
  text: string,
  groupId: number | null,
  eventId: string,
  userId: string,
  peerId: number,
  chat: ChatContext,
): ParsedGameplay {
  const invoked = resolveGroupText(text, groupId);
  if (!invoked) return { kind: 'ignore', reason: 'unaddressed', eventId };
  if (invoked.kind === 'help') {
    return { kind: 'help', eventId, userId, peerId, chat };
  }
  return {
    kind: 'command',
    type: 'message_new',
    eventId,
    userId,
    peerId,
    chat,
    command: invoked.command,
    text: invoked.text,
  };
}

function parseMessageEvent(payload: Record<string, unknown>, eventId: string): ParsedGameplay {
  const object = asRecord(payload.object);
  if (!object) return { kind: 'malformed', reason: 'no_object' };
  const userId = positiveId(object.user_id);
  const peerId = Number(object.peer_id ?? object.user_id);
  const callbackEventId = object.event_id != null ? String(object.event_id) : undefined;
  if (!userId) return { kind: 'ignore', reason: 'community', eventId };
  const chat = classifyChat(userId, peerId);
  if (!chat) {
    return { kind: 'ignore', reason: 'bad_peer', eventId };
  }
  const decoded = decodeButtonPayload(object.payload);
  if (!decoded.ok) {
    return {
      kind: 'tampered',
      eventId,
      userId: String(userId),
      peerId,
      chat,
      callbackEventId,
    };
  }
  return {
    kind: 'command',
    type: 'message_event',
    eventId,
    userId: String(userId),
    peerId,
    chat,
    command: decoded.command,
    callbackEventId,
  };
}

export function isPlainCallbackBody(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}
