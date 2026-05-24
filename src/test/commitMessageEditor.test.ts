// Pure-helper tests for the multi-line describe buffer. The
// FileSystemProvider lifecycle (open / save / close) requires a running
// vscode host and is exercised manually; only the comment-stripping and
// initial-buffer construction are unit-testable.

import { expect, test } from 'vitest';

import {
  buildInitialBuffer,
  stripCommentsFromMessage
} from '../views/commitMessageBuffer';

test('stripCommentsFromMessage drops # lines and trims trailing whitespace', () => {
  const input = [
    'Real first line',
    '',
    'Body paragraph.',
    '# this is a hint',
    '# more hints',
    ''
  ].join('\n');
  expect(stripCommentsFromMessage(input)).toBe(
    'Real first line\n\nBody paragraph.'
  );
});

test('stripCommentsFromMessage preserves internal blank lines', () => {
  // Two-paragraph description: subject + blank + body. The blank line
  // between paragraphs MUST survive (jj treats subject/body the same way
  // git does).
  const input = 'Subject\n\nBody line one\nBody line two\n';
  expect(stripCommentsFromMessage(input)).toBe(
    'Subject\n\nBody line one\nBody line two'
  );
});

test('stripCommentsFromMessage returns empty string when buffer is only comments', () => {
  const input = '# comment 1\n# comment 2\n';
  expect(stripCommentsFromMessage(input)).toBe('');
});

test('stripCommentsFromMessage only strips # at column 0, not mid-line', () => {
  // A literal `#` in the middle of a line (e.g. "fixes #42") must survive.
  const input = 'Fixes #42\n# strip me\n';
  expect(stripCommentsFromMessage(input)).toBe('Fixes #42');
});

test('buildInitialBuffer prepends current description and appends the help header', () => {
  const buf = buildInitialBuffer('Existing description');
  expect(buf.startsWith('Existing description\n\n')).toBe(true);
  expect(buf).toContain('# Enter the new description for @');
  expect(buf).toContain('# Save (Ctrl+S / Cmd+S) to submit');
});

test('buildInitialBuffer with empty description still produces a usable template', () => {
  // When @ has no description yet, the buffer starts with the comment block
  // separated by a blank line — the user types above it.
  const buf = buildInitialBuffer('');
  expect(buf.startsWith('\n\n#')).toBe(true);
});

test('buildInitialBuffer + stripCommentsFromMessage round-trips an unmodified buffer to the original', () => {
  // Opening then immediately saving (without edits) should preserve the
  // original description verbatim. This guards against accidental
  // newline-padding regressions.
  const original = 'Subject\n\nBody.';
  const buf = buildInitialBuffer(original);
  expect(stripCommentsFromMessage(buf)).toBe(original);
});
