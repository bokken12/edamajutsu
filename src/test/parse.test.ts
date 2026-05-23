import * as assert from 'assert';

import {
  JjParseError,
  parseDiffSummary,
  parseGraphLog,
  parseLogRecords,
  parseOpLogRecords
} from '../jj/parse';
import { FIELD_SEP, LIST_ITEM_SEP, RECORD_PREFIX } from '../jj/templates';

type FieldOverrides = {
  changeId?: string;
  commitId?: string;
  description?: string;
  descriptionFirstLine?: string;
  authorName?: string;
  authorEmail?: string;
  parents?: string;
  bookmarks?: string;
  conflict?: '0' | '1';
  empty?: '0' | '1';
  workingCopy?: '0' | '1';
};

function buildRecord(o: FieldOverrides): string {
  const j = (s: string | undefined): string => JSON.stringify(s ?? '');
  return [
    o.changeId ?? 'c',
    o.commitId ?? 'h',
    j(o.description),
    j(o.descriptionFirstLine),
    j(o.authorName ?? 'A'),
    o.authorEmail ?? 'a@x',
    o.parents ?? '',
    o.bookmarks ?? '',
    o.conflict ?? '0',
    o.empty ?? '0',
    o.workingCopy ?? '0'
  ].join(FIELD_SEP) + '\n';
}

export function runParseTests(): void {
  testParsesSingleRecord();
  testParsesMultipleRecords();
  testEmptyInputYieldsEmptyArray();
  testEmptyListFieldsBecomeEmptyArrays();
  testDescriptionFirstLineSurvivesControlBytes();
  testBookmarksAreJsonDecoded();
  testRejectsWrongFieldCount();
  testRejectsBadBoolean();
  testDiffSummaryParsesEachKind();
  testDiffSummaryEmpty();
  testDiffSummaryRejectsUnknownStatus();
  testGraphLogSplitsDataAndContinuationRows();
  testGraphLogPreservesGraphPrefix();
  testGraphLogEmpty();
  testOpLogParsesRecords();
  testOpLogEmpty();
  testOpLogRejectsWrongFieldCount();
}

function testParsesSingleRecord(): void {
  const record = buildRecord({
    changeId: 'abcd1234',
    commitId: 'ef567890',
    description: 'subject\nbody line 1\nbody line 2',
    descriptionFirstLine: 'subject',
    authorName: 'Alice',
    authorEmail: 'alice@example.com',
    parents: `parent1${LIST_ITEM_SEP}parent2`,
    bookmarks: JSON.stringify('main'),
    workingCopy: '1'
  });

  const [change] = parseLogRecords(record);
  assert.ok(change);
  assert.strictEqual(change.changeId, 'abcd1234');
  assert.strictEqual(change.commitId, 'ef567890');
  assert.strictEqual(change.description, 'subject\nbody line 1\nbody line 2');
  assert.strictEqual(change.descriptionFirstLine, 'subject');
  assert.strictEqual(change.authorName, 'Alice');
  assert.strictEqual(change.authorEmail, 'alice@example.com');
  assert.deepStrictEqual([...change.parents], ['parent1', 'parent2']);
  assert.deepStrictEqual([...change.bookmarks], ['main']);
  assert.strictEqual(change.isWorkingCopy, true);
}

function testParsesMultipleRecords(): void {
  const stdout =
    buildRecord({ changeId: 'c1', descriptionFirstLine: 'first', workingCopy: '1' }) +
    buildRecord({ changeId: 'c2', descriptionFirstLine: 'second', parents: 'c1', empty: '1' });

  const records = parseLogRecords(stdout);
  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0]!.changeId, 'c1');
  assert.strictEqual(records[1]!.isEmpty, true);
  assert.deepStrictEqual([...records[1]!.parents], ['c1']);
}

function testEmptyInputYieldsEmptyArray(): void {
  assert.deepStrictEqual(parseLogRecords(''), []);
}

function testEmptyListFieldsBecomeEmptyArrays(): void {
  const [change] = parseLogRecords(buildRecord({ empty: '1' }));
  assert.ok(change);
  assert.deepStrictEqual([...change.parents], []);
  assert.deepStrictEqual([...change.bookmarks], []);
  assert.strictEqual(change.description, '');
  assert.strictEqual(change.descriptionFirstLine, '');
}

// Regression: a description that happens to contain our RS / FS separator
// bytes must round-trip via escape_json + JSON.parse. Multi-line bodies are
// also preserved because escape_json keeps real newlines as `\n`.
function testDescriptionFirstLineSurvivesControlBytes(): void {
  const dangerous = `has${FIELD_SEP}RS and ${LIST_ITEM_SEP}FS bytes`;
  const multi = `${dangerous}\nsecond body line`;
  const [change] = parseLogRecords(
    buildRecord({ description: multi, descriptionFirstLine: dangerous })
  );
  assert.ok(change);
  assert.strictEqual(change.descriptionFirstLine, dangerous);
  assert.strictEqual(change.description, multi);
}

function testBookmarksAreJsonDecoded(): void {
  const bookmarkList = [JSON.stringify('main'), JSON.stringify('weird name')].join(LIST_ITEM_SEP);
  const [change] = parseLogRecords(buildRecord({ bookmarks: bookmarkList }));
  assert.ok(change);
  assert.deepStrictEqual([...change.bookmarks], ['main', 'weird name']);
}

