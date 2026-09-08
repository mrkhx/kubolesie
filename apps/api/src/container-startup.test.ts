import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const SCRIPT = join(ROOT, 'scripts/start-container.sh');
const DOCKERFILE = join(ROOT, 'Dockerfile');
const SECRET_DATABASE_URL = 'postgresql://secret-user:super-secret@db.example:5432/kubolesie';
const UNUSED_REDIS_URL = 'redis://should-not-be-used:6379';

function scriptBody(): string {
  return readFileSync(SCRIPT, 'utf8');
}

function dockerfileBody(): string {
  return readFileSync(DOCKERFILE, 'utf8');
}

function runWithFakeNpm(migrateExit: number): { status: number | null; log: string; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kubolesie-start-'));
  const logFile = join(dir, 'npm.log');
  const npm = join(dir, 'npm');
  writeFileSync(
    npm,
    `#!/bin/sh
echo "$*" >> "${logFile}"
case " $* " in
  *" db:migrate:deploy "*)
    echo "[fake-npm] migrate deploy"
    exit ${migrateExit}
    ;;
  *" start:api "*)
    echo "[fake-npm] API_STARTED"
    echo API_STARTED >> "${logFile}"
    exit 0
    ;;
esac
echo "[fake-npm] unexpected: $*" >&2
exit 2
`,
  );
  chmodSync(npm, 0o755);
  const result = spawnSync('sh', [SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      HOME: dir,
      NODE_ENV: 'production',
      DATABASE_URL: SECRET_DATABASE_URL,
      REDIS_URL: UNUSED_REDIS_URL,
    },
    encoding: 'utf8',
  });
  let log = '';
  try {
    log = readFileSync(logFile, 'utf8');
  } catch {
    log = '';
  }
  return {
    status: result.status,
    log,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function combinedOutput(result: { log: string; stdout: string; stderr: string }): string {
  return `${result.log}\n${result.stdout}\n${result.stderr}`;
}

describe('container production startup', () => {
  it('runs prisma migrate deploy before the existing API start command', () => {
    const script = scriptBody();
    expect(script).toMatch(/^set -e/m);
    expect(script).toContain('npm run db:migrate:deploy');
    expect(script).toContain('npm run start:api');
    expect(script.indexOf('npm run db:migrate:deploy')).toBeLessThan(script.indexOf('npm run start:api'));
    expect(script).toMatch(/\bexec npm run start:api\b/);
    expect(script).not.toMatch(/migrate dev/);
    expect(script).not.toMatch(/db push/);
    expect(script).not.toMatch(/migrate reset/);
    expect(script).not.toMatch(/force-reset/);
    expect(script).not.toMatch(/echo.*DATABASE_URL/);
    expect(script).not.toMatch(/printenv DATABASE_URL/);
    expect(script).not.toMatch(/REDIS_URL/);

    const docker = dockerfileBody();
    expect(docker).toContain('CMD ["sh", "scripts/start-container.sh"]');
    expect(docker).toMatch(/COPY scripts\/start-container\.sh/);
    expect(docker).toMatch(/^USER kubolesie/m);
    expect(docker).toMatch(/ENV NODE_ENV=production/);
    expect(docker).toMatch(/ENV HOST=0\.0\.0\.0/);
    expect(docker).not.toMatch(/CMD \["npm", "run", "start:api"\]/);
    expect(docker).not.toMatch(/migrate dev|db push|migrate reset/);

    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      version: string;
      scripts: Record<string, string>;
    };
    expect(pkg.version).toBe('0.0.8');
    expect(pkg.scripts['start:api']).toBe(
      'npm run prisma:generate && npm run start --workspace=@kubolesie/api',
    );
    expect(pkg.scripts['db:migrate:deploy']).toBe(
      'npm run prisma:migrate:deploy --workspace=@kubolesie/database',
    );
  });

  it('does not start the API when migrate deploy fails', () => {
    const result = runWithFakeNpm(1);
    expect(result.status).not.toBe(0);
    expect(result.log).toMatch(/db:migrate:deploy/);
    expect(result.log).not.toMatch(/API_STARTED/);
    expect(result.stdout + result.stderr).not.toMatch(/API_STARTED/);
    expect(combinedOutput(result)).not.toContain('super-secret');
    expect(combinedOutput(result)).not.toContain(SECRET_DATABASE_URL);
    expect(combinedOutput(result)).not.toContain(UNUSED_REDIS_URL);
  });

  it('starts the API only after migrate deploy succeeds', () => {
    const result = runWithFakeNpm(0);
    expect(result.status).toBe(0);
    const migrateAt = result.log.indexOf('db:migrate:deploy');
    const startAt = result.log.indexOf('API_STARTED');
    expect(migrateAt).toBeGreaterThan(-1);
    expect(startAt).toBeGreaterThan(migrateAt);
    expect(combinedOutput(result)).not.toContain('super-secret');
    expect(combinedOutput(result)).not.toContain(SECRET_DATABASE_URL);
    expect(combinedOutput(result)).not.toContain(UNUSED_REDIS_URL);
  });
});
