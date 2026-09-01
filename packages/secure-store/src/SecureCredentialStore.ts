/**
 * SecureCredentialStore
 *
 * Wraps react-native-keychain to store AWS credentials exclusively in the
 * Android Keystore (hardware-backed on API 23+). The JS layer never holds
 * raw credential values after the initial write from the QR pairing payload.
 *
 * Minimum supported Android API: 23 (Marshmallow).
 * Devices below API 23 are refused at pairing time — see isPlatformSupported().
 */
import * as Keychain from 'react-native-keychain';
import { Platform } from 'react-native';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  property: string;
}

const SERVICE_KEY = 'VIRTUAL_DOORMAN_AWS_v1';
const MIN_ANDROID_API = 23;

/**
 * Returns true if the platform supports hardware-backed Keystore storage.
 * On Android < API 23, credentials cannot be stored securely — refuse pairing.
 */
export async function isPlatformSupported(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // iOS uses Secure Enclave — always supported for our purposes
    return true;
  }
  return Platform.Version >= MIN_ANDROID_API;
}

/**
 * Store AWS credentials in the Android Keystore.
 * Call this exactly once at pairing time, immediately after QR decode.
 * Zero the pairing payload from memory after calling this.
 *
 * @throws if the platform does not support hardware-backed storage
 * @throws if Keychain write fails
 */
export async function storeCredentials(creds: AwsCredentials): Promise<void> {
  if (!(await isPlatformSupported())) {
    throw new Error(
      `Android API ${Platform.Version} is below minimum ${MIN_ANDROID_API}. ` +
        'Hardware-backed Keystore is not available. Pairing refused.',
    );
  }

  const payload = JSON.stringify(creds);

  await Keychain.setGenericPassword(
    SERVICE_KEY, // username field — used as the key name
    payload, // password field — holds the JSON blob
    {
      service: SERVICE_KEY,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    },
  );
}

/**
 * Load stored credentials.
 * Returns null if no credentials are stored (tablet is unpaired).
 *
 * Never cache the return value in module scope — always call loadCredentials()
 * at the point of use so credentials are held in memory for the shortest
 * possible time.
 */
export async function loadCredentials(): Promise<AwsCredentials | null> {
  const result = await Keychain.getGenericPassword({
    service: SERVICE_KEY,
  });

  if (!result || result === false) {
    return null;
  }

  try {
    return JSON.parse(result.password) as AwsCredentials;
  } catch {
    // Corrupted entry — treat as unpaired
    return null;
  }
}

/**
 * Clear all stored credentials.
 * Call on unpair, factory reset, or S3 reset command.
 * This is the FIRST step of any reset flow — credentials must be gone
 * before any other reset action proceeds.
 */
export async function clearCredentials(): Promise<void> {
  await Keychain.resetGenericPassword({
    service: SERVICE_KEY,
  });
}

/**
 * Returns true if the tablet currently holds stored credentials.
 * Does NOT return the credentials themselves — use loadCredentials() for that.
 */
export async function isPaired(): Promise<boolean> {
  const creds = await loadCredentials();
  return creds !== null;
}
