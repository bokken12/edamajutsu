import { spawn } from 'child_process';
import { Context, Effect, Layer } from 'effect';

import { Change } from '../model/change';
import { FileChange } from '../model/fileChange';
import { Operation } from '../model/operation';
import {
  JjCommandFailed,
  JjDriverError,
  JjResult,
  JjSpawnError,
  JjValidationError
} from './errors';
import {
  GraphLine,
  parseDiffSummary,
  parseGraphLog,
  parseLogRecords,
  parseOpLogRecords
} from './parse';
import {
  DIFF_SUMMARY_TEMPLATE,
  LOG_GRAPH_TEMPLATE,
  LOG_TEMPLATE,
  OP_LOG_TEMPLATE
} from './templates';

export type { JjResult };

export type CommandOptions = {
  // When true, jj will snapshot the working copy before answering. Default
  // false — most reads should be passive.
  readonly snapshot?: boolean;
};

export type LogOptions = CommandOptions & {
  // Override the configured default revset. Leave undefined to use `revsets.log`.
  readonly revset?: string;
  // Cap on records returned. Maps to jj's `-n`. Must be a non-negative integer.
  readonly limit?: number;
};

export type DiffSummaryOptions = CommandOptions & {
  // Revset of changes to diff. Default: the working copy's own changes (jj's
  // own default for `jj diff` with no `-r`).
  readonly revset?: string;
};

// Driver-config Tag. Each command flow provides its own config (the repo
// resolved from the active workspace folder) via Layer.succeed.
export class JjConfig extends Context.Tag('edamajutsu/JjConfig')<
  JjConfig,
  { readonly repoRoot: string; readonly jjBinary: string }
>() {}

// The driver as an Effect Service. Methods return Effects with typed errors;
// callers either `yield* JjDriver` inside an Effect.gen, or construct one
// directly via `makeDriver` (used by tests).
export interface JjDriverOps {
  readonly run: (
    args: ReadonlyArray<string>,
    opts?: CommandOptions
  ) => Effect.Effect<JjResult, JjSpawnError>;
  readonly log: (opts?: LogOptions) => Effect.Effect<Change[], JjDriverError>;
  readonly logGraph: (opts?: LogOptions) => Effect.Effect<GraphLine[], JjDriverError>;
  readonly diffSummary: (
    opts?: DiffSummaryOptions
  ) => Effect.Effect<FileChange[], JjDriverError>;
  readonly opLog: (
    opts?: CommandOptions & { readonly limit?: number }
  ) => Effect.Effect<Operation[], JjDriverError>;
  readonly diffText: (
    opts: { readonly revset: string } & CommandOptions
  ) => Effect.Effect<string, JjDriverError>;
  readonly undo: () => Effect.Effect<void, JjDriverError>;
  readonly newChange: (message?: string) => Effect.Effect<void, JjDriverError>;
  readonly describe: (message: string) => Effect.Effect<void, JjDriverError>;
  readonly abandon: (revset: string) => Effect.Effect<void, JjDriverError>;
  readonly edit: (revset: string) => Effect.Effect<void, JjDriverError>;
  readonly createBookmark: (name: string, revset: string) => Effect.Effect<void, JjDriverError>;
  readonly setBookmark: (name: string, revset: string) => Effect.Effect<void, JjDriverError>;
  readonly listBookmarks: () => Effect.Effect<string[], JjDriverError>;
  readonly squashIntoParent: () => Effect.Effect<void, JjDriverError>;
  readonly redo: () => Effect.Effect<void, JjDriverError>;
  readonly duplicate: (revset: string) => Effect.Effect<void, JjDriverError>;
  readonly revert: (revset: string) => Effect.Effect<void, JjDriverError>;
  readonly deleteBookmark: (name: string) => Effect.Effect<void, JjDriverError>;
  readonly renameBookmark: (oldName: string, newName: string) => Effect.Effect<void, JjDriverError>;
  readonly forgetBookmark: (name: string) => Effect.Effect<void, JjDriverError>;
  readonly rebase: (opts: {
    readonly source: string;
    readonly destination: string;
  }) => Effect.Effect<void, JjDriverError>;
  readonly gitPush: () => Effect.Effect<void, JjDriverError>;
  readonly gitFetch: () => Effect.Effect<void, JjDriverError>;
  readonly absorb: () => Effect.Effect<void, JjDriverError>;
}

export class JjDriver extends Context.Tag('edamajutsu/JjDriver')<JjDriver, JjDriverOps>() {}

// Live driver layer. Depends on JjConfig — each command's boundary provides
// the resolved repo root via jjConfigLayer.
export const JjDriverLive: Layer.Layer<JjDriver, never, JjConfig> = Layer.effect(
  JjDriver,
  Effect.map(JjConfig, makeOps)
);

