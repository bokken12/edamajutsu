import { expect, test } from 'vitest';

import { JjParseError } from '../jj/errors';
import {
  parseDiffSummary,
  parseGraphLog,
  parseLogRecords,
  parseOpLogRecords,
  parseRevisionDiffWithSummary
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

test('parses a fully populated log record', () => {
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

  expect(parseLogRecords(record)).toMatchInlineSnapshot(`
    [
      {
        "authorEmail": "alice@example.com",
        "authorName": "Alice",
        "bookmarks": [
          "main",
        ],
        "changeId": "abcd1234",
        "commitId": "ef567890",
        "description": "subject
    body line 1
    body line 2",
        "descriptionFirstLine": "subject",
        "isConflicted": false,
        "isEmpty": false,
        "isWorkingCopy": true,
        "parents": [
          "parent1",
          "parent2",
        ],
      },
    ]
  `);
});

test('parses multiple records in order', () => {
  const stdout =
    buildRecord({ changeId: 'c1', descriptionFirstLine: 'first', workingCopy: '1' }) +
    buildRecord({ changeId: 'c2', descriptionFirstLine: 'second', parents: 'c1', empty: '1' });

  expect(parseLogRecords(stdout)).toMatchInlineSnapshot(`
    [
      {
        "authorEmail": "a@x",
        "authorName": "A",
        "bookmarks": [],
        "changeId": "c1",
        "commitId": "h",
        "description": "",
        "descriptionFirstLine": "first",
        "isConflicted": false,
        "isEmpty": false,
        "isWorkingCopy": true,
        "parents": [],
      },
      {
        "authorEmail": "a@x",
        "authorName": "A",
        "bookmarks": [],
        "changeId": "c2",
        "commitId": "h",
        "description": "",
        "descriptionFirstLine": "second",
        "isConflicted": false,
        "isEmpty": true,
        "isWorkingCopy": false,
        "parents": [
          "c1",
        ],
      },
    ]
  `);
});

test('empty stdout yields empty array', () => {
  expect(parseLogRecords('')).toEqual([]);
});

test('empty list fields decode to empty arrays', () => {
  expect(parseLogRecords(buildRecord({ empty: '1' }))).toMatchInlineSnapshot(`
    [
      {
        "authorEmail": "a@x",
        "authorName": "A",
        "bookmarks": [],
        "changeId": "c",
        "commitId": "h",
        "description": "",
        "descriptionFirstLine": "",
        "isConflicted": false,
        "isEmpty": true,
        "isWorkingCopy": false,
        "parents": [],
      },
    ]
  `);
});

// Regression: descriptions that contain our RS / FS separator bytes must
// round-trip via escape_json + JSON.parse.
test('description with control bytes round-trips losslessly', () => {
  const dangerous = `has${FIELD_SEP}RS and ${LIST_ITEM_SEP}FS bytes`;
  const multi = `${dangerous}\nsecond body line`;
  expect(
    parseLogRecords(buildRecord({ description: multi, descriptionFirstLine: dangerous }))
  ).toMatchInlineSnapshot(`
    [
      {
        "authorEmail": "a@x",
        "authorName": "A",
        "bookmarks": [],
        "changeId": "c",
        "commitId": "h",
        "description": "hasRS and FS bytes
    second body line",
        "descriptionFirstLine": "hasRS and FS bytes",
        "isConflicted": false,
        "isEmpty": false,
        "isWorkingCopy": false,
        "parents": [],
      },
    ]
  `);
});

test('bookmark list items are JSON-decoded', () => {
  const bookmarkList = [JSON.stringify('main'), JSON.stringify('weird name')].join(LIST_ITEM_SEP);
  expect(parseLogRecords(buildRecord({ bookmarks: bookmarkList }))).toMatchInlineSnapshot(`
    [
      {
        "authorEmail": "a@x",
        "authorName": "A",
        "bookmarks": [
          "main",
          "weird name",
        ],
        "changeId": "c",
        "commitId": "h",
        "description": "",
        "descriptionFirstLine": "",
        "isConflicted": false,
        "isEmpty": false,
        "isWorkingCopy": false,
        "parents": [],
      },
    ]
  `);
});

test('rejects records with the wrong field count', () => {
  const bad = ['only', 'three', 'fields'].join(FIELD_SEP) + '\n';
  expect(() => parseLogRecords(bad)).toThrow(JjParseError);
});

test('rejects boolean fields that are not 0/1', () => {
  expect(() => parseLogRecords(buildRecord({ conflict: 'maybe' as '0' }))).toThrow(JjParseError);
});

test('parses each diff-summary kind', () => {
  const stdout =
    `added${FIELD_SEP}new.txt\n` +
    `modified${FIELD_SEP}src/file.ts\n` +
    `removed${FIELD_SEP}old.txt\n` +
    `renamed${FIELD_SEP}new-name.txt\n` +
    `copied${FIELD_SEP}copy.txt\n`;
  expect(parseDiffSummary(stdout)).toMatchInlineSnapshot(`
    [
      {
        "kind": "added",
        "path": "new.txt",
      },
      {
        "kind": "modified",
        "path": "src/file.ts",
      },
      {
        "kind": "deleted",
        "path": "old.txt",
      },
      {
        "kind": "renamed",
        "path": "new-name.txt",
      },
      {
        "kind": "copied",
        "path": "copy.txt",
      },
    ]
  `);
});

test('diff-summary empty input yields empty array', () => {
  expect(parseDiffSummary('')).toEqual([]);
});

test('diff-summary rejects unknown status strings', () => {
  expect(() => parseDiffSummary(`weirdstatus${FIELD_SEP}a.txt\n`)).toThrow(JjParseError);
});

// Real jj output is exercised end-to-end in driver.test.ts; the unit tests
// here cover the protocol-level invariants the parser enforces against
// malformed input that jj itself wouldn't produce.

test('parseRevisionDiffWithSummary throws when summary entries lack diff blocks', () => {
  // Summary mentions x.ts but the diff section has no matching `diff --git`
  // header.
  const stdout = `added\x1ex.ts\n\x1f`;
  expect(() => parseRevisionDiffWithSummary(stdout)).toThrow(JjParseError);
});

test('parseRevisionDiffWithSummary throws when diff blocks lack summary entries', () => {
  // Diff section has x.ts but summary doesn't list it.
  const stdout = `\x1fdiff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-a\n+b\n`;
  expect(() => parseRevisionDiffWithSummary(stdout)).toThrow(JjParseError);
});

test('parseRevisionDiffWithSummary throws on duplicate diff blocks', () => {
  const stdout =
    `added\x1ex.ts\n\x1f` +
    `diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n+a\n` +
    `diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n+b\n`;
  expect(() => parseRevisionDiffWithSummary(stdout)).toThrow(JjParseError);
});

test('parseRevisionDiffWithSummary throws when the section separator is missing', () => {
  expect(() => parseRevisionDiffWithSummary('added\x1ex.ts\n')).toThrow(JjParseError);
});

test('parseRevisionDiffWithSummary returns empty for empty input', () => {
  expect(parseRevisionDiffWithSummary('')).toEqual([]);
});

test('graph log splits data rows from continuation rows', () => {
  const dataLine = (graphPrefix: string, change: string): string =>
    graphPrefix +
    RECORD_PREFIX +
    buildRecord({ changeId: change, descriptionFirstLine: `desc-${change}` });
  const stdout = dataLine('@  ', 'aaa11111') + '│\n' + dataLine('○  ', 'bbb22222') + '~\n';

  expect(parseGraphLog(stdout)).toMatchInlineSnapshot(`
    [
      {
        "change": {
          "authorEmail": "a@x",
          "authorName": "A",
          "bookmarks": [],
          "changeId": "aaa11111",
          "commitId": "h",
          "description": "",
          "descriptionFirstLine": "desc-aaa11111",
          "isConflicted": false,
          "isEmpty": false,
          "isWorkingCopy": false,
          "parents": [],
        },
        "graphPrefix": "@  ",
        "kind": "change",
      },
      {
        "kind": "graphOnly",
        "text": "│",
      },
      {
        "change": {
          "authorEmail": "a@x",
          "authorName": "A",
          "bookmarks": [],
          "changeId": "bbb22222",
          "commitId": "h",
          "description": "",
          "descriptionFirstLine": "desc-bbb22222",
          "isConflicted": false,
          "isEmpty": false,
          "isWorkingCopy": false,
          "parents": [],
        },
        "graphPrefix": "○  ",
        "kind": "change",
      },
      {
        "kind": "graphOnly",
        "text": "~",
      },
    ]
  `);
});

test('graph log empty input yields empty array', () => {
  expect(parseGraphLog('')).toEqual([]);
});

test('graph log preserves leading box-drawing graph prefix', () => {
  const prefix = '│ ○  ';
  const line = prefix + RECORD_PREFIX + buildRecord({ changeId: 'feedbeef' });
  expect(parseGraphLog(line)).toMatchInlineSnapshot(`
    [
      {
        "change": {
          "authorEmail": "a@x",
          "authorName": "A",
          "bookmarks": [],
          "changeId": "feedbeef",
          "commitId": "h",
          "description": "",
          "descriptionFirstLine": "",
          "isConflicted": false,
          "isEmpty": false,
          "isWorkingCopy": false,
          "parents": [],
        },
        "graphPrefix": "│ ○  ",
        "kind": "change",
      },
    ]
  `);
});

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

test('parses op-log records', () => {
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
  expect(parseOpLogRecords(stdout)).toMatchInlineSnapshot(`
    [
      {
        "description": "snapshot working copy",
        "descriptionFirstLine": "snapshot working copy",
        "id": "aaa111",
        "time": "2026-05-23 13:29:43.395 -07:00",
        "user": "crouton@host",
      },
      {
        "description": "create bookmark feature pointing to commit abc
    second line",
        "descriptionFirstLine": "create bookmark feature pointing to commit abc",
        "id": "bbb222",
        "time": "2026-05-23 13:29:43.395 -07:00",
        "user": "crouton@host",
      },
    ]
  `);
});

test('op-log empty input yields empty array', () => {
  expect(parseOpLogRecords('')).toEqual([]);
});

test('op-log rejects wrong field count', () => {
  const bad = ['only', 'three', 'fields'].join(FIELD_SEP) + '\n';
  expect(() => parseOpLogRecords(bad)).toThrow(JjParseError);
});
