import { spawn } from 'child_process';
import { Change } from '../model/change';
import { FileChange } from '../model/fileChange';
import { Operation } from '../model/operation';
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

export type JjResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
};

export class JjCommandError extends Error {
  constructor(
    readonly args: ReadonlyArray<string>,
    readonly result: JjResult
  ) {
    const exit = result.signal !== null ? `signal ${result.signal}` : `code ${result.exitCode}`;
    const tail =
      [
        result.stderr.trim() && `stderr: ${result.stderr.trim()}`,
        result.stdout.trim() && `stdout: ${result.stdout.trim()}`
      ]
        .filter(Boolean)
        .join('\n') || '(no output)';
    super(`jj ${args.join(' ')} exited with ${exit}\n${tail}`);
    this.name = 'JjCommandError';
  }
}

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

export type JjDriverOptions = {
  // Path that contains a `.jj/` directory (or any descendant). Used as cwd for jj.
  readonly repoRoot: string;
  // Override the binary used. Defaults to `jj` from PATH.
  readonly jjBinary?: string;
};

// Driver for invoking the `jj` CLI. By default every call passes
// `--ignore-working-copy` so reads never cause a snapshot. Callers that need a
// snapshot (e.g. the explicit `g` refresh) should set `snapshot: true`.
export class JjDriver {
  private readonly jjBinary: string;
  private readonly repoRoot: string;

  constructor(options: JjDriverOptions) {
    this.repoRoot = options.repoRoot;
    this.jjBinary = options.jjBinary ?? 'jj';
  }

  async run(args: ReadonlyArray<string>, opts?: { snapshot?: boolean }): Promise<JjResult> {
    const snapshot = opts?.snapshot ?? false;
    const fullArgs = [
      '--no-pager',
      '--color=never',
      ...(snapshot ? [] : ['--ignore-working-copy']),
      ...args
    ];
    return runProcess(this.jjBinary, fullArgs, this.repoRoot);
  }

  async log(opts?: LogOptions): Promise<Change[]> {
    const args = ['log', '--no-graph', '-T', LOG_TEMPLATE];
    appendLogOpts(args, opts);
    const result = await this.runChecked(args, opts);
    return parseLogRecords(result.stdout);
  }

  // Graph-rendered `jj log`. Lines come back as either parsed `change`
  // records (with the leading graph glyphs jj drew) or `graphOnly`
  // continuation rows that we re-emit verbatim for display.
  async logGraph(opts?: LogOptions): Promise<GraphLine[]> {
    const args = ['log', '-T', LOG_GRAPH_TEMPLATE];
    appendLogOpts(args, opts);
    const result = await this.runChecked(args, opts);
    return parseGraphLog(result.stdout);
  }

  async diffSummary(opts?: DiffSummaryOptions): Promise<FileChange[]> {
    const args = ['diff', '-T', DIFF_SUMMARY_TEMPLATE];
    if (opts?.revset !== undefined) {
      args.push('-r', opts.revset);
    }
    const result = await this.runChecked(args, opts);
    return parseDiffSummary(result.stdout);
  }

  async opLog(opts?: CommandOptions & { readonly limit?: number }): Promise<Operation[]> {
    const args = ['op', 'log', '--no-graph', '-T', OP_LOG_TEMPLATE];
    if (opts?.limit !== undefined) {
      if (!Number.isInteger(opts.limit) || opts.limit < 0) {
        throw new Error(`op log limit must be a non-negative integer, got ${opts.limit}`);
      }
      args.push('-n', String(opts.limit));
    }
    const result = await this.runChecked(args, opts);
    return parseOpLogRecords(result.stdout);
  }

  // Returns the unified `diff --git` text for the given revset (i.e. the
  // diff that REV introduces relative to its first parent). Used by the
  // commit detail view; the per-file `diff --git a/... b/...` headers let
  // us split the output for folding client-side.
  async diffText(opts: { readonly revset: string } & CommandOptions): Promise<string> {
    const args = ['diff', '--git', '-r', opts.revset];
    const result = await this.runChecked(args, opts);
    return result.stdout;
  }

  // Rolls back the most recent operation. Mutating, so it always snapshots
  // the working copy first (we cannot pass --ignore-working-copy or jj
  // would refuse). Subsequent view refreshes after an undo can stay passive
  // because jj already snapshotted.
  async undo(): Promise<void> {
    await this.runChecked(['undo'], { snapshot: true });
  }

  // Creates a new empty change on top of @ and switches to it. Optional
  // single-line description; omit for an undescribed change.
  async newChange(message?: string): Promise<void> {
    const args = ['new'];
    if (message !== undefined && message !== '') {
      args.push('-m', message);
    }
    await this.runChecked(args, { snapshot: true });
  }

  // Sets the description of @ to the given (possibly multi-line) string.
  async describe(message: string): Promise<void> {
    await this.runChecked(['describe', '-m', message], { snapshot: true });
  }

  // Abandons the given change. Its descendants are rebased onto its parents.
  async abandon(revset: string): Promise<void> {
    await this.runChecked(['abandon', revset], { snapshot: true });
  }

  // Switches @ to the given revision. Pending working-copy changes are
  // snapshotted into the previous @ before the switch.
  async edit(revset: string): Promise<void> {
    await this.runChecked(['edit', revset], { snapshot: true });
  }

