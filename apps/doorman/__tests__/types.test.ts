/**
 * Cross-workspace import guard: `@virtualdoorman/types` must be usable from
 * the app as TypeScript source, with no build step. The real assertions here
 * are compile-time — `yarn typecheck` fails if any of these shapes drift.
 *
 * Every name the barrel exports is imported here and bound to a value below.
 * `noUnusedLocals` makes that binding mandatory, so dropping an export from
 * `packages/types/src/index.ts` fails this file's typecheck instead of going
 * unnoticed until the ticket that needs it.
 */
import type {
  Command,
  CommandAck,
  CommandAckStatus,
  CommandBase,
  CommandType,
  Config,
  ConfigSchemaVersion,
  Entry,
  EntryData,
  EntryDataSchemaVersion,
  EntryFormFields,
  FormFieldConfig,
  FormFieldType,
  NotificationsConfig,
  Property,
  PropertyPrefixInput,
  RepairCommand,
  ResetCommand,
  UnpairCommand,
  UpdatePinCommand,
  UploadStatus,
} from '@virtualdoorman/types';

const property: Property = {
  name: 'north-tower',
  display_name: 'North Tower',
  bucket: 'virtualdoorman-entries',
  prefix: 'properties/north-tower',
};

const prefixInput: PropertyPrefixInput = {
  property,
  device_id: 'tablet-01',
  timestamp_utc: '2026-02-01T17:04:05.123Z',
};

const formFields: EntryFormFields = { visiting: 'Unit 402' };

const uploadStatuses: UploadStatus[] = ['queued', 'uploaded', 'failed'];

const entrySchemaVersion: EntryDataSchemaVersion = 1;

const entry: Entry = {
  entry_id: '6f1b2f3e-0d4a-4a4e-9c4b-2f9a4b8c1d2e',
  property: property.name,
  timestamp_utc: prefixInput.timestamp_utc,
  device_id: 'tablet-01',
  ocr_raw: 'JANE Q PUBLIC\nDL 1234567',
  form_fields: formFields,
  cv_confidence: 0.92,
  upload_status: 'queued',
  app_version: '1.0',
  booking_system: null,
};

const entryData: EntryData = { schema_version: entrySchemaVersion, entry };

const formFieldTypes: FormFieldType[] = [
  'text',
  'email',
  'phone',
  'number',
  'date',
];

const formField: FormFieldConfig = {
  id: 'visiting',
  label: 'Who are you visiting?',
  type: 'text',
  order: 1,
  required: true,
};

const notifications: NotificationsConfig = {
  enabled: false,
  email_recipients: [],
  sms_recipients: null,
};

const configSchemaVersion: ConfigSchemaVersion = 1;

const config: Config = {
  schema_version: configSchemaVersion,
  property: property.name,
  screensaver_text: 'Touch to check in',
  thank_you_text: 'Thank you, someone will be right with you.',
  form_fields: [formField],
  poll_interval_minutes: 20,
  notifications,
  cv_confidence_threshold: 0.8,
  booking_system: null,
};

/** Shared by every command below; also pins {@link CommandBase}'s shape. */
const commandBase: CommandBase = {
  command_id: 'c0',
  device_id: 'tablet-01',
  issued_at_utc: '2026-02-01T17:00:00.000Z',
};

const unpair: UnpairCommand = {
  ...commandBase,
  command_id: 'c1',
  type: 'unpair',
};
const reset: ResetCommand = { ...commandBase, command_id: 'c2', type: 'reset' };
const updatePin: UpdatePinCommand = {
  ...commandBase,
  command_id: 'c3',
  type: 'update-pin',
  payload: { pin: '4821' },
};
const repair: RepairCommand = {
  ...commandBase,
  command_id: 'c4',
  type: 'repair',
};

const commands: Command[] = [unpair, reset, updatePin, repair];

const commandTypes: CommandType[] = ['unpair', 'reset', 'update-pin', 'repair'];

const ackStatuses: CommandAckStatus[] = ['acknowledged', 'failed'];

const ack: CommandAck = {
  command_id: 'c3',
  device_id: 'tablet-01',
  status: 'acknowledged',
  acknowledged_at_utc: '2026-02-01T17:00:10.000Z',
};

/**
 * Builds a failed ack the way a caller actually will: the detail comes from
 * something that may be `undefined` (`err?.message`). A *parameter* is used
 * rather than a local const because TypeScript narrows an initialised const
 * back to `string`, which would hide the very thing this guards —
 * `exactOptionalPropertyTypes` rejects assigning `string | undefined` to a
 * plain `error?: string`, so this is what pins `CommandAck.error`'s
 * `| undefined`.
 */
function failedAckFor(error: string | undefined): CommandAck {
  return {
    command_id: 'c4',
    device_id: 'tablet-01',
    status: 'failed',
    acknowledged_at_utc: '2026-02-01T17:00:11.000Z',
    error,
  };
}

const failureDetail = 'S3 upload rejected the credentials';
const failedAck = failedAckFor(failureDetail);

/** Narrowing on `type` must give access to command-specific payloads. */
function pinFromCommand(command: Command): string | null {
  return command.type === 'update-pin' ? command.payload.pin : null;
}

describe('@virtualdoorman/types', () => {
  it('is importable from the app workspace', () => {
    expect(entryData.entry.entry_id).toBe(entry.entry_id);
    expect(config.form_fields[0]?.id).toBe('visiting');
    expect(property.prefix).toBe('properties/north-tower');
    expect(prefixInput.property.bucket).toBe('virtualdoorman-entries');
  });

  // Every other import here is `import type`, which Babel erases — so nothing
  // above actually asks Jest (or Metro) to *resolve* the package. This does:
  // a stale `moduleNameMapper` in jest.config.js is a hard failure, not a
  // silent fallback, so without this the mapper could rot unnoticed until the
  // first ticket that needs runtime code from the package.
  it('resolves at runtime, not just at compile time', () => {
    const runtimeModule: unknown = require('@virtualdoorman/types');

    // Type-only package: the module is real but carries no runtime exports.
    expect(runtimeModule).toBeDefined();
  });

  it('models commands as a union discriminated by type', () => {
    expect(commands.map(pinFromCommand)).toEqual([null, null, '4821', null]);
    expect(commands.map(command => command.type)).toEqual(commandTypes);
    expect(ack.status).toBe('acknowledged');
  });

  it('carries failure detail on a failed ack', () => {
    expect(ackStatuses).toContain(failedAck.status);
    expect(failedAck.error).toBe(failureDetail);
    expect(ack.error).toBeUndefined();
  });

  it('enumerates the value sets later tickets switch on', () => {
    expect(uploadStatuses).toContain(entry.upload_status);
    expect(formFieldTypes).toContain(formField.type);
    expect(notifications.enabled).toBe(false);
  });

  it('keeps the stubbed booking-system fields null in v1', () => {
    expect(entry.booking_system).toBeNull();
    expect(config.booking_system).toBeNull();
  });
});
