/**
 * `@virtualdoorman/types` — shared, runtime-free type definitions for the
 * documents the tablet app and the master admin app exchange.
 *
 * Consumed as TypeScript source (no build step): the workspace `main` points
 * at `src/index.ts` and Metro/tsconfig paths resolve it directly.
 */

export type {
  Entry,
  EntryData,
  EntryDataSchemaVersion,
  EntryFormFields,
  UploadStatus,
} from './entry';
export type {
  Config,
  ConfigSchemaVersion,
  FormFieldConfig,
  FormFieldType,
  NotificationsConfig,
} from './config';
export type {
  Command,
  CommandAck,
  CommandAckStatus,
  CommandBase,
  CommandType,
  RepairCommand,
  ResetCommand,
  UnpairCommand,
  UpdatePinCommand,
} from './command';
export type { Property, PropertyPrefixInput } from './property';
