/**
 * Entry records — the `data.json` document written next to every captured ID
 * photo and mirrored to S3 by the sync ticket.
 *
 * Field names are snake_case on purpose: they are the wire/on-disk shape, not
 * an internal view model.
 */

/** Lifecycle of an entry's upload to S3. */
export type UploadStatus = 'queued' | 'uploaded' | 'failed';

/**
 * Answers to the admin-configured form, keyed by `FormFieldConfig.id`.
 * Values are always strings — the form renders text-ish inputs and the
 * admin app is responsible for interpreting them.
 */
export type EntryFormFields = Readonly<Record<string, string>>;

/** A single visitor check-in. */
export interface Entry {
  /** UUID v4 generated on device; also the S3 object key stem. */
  entry_id: string;
  /** Property this device is paired to (see {@link Property.name}). */
  property: string;
  /** ISO-8601 UTC instant of capture, e.g. `2026-02-01T17:04:05.123Z`. */
  timestamp_utc: string;
  /** Stable per-device identifier assigned at pairing. */
  device_id: string;
  /** Raw OCR text as returned by the recognizer; `null` when OCR produced nothing. */
  ocr_raw: string | null;
  /** Admin-configured form answers keyed by field id. */
  form_fields: EntryFormFields;
  /** Recognizer confidence for the capture, 0..1. */
  cv_confidence: number;
  /** Where this entry is in the offline upload queue. */
  upload_status: UploadStatus;
  /** `versionName` of the APK that produced the entry. */
  app_version: string;
  // FUTURE: booking-system integration (match an entry to a reservation).
  // Stubbed as `null` so v1 documents already carry the key.
  booking_system: null;
}

/** Schema version of the `data.json` document. */
export type EntryDataSchemaVersion = 1;

/** The `data.json` document exactly as written to disk / S3. */
export interface EntryData {
  schema_version: EntryDataSchemaVersion;
  entry: Entry;
}
