import { Change, changeId, commitId } from '../model/change';
import { FileChange, FileChangeKind } from '../model/fileChange';
import { Operation, operationId } from '../model/operation';
import { JjParseError } from './errors';
import {
  DIFF_SECTION_SEP,
  FIELD_SEP,
  FieldKind,
  FieldSpec,
  LIST_ITEM_SEP,
  LOG_FIELDS,
  LogRecord,
  OP_LOG_FIELDS,
  OpLogRecord,
  RECORD_PREFIX,
  RecordOf
} from './templates';

// One line of a graph-rendered `jj log`. Data rows carry a parsed Change plus
// the leading graph glyphs jj drew; continuation rows are just graph art (or
// the `~` elision marker) and have no associated change.
export type GraphLine =
  | { readonly kind: 'change'; readonly graphPrefix: string; readonly change: Change }
  | { readonly kind: 'graphOnly'; readonly text: string };

export function parseLogRecords(stdout: string): Change[] {
  return splitTrailingNewline(stdout).map(parseLogRecord);
}

function splitTrailingNewline(stdout: string): string[] {
  if (stdout === '') {
    return [];
  }
  const trimmed = stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout;
  return trimmed.split('\n');
}

// Generic record parser: splits a line into fields, decodes each according
// to its FieldSpec's `kind`, and assembles a record keyed by `name`. The
// caller passes the SAME field array used to build the jj template, so the
// parser's shape is guaranteed in lockstep with the template at compile time
// (`RecordOf<typeof FIELDS>`).
function parseRecord<F extends ReadonlyArray<FieldSpec>>(line: string, fields: F): RecordOf<F> {
  const parts = line.split(FIELD_SEP);
  if (parts.length !== fields.length) {
    throw new JjParseError(
      `expected ${fields.length} fields in record, got ${parts.length}`,
      line
    );
  }
  const result: Record<string, unknown> = {};
  fields.forEach((spec, i) => {
    result[spec.name] = decodeField(parts[i]!, spec.kind, line);
  });
  return result as RecordOf<F>;
}

function decodeField(raw: string, kind: FieldKind, line: string): string | string[] | boolean {
  switch (kind) {
    case 'raw':
      return raw;
    case 'json':
      return parseJsonString(raw, line);
    case 'list-raw':
      return parseListRaw(raw);
    case 'list-json':
      return parseListRaw(raw).map((item) => parseJsonString(item, line));
    case 'bool':
      return parseBool(raw, line);
  }
}

function parseLogRecord(line: string): Change {
  return toChange(parseRecord(line, LOG_FIELDS));
}

// Bridge between the type-derived parsed shape and the user-facing Change,
// which uses branded ChangeId / CommitId. This is the one place a renamed
// field in LOG_FIELDS surfaces as a typecheck error.
function toChange(raw: LogRecord): Change {
  return {
    changeId: changeId(raw.changeId),
    commitId: commitId(raw.commitId),
    description: raw.description,
    descriptionFirstLine: raw.descriptionFirstLine,
    authorName: raw.authorName,
    authorEmail: raw.authorEmail,
    parents: raw.parents.map(changeId),
    bookmarks: raw.bookmarks,
    isConflicted: raw.isConflicted,
    isEmpty: raw.isEmpty,
    isWorkingCopy: raw.isWorkingCopy
  };
}

function parseListRaw(raw: string): string[] {
  if (raw === '') {
    return [];
  }
  return raw.split(LIST_ITEM_SEP);
}

function parseJsonString(raw: string, line: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new JjParseError(
      `failed to JSON-decode field: ${err instanceof Error ? err.message : String(err)}`,
      line
    );
  }
  if (typeof parsed !== 'string') {
    throw new JjParseError(`expected JSON string, got ${typeof parsed}`, line);
  }
  return parsed;
}

export function parseGraphLog(stdout: string): GraphLine[] {
  return splitTrailingNewline(stdout).map(parseGraphLogLine);
}

function parseGraphLogLine(line: string): GraphLine {
  const sentinelIdx = line.indexOf(RECORD_PREFIX);
  if (sentinelIdx < 0) {
    return { kind: 'graphOnly', text: line };
  }
  const graphPrefix = line.slice(0, sentinelIdx);
  const recordLine = line.slice(sentinelIdx + 1);
  return { kind: 'change', graphPrefix, change: parseLogRecord(recordLine) };
}

export function parseDiffSummary(stdout: string): FileChange[] {
  return splitTrailingNewline(stdout).map(parseDiffSummaryLine);
}

