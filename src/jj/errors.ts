// Tagged errors for the jj layer. Each variant carries a discriminator
// (`_tag`) so callers can match by tag instead of grepping error messages —
// the `/\bENOENT\b/` regex in the view error renderers and the repeated
// `err instanceof Error ? err.message : String(err)` dance both go away.
//
// All variants extend Error so they remain throwable, keep a useful stack,
// and play nicely with vitest's `.toThrow(Class)` assertions. The data each
// variant carries (args, result, etc.) sits on `readonly` instance fields,
// so callers that want more than the rendered message can still get at it.

import type { JjResult } from './driver';

// Spawning the jj binary itself failed — almost always because `jj` is not
// on PATH. The original cause (a Node `Error`, typically `.code = 'ENOENT'`)
// is preserved so anyone who wants to inspect it still can; views check the
// _tag to render the "install jj" hint without going near the message.
export class JjSpawnError extends Error {
  readonly _tag = 'JjSpawnError';
  constructor(
    readonly binary: string,
    override readonly cause: unknown
  ) {
    super(`failed to spawn ${binary}: ${formatCause(cause)}`);
    this.name = 'JjSpawnError';
  }
}

// jj exited non-zero (or on a signal). Same data the old JjCommandError
// carried — just renamed and given the _tag discriminator.
export class JjCommandFailed extends Error {
  readonly _tag = 'JjCommandFailed';
  constructor(
    readonly args: ReadonlyArray<string>,
    readonly result: JjResult
  ) {
    const exit =
      result.signal !== null ? `signal ${result.signal}` : `code ${result.exitCode}`;
    const tail =
      [
        result.stderr.trim() && `stderr: ${result.stderr.trim()}`,
        result.stdout.trim() && `stdout: ${result.stdout.trim()}`
      ]
        .filter(Boolean)
        .join('\n') || '(no output)';
    super(`jj ${args.join(' ')} exited with ${exit}\n${tail}`);
    this.name = 'JjCommandFailed';
  }
}

// Caller supplied an invalid value to a driver method (e.g. a non-integer
// limit). Caught at the driver boundary so the message points at the bad
// input rather than at a downstream jj failure.
export class JjValidationError extends Error {
  readonly _tag = 'JjValidationError';
  constructor(message: string) {
    super(message);
    this.name = 'JjValidationError';
  }
}

// Parsing jj's stdout failed. Raised from parse.ts; the raw line that
// triggered the failure is kept for debugging.
export class JjParseError extends Error {
  readonly _tag = 'JjParseError';
  constructor(
    message: string,
    readonly raw: string
  ) {
    super(message);
    this.name = 'JjParseError';
  }
}

// jj returned successfully but the records we expected to be there weren't
// — e.g. `jj log -r @ -n 1` came back empty. Distinct from a parse failure
// because the bytes were well-formed; the *shape* of the response is wrong.
export class JjUnexpectedOutput extends Error {
  readonly _tag = 'JjUnexpectedOutput';
  constructor(message: string) {
    super(message);
    this.name = 'JjUnexpectedOutput';
  }
}

// The union every jj-layer caller deals with. Anything thrown by the driver,
// the parser, or our validation path is one of these.
export type JjError =
  | JjSpawnError
  | JjCommandFailed
  | JjValidationError
  | JjParseError
  | JjUnexpectedOutput;

// Single canonical "what should the UI show" formatter. Replaces the eight
// copies of `err instanceof Error ? err.message : String(err)` scattered
// across the views and AppContext. Accepts `unknown` so the catch-clause
// boundary doesn't need to do its own narrowing.
export function formatJjError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}
