import { Change } from '../model/change';
import { FileChange, FileChangeKind } from '../model/fileChange';
import { LineBuilder } from '../render/decoratedText';
import { DecorationKey } from '../render/decorations';
import { fileKindGlyph } from '../render/fileKind';
import { Node } from './viewTree';

// Tree construction for the commit-detail view. Three top-level sections
// (Description, Files, Diff) are foldable; inside Diff each per-file block
// (delimited by `diff --git ...` lines) is also foldable and defaults to
// collapsed so opening a commit shows file list rather than diff bodies.

export type CommitDetail = {
  readonly change: Change;
  readonly files: ReadonlyArray<FileChange>;
  readonly diff: string;
};

const DESCRIPTION_SECTION_ID = 'description';
const FILES_SECTION_ID = 'files';
const DIFF_SECTION_ID = 'diff';

export function buildTree(detail: CommitDetail): ReadonlyArray<Node> {
  const out: Node[] = [];
  const { change, files, diff } = detail;

  const plain = (text: string): Node => ({
    kind: 'line',
    line: new LineBuilder().plain(text).build()
  });

  out.push(plain(`edamajutsu: commit ${change.changeId.slice(0, 8)}`));
  out.push(plain(''));
  out.push(plain(`Change:    ${change.changeId}`));
  out.push(plain(`Commit:    ${change.commitId}`));
  out.push(plain(`Author:    ${change.authorName} <${change.authorEmail}>`));
  if (change.parents.length > 0) {
    out.push(plain(`Parents:   ${change.parents.map((p) => p.slice(0, 8)).join(', ')}`));
  }
  if (change.bookmarks.length > 0) {
    out.push(plain(`Bookmarks: ${change.bookmarks.join(', ')}`));
  }
  const flags = [change.isEmpty ? 'empty' : '', change.isConflicted ? 'conflict' : '']
    .filter(Boolean)
    .join(', ');
  if (flags) {
    out.push(plain(`Flags:     ${flags}`));
  }
  out.push(plain(''));

  out.push(buildDescriptionSection(change));
  out.push(plain(''));

  if (files.length > 0) {
    out.push(buildFilesSection(files));
    out.push(plain(''));
  }

  if (diff.trim() !== '') {
    out.push(buildDiffSection(diff));
    out.push(plain(''));
  }

  return out;
}

function buildDescriptionSection(change: Change): Node {
  const header = new LineBuilder().dec('sectionHeader', 'Description:').build();
  const body: Node[] = descriptionLines(change).map((text) => ({
    kind: 'line',
    line: new LineBuilder().plain(text).build()
  }));
  return {
    kind: 'fold',
    id: DESCRIPTION_SECTION_ID,
    foldedByDefault: false,
    header,
    body
  };
}

function descriptionLines(change: Change): string[] {
  const body = change.description.trimEnd();
  if (body === '') {
    return ['  (no description set)'];
  }
  return body.split('\n').map((line) => `  ${line}`);
}

function buildFilesSection(files: ReadonlyArray<FileChange>): Node {
  const header = new LineBuilder().dec('sectionHeader', `Files (${files.length}):`).build();
  const body: Node[] = files.map((file) => ({
    kind: 'line',
    line: new LineBuilder()
      .plain('  ')
      .dec(fileKindDecoration(file.kind), fileKindGlyph(file.kind))
      .plain(` ${file.path}`)
      .build()
  }));
  return {
    kind: 'fold',
    id: FILES_SECTION_ID,
    foldedByDefault: false,
    header,
    body
  };
}

function buildDiffSection(diff: string): Node {
  const header = new LineBuilder().dec('sectionHeader', 'Diff:').build();
  const body: Node[] = buildDiffBlocks(diff);
  return {
    kind: 'fold',
    id: DIFF_SECTION_ID,
    foldedByDefault: false,
    header,
    body
  };
}

// Splits `diff` on `diff --git ...` boundaries; each block becomes a fold
// node keyed on the path from the `b/<to>` half of the header. Lines before
// the first `diff --git` (if any) are emitted as plain lines so they aren't
// lost.
function buildDiffBlocks(diff: string): Node[] {
  const lines = diff.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const out: Node[] = [];
  let i = 0;
  // Stray preamble before the first `diff --git` (rare but possible).
  while (i < lines.length && !lines[i]!.startsWith('diff --git ')) {
    out.push(plainLine(lines[i]!));
    i += 1;
  }
  while (i < lines.length) {
    const headerText = lines[i]!;
    const path = parseDiffPath(headerText);
    const start = i;
    i += 1;
    while (i < lines.length && !lines[i]!.startsWith('diff --git ')) {
      i += 1;
    }
    const blockBody = lines.slice(start + 1, i);
    out.push({
      kind: 'fold',
      id: `diff:${path}`,
      foldedByDefault: true,
      header: new LineBuilder().plain(headerText).build(),
      body: blockBody.map(plainLine)
    });
  }
  return out;
}

// Parses `diff --git a/<from> b/<to>` and returns `<to>`. Falls back to the
// raw header if parsing fails — uniqueness still holds across blocks in the
// same diff.
function parseDiffPath(headerText: string): string {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(headerText);
  if (match) {
    return match[2]!;
  }
  return headerText;
}

function plainLine(text: string): Node {
  return { kind: 'line', line: new LineBuilder().plain(text).build() };
}

function fileKindDecoration(kind: FileChangeKind): DecorationKey {
  switch (kind) {
    case 'added':
      return 'fileAdded';
    case 'modified':
      return 'fileModified';
    case 'deleted':
      return 'fileDeleted';
    case 'renamed':
      return 'fileRenamed';
    case 'copied':
      return 'fileCopied';
  }
}
