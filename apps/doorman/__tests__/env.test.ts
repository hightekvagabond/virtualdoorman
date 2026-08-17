/**
 * The env accessor must fail loudly on a misconfigured build rather than
 * handing screens `undefined`.
 */
import fs from 'fs';
import path from 'path';

import { env, parseEnv, type RawEnv } from '../src/config/env';

/**
 * Minimal `.env` reader mirroring the regex in
 * `node_modules/react-native-config/android/dotenv.gradle`, so this test reads
 * the committed files the same way the Gradle build does.
 */
function readEnvFile(fileName: string): RawEnv {
  const contents = fs.readFileSync(
    path.join(__dirname, '..', fileName),
    'utf8',
  );
  const parsed: Record<string, string> = {};

  for (const line of contents.split('\n')) {
    const match =
      /^\s*(?:export\s+|)([\w\d.\-_]+)\s*=\s*['"]?(.*?)?['"]?\s*$/.exec(line);

    if (match?.[1] !== undefined) {
      parsed[match[1]] = match[2] ?? '';
    }
  }

  return parsed;
}

/**
 * A valid environment, per key, plus a value that is not in that key's allowed
 * set. Every key is driven through the same cases: checking only `ENV_NAME`
 * would leave `LOG_LEVEL`'s validation free to be deleted with a green gate,
 * since `ENV_NAME` is evaluated first and throws before `LOG_LEVEL` is read.
 */
const VALID_ENV = { ENV_NAME: 'development', LOG_LEVEL: 'debug' } as const;

const KEY_CASES = [
  ['ENV_NAME', 'staging', 'development, production'],
  ['LOG_LEVEL', 'trace', 'debug, info, warn, error'],
] as const;

describe('parseEnv', () => {
  it('accepts a well-formed environment', () => {
    expect(parseEnv({ ENV_NAME: 'production', LOG_LEVEL: 'warn' })).toEqual({
      ENV_NAME: 'production',
      LOG_LEVEL: 'warn',
    });
  });

  describe.each(KEY_CASES)('%s', (key, badValue, allowed) => {
    it('throws when the key is absent', () => {
      const { [key]: _absent, ...rest } = VALID_ENV;

      // The message has to say *which* failure it is: matching only the key
      // name would let the missing-key branch be deleted, since an absent key
      // also trips the allowed-values branch.
      expect(() => parseEnv(rest)).toThrow(
        new RegExp(`Missing environment key "${key}"`),
      );
    });

    it('throws when the key is empty', () => {
      expect(() => parseEnv({ ...VALID_ENV, [key]: '' })).toThrow(
        new RegExp(`Missing environment key "${key}"`),
      );
    });

    it('throws when the key is outside the allowed values', () => {
      expect(() => parseEnv({ ...VALID_ENV, [key]: badValue })).toThrow(
        new RegExp(
          `Invalid environment key "${key}": expected one of ${allowed}, got "${badValue}"`,
        ),
      );
    });
  });

  it('exposes the values baked into this build', () => {
    expect(env.ENV_NAME).toBe('development');
    expect(env.LOG_LEVEL).toBe('debug');
  });
});

// Gradle bakes .env.development into debug builds and .env.production into
// release builds (apps/doorman/android/app/build.gradle). Adding a key to
// env.ts without adding it to both files would only surface as a crash on a
// real device, so the committed files are validated here instead.
describe('committed .env files', () => {
  it.each([
    ['.env.development', 'development'],
    ['.env.production', 'production'],
  ])('%s satisfies the env accessor', (fileName, expectedEnvName) => {
    const parsed = parseEnv(readEnvFile(fileName));

    expect(parsed.ENV_NAME).toBe(expectedEnvName);
  });
});
