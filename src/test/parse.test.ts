import * as assert from 'assert';

import { JjParseError, parseLogRecords } from '../jj/parse';
import { FIELD_SEP, LIST_ITEM_SEP } from '../jj/templates';

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
  testDescriptionWithControlBytesSurvivesUnchanged();
  testDescriptionWithNewlinesRoundTrips();
  testBookmarksAreJsonDecoded();
  testRejectsWrongFieldCount();
  testRejectsBadBoolean();
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
    buildRecord({ changeId: 'c1', description: 'first', descriptionFirstLine: 'first', workingCopy: '1' }) +
    buildRecord({ changeId: 'c2', description: 'second', descriptionFirstLine: 'second', parents: 'c1', empty: '1' });

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

// Regression: descriptions that contain RS / FS / US bytes used to corrupt
// parsing under the old line-encoding scheme. With escape_json + JSON.parse
// the bytes survive unchanged.
function testDescriptionWithControlBytesSurvivesUnchanged(): void {
  const dangerous = `has${FIELD_SEP}RS and ${LIST_ITEM_SEP}FS bytes`;
  const [change] = parseLogRecords(buildRecord({ description: dangerous }));
  assert.ok(change);
  assert.strictEqual(change.description, dangerous);
}

function testDescriptionWithNewlinesRoundTrips(): void {
  const desc = 'line one\nline two\n\nline four';
  const [change] = parseLogRecords(buildRecord({ description: desc }));
  assert.ok(change);
  assert.strictEqual(change.description, desc);
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
