import { describe, expect, it } from 'vitest';
import {
  assertProductionReady,
  describeAppConfig,
  loadAppConfig,
  ProductionConfigError,
} from './app-config';

const COMPLETE = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://kubolesie:s3cret@db:5432/kubolesie',
  VK_GROUP_ID: '111',
  VK_GROUP_TOKEN: 'test-token',
  VK_CALLBACK_SECRET: 'test-secret',
  VK_CONFIRMATION_CODE: 'confirm-code',
  VK_API_VERSION: '5.199',
  PORT: '8080',
  HOST: '0.0.0.0',
  APP_COMMIT_SHA: 'abc123',
};

describe('production app config', () => {
  it('fails production without DATABASE_URL', () => {
    const config = loadAppConfig({ ...COMPLETE, DATABASE_URL: '' });
    expect(() => assertProductionReady(config)).toThrow(ProductionConfigError);
    expect(() => assertProductionReady(config)).toThrow(/DATABASE_URL/);
  });

  it('fails production without VK token', () => {
    expect(() => assertProductionReady(loadAppConfig({ ...COMPLETE, VK_GROUP_TOKEN: '' }))).toThrow(
      /VK_GROUP_TOKEN/,
    );
  });

  it('fails production without callback secret', () => {
    expect(() =>
      assertProductionReady(loadAppConfig({ ...COMPLETE, VK_CALLBACK_SECRET: '' })),
    ).toThrow(/VK_CALLBACK_SECRET/);
  });

  it('fails production without confirmation code', () => {
    expect(() =>
      assertProductionReady(loadAppConfig({ ...COMPLETE, VK_CONFIRMATION_CODE: '' })),
    ).toThrow(/VK_CONFIRMATION_CODE/);
  });

  it('fails production without group id', () => {
    expect(() => assertProductionReady(loadAppConfig({ ...COMPLETE, VK_GROUP_ID: '' }))).toThrow(
      /VK_GROUP_ID/,
    );
  });

  it('passes production when the required set is present', () => {
    const config = loadAppConfig(COMPLETE);
    expect(() => assertProductionReady(config)).not.toThrow();
    expect(config.production).toBe(true);
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.vk.apiVersion).toBe('5.199');
    expect(config.mockApiEnabled).toBe(false);
  });

  it('allows injected fake config in non-production test mode', () => {
    const config = loadAppConfig({
      NODE_ENV: 'test',
      VK_GROUP_ID: '1',
      VK_GROUP_TOKEN: 'fake',
      VK_CALLBACK_SECRET: 'fake',
      VK_CONFIRMATION_CODE: 'fake',
    });
    expect(() => assertProductionReady(config)).not.toThrow();
    expect(config.production).toBe(false);
    expect(config.mockApiEnabled).toBe(true);
    expect(config.database.dbConfigured).toBe(false);
  });

  it('disables mock API in production even if ENABLE_MOCK_API=true', () => {
    const config = loadAppConfig({ ...COMPLETE, ENABLE_MOCK_API: 'true' });
    expect(config.mockApiEnabled).toBe(false);
  });

  it('does not leak secrets, tokens or DATABASE_URL in describeAppConfig', () => {
    const dumped = JSON.stringify(describeAppConfig(loadAppConfig(COMPLETE)));
    expect(dumped).not.toContain('test-token');
    expect(dumped).not.toContain('test-secret');
    expect(dumped).not.toContain('confirm-code');
    expect(dumped).not.toContain('s3cret');
    expect(dumped).not.toContain('postgresql://');
    expect(dumped).toContain('"vkConfigured":true');
    expect(dumped).toContain('"dbConfigured":true');
  });
});
