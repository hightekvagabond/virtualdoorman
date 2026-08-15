/**
 * The env accessor must fail loudly on a misconfigured build rather than
 * handing screens `undefined`.
 */
import { env, parseEnv } from '../src/config/env';

describe('parseEnv', () => {
  it('accepts a well-formed environment', () => {
    expect(parseEnv({ ENV_NAME: 'production', LOG_LEVEL: 'warn' })).toEqual({
      ENV_NAME: 'production',
      LOG_LEVEL: 'warn',
    });
  });

  it('throws when a key is missing or empty', () => {
    expect(() => parseEnv({ LOG_LEVEL: 'warn' })).toThrow(/ENV_NAME/);
    expect(() => parseEnv({ ENV_NAME: '', LOG_LEVEL: 'warn' })).toThrow(
      /ENV_NAME/,
    );
  });

  it('throws when a key is outside the allowed values', () => {
    expect(() => parseEnv({ ENV_NAME: 'staging', LOG_LEVEL: 'warn' })).toThrow(
      /expected one of development, production/,
    );
  });

  it('exposes the values baked into this build', () => {
    expect(env.ENV_NAME).toBe('development');
    expect(env.LOG_LEVEL).toBe('debug');
  });
});
