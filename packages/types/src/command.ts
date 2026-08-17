/**
 * Recovery commands — small documents the master admin app drops in S3 for a
 * tablet to pick up on its next poll, plus the acknowledgement it writes back.
 */

/** Fields every command carries, whatever its `type`. */
export interface CommandBase {
  /** UUID v4; also the ack correlation id. */
  command_id: string;
  /** Device the command targets (see {@link Property}/pairing). */
  device_id: string;
  /** ISO-8601 UTC instant the admin issued the command. */
  issued_at_utc: string;
}

/** Forget the pairing and return to the QR pairing screen. */
export interface UnpairCommand extends CommandBase {
  type: 'unpair';
}

/** Wipe local state (queued entries included) and restart onboarding. */
export interface ResetCommand extends CommandBase {
  type: 'reset';
}

/** Replace the admin PIN that unlocks kiosk mode. */
export interface UpdatePinCommand extends CommandBase {
  type: 'update-pin';
  payload: {
    /** New admin PIN; stored in the Android Keystore, never in `config.json`. */
    pin: string;
  };
}

/** Re-fetch credentials/config without losing queued entries. */
export interface RepairCommand extends CommandBase {
  type: 'repair';
}

/** Every recovery command, discriminated by `type`. */
export type Command =
  | UnpairCommand
  | ResetCommand
  | UpdatePinCommand
  | RepairCommand;

/** The `type` discriminant of {@link Command}. */
export type CommandType = Command['type'];

/** Outcome a device reports back for a command. */
export type CommandAckStatus = 'acknowledged' | 'failed';

/** Acknowledgement document written by the device after handling a command. */
export interface CommandAck {
  command_id: string;
  device_id: string;
  status: CommandAckStatus;
  /** ISO-8601 UTC instant the device finished handling the command. */
  acknowledged_at_utc: string;
  /**
   * Failure detail; present only when `status` is `'failed'`.
   *
   * Explicitly `| undefined` because the repo runs `exactOptionalPropertyTypes`:
   * without it, the natural `error: err?.message` assignment is a type error
   * and the next ticket would be tempted to relax the compiler flag instead.
   */
  error?: string | undefined;
}
