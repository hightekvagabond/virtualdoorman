# Credential Storage

## Why Android Keystore?

Virtual Doorman stores AWS credentials (Access Key ID + Secret Access Key)
exclusively in the **Android Keystore system** via `react-native-keychain`.

Credentials are **never** stored in:
- `AsyncStorage`
- `MMKV`
- Shared Preferences
- Any plaintext file on the filesystem
- Environment variables or bundled config

This means `adb shell` + filesystem inspection will find no plaintext credentials
anywhere on the device. The Keystore holds the secrets; the app retrieves them
at runtime only when an upload is about to occur.

## Minimum Android API

**API 23 (Android 6.0 Marshmallow)** is the minimum supported version.

Devices below API 23 lack hardware-backed Keystore support. If a tablet running
an older Android version attempts to pair, the app will display a clear error
and refuse to store credentials. Do not deploy on pre-API-23 hardware.

## How credentials reach the device

1. The **master app** (owner's phone) generates a QR code containing:
   ```json
   {
     "accessKeyId": "...",
     "secretAccessKey": "...",
     "bucket": "my-hostel-bucket",
     "region": "us-east-1",
     "property": "hostel-main"
   }
   ```
2. The **kiosk tablet** scans the QR code.
3. `storeCredentials()` is called immediately — the payload is written to
   Keystore and zeroed from memory.
4. The QR payload is **never logged**, never sent over the network, and
   never written to disk outside the Keystore entry.

## Service key versioning

The Keystore entry is tagged `VIRTUAL_DOORMAN_AWS_v1`. If the credential
schema changes in a future version, a new service key (`_v2`, etc.) will
be introduced and a migration path provided.

## Unpair / factory reset

`clearCredentials()` is the **first step** of any reset flow. It calls
`Keychain.resetGenericPassword()` which instructs the Keystore to delete
the entry. After this call, `loadCredentials()` returns `null` and
`isPaired()` returns `false`.

This is called:
- When the owner initiates unpair from the master app (via S3 command file)
- When the admin triggers factory reset from the emergency PIN screen
- Before any re-pair / QR scan sequence

## Using credentials in code

Always call `loadCredentials()` at the point of use. Never cache credentials
in module scope or component state:

```typescript
import { loadCredentials } from '@virtualdoorman/secure-store';

async function uploadEntry(entry: EntryData) {
  const creds = await loadCredentials();
  if (!creds) {
    // Tablet is unpaired — queue for later
    await offlineQueue.enqueue(entry);
    return;
  }
  // Use creds here — they leave memory when this function returns
  const s3 = buildS3Client(creds);
  await s3.putObject(...);
}
```

## Audit

All credential operations (store, load, clear) are logged to the on-device
audit log (timestamps only, no values). Emergency access events that involve
credentials are also written to S3 as audit entries.
