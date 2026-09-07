import { BALANCE_VERSION, PROTOTYPE_VERSION } from '@kubolesie/shared';
import {
  describeDatabaseConfig,
  loadDatabaseConfig,
  type DatabaseConfig,
} from '@kubolesie/database';
import {
  DEFAULT_VK_API_VERSION,
  describeVkConfig,
  isVkCallbackReady,
  loadVkConfig,
  type VkConfig,
} from '@kubolesie/vk-bot';

export class ProductionConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`[config] production missing: ${missing.join(', ')}`);
    this.name = 'ProductionConfigError';
  }
}

export interface AppConfig {
  production: boolean;
  nodeEnv: string;
  port: number;
  host: string;
  version: string;
  prototypeVersion: string;
  balanceVersion: string;
  commitSha: string | null;
  mockApiEnabled: boolean;
  vk: VkConfig;
  database: DatabaseConfig;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  return Number.isFinite(port) && port > 0 ? port : 3000;
}

export function loadAppConfig(env: NodeJS.Dict<string> = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  return {
    production,
    nodeEnv: env.NODE_ENV ?? 'development',
    port: parsePort(env.PORT),
    host: emptyToNull(env.HOST) ?? '0.0.0.0',
    version: PROTOTYPE_VERSION,
    prototypeVersion: PROTOTYPE_VERSION,
    balanceVersion: BALANCE_VERSION,
    commitSha: emptyToNull(env.APP_COMMIT_SHA),
    mockApiEnabled: production ? false : env.ENABLE_MOCK_API !== 'false',
    vk: loadVkConfig(env),
    database: loadDatabaseConfig(env),
  };
}

export function assertProductionReady(config: AppConfig): void {
  if (!config.production) return;
  const missing: string[] = [];
  if (!config.database.databaseUrl) missing.push('DATABASE_URL');
  if (config.database.gameStore === 'memory') missing.push('GAME_STORE=memory');
  if (config.vk.groupId == null) missing.push('VK_GROUP_ID');
  if (!config.vk.groupToken) missing.push('VK_GROUP_TOKEN');
  if (!config.vk.callbackSecret) missing.push('VK_CALLBACK_SECRET');
  if (!config.vk.confirmationCode) missing.push('VK_CONFIRMATION_CODE');
  if (missing.length) throw new ProductionConfigError(missing);
}

export function describeAppConfig(config: AppConfig): Record<string, unknown> {
  return {
    env: config.nodeEnv,
    port: config.port,
    host: config.host,
    version: config.version,
    prototypeVersion: config.prototypeVersion,
    balanceVersion: config.balanceVersion,
    commit: config.commitSha,
    mockApiEnabled: config.mockApiEnabled,
    vkConfigured: isVkCallbackReady(config.vk),
    vk: describeVkConfig(config.vk),
    database: describeDatabaseConfig(config.database),
    apiVersion: config.vk.apiVersion || DEFAULT_VK_API_VERSION,
  };
}

export function logAppStartup(
  config: AppConfig,
  log: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void } = console,
): void {
  log.log(`[api] startup ${JSON.stringify(describeAppConfig(config))}`);
  if (config.production && !isVkCallbackReady(config.vk)) {
    log.error('[api] production VK callback is fail-closed');
  }
}
