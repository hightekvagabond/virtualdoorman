/**
 * Cross-workspace import guard: `@virtualdoorman/types` must be usable from
 * the app as TypeScript source, with no build step. The real assertions here
 * are compile-time — `yarn typecheck` fails if any of these shapes drift.
 */
import type {
  Command,
  CommandAck,
  Config,
  Entry,
  EntryData,
  Property,
} from '@virtualdoorman/types';

const property: Property = {
  name: 'north-tower',
  display_name: 'North Tower',
  bucket: 'virtualdoorman-entries',
  prefix: 'properties/north-tower',
};

const entry: Entry = {
  entry_id: '6f1b2f3e-0d4a-4a4e-9c4b-2f9a4b8c1d2e',
  property: property.name,
  timestamp_utc: '2026-02-01T17:04:05.123Z',
  device_id: 'tablet-01',
  ocr_raw: 'JANE Q PUBLIC\nDL 1234567',
  form_fields: { visiting: 'Unit 402' },
  cv_confidence: 0.92,
  upload_status: 'queued',
  app_version: '1.0',
  booking_system: null,
};

const entryData: EntryData = { schema_version: 1, entry };

const config: Config = {
  schema_version: 1,
  property: property.name,
  screensaver_text: 'Touch to check in',
  thank_you_text: 'Thank you, someone will be right with you.',
  form_fields: [
    {
      id: 'visiting',
      label: 'Who are you visiting?',
      type: 'text',
      order: 1,
      required: true,
    },
  ],
  poll_interval_minutes: 20,
  notifications: { enabled: false, email_recipients: [], sms_recipients: null },
  cv_confidence_threshold: 0.8,
  booking_system: null,
};

const commands: Command[] = [
  {
    type: 'unpair',
    command_id: 'c1',
    device_id: 'tablet-01',
    issued_at_utc: '2026-02-01T17:00:00.000Z',
  },
  {
    type: 'reset',
    command_id: 'c2',
    device_id: 'tablet-01',
    issued_at_utc: '2026-02-01T17:00:00.000Z',
  },
  {
    type: 'update-pin',
    command_id: 'c3',
    device_id: 'tablet-01',
    issued_at_utc: '2026-02-01T17:00:00.000Z',
    payload: { pin: '4821' },
  },
  {
    type: 'repair',
    command_id: 'c4',
    device_id: 'tablet-01',
    issued_at_utc: '2026-02-01T17:00:00.000Z',
  },
];

const ack: CommandAck = {
  command_id: 'c3',
  device_id: 'tablet-01',
  status: 'acknowledged',
  acknowledged_at_utc: '2026-02-01T17:00:10.000Z',
};

/** Narrowing on `type` must give access to command-specific payloads. */
function pinFromCommand(command: Command): string | null {
  return command.type === 'update-pin' ? command.payload.pin : null;
}

describe('@virtualdoorman/types', () => {
  it('is importable from the app workspace', () => {
    expect(entryData.entry.entry_id).toBe(entry.entry_id);
    expect(config.form_fields[0]?.id).toBe('visiting');
    expect(property.prefix).toBe('properties/north-tower');
  });

  it('models commands as a union discriminated by type', () => {
    expect(commands.map(pinFromCommand)).toEqual([null, null, '4821', null]);
    expect(ack.status).toBe('acknowledged');
  });

  it('keeps the stubbed booking-system fields null in v1', () => {
    expect(entry.booking_system).toBeNull();
    expect(config.booking_system).toBeNull();
  });
});
