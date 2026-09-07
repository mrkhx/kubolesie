import { randomUUID } from 'node:crypto';
import type { GameRuntime } from '@kubolesie/game-core';
import type { GameResponse } from '@kubolesie/shared';
import { parseMockVkEvent, toVkKeyboard, type MockVkEvent, type VkKeyboard } from './commands';
import {
  isPlainCallbackBody,
  parseGameplayEvent,
  verifyCallbackAuth,
  verifyConfirmation,
} from './callback';
import { randomIdFromEvent, VkApiError, type VkMessenger } from './client';
import { isVkCallbackReady, loadVkConfig, type VkConfig } from './config';
import type { AbuseGuard } from './abuse-guard';
import { THROTTLE_TEXT } from './abuse-policy';

export interface CallbackHttpResult {
  status: number;
  body: string;
}

export interface CallbackContext {
  ip?: string;
}

export interface VkLogEntry {
  msg: 'vk.callback';
  type: string;
  status: string;
  eventId?: string;
  playerId?: string;
  peerId?: number;
  method?: string;
  errorCode?: string | number;
  reason?: string;
  category?: string;
  durationMs?: number;
}

export interface VkAdapterDeps {
  client?: VkMessenger;
  config?: VkConfig;
  log?: (entry: VkLogEntry) => void;
  abuse?: AbuseGuard;
}

function defaultLog(entry: VkLogEntry): void {
  console.log(JSON.stringify(entry));
}

const SAFE_TEXT = 'Сейчас это сделать нельзя.';

export class VkAdapter {
  constructor(
    private readonly runtime: GameRuntime,
    private readonly deps: VkAdapterDeps = {},
  ) {}

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

