import { Change, changeId, commitId } from '../model/change';
import { FileChange, FileChangeKind } from '../model/fileChange';
import { FIELD_SEP, LIST_ITEM_SEP, LOG_FIELDS } from './templates';

export class JjParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'JjParseError';
  }
}

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

// The destructure order below must match the order of LOG_FIELDS in templates.ts.
function parseLogRecord(line: string): Change {
  const fields = line.split(FIELD_SEP);
  if (fields.length !== LOG_FIELDS.length) {
    throw new JjParseError(
      `expected ${LOG_FIELDS.length} fields in log record, got ${fields.length}`,
      line
    );
  }
  const [
    changeIdRaw,
    commitIdRaw,
    descriptionFirstLineRaw,
    authorNameRaw,
    authorEmailRaw,
    parentsRaw,
    bookmarksRaw,
    conflictRaw,
    emptyRaw,
    workingCopyRaw
  ] = fields as [string, string, string, string, string, string, string, string, string, string];

  return {
    changeId: changeId(changeIdRaw),
    commitId: commitId(commitIdRaw),
    descriptionFirstLine: parseJsonString(descriptionFirstLineRaw, line),
    authorName: parseJsonString(authorNameRaw, line),
    authorEmail: authorEmailRaw,
    parents: parseListRaw(parentsRaw).map(changeId),
    bookmarks: parseListRaw(bookmarksRaw).map((item) => parseJsonString(item, line)),
    isConflicted: parseBool(conflictRaw, line),
    isEmpty: parseBool(emptyRaw, line),
    isWorkingCopy: parseBool(workingCopyRaw, line)
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

export function parseDiffSummary(stdout: string): FileChange[] {
  return splitTrailingNewline(stdout).map(parseDiffSummaryLine);
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

function parseBool(raw: string, line: string): boolean {
  if (raw === '0') {
    return false;
  }
  if (raw === '1') {
    return true;
  }
  throw new JjParseError(`expected boolean field to be "0" or "1", got ${JSON.stringify(raw)}`, line);
}
