import { spawn } from 'child_process';
import { Change } from '../model/change';
import { FileChange } from '../model/fileChange';
import { GraphLine, parseDiffSummary, parseGraphLog, parseLogRecords } from './parse';
import { DIFF_SUMMARY_TEMPLATE, LOG_GRAPH_TEMPLATE, LOG_TEMPLATE } from './templates';

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
