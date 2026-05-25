import { expect, test, vi } from 'vitest';

// commitTree.ts transitively imports decoratedText which references
// vscode.Range. Stub the handful of vscode bits the renderer touches.
vi.mock('vscode', () => ({
  Uri: {
    from: (parts: { scheme: string; path: string }) => ({
      ...parts,
      toString: () => `${parts.scheme}:${parts.path}`
    })
  },
  EventEmitter: class {
    event = (): { dispose: () => void } => ({ dispose: () => {} });
    fire(): void {}
  },
  Range: class {
    constructor(
      public startLine: number,
      public startCol: number,
      public endLine: number,
      public endCol: number
    ) {}
  },
  FoldingRange: class {},
  FoldingRangeKind: { Region: 'region' }
}));

import { Change, changeId, commitId } from '../model/change';
import { FileChange } from '../model/fileChange';
import { buildTree, CommitDetail } from '../views/commitTree';
import { FoldState, Rendered, render } from '../views/viewTree';

const CHANGE: Change = {
  changeId: changeId('abcdef01'),
  commitId: commitId('cafebabe'),
  description: 'First line of description\nsecond paragraph',
  descriptionFirstLine: 'First line of description',
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  parents: [changeId('parent01')],
  bookmarks: ['main'],
  isConflicted: false,
  isEmpty: false,
  isWorkingCopy: false
};

const FILES: ReadonlyArray<FileChange> = [
  { kind: 'modified', path: 'src/foo.ts' },
  { kind: 'added', path: 'src/bar.ts' }
];

const DIFF = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  'diff --git a/src/bar.ts b/src/bar.ts',
  '@@ -0,0 +1 @@',
  '+brand new',
  ''
].join('\n');

const DETAIL: CommitDetail = { change: CHANGE, files: FILES, diff: DIFF };

const EMPTY: FoldState = new Map();

// Dump every relevant field of a Rendered into a single readable string,
// matching the shape used by statusTree's annotate(): one row per line with
// its enclosing fold id, followed by the effective fold map. Commit detail
// doesn't tag lines with changes, so lineToChange is uniformly empty here.
function annotate(r: Rendered): string {
  const lines = r.text.split('\n');
  const fold = (i: number): string => r.lineToFoldId[i] ?? '-';
  const change = (i: number): string => r.lineToChange[i]?.changeId.slice(0, 4) ?? '-';

  const foldWidth = Math.max(4, ...lines.map((_, i) => fold(i).length));
  const changeWidth = Math.max(2, ...lines.map((_, i) => change(i).length));

  const body = lines
    .map((text, i) => `${fold(i).padEnd(foldWidth)} | ${change(i).padEnd(changeWidth)} | ${text}`)
    .join('\n');

  const eff = [...r.effective.entries()]
    .map(([id, collapsed]) => `  ${id} = ${collapsed ? 'collapsed' : 'expanded'}`)
    .join('\n');

  return `effective:\n${eff || '  (none)'}\n\nlines (fold | change | text):\n${body}`;
}

test('default fold state: sections expanded, per-file diff blocks collapsed', () => {
  const r = render(buildTree(DETAIL), EMPTY);
  expect(annotate(r)).toMatchInlineSnapshot(`
    "effective:
      description = expanded
      files = expanded
      diff = expanded
      diff:src/foo.ts = collapsed
      diff:src/bar.ts = collapsed

    lines (fold | change | text):
    -               | -  | edamajutsu: commit abcdef01
    -               | -  | 
    -               | -  | Change:    abcdef01
    -               | -  | Commit:    cafebabe
    -               | -  | Author:    Alice <alice@example.com>
    -               | -  | Parents:   parent01
    -               | -  | Bookmarks: main
    -               | -  | 
    description     | -  | Description:
    description     | -  |   First line of description
    description     | -  |   second paragraph
    -               | -  | 
    files           | -  | Files (2):
    files           | -  |   M src/foo.ts
    files           | -  |   A src/bar.ts
    -               | -  | 
    diff            | -  | Diff:
    diff:src/foo.ts | -  | diff --git a/src/foo.ts b/src/foo.ts
    diff:src/bar.ts | -  | diff --git a/src/bar.ts b/src/bar.ts
    -               | -  | "
  `);
});

