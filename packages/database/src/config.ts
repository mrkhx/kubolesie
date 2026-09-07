export interface DatabaseConfig {
  production: boolean;
  databaseUrl: string | null;
  gameStore: 'prisma' | 'memory' | null;
  dbConfigured: boolean;
  dbProvider: 'postgresql' | null;
}

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

export function redactDatabaseUrl(url: string): string {
  return url
    .replace(/:\/\/([^:/@]+):([^@]+)@/g, '://$1:***@')
    .replace(/([?&](?:password|pwd|sslpassword)=)[^&]*/gi, '$1***');
}

export function sanitizeDatabaseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://***')
    .replace(/password=[^\s&'"]+/gi, 'password=***');
}

export function loadDatabaseConfig(env: NodeJS.Dict<string> = process.env): DatabaseConfig {
  const databaseUrl = emptyToNull(env.DATABASE_URL);
  const rawStore = emptyToNull(env.GAME_STORE);
  const gameStore = rawStore === 'prisma' || rawStore === 'memory' ? rawStore : null;
  return {
    production: env.NODE_ENV === 'production',
    databaseUrl,
    gameStore,
    dbConfigured: Boolean(databaseUrl),
    dbProvider: databaseUrl ? 'postgresql' : null,
  };
}

export function describeDatabaseConfig(config: DatabaseConfig): {
  dbConfigured: boolean;
  dbProvider: 'postgresql' | null;
  production: boolean;
  gameStore: 'prisma' | 'memory' | null;
} {
  return {
    dbConfigured: config.dbConfigured,
    dbProvider: config.dbProvider,
    production: config.production,
    gameStore: config.gameStore,
  };
}

export function assertDatabaseReady(config: DatabaseConfig): void {
  if (!config.production) return;
  if (!config.databaseUrl) {
    throw new DatabaseConfigError('[database] production requires DATABASE_URL');
  }
  if (config.gameStore === 'memory') {
    throw new DatabaseConfigError('[database] production forbids GAME_STORE=memory');
  }
}
