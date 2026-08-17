/**
 * Remote configuration — the `config.json` document the master admin app
 * publishes and each paired tablet polls for.
 *
 * Everything an admin can reword lives here rather than in the i18n
 * catalogues: i18n covers app chrome, `config.json` covers per-property copy.
 */

/** Input widget a form field renders as. */
export type FormFieldType = 'text' | 'email' | 'phone' | 'number' | 'date';

/** One admin-defined question on the check-in form. */
export interface FormFieldConfig {
  /** Stable key; also the key used in {@link Entry.form_fields}. */
  id: string;
  /** Label shown to the visitor — admin-authored copy, never an i18n key. */
  label: string;
  type: FormFieldType;
  /** Ascending display order; ties fall back to array order. */
  order: number;
  required: boolean;
}

/** Outbound notification settings. Off by default. */
export interface NotificationsConfig {
  enabled: boolean;
  /** Addresses notified on new entries; empty while `enabled` is false. */
  email_recipients: string[];
  // FUTURE: SMS recipients / webhook targets once a provider is chosen.
  sms_recipients: null;
}

/** Schema version of the `config.json` document. */
export type ConfigSchemaVersion = 1;

/** The `config.json` document exactly as published to S3. */
export interface Config {
  schema_version: ConfigSchemaVersion;
  /** Property this config belongs to (see {@link Property.name}). */
  property: string;
  /** Copy shown on the idle/screensaver screen — admin-authored. */
  screensaver_text: string;
  /** Copy shown after a successful check-in — admin-authored. */
  thank_you_text: string;
  form_fields: FormFieldConfig[];
  /** How often the tablet polls for config/commands. Default: 20. */
  poll_interval_minutes: number;
  notifications: NotificationsConfig;
  /** Minimum {@link Entry.cv_confidence} to accept a capture without a retry prompt, 0..1. */
  cv_confidence_threshold: number;
  // FUTURE: booking-system integration (provider + credentials reference).
  booking_system: null;
}
