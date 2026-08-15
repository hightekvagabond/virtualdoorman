/**
 * Typed accessor over the build-time environment.
 *
 * `react-native-config` bakes `.env.development` (debug builds) or
 * `.env.production` (release builds) into the APK. Nothing else in the app
 * should import `react-native-config` directly: read {@link env} instead, so
 * missing or malformed keys fail loudly at startup rather than as `undefined`
 * deep in a screen.
 *
 * Secrets never live here — AWS credentials arrive through QR pairing and go
 * straight to the Android Keystore (security ticket).
 */
import Config from 'react-native-config';

export const ENV_NAMES = ['development', 'production'] as const;
export type EnvName = (typeof ENV_NAMES)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Env {
  /** Which `.env` file this build was compiled with. */
  readonly ENV_NAME: EnvName;
  /** Minimum severity the app logs at. */
  readonly LOG_LEVEL: LogLevel;
}

/** Raw, unvalidated key/value pairs as handed over by the native module. */
export type RawEnv = Record<string, string | undefined>;

/**
 * Reads `key` from `source` and checks it against `allowed`.
 * Throws — deliberately — so a misconfigured build never boots half-working.
 */
function readEnum<T extends string>(
  source: RawEnv,
  key: string,
  allowed: readonly T[],
): T {
  const raw = source[key];

  if (raw === undefined || raw === '') {
    throw new Error(
      `Missing environment key "${key}". Check apps/doorman/.env.development and .env.production.`,
    );
  }

  const match = allowed.find(candidate => candidate === raw);
  if (match === undefined) {
    throw new Error(
      `Invalid environment key "${key}": expected one of ${allowed.join(
        ', ',
      )}, got "${raw}".`,
    );
  }

  return match;
}

/** Validates the raw native config into a typed {@link Env}. */
export function parseEnv(source: RawEnv): Env {
  return Object.freeze({
    ENV_NAME: readEnum(source, 'ENV_NAME', ENV_NAMES),
    LOG_LEVEL: readEnum(source, 'LOG_LEVEL', LOG_LEVELS),
  });
}

/** Validated, frozen view of this build's environment. */
export const env: Env = parseEnv(Config as RawEnv);
