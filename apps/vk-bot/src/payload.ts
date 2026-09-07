import { isGameCommandType, type GameCommand } from '@kubolesie/shared';
import { VK_BUTTON_PAYLOAD_MAX } from './config';

export type PayloadDecode =
  | { ok: true; command: GameCommand }
  | { ok: false; reason: 'missing' | 'tampered' };

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function asFlatRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isPrimitive(entry)) return null;
    result[key] = entry;
  }
  return result;
}

export function parseJsonPayload(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export function decodeButtonPayload(raw: unknown): PayloadDecode {
  if (raw == null) return { ok: false, reason: 'missing' };
  if (typeof raw === 'string') {
    const token = raw.trim().toLowerCase();
    if (token === 'start' || token === 'начать' || token === '/start') {
      return { ok: true, command: { type: 'START_GAME', payload: {} } };
    }
  }
  const parsed = typeof raw === 'string' || typeof raw === 'object' ? parseJsonPayload(raw) : null;
  if (typeof parsed === 'string') {
    const token = parsed.trim().toLowerCase();
    if (token === 'start' || token === 'начать' || token === '/start') {
      return { ok: true, command: { type: 'START_GAME', payload: {} } };
    }
    return { ok: false, reason: 'tampered' };
  }
  const record = asFlatRecord(parsed);
  if (!record) return { ok: false, reason: 'tampered' };
  const action = String(record.action ?? '').trim();
  if (!action || !isGameCommandType(action)) {
    const vkCommand = String(record.command ?? record.cmd ?? '').trim().toLowerCase();
    if (vkCommand === 'start' || vkCommand === 'начать' || vkCommand === '/start') {
      return { ok: true, command: { type: 'START_GAME', payload: {} } };
    }
    return { ok: false, reason: 'tampered' };
  }
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'action') continue;
    payload[key] = value;
  }
  return { ok: true, command: { type: action, payload } };
}

export function serializeButtonPayload(action: string, payload?: Record<string, unknown>): string {
  const body: Record<string, unknown> = { action };
  if (payload) {
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      if (!isPrimitive(value)) continue;
      body[key] = value;
    }
  }
  let json = JSON.stringify(body);
  if (Buffer.byteLength(json, 'utf8') > VK_BUTTON_PAYLOAD_MAX) {
    json = JSON.stringify({ action });
  }
  if (Buffer.byteLength(json, 'utf8') > VK_BUTTON_PAYLOAD_MAX) {
    json = json.slice(0, VK_BUTTON_PAYLOAD_MAX);
  }
  return json;
}
