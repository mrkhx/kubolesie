export const DEFAULT_VK_API_VERSION = '5.199';
export const DEFAULT_VK_API_TIMEOUT_MS = 4000;
export const VK_CALLBACK_JSON_LIMIT = 32 * 1024;
export const VK_MESSAGE_MAX_LENGTH = 4096;
export const VK_BUTTON_PAYLOAD_MAX = 255;
export const VK_CHAT_PEER_OFFSET = 2_000_000_000;

export interface VkConfig {
  groupId: number | null;
  groupToken: string | null;
  callbackSecret: string | null;
  confirmationCode: string | null;
  apiVersion: string;
  production: boolean;
  timeoutMs?: number;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_VK_API_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_VK_API_TIMEOUT_MS;
  return Math.min(15_000, Math.max(500, Math.trunc(parsed)));
}

export function loadVkConfig(env: NodeJS.Dict<string> = process.env): VkConfig {
  const groupRaw = emptyToNull(env.VK_GROUP_ID);
  const groupNum = groupRaw ? Number(groupRaw) : NaN;
  return {
    groupId: Number.isFinite(groupNum) && groupNum > 0 ? groupNum : null,
    groupToken: emptyToNull(env.VK_GROUP_TOKEN),
    callbackSecret: emptyToNull(env.VK_CALLBACK_SECRET),
    confirmationCode: emptyToNull(env.VK_CONFIRMATION_CODE),
    apiVersion: emptyToNull(env.VK_API_VERSION) ?? DEFAULT_VK_API_VERSION,
    production: env.NODE_ENV === 'production',
    timeoutMs: parseTimeoutMs(env.VK_API_TIMEOUT_MS),
  };
}

export function isVkCallbackReady(config: VkConfig): boolean {
  return Boolean(
    config.groupId && config.groupToken && config.callbackSecret && config.confirmationCode,
  );
}

export function describeVkConfig(config: VkConfig): {
  vkConfigured: boolean;
  groupId: boolean;
  groupToken: boolean;
  callbackSecret: boolean;
  confirmationCode: boolean;
  apiVersion: string;
  timeoutMs: number;
} {
  return {
    vkConfigured: isVkCallbackReady(config),
    groupId: Boolean(config.groupId),
    groupToken: Boolean(config.groupToken),
    callbackSecret: Boolean(config.callbackSecret),
    confirmationCode: Boolean(config.confirmationCode),
    apiVersion: config.apiVersion,
    timeoutMs: config.timeoutMs ?? DEFAULT_VK_API_TIMEOUT_MS,
  };
}

export function logVkStartup(
  config: VkConfig,
  log: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void } = console,
): void {
  const ready = isVkCallbackReady(config);
  log.log(`[vk] callback ready=${ready} ${JSON.stringify(describeVkConfig(config))}`);
  if (config.production && !ready) {
    log.error(
      '[vk] production callback is fail-closed: missing VK_GROUP_ID / VK_GROUP_TOKEN / VK_CALLBACK_SECRET / VK_CONFIRMATION_CODE',
    );
  }
}
