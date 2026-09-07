/**
 * Ephemeral anti-abuse store. Redis or in-memory.
 * Never holds gameplay truth (inventory, energy, coins, quests, ratings).
 * Game Core must not import this module.
 */
export interface ConsumeWindow {
  key: string;
  limit: number;
  ttlMs: number;
}

export interface EphemeralStore {
  /**
   * Atomically increment every window. Returns true only if every window
   * stayed within its limit. Rejected hits still count (flood protection).
   * All keys must carry a TTL.
   */
  consume(windows: ConsumeWindow[]): Promise<boolean>;
  tryLock(key: string, token: string, ttlMs: number): Promise<boolean>;
  unlock(key: string, token: string): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