function testRejectsWrongFieldCount(): void {
  const bad = ['only', 'three', 'fields'].join(FIELD_SEP) + '\n';
  assert.throws(() => parseLogRecords(bad), JjParseError);
}

function testRejectsBadBoolean(): void {
  const record = buildRecord({ conflict: 'maybe' as '0' });
  assert.throws(() => parseLogRecords(record), JjParseError);
}

function testDiffSummaryParsesEachKind(): void {
  const stdout =
    `added${FIELD_SEP}new.txt\n` +
    `modified${FIELD_SEP}src/file.ts\n` +
    `removed${FIELD_SEP}old.txt\n` +
    `renamed${FIELD_SEP}new-name.txt\n` +
    `copied${FIELD_SEP}copy.txt\n`;
  const files = parseDiffSummary(stdout);
  assert.deepStrictEqual(
    files.map((f) => ({ kind: f.kind, path: f.path })),
    [
      { kind: 'added', path: 'new.txt' },
      { kind: 'modified', path: 'src/file.ts' },
      { kind: 'deleted', path: 'old.txt' },
      { kind: 'renamed', path: 'new-name.txt' },
      { kind: 'copied', path: 'copy.txt' }
    ]
  );
}

function testDiffSummaryEmpty(): void {
  assert.deepStrictEqual(parseDiffSummary(''), []);
}

function testDiffSummaryRejectsUnknownStatus(): void {
  assert.throws(() => parseDiffSummary(`weirdstatus${FIELD_SEP}a.txt\n`), JjParseError);
}

function testGraphLogSplitsDataAndContinuationRows(): void {
  const dataLine = (graphPrefix: string, change: string): string =>
    graphPrefix + RECORD_PREFIX + buildRecord({ changeId: change, descriptionFirstLine: `desc-${change}` });
  const stdout =
    dataLine('@  ', 'aaa11111') +
    '│\n' +
    dataLine('○  ', 'bbb22222') +
    '~\n';

  const lines = parseGraphLog(stdout);
  assert.strictEqual(lines.length, 4);
  assert.strictEqual(lines[0]?.kind, 'change');
  assert.strictEqual(lines[1]?.kind, 'graphOnly');
  assert.strictEqual(lines[2]?.kind, 'change');
  assert.strictEqual(lines[3]?.kind, 'graphOnly');
  if (lines[0]?.kind === 'change') {
    assert.strictEqual(lines[0].graphPrefix, '@  ');
    assert.strictEqual(lines[0].change.changeId, 'aaa11111');
  }
  if (lines[1]?.kind === 'graphOnly') {
    assert.strictEqual(lines[1].text, '│');
  }
  if (lines[3]?.kind === 'graphOnly') {
    assert.strictEqual(lines[3].text, '~');
  }
}

function testGraphLogEmpty(): void {
  assert.deepStrictEqual(parseGraphLog(''), []);
}

function testGraphLogPreservesGraphPrefix(): void {
  // Realistic prefix: leading spaces, box-drawing chars, more spaces.
  const prefix = '│ ○  ';
  const line = prefix + RECORD_PREFIX + buildRecord({ changeId: 'feedbeef' });
  const [parsed] = parseGraphLog(line);
  assert.ok(parsed && parsed.kind === 'change');
  assert.strictEqual(parsed.graphPrefix, prefix);
  assert.strictEqual(parsed.change.changeId, 'feedbeef');
}

function buildOpRecord(o: {
  id?: string;
  description?: string;
  descriptionFirstLine?: string;
  user?: string;
  time?: string;
}): string {
  const j = (s: string | undefined): string => JSON.stringify(s ?? '');
  return [
    o.id ?? '0123456789abcdef',
    j(o.description),
    j(o.descriptionFirstLine),
    j(o.user ?? 'someone@host'),
    o.time ?? '2026-05-23 13:29:43.395 -07:00'
  ].join(FIELD_SEP) + '\n';
}

function testOpLogParsesRecords(): void {
  const stdout =
    buildOpRecord({
      id: 'aaa111',
      description: 'snapshot working copy',
      descriptionFirstLine: 'snapshot working copy',
      user: 'crouton@host',
      time: '2026-05-23 13:29:43.395 -07:00'
    }) +
    buildOpRecord({
      id: 'bbb222',
      description: 'create bookmark feature pointing to commit abc\nsecond line',
      descriptionFirstLine: 'create bookmark feature pointing to commit abc',
      user: 'crouton@host'
    });

  const ops = parseOpLogRecords(stdout);
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0]!.id, 'aaa111');
  assert.strictEqual(ops[0]!.descriptionFirstLine, 'snapshot working copy');
  assert.strictEqual(ops[0]!.user, 'crouton@host');
  assert.strictEqual(ops[1]!.description, 'create bookmark feature pointing to commit abc\nsecond line');
  assert.strictEqual(ops[1]!.descriptionFirstLine, 'create bookmark feature pointing to commit abc');
}

function testOpLogEmpty(): void {
  assert.deepStrictEqual(parseOpLogRecords(''), []);
}

function testOpLogRejectsWrongFieldCount(): void {
  const bad = ['only', 'three', 'fields'].join(FIELD_SEP) + '\n';
  assert.throws(() => parseOpLogRecords(bad), JjParseError);
}
