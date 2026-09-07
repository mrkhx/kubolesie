import { timingSafeEqual } from 'node:crypto';
import type { GameCommand } from '@kubolesie/shared';
import { commandFromText } from './commands';
import { VK_CHAT_PEER_OFFSET, type VkConfig } from './config';
import { decodeButtonPayload } from './payload';

export type CallbackAuth = 'ok' | 'secret' | 'group' | 'misconfigured';

export type ParsedGameplay =
  | { kind: 'ignore'; reason: string; eventId: string }
  | { kind: 'malformed'; reason: string }
  | {
      kind: 'tampered';
      eventId: string;
      userId: string;
      peerId: number;
      callbackEventId?: string;
    }
  | {
      kind: 'command';
      type: 'message_new' | 'message_event';
      eventId: string;
      userId: string;
      peerId: number;
      command: GameCommand;
      text?: string;
      callbackEventId?: string;
    };

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
  // VK sends `secret` on confirmation when the community Callback secret is set.
  // If we have a secret configured (always in production), require it — do not
  // hand out VK_CONFIRMATION_CODE to anyone who only knows group_id.
  if (config.callbackSecret) {
    if (typeof payload.secret !== 'string' || !secretsEqual(payload.secret, config.callbackSecret)) {
      return 'secret';
    }
  }
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

export function parseGameplayEvent(
  payload: Record<string, unknown>,
  type: 'message_new' | 'message_event',
): ParsedGameplay {
  const eventId = internalEventId(type, payload);
  if (type === 'message_new') return parseMessageNew(payload, eventId);
  return parseMessageEvent(payload, eventId);
}

function parseMessageNew(payload: Record<string, unknown>, eventId: string): ParsedGameplay {
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
  if (!Number.isFinite(peerId) || peerId >= VK_CHAT_PEER_OFFSET || peerId !== fromId) {
    return { kind: 'ignore', reason: 'group_chat', eventId };
  }
  const text = typeof message.text === 'string' ? message.text : '';
  const rawPayload = message.payload;
  if (rawPayload != null && String(rawPayload).trim() !== '') {
    const decoded = decodeButtonPayload(rawPayload);
    if (!decoded.ok) {
      return { kind: 'tampered', eventId, userId: String(fromId), peerId };
    }
    return {
      kind: 'command',
      type: 'message_new',
      eventId,
      userId: String(fromId),
      peerId,
      command: decoded.command,
      text,
    };
  }
  if (!text.trim()) return { kind: 'ignore', reason: 'empty', eventId };
  return {
    kind: 'command',
    type: 'message_new',
    eventId,
    userId: String(fromId),
    peerId,
    command: commandFromText(text),
    text,
  };
}

function parseMessageEvent(payload: Record<string, unknown>, eventId: string): ParsedGameplay {
  const object = asRecord(payload.object);
  if (!object) return { kind: 'malformed', reason: 'no_object' };
  const userId = positiveId(object.user_id);
  const peerId = positiveId(object.peer_id ?? object.user_id);
  const callbackEventId = object.event_id != null ? String(object.event_id) : undefined;
  if (!userId) return { kind: 'ignore', reason: 'community', eventId };
  if (!peerId || peerId >= VK_CHAT_PEER_OFFSET || peerId !== userId) {
    return { kind: 'ignore', reason: 'group_chat', eventId };
  }
  const decoded = decodeButtonPayload(object.payload);
  if (!decoded.ok) {
    return {
      kind: 'tampered',
      eventId,
      userId: String(userId),
      peerId,
      callbackEventId,
    };
  }
  return {
    kind: 'command',
    type: 'message_event',
    eventId,
    userId: String(userId),
    peerId,
    command: decoded.command,
    callbackEventId,
  };
}

export function isPlainCallbackBody(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}