test('foo diff expanded: only foo body visible', () => {
  const fold = new Map<string, boolean>([['diff:src/foo.ts', false]]);
  const r = render(buildTree(DETAIL), fold);
  expect(annotate(r)).toMatchInlineSnapshot(`
    "effective:
      description = expanded
      files = expanded
      diff = expanded
      diff:src/foo.ts = expanded
      diff:src/bar.ts = collapsed

    lines (fold | change | text):
    -               | -  | edamajutsu: commit abcdef01
    -               | -  | 
    -               | -  | Change:    abcdef01
    -               | -  | Commit:    cafebabe
    -               | -  | Author:    Alice <alice@example.com>
    -               | -  | Parents:   parent01
    -               | -  | Bookmarks: main
    -               | -  | 
    description     | -  | Description:
    description     | -  |   First line of description
    description     | -  |   second paragraph
    -               | -  | 
    files           | -  | Files (2):
    files           | -  |   M src/foo.ts
    files           | -  |   A src/bar.ts
    -               | -  | 
    diff            | -  | Diff:
    diff:src/foo.ts | -  | diff --git a/src/foo.ts b/src/foo.ts
    diff:src/foo.ts | -  | @@ -1 +1 @@
    diff:src/foo.ts | -  | -old
    diff:src/foo.ts | -  | +new
    diff:src/bar.ts | -  | diff --git a/src/bar.ts b/src/bar.ts
    -               | -  | "
  `);
});

test('Diff: section collapsed: every per-file block hidden', () => {
  const fold = new Map<string, boolean>([['diff', true]]);
  const r = render(buildTree(DETAIL), fold);
  expect(annotate(r)).toMatchInlineSnapshot(`
    "effective:
      description = expanded
      files = expanded
      diff = collapsed

    lines (fold | change | text):
    -           | -  | edamajutsu: commit abcdef01
    -           | -  | 
    -           | -  | Change:    abcdef01
    -           | -  | Commit:    cafebabe
    -           | -  | Author:    Alice <alice@example.com>
    -           | -  | Parents:   parent01
    -           | -  | Bookmarks: main
    -           | -  | 
    description | -  | Description:
    description | -  |   First line of description
    description | -  |   second paragraph
    -           | -  | 
    files       | -  | Files (2):
    files       | -  |   M src/foo.ts
    files       | -  |   A src/bar.ts
    -           | -  | 
    diff        | -  | Diff:
    -           | -  | "
  `);
});

test('toggling a default-folded diff block expands it', () => {
  const tree = buildTree(DETAIL);
  const r1 = render(tree, EMPTY);
  const fold = new Map<string, boolean>();
  const lines1 = r1.text.split('\n');
  const fooHeader = lines1.findIndex((l) => l === 'diff --git a/src/foo.ts b/src/foo.ts');
  const id = r1.lineToFoldId[fooHeader];
  expect(id).toBe('diff:src/foo.ts');
  fold.set(id!, !r1.effective.get(id!));
  const r2 = render(tree, fold);
  expect(r2.text).toContain('+new');
  // bar block should still be collapsed.
  expect(r2.text).not.toContain('+brand new');
});

test('empty description renders the placeholder under the section', () => {
  const detail: CommitDetail = {
    change: { ...CHANGE, description: '', descriptionFirstLine: '' },
    files: [],
    diff: ''
  };
  const r = render(buildTree(detail), EMPTY);
  expect(r.text).toContain('Description:');
  expect(r.text).toContain('  (no description set)');
  expect(r.text).not.toContain('Files (');
  expect(r.text).not.toContain('Diff:');
});

test('no files and no diff: only Description section appears', () => {
  const detail: CommitDetail = { change: CHANGE, files: [], diff: '' };
  const r = render(buildTree(detail), EMPTY);
  expect(r.effective.has('description')).toBe(true);
  expect(r.effective.has('files')).toBe(false);
  expect(r.effective.has('diff')).toBe(false);
});

test('render is pure on plain data', () => {
  const tree = buildTree(DETAIL);
  const a = render(tree, EMPTY).text;
  const b = render(tree, EMPTY).text;
  expect(a).toBe(b);
});
