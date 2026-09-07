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

export interface CallbackHttpResult {
  status: number;
  body: string;
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
}

export interface VkAdapterDeps {
  client?: VkMessenger;
  config?: VkConfig;
  log?: (entry: VkLogEntry) => void;
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

  async handleCallback(raw: unknown): Promise<CallbackHttpResult> {
    const config = this.deps.config ?? loadVkConfig();
    const log = this.deps.log ?? defaultLog;
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

      log({
        msg: 'vk.callback',
        type,
        status: 'handle',
        eventId: parsed.eventId,
        peerId: parsed.peerId,
      });
      let game: GameResponse;
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
      });
      return { status: 200, body: 'ok' };
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

  private async answerSafe(eventId: string, userId: number, peerId: number): Promise<void> {
    try {
      await this.deps.client?.answerEvent({ eventId, userId, peerId });
    } catch {
      return;
    }
  }
}

export type { GameResponse };