  // Creates a new bookmark at the given revset. Errors if a bookmark with
  // that name already exists — moving an existing bookmark goes through
  // `setBookmark`, paired with a UX that picks from a known list so we can't
  // typo a name and silently overwrite something.
  async createBookmark(name: string, revset: string): Promise<void> {
    await this.runChecked(['bookmark', 'create', name, '-r', revset], { snapshot: true });
  }

  // Moves the bookmark to the given revset. Pairs with `listBookmarks` so
  // callers never invoke this with a name that wasn't already in the repo.
  // `--allow-backwards` lets the bookmark move to an ancestor of its current
  // target.
  async setBookmark(name: string, revset: string): Promise<void> {
    await this.runChecked(
      ['bookmark', 'set', name, '-r', revset, '--allow-backwards'],
      { snapshot: true }
    );
  }

  // Lists the names of local bookmarks currently present in the repo. Remote-
  // tracking entries (`name@remote`) are filtered out.
  async listBookmarks(): Promise<string[]> {
    const result = await this.runChecked(
      ['bookmark', 'list', '-T', 'if(remote, "", name ++ "\\n")'],
      {}
    );
    return result.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  }

  // Squashes @ into @-: all changes from @ are moved into @-, then @ is
  // dropped (a new empty @ is created in its place if @ had children).
  // `--use-destination-message` keeps @-'s description as-is without opening
  // an editor — users can rename after the fact via `c`.
  async squashIntoParent(): Promise<void> {
    await this.runChecked(['squash', '--use-destination-message'], { snapshot: true });
  }

  // Inverse of `undo` — re-applies the most recently undone operation.
  async redo(): Promise<void> {
    await this.runChecked(['redo'], { snapshot: true });
  }

  // Creates a copy of the given change on top of its parents (i.e. as a
  // sibling). Future PR can add `--insert-after` / `--onto` flags.
  async duplicate(revset: string): Promise<void> {
    await this.runChecked(['duplicate', '-r', revset], { snapshot: true });
  }

  // Creates a new change that's the inverse of REV, placed as a child of @.
  // @ does NOT move to the new revert — callers who want to land on it
  // should follow up with `edit('@+')`.
  async revert(revset: string): Promise<void> {
    await this.runChecked(['revert', '-r', revset, '--insert-after', '@'], { snapshot: true });
  }

  // Removes a bookmark. The underlying commit is not abandoned. The deletion
  // is marked for propagation to remotes on the next push.
  async deleteBookmark(name: string): Promise<void> {
    await this.runChecked(['bookmark', 'delete', name], { snapshot: true });
  }

  // Renames a bookmark in place. Errors if `oldName` is absent or `newName`
  // collides with an existing bookmark.
  async renameBookmark(oldName: string, newName: string): Promise<void> {
    await this.runChecked(['bookmark', 'rename', oldName, newName], { snapshot: true });
  }

  // Drops the local bookmark without propagating to remotes (unlike delete).
  // Useful when you imported a remote bookmark you don't want locally.
  async forgetBookmark(name: string): Promise<void> {
    await this.runChecked(['bookmark', 'forget', name], { snapshot: true });
  }

  // Rebases `source` (and its descendants, via `-s`) onto `destination`.
  // Covers the common "move my work onto X" intent in one shot. Variants
  // (single-commit `-r`, whole-branch `-b`, insert-before/-after) are
  // deferred to a transient flow.
  async rebase(opts: { readonly source: string; readonly destination: string }): Promise<void> {
    await this.runChecked(
      ['rebase', '-s', opts.source, '-d', opts.destination],
      { snapshot: true }
    );
  }

  // Pushes local bookmark changes (including newly-created bookmarks) to
  // their tracked remotes. `--allow-new` covers the first-push case.
  async gitPush(): Promise<void> {
    await this.runChecked(['git', 'push', '--allow-new'], { snapshot: true });
  }

  // Pushes a single named bookmark. `--allow-new` covers the first-push case
  // for a bookmark that doesn't yet exist on the remote.
  async gitPushBookmark(name: string): Promise<void> {
    await this.runChecked(['git', 'push', '--allow-new', '--bookmark', name], { snapshot: true });
  }

  // Fetches from configured remotes.
  async gitFetch(): Promise<void> {
    await this.runChecked(['git', 'fetch'], { snapshot: true });
  }

  // Distributes the working-copy hunks into the most recent ancestor that
  // touched the same lines. Mutating, snapshots first.
  async absorb(): Promise<void> {
    await this.runChecked(['absorb'], { snapshot: true });
  }

  private async runChecked(
    args: ReadonlyArray<string>,
    opts?: CommandOptions
  ): Promise<JjResult> {
    const result = await this.run(args, opts);
    if (result.exitCode !== 0 || result.signal !== null) {
      throw new JjCommandError(args, result);
    }
    return result;
  }
}

function appendLogOpts(args: string[], opts: LogOptions | undefined): void {
  if (opts?.revset !== undefined) {
    args.push('-r', opts.revset);
  }
  if (opts?.limit !== undefined) {
    if (!Number.isInteger(opts.limit) || opts.limit < 0) {
      throw new Error(`log limit must be a non-negative integer, got ${opts.limit}`);
    }
    args.push('-n', String(opts.limit));
  }
}

function runProcess(
  binary: string,
  args: ReadonlyArray<string>,
  cwd: string
): Promise<JjResult> {
  return new Promise((resolve, reject) => {
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

    proc.on('error', (err) => {
      reject(err);
    });
    proc.on('close', (code, signal) => {
      resolve({ stdout, stderr, exitCode: code, signal });
    });
  });
}
