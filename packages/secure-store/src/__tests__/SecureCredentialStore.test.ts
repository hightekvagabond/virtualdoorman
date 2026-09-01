/**
 * SecureCredentialStore tests
 *
 * react-native-keychain is mocked — these tests verify the store/load/clear
 * contract, the null-on-unpaired path, and the API-23 platform guard.
 */
import * as Keychain from 'react-native-keychain';
import { Platform } from 'react-native';
import {
  storeCredentials,
  loadCredentials,
  clearCredentials,
  isPaired,
  isPlatformSupported,
  AwsCredentials,
} from '../SecureCredentialStore';

jest.mock('react-native-keychain');

const mockKeychain = Keychain as jest.Mocked<typeof Keychain>;

const testCreds: AwsCredentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'my-hostel-bucket',
  region: 'us-east-1',
  property: 'hostel-main',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: Android API 29, hardware-backed
  Platform.OS = 'android';
  (Platform as any).Version = 29;
});

describe('isPlatformSupported', () => {
  it('returns true on Android API 23', async () => {
    (Platform as any).Version = 23;
    expect(await isPlatformSupported()).toBe(true);
  });

  it('returns false on Android API 22', async () => {
    (Platform as any).Version = 22;
    expect(await isPlatformSupported()).toBe(false);
  });

  it('returns true on iOS regardless of version', async () => {
    Platform.OS = 'ios';
    expect(await isPlatformSupported()).toBe(true);
  });
});

describe('storeCredentials', () => {
  it('writes JSON blob to Keychain', async () => {
    mockKeychain.setGenericPassword.mockResolvedValue(true as any);
    await storeCredentials(testCreds);
    expect(mockKeychain.setGenericPassword).toHaveBeenCalledWith(
      'VIRTUAL_DOORMAN_AWS_v1',
      JSON.stringify(testCreds),
      expect.objectContaining({ service: 'VIRTUAL_DOORMAN_AWS_v1' }),
    );
  });

  it('throws on Android < API 23', async () => {
    (Platform as any).Version = 21;
    await expect(storeCredentials(testCreds)).rejects.toThrow(
      'Hardware-backed Keystore is not available',
    );
    expect(mockKeychain.setGenericPassword).not.toHaveBeenCalled();
  });
});

describe('loadCredentials', () => {
  it('returns credentials when stored', async () => {
    mockKeychain.getGenericPassword.mockResolvedValue({
      service: 'VIRTUAL_DOORMAN_AWS_v1',
      username: 'VIRTUAL_DOORMAN_AWS_v1',
      password: JSON.stringify(testCreds),
      storage: '',
    });
    const result = await loadCredentials();
    expect(result).toEqual(testCreds);
  });

  it('returns null when nothing stored', async () => {
    mockKeychain.getGenericPassword.mockResolvedValue(false);
    expect(await loadCredentials()).toBeNull();
  });

  it('returns null on corrupted entry', async () => {
    mockKeychain.getGenericPassword.mockResolvedValue({
      service: 'VIRTUAL_DOORMAN_AWS_v1',
      username: 'VIRTUAL_DOORMAN_AWS_v1',
      password: 'not-valid-json{{{',
      storage: '',
    });
    expect(await loadCredentials()).toBeNull();
  });
});

describe('clearCredentials', () => {
  it('calls resetGenericPassword', async () => {
    mockKeychain.resetGenericPassword.mockResolvedValue(true);
    await clearCredentials();
    expect(mockKeychain.resetGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'VIRTUAL_DOORMAN_AWS_v1' }),
    );
  });
});

describe('isPaired', () => {
  it('returns true when credentials exist', async () => {
    mockKeychain.getGenericPassword.mockResolvedValue({
      service: 'VIRTUAL_DOORMAN_AWS_v1',
      username: 'VIRTUAL_DOORMAN_AWS_v1',
      password: JSON.stringify(testCreds),
      storage: '',
    });
    expect(await isPaired()).toBe(true);
  });

  it('returns false when unpaired', async () => {
    mockKeychain.getGenericPassword.mockResolvedValue(false);
    expect(await isPaired()).toBe(false);
  });
});