  async handleCallback(raw: unknown, ctx: CallbackContext = {}): Promise<CallbackHttpResult> {
    const config = this.deps.config ?? loadVkConfig();
    const log = this.deps.log ?? defaultLog;
    const abuse = this.deps.abuse;
    const started = Date.now();
    try {
      if (!isPlainCallbackBody(raw)) {
        log({ msg: 'vk.callback', type: 'malformed', status: 'rejected' });
        return { status: 200, body: 'ok' };
      }
      const type = typeof raw.type === 'string' ? raw.type : '';
      if (type === 'confirmation') {
        const auth = verifyConfirmation(raw, config);
        if (auth !== 'ok') {
          log({ msg: 'vk.callback', type: 'confirmation', status: auth });
          return { status: auth === 'misconfigured' ? 503 : 403, body: 'forbidden' };
        }
        log({ msg: 'vk.callback', type: 'confirmation', status: 'ok' });
        return { status: 200, body: config.confirmationCode ?? '' };
      }

      if (!isVkCallbackReady(config)) {
        log({ msg: 'vk.callback', type: type || 'unknown', status: 'misconfigured' });
        return { status: 503, body: 'forbidden' };
      }
      const auth = verifyCallbackAuth(raw, config);
      if (auth !== 'ok') {
        log({ msg: 'vk.callback', type: type || 'unknown', status: auth });
        return { status: 403, body: 'forbidden' };
      }

      if (type !== 'message_new' && type !== 'message_event') {
        log({ msg: 'vk.callback', type: type || 'unknown', status: 'ignored' });
        return { status: 200, body: 'ok' };
      }

      const parsed = parseGameplayEvent(raw, type);
      if (parsed.kind === 'malformed') {
        log({ msg: 'vk.callback', type, status: 'malformed', reason: parsed.reason });
        return { status: 200, body: 'ok' };
      }
      if (parsed.kind === 'ignore') {
        log({
          msg: 'vk.callback',
          type,
          status: 'ignored',
          eventId: parsed.eventId,
          reason: parsed.reason,
        });
        return { status: 200, body: 'ok' };
      }

      if (abuse?.enabled) {
        if (ctx.ip) {
          const ipDecision = await abuse.allowIp(ctx.ip);
          if (!ipDecision.allowed) {
            log({
              msg: 'vk.callback',
              type,
              status: 'rate_limited',
              reason: ipDecision.reason === 'store_error' ? 'store_error' : 'ip',
              eventId: parsed.eventId,
              category: 'ip',
              durationMs: Date.now() - started,
            });
            return { status: 200, body: 'ok' };
          }
        }
        const ingress = await abuse.allowCallbackUser(parsed.userId);
        if (!ingress.allowed) {
          log({
            msg: 'vk.callback',
            type,
            status: 'rate_limited',
            reason: ingress.reason === 'store_error' ? 'store_error' : 'callback',
            eventId: parsed.eventId,
            peerId: parsed.peerId,
            category: 'callback',
            durationMs: Date.now() - started,
          });
          const text = ingress.reason === 'store_error' ? SAFE_TEXT : THROTTLE_TEXT;
          await this.replyLimited(type, parsed.peerId, parsed.eventId, parsed.userId, parsed.callbackEventId, text);
          return { status: 200, body: 'ok' };
        }
      }

      if (parsed.kind === 'tampered') {
        log({
          msg: 'vk.callback',
          type,
          status: 'tampered',
          eventId: parsed.eventId,
          peerId: parsed.peerId,
        });
        await this.notifySafe(parsed.peerId, parsed.eventId, SAFE_TEXT);
        if (type === 'message_event' && parsed.callbackEventId) {
          await this.answerSafe(parsed.callbackEventId, Number(parsed.userId), parsed.peerId);
        }
        return { status: 200, body: 'ok' };
      }

      if (abuse?.enabled) {
        const replay = await this.runtime.peekProcessed(parsed.eventId);
        if (replay) {
          abuse.noteDuplicate();
          log({
            msg: 'vk.callback',
            type,
            status: 'duplicate',
            eventId: parsed.eventId,
            peerId: parsed.peerId,
            durationMs: Date.now() - started,
          });
          try {
            await this.sendGame(parsed.peerId, parsed.eventId, replay);
            if (type === 'message_event' && parsed.callbackEventId) {
              await this.deps.client?.answerEvent({
                eventId: parsed.callbackEventId,
                userId: Number(parsed.userId),
                peerId: parsed.peerId,
              });
            }
          } catch (error) {
            log({
              msg: 'vk.callback',
              type,
              status: 'send_failed',
              eventId: parsed.eventId,
              peerId: parsed.peerId,
              method: 'messages.send',
              errorCode: error instanceof VkApiError ? error.code : 'send',
            });
            return { status: 503, body: 'retry' };
          }
          return { status: 200, body: 'ok' };
        }

        const commandDecision = await abuse.allowCommand(parsed.userId, parsed.command);
        if (!commandDecision.allowed) {
          log({
            msg: 'vk.callback',
            type,
            status: 'rate_limited',
            reason: commandDecision.reason === 'store_error' ? 'store_error' : 'command',
            eventId: parsed.eventId,
            peerId: parsed.peerId,
            category: abuse.classify(parsed.command),
            durationMs: Date.now() - started,
          });
          const text = commandDecision.reason === 'store_error' ? SAFE_TEXT : THROTTLE_TEXT;
          await this.replyLimited(type, parsed.peerId, parsed.eventId, parsed.userId, parsed.callbackEventId, text);
          return { status: 200, body: 'ok' };
        }
      }

      log({
        msg: 'vk.callback',
        type,
        status: 'handle',
        eventId: parsed.eventId,
        peerId: parsed.peerId,
      });

      let lockToken: string | null = null;
      if (abuse?.enabled && abuse.needsLock(parsed.command)) {
        lockToken = randomUUID();
        const lock = await abuse.tryPlayerLock(parsed.userId, lockToken);
        if (!lock.allowed) {
          log({
            msg: 'vk.callback',
            type,
            status: 'rate_limited',
            reason: lock.reason === 'store_error' ? 'store_error' : 'lock_busy',
            eventId: parsed.eventId,
            peerId: parsed.peerId,
            category: abuse.classify(parsed.command),
            durationMs: Date.now() - started,
          });
          const text = lock.reason === 'store_error' ? SAFE_TEXT : THROTTLE_TEXT;
          await this.replyLimited(type, parsed.peerId, parsed.eventId, parsed.userId, parsed.callbackEventId, text);
          return { status: 200, body: 'ok' };
        }
      }

      let game: GameResponse;
      try {
        try {
          game = await this.runtime.handle({
            eventId: parsed.eventId,
            identity: {
              provider: 'vk',
              providerUserId: parsed.userId,
              displayName: 'Путник',
            },
            command: parsed.command,
            text: parsed.text,
          });
        } catch {
          log({
            msg: 'vk.callback',
            type,
            status: 'core_error',
            eventId: parsed.eventId,
            peerId: parsed.peerId,
            errorCode: 'internal',
          });
          game = { text: SAFE_TEXT, buttons: [] };
        }
        const playerId = game.state?.playerId;
        try {
          await this.sendGame(parsed.peerId, parsed.eventId, game);
          if (type === 'message_event' && parsed.callbackEventId) {
            await this.deps.client?.answerEvent({
              eventId: parsed.callbackEventId,
              userId: Number(parsed.userId),
              peerId: parsed.peerId,
            });
          }
        } catch (error) {
          log({
            msg: 'vk.callback',
            type,
            status: 'send_failed',
            eventId: parsed.eventId,
            playerId,
            peerId: parsed.peerId,
            method: 'messages.send',
            errorCode: error instanceof VkApiError ? error.code : 'send',
          });
          return { status: 503, body: 'retry' };
        }
        log({
          msg: 'vk.callback',
          type,
          status: 'ok',
          eventId: parsed.eventId,
          playerId,
          peerId: parsed.peerId,
          method: 'messages.send',
          durationMs: Date.now() - started,
        });
        return { status: 200, body: 'ok' };
      } finally {
        if (lockToken && abuse) {
          await abuse.releasePlayerLock(parsed.userId, lockToken);
        }
      }
    } catch {
      log({ msg: 'vk.callback', type: 'error', status: 'crash' });
      return { status: 200, body: 'ok' };
    }
  }

