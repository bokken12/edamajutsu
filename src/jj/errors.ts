import { Data } from 'effect';

// Tagged errors for the jj driver layer. Effect lets us match on `_tag` in
// callers, replacing the `err instanceof Error ? err.message : String(err)`
// dance the codebase repeated in five places. Each error carries the inputs
// that produced it so the caller can format a user-facing message without
// reaching back into the throwing scope.

export type JjResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
};

// Spawning the jj binary itself failed — typically because `jj` is not on
// PATH. The original cause is preserved so the UI can match on ENOENT to
// surface the "install jj" hint.
export class JjSpawnError extends Data.TaggedError('JjSpawnError')<{
  readonly binary: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `failed to spawn ${this.binary}: ${formatCause(this.cause)}`;
  }
}

// jj exited non-zero (or on a signal). Carries the exact argv and the captured
// output so error messages can show both — same shape as the original
// JjCommandError, just with the discriminator tag.
export class JjCommandFailed extends Data.TaggedError('JjCommandFailed')<{
  readonly args: ReadonlyArray<string>;
  readonly result: JjResult;
}> {
  override get message(): string {
    const exit =
      this.result.signal !== null
        ? `signal ${this.result.signal}`
        : `code ${this.result.exitCode}`;
    const tail =
      [
        this.result.stderr.trim() && `stderr: ${this.result.stderr.trim()}`,
        this.result.stdout.trim() && `stdout: ${this.result.stdout.trim()}`
      ]
        .filter(Boolean)
        .join('\n') || '(no output)';
    return `jj ${this.args.join(' ')} exited with ${exit}\n${tail}`;
  }
}

// Caller supplied an invalid value to a driver method (e.g. a negative limit).
// Caught at the driver boundary rather than letting the underlying jj process
// fail with a less-actionable error.
export class JjValidationError extends Data.TaggedError('JjValidationError')<{
  readonly message: string;
}> {}

// jj returned successfully but the records we expected to be there weren't.
// Surfaces in the same place a driver call's data is consumed, so each view
// can include the missing-record case in its catch-all error rendering.
export class JjUnexpectedOutput extends Data.TaggedError('JjUnexpectedOutput')<{
  readonly message: string;
}> {}

// All errors the driver layer can surface. Re-exported here so callers can
// `import type { JjDriverError } from './errors'` without listing each variant.
export type JjDriverError =
  | JjSpawnError
  | JjCommandFailed
  | JjValidationError
  | JjParseError
  | JjUnexpectedOutput;

// Parse-layer error. Kept in this module rather than parse.ts so all
// driver-domain errors share one home and parse.ts stays purely concerned with
// decoding.
export class JjParseError extends Data.TaggedError('JjParseError')<{
  readonly message: string;
  readonly raw: string;
}> {}

// Format a thrown value's message defensively. The driver's spawn path can
// receive Node's `Error` (with `.code`), but we don't trust the type.
function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}
