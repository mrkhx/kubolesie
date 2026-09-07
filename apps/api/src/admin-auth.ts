import { timingSafeEqual } from 'node:crypto';

export function loadAdminAnalyticsToken(env: NodeJS.Dict<string> = process.env): string | null {
  const raw = env.ADMIN_ANALYTICS_TOKEN?.trim() ?? '';
  return raw.length ? raw : null;
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(a.length);
    timingSafeEqual(a, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export type AdminAuthResult = 'disabled' | 'missing' | 'wrong' | 'ok';

export function checkAdminAnalyticsAuth(
  configured: string | null,
  authorization: string | undefined,
): AdminAuthResult {
  if (!configured) return 'disabled';
  const provided = parseBearer(authorization);
  if (!provided) return 'missing';
  return timingSafeEqualString(provided, configured) ? 'ok' : 'wrong';
}
