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