// Build a config layer from a known repo root.
export const jjConfigLayer = (repoRoot: string, jjBinary = 'jj'): Layer.Layer<JjConfig> =>
  Layer.succeed(JjConfig, { repoRoot, jjBinary });

// Standalone factory for callers that want the operations object directly
// (notably the test suite, which doesn't want to thread a Layer through every
// assertion). The shape is identical to what JjDriverLive provides.
export const makeDriver = (config: {
  readonly repoRoot: string;
  readonly jjBinary?: string;
}): JjDriverOps =>
  makeOps({ repoRoot: config.repoRoot, jjBinary: config.jjBinary ?? 'jj' });

function makeOps(config: { readonly repoRoot: string; readonly jjBinary: string }): JjDriverOps {
  // Spawn jj and resolve to a JjResult. The only failure mode here is the
  // spawn itself; non-zero exit codes are surfaced by runChecked below.
  const run: JjDriverOps['run'] = (args, opts) => {
    const snapshot = opts?.snapshot ?? false;
    const fullArgs = [
      '--no-pager',
      '--color=never',
      ...(snapshot ? [] : ['--ignore-working-copy']),
      ...args
    ];
    return runProcess(config.jjBinary, fullArgs, config.repoRoot);
  };

  const runChecked = (
    args: ReadonlyArray<string>,
    opts?: CommandOptions
  ): Effect.Effect<JjResult, JjDriverError> =>
    run(args, opts).pipe(
      Effect.flatMap((result) =>
        result.exitCode !== 0 || result.signal !== null
          ? Effect.fail(new JjCommandFailed({ args, result }))
          : Effect.succeed(result)
      )
    );

  // jj does its own validation, but catching obvious caller mistakes at the
  // driver boundary keeps the error message pointing at the bad input rather
  // than a downstream jj failure.
  const validateLimit = (
    limit: number | undefined,
    label: string
  ): Effect.Effect<void, JjValidationError> =>
    limit === undefined
      ? Effect.void
      : Number.isInteger(limit) && limit >= 0
        ? Effect.void
        : Effect.fail(
            new JjValidationError({
              message: `${label} must be a non-negative integer, got ${limit}`
            })
          );

  const log: JjDriverOps['log'] = (opts) =>
    Effect.gen(function* () {
      yield* validateLimit(opts?.limit, 'log limit');
      const args = ['log', '--no-graph', '-T', LOG_TEMPLATE];
      appendLogOpts(args, opts);
      const result = yield* runChecked(args, opts);
      return parseLogRecords(result.stdout);
    });

  const logGraph: JjDriverOps['logGraph'] = (opts) =>
    Effect.gen(function* () {
      yield* validateLimit(opts?.limit, 'log limit');
      const args = ['log', '-T', LOG_GRAPH_TEMPLATE];
      appendLogOpts(args, opts);
      const result = yield* runChecked(args, opts);
      return parseGraphLog(result.stdout);
    });

  const diffSummary: JjDriverOps['diffSummary'] = (opts) =>
    Effect.gen(function* () {
      const args = ['diff', '-T', DIFF_SUMMARY_TEMPLATE];
      if (opts?.revset !== undefined) {
        args.push('-r', opts.revset);
      }
      const result = yield* runChecked(args, opts);
      return parseDiffSummary(result.stdout);
    });

  const opLog: JjDriverOps['opLog'] = (opts) =>
    Effect.gen(function* () {
      yield* validateLimit(opts?.limit, 'op log limit');
      const args = ['op', 'log', '--no-graph', '-T', OP_LOG_TEMPLATE];
      if (opts?.limit !== undefined) {
        args.push('-n', String(opts.limit));
      }
      const result = yield* runChecked(args, opts);
      return parseOpLogRecords(result.stdout);
    });

  // Returns the unified `diff --git` text for the given revset (i.e. the diff
  // that REV introduces relative to its first parent). The commit detail view
  // splits the output by `diff --git a/... b/...` headers for folding.
  const diffText: JjDriverOps['diffText'] = (opts) =>
    runChecked(['diff', '--git', '-r', opts.revset], opts).pipe(
      Effect.map((result) => result.stdout)
    );

  // Mutating commands always snapshot first — jj refuses --ignore-working-copy
  // for these, and skipping would silently lose the user's working-copy edits.
  // Small helper keeps the signature uniform across all mutations.
  const mutate = (args: ReadonlyArray<string>): Effect.Effect<void, JjDriverError> =>
    runChecked(args, { snapshot: true }).pipe(Effect.asVoid);

  const undo: JjDriverOps['undo'] = () => mutate(['undo']);

  const newChange: JjDriverOps['newChange'] = (message) => {
    const args = ['new'];
    if (message !== undefined && message !== '') {
      args.push('-m', message);
    }
    return mutate(args);
  };

  const describe: JjDriverOps['describe'] = (message) => mutate(['describe', '-m', message]);
  const abandon: JjDriverOps['abandon'] = (revset) => mutate(['abandon', revset]);
  const edit: JjDriverOps['edit'] = (revset) => mutate(['edit', revset]);

  // Creates a bookmark at the given revset. Errors if the name is taken;
  // moving an existing bookmark goes through setBookmark.
  const createBookmark: JjDriverOps['createBookmark'] = (name, revset) =>
    mutate(['bookmark', 'create', name, '-r', revset]);

  // --allow-backwards lets the bookmark move to an ancestor of its current
  // target. Pairs with listBookmarks so callers can't typo a name.
  const setBookmark: JjDriverOps['setBookmark'] = (name, revset) =>
    mutate(['bookmark', 'set', name, '-r', revset, '--allow-backwards']);

  // Lists local-only bookmark names. Remote-tracking entries (`name@remote`)
  // are filtered out by the template's `if(remote, "", ...)`.
  const listBookmarks: JjDriverOps['listBookmarks'] = () =>
    runChecked(['bookmark', 'list', '-T', 'if(remote, "", name ++ "\\n")']).pipe(
      Effect.map((result) =>
        result.stdout
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s !== '')
      )
    );

  const squashIntoParent: JjDriverOps['squashIntoParent'] = () =>
    mutate(['squash', '--use-destination-message']);

  const redo: JjDriverOps['redo'] = () => mutate(['redo']);

  // Creates a copy of the given change on top of its parents (i.e. as a
  // sibling). Future PR can add `--insert-after` / `--onto` flags.
  const duplicate: JjDriverOps['duplicate'] = (revset) => mutate(['duplicate', '-r', revset]);

  // Creates a new change that's the inverse of REV, placed as a child of @.
  // @ does NOT move to the new revert — callers who want to land on it
  // should follow up with `edit('@+')`.
  const revert: JjDriverOps['revert'] = (revset) =>
    mutate(['revert', '-r', revset, '--insert-after', '@']);

  // Removes a bookmark. The underlying commit is not abandoned. The deletion
  // is marked for propagation to remotes on the next push.
  const deleteBookmark: JjDriverOps['deleteBookmark'] = (name) =>
    mutate(['bookmark', 'delete', name]);

  const renameBookmark: JjDriverOps['renameBookmark'] = (oldName, newName) =>
    mutate(['bookmark', 'rename', oldName, newName]);

  // Drops the local bookmark without propagating to remotes (unlike delete).
  // Useful when you imported a remote bookmark you don't want locally.
  const forgetBookmark: JjDriverOps['forgetBookmark'] = (name) =>
    mutate(['bookmark', 'forget', name]);

  // Rebases `source` (and its descendants, via `-s`) onto `destination`.
  // Covers the common "move my work onto X" intent in one shot.
  const rebase: JjDriverOps['rebase'] = (opts) =>
    mutate(['rebase', '-s', opts.source, '-d', opts.destination]);

  const gitPush: JjDriverOps['gitPush'] = () => mutate(['git', 'push', '--allow-new']);
  const gitFetch: JjDriverOps['gitFetch'] = () => mutate(['git', 'fetch']);
  const absorb: JjDriverOps['absorb'] = () => mutate(['absorb']);

  return {
    run,
    log,
    logGraph,
    diffSummary,
    opLog,
    diffText,
    undo,
    newChange,
    describe,
    abandon,
    edit,
    createBookmark,
    setBookmark,
    listBookmarks,
    squashIntoParent,
    redo,
    duplicate,
    revert,
    deleteBookmark,
    renameBookmark,
    forgetBookmark,
    rebase,
    gitPush,
    gitFetch,
    absorb
  };
}

function appendLogOpts(args: string[], opts: LogOptions | undefined): void {
  if (opts?.revset !== undefined) {
    args.push('-r', opts.revset);
  }
  if (opts?.limit !== undefined) {
    args.push('-n', String(opts.limit));
  }
}

// Spawns the binary and resolves to a JjResult. Effect.async bridges the
// child_process callback API; a spawn failure (e.g. ENOENT) fails with
// JjSpawnError, otherwise we always succeed with whatever exit code jj gave
// us. Translating a non-zero exit code into a failure is runChecked's job.
function runProcess(
  binary: string,
  args: ReadonlyArray<string>,
  cwd: string
): Effect.Effect<JjResult, JjSpawnError> {
  return Effect.async<JjResult, JjSpawnError>((resume) => {
    const proc = spawn(binary, [...args], { cwd });
    let stdout = '';
    let stderr = '';

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    let settled = false;
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      resume(Effect.fail(new JjSpawnError({ binary, cause: err })));
    });
    proc.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resume(Effect.succeed({ stdout, stderr, exitCode: code, signal }));
    });
  });
}