  private async sendGame(peerId: number, eventId: string, game: GameResponse): Promise<void> {
    const client = this.deps.client;
    if (!client) throw new VkApiError('messages.send', 'no_client');
    await client.sendMessage({
      peerId,
      text: game.text,
      keyboard: toVkKeyboard(game.buttons),
      randomId: randomIdFromEvent(eventId),
    });
  }

  private async notifySafe(peerId: number, eventId: string, text: string): Promise<void> {
    try {
      if (!this.deps.client) return;
      await this.deps.client.sendMessage({
        peerId,
        text,
        randomId: randomIdFromEvent(`${eventId}:reject`),
      });
    } catch {
      return;
    }
  }

  private async replyLimited(
    type: string,
    peerId: number,
    eventId: string,
    userId: string,
    callbackEventId: string | undefined,
    text: string,
  ): Promise<void> {
    try {
      if (this.deps.client) {
        await this.deps.client.sendMessage({
          peerId,
          text,
          randomId: randomIdFromEvent(`${eventId}:throttle`),
        });
      }
    } catch {
      // ACK anyway — never 429 VK.
    }
    if (type === 'message_event' && callbackEventId) {
      await this.answerSafe(callbackEventId, Number(userId), peerId);
    }
  }

  private async answerSafe(eventId: string, userId: number, peerId: number): Promise<void> {
    try {
      await this.deps.client?.answerEvent({ eventId, userId, peerId });
    } catch {
      return;
    }
  }
}

export type { GameResponse };
