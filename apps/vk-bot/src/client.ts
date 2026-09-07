import {
  DEFAULT_VK_API_VERSION,
  VK_MESSAGE_MAX_LENGTH,
  type VkConfig,
} from './config';
import type { VkKeyboard } from './commands';

export const VK_API_ENDPOINT = 'https://api.vk.com/method';

export class VkApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: number | string,
  ) {
    super(`vk api ${method} failed`);
    this.name = 'VkApiError';
  }
}

export interface SendMessageInput {
  peerId: number;
  text: string;
  keyboard?: VkKeyboard;
  randomId: number;
}

export interface AnswerEventInput {
  eventId: string;
  userId: number;
  peerId: number;
}

export interface VkMessenger {
  sendMessage(input: SendMessageInput): Promise<void>;
  answerEvent(input: AnswerEventInput): Promise<void>;
}

export function randomIdFromEvent(eventId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < eventId.length; i += 1) {
    hash ^= eventId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const value = hash | 0;
  return value === 0 ? 1 : value;
}

export function clipVkText(text: string): string {
  if (text.length <= VK_MESSAGE_MAX_LENGTH) return text;
  return text.slice(0, VK_MESSAGE_MAX_LENGTH - 1) + '…';
}

export class RecordingVkApi implements VkMessenger {
  readonly sent: SendMessageInput[] = [];
  readonly answers: AnswerEventInput[] = [];
  failSend = false;
  failAnswer = false;

  async sendMessage(input: SendMessageInput): Promise<void> {
    if (this.failSend) throw new VkApiError('messages.send', 10);
    this.sent.push(input);
  }

  async answerEvent(input: AnswerEventInput): Promise<void> {
    if (this.failAnswer) throw new VkApiError('messages.sendMessageEventAnswer', 10);
    this.answers.push(input);
  }
}

export class VkApiClient implements VkMessenger {
  constructor(
    private readonly config: VkConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  async sendMessage(input: SendMessageInput): Promise<void> {
    const params: Record<string, string> = {
      peer_id: String(input.peerId),
      message: clipVkText(input.text),
      random_id: String(input.randomId),
      dont_parse_links: '1',
    };
    if (input.keyboard && input.keyboard.buttons.length > 0) {
      params.keyboard = JSON.stringify(input.keyboard);
    }
    await this.call('messages.send', params);
  }

  async answerEvent(input: AnswerEventInput): Promise<void> {
    await this.call('messages.sendMessageEventAnswer', {
      event_id: input.eventId,
      user_id: String(input.userId),
      peer_id: String(input.peerId),
    });
  }

  private async call(method: string, params: Record<string, string>): Promise<unknown> {
    const token = this.config.groupToken;
    if (!token) throw new VkApiError(method, 'no_token');
    const body = new URLSearchParams(params);
    body.set('access_token', token);
    body.set('v', this.config.apiVersion || DEFAULT_VK_API_VERSION);
    let response: Response;
    try {
      response = await this.http(`${VK_API_ENDPOINT}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      throw new VkApiError(method, 'network');
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new VkApiError(method, 'invalid_json');
    }
    const error = (json as { error?: { error_code?: number } }).error;
    if (error) {
      throw new VkApiError(method, error.error_code ?? 'vk_error');
    }
    if (!response.ok) throw new VkApiError(method, response.status);
    return json;
  }
}
