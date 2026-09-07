import type { ConsumeWindow, EphemeralStore } from './ephemeral';

export interface MemoryCounter {
  count: number;
  resetAt: number;
}

export interface MemoryLock {
  token: string;
  expiresAt: number;
}

export interface MemoryBacking {
  counters: Map<string, MemoryCounter>;
  locks: Map<string, MemoryLock>;
}

export function createMemoryBacking(): MemoryBacking {
  return { counters: new Map(), locks: new Map() };
}

/**
 * Process-local store for tests and local dev. Two instances share a limit
 * only when constructed with the same backing (simulates two API processes
 * on one Redis).
 */
export class MemoryEphemeralStore implements EphemeralStore {
  constructor(
    private readonly backing: MemoryBacking = createMemoryBacking(),
    private readonly now: () => number = Date.now,
  ) {}

  async consume(windows: ConsumeWindow[]): Promise<boolean> {
    if (windows.length === 0) return true;
    const now = this.now();
    let allowed = true;
    for (const window of windows) {
      let entry = this.backing.counters.get(window.key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + window.ttlMs };
      }
      entry.count += 1;
      this.backing.counters.set(window.key, entry);
      if (entry.count > window.limit) allowed = false;
    }
    return allowed;
  }

  async tryLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const now = this.now();
    const current = this.backing.locks.get(key);
    if (current && current.expiresAt > now) return false;
    this.backing.locks.set(key, { token, expiresAt: now + ttlMs });
    return true;
  }

  async unlock(key: string, token: string): Promise<void> {
    const current = this.backing.locks.get(key);
    if (current && current.token === token) this.backing.locks.delete(key);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}