// One changed file: kind + path from the summary section, paired with the
// `diff --git` body block from the unified-diff section.
export type FileDiff = {
  readonly kind: FileChangeKind;
  readonly path: string;
  readonly body: ReadonlyArray<string>;
};

// Parses the output of REVISION_DIFF_WITH_SUMMARY_TEMPLATE. Splits on the
// summary-vs-diff section separator, parses the summary half line-by-line
// (matching parseDiffSummary), splits the diff half by file (matching
// splitDiffByFile), and merges them by path. Throws if any summary entry
// lacks a corresponding diff block or vice versa — jj's templates guarantee
// they line up, so a mismatch means input was corrupted in transit.
export function parseRevisionDiffWithSummary(stdout: string): FileDiff[] {
  if (stdout === '') {
    return [];
  }
  const sepIdx = stdout.indexOf(DIFF_SECTION_SEP);
  if (sepIdx < 0) {
    throw new JjParseError(`missing summary/diff section separator`, stdout);
  }
  const summary = stdout.slice(0, sepIdx);
  const diff = stdout.slice(sepIdx + 1);
  const files = summary === '' ? [] : splitTrailingNewline(summary).map(parseDiffSummaryLine);
  const diffByFile = splitDiffByFile(diff);
  const out: FileDiff[] = files.map((f) => {
    const body = diffByFile.get(f.path);
    if (!body) {
      throw new JjParseError(`summary entry has no matching diff block`, f.path);
    }
    diffByFile.delete(f.path);
    return { kind: f.kind, path: f.path, body };
  });
  if (diffByFile.size > 0) {
    const stray = [...diffByFile.keys()].join(', ');
    throw new JjParseError(`diff blocks without summary entries: ${stray}`, stray);
  }
  return out;
}

// Splits a `jj diff --git` blob into per-file bodies keyed by the destination
// path (`b/<path>`) from each `diff --git` header. Each value is the full
// block of lines for that file, header line included, so callers can render
// it verbatim. Throws if two blocks share the same destination path — that
// would mean the input was malformed and silently overwriting would mask a
// real bug.
function splitDiffByFile(diff: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const lines = diff.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  let current: { path: string; lines: string[] } | undefined;
  const commit = (block: { path: string; lines: string[] }): void => {
    if (out.has(block.path)) {
      throw new JjParseError(`duplicate diff block for path ${JSON.stringify(block.path)}`, block.lines[0]!);
    }
    out.set(block.path, block.lines);
  };
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) {
        commit(current);
      }
      const path = parseDiffHeaderBPath(line);
      current = path === undefined ? undefined : { path, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    commit(current);
  }
  return out;
}

// Extracts `<path>` from a `diff --git a/<src> b/<path>` header. Splits on
// the last ` b/` because either side may legally contain spaces (jj's
// `--git` output does not quote them).
function parseDiffHeaderBPath(line: string): string | undefined {
  const prefix = 'diff --git a/';
  if (!line.startsWith(prefix)) {
    return undefined;
  }
  const rest = line.slice(prefix.length);
  const sepIdx = rest.lastIndexOf(' b/');
  if (sepIdx < 0) {
    return undefined;
  }
  return rest.slice(sepIdx + 3);
}

function parseDiffSummaryLine(line: string): FileChange {
  const sep = line.indexOf(FIELD_SEP);
  if (sep < 0) {
    throw new JjParseError(`missing field separator in diff-summary line`, line);
  }
  const status = line.slice(0, sep);
  const path = line.slice(sep + 1);
  return { kind: parseFileChangeKind(status, line), path };
}

function parseFileChangeKind(status: string, line: string): FileChangeKind {
  switch (status) {
    case 'added':
      return 'added';
    case 'modified':
      return 'modified';
    case 'removed':
      return 'deleted';
    case 'renamed':
      return 'renamed';
    case 'copied':
      return 'copied';
    default:
      throw new JjParseError(`unknown file change status ${JSON.stringify(status)}`, line);
  }
}

export function parseOpLogRecords(stdout: string): Operation[] {
  return splitTrailingNewline(stdout).map(parseOpLogRecord);
}

function parseOpLogRecord(line: string): Operation {
  return toOperation(parseRecord(line, OP_LOG_FIELDS));
}

function toOperation(raw: OpLogRecord): Operation {
  return {
    id: operationId(raw.id),
    description: raw.description,
    descriptionFirstLine: raw.descriptionFirstLine,
    user: raw.user,
    time: raw.time
  };
}

function parseBool(raw: string, line: string): boolean {
  if (raw === '0') {
    return false;
  }
  if (raw === '1') {
    return true;
  }
  throw new JjParseError(`expected boolean field to be "0" or "1", got ${JSON.stringify(raw)}`, line);
}
