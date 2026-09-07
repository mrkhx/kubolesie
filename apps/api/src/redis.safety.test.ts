import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('redis implementation safety', () => {
  it('does not ship FLUSHALL, FLUSHDB or KEYS * in runtime redis.ts', () => {
    const source = readFileSync(join(__dirname, 'redis.ts'), 'utf8');
    expect(source).not.toMatch(/FLUSHALL/);
    expect(source).not.toMatch(/FLUSHDB/);
    expect(source).not.toMatch(/KEYS \*/);
  });

  it('does not log REDIS_URL and uses namespaced keys', () => {
    const source = readFileSync(join(__dirname, 'redis.ts'), 'utf8');
    expect(source).toContain('kubolesie:rl:');
    expect(source).toContain('kubolesie:lock:');
    expect(source).not.toMatch(/console\.log\(.*REDIS_URL/);
  });
});
