import { expect, test, vi } from 'vitest';

// statusTree.ts transitively imports decoratedText which references
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

import { FileDiff } from '../jj/parse';
import { Change, changeId, commitId } from '../model/change';
import { buildTree } from '../views/statusTree';
import { FoldState, Rendered, render } from '../views/viewTree';

const WORKING: Change = {
  changeId: changeId('aaaaaaaa'),
  commitId: commitId('11111111'),
  description: 'wc',
  descriptionFirstLine: 'wc',
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  parents: [changeId('zzzzzzzz')],
  bookmarks: [],
  isConflicted: false,
  isEmpty: false,
  isWorkingCopy: true
};

const PARENT: Change = {
  changeId: changeId('bbbbbbbb'),
  commitId: commitId('22222222'),
  description: 'parent',
  descriptionFirstLine: 'parent',
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  parents: [],
  bookmarks: [],
  isConflicted: false,
  isEmpty: false,
  isWorkingCopy: false
};

const FILES: ReadonlyArray<FileDiff> = [
  {
    kind: 'modified',
    path: 'src/foo.ts',
    body: [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new'
    ]
  },
  {
    kind: 'added',
    path: 'src/bar.ts',
    body: ['diff --git a/src/bar.ts b/src/bar.ts', '@@ -0,0 +1 @@', '+brand new']
  }
];

const REPO = { root: '/repo' };

const DATA = { workingCopy: WORKING, parent: PARENT, files: FILES };

const EMPTY: FoldState = new Map();

// Dump every relevant field of a Rendered into a single readable string:
// the effective fold map followed by one row per line with its enclosing
// fold id and the change it belongs to. Per-line lookups (lineToFoldId,
// lineToChange) and the effective map are easier to read — and update on
// purpose — as one snapshot than as scattered `expect(...).toBe(...)` calls.
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

test('default fold state: per-file diffs collapsed, section expanded', () => {
  const r = render(buildTree(REPO, DATA), EMPTY);
  expect(annotate(r)).toMatchInlineSnapshot(`
    "effective:
      files = expanded
      file:src/foo.ts = collapsed
      file:src/bar.ts = collapsed

    lines (fold | change | text):
    -               | -    | edamajutsu: status
    -               | -    | 
    -               | -    | Repository: /repo
    -               | -    | 
    -               | aaaa | Working copy: aaaaaaaa 11111111
    -               | aaaa |   wc
    -               | aaaa |   Alice <alice@example.com>
    -               | -    | 
    -               | bbbb | Parent commit: bbbbbbbb 22222222
    -               | bbbb |   parent
    -               | bbbb |   Alice <alice@example.com>
    -               | -    | 
    files           | aaaa | Working copy changes (2):
    file:src/foo.ts | aaaa |   M src/foo.ts
    file:src/bar.ts | aaaa |   A src/bar.ts
    -               | -    | "
  `);
});

test('foo expanded: only foo.ts diff body visible', () => {
  const fold = new Map<string, boolean>([['file:src/foo.ts', false]]);
  const r = render(buildTree(REPO, DATA), fold);
  expect(annotate(r)).toMatchInlineSnapshot(`
    "effective:
      files = expanded
      file:src/foo.ts = expanded
      file:src/bar.ts = collapsed

    lines (fold | change | text):
    -               | -    | edamajutsu: status
    -               | -    | 
    -               | -    | Repository: /repo
    -               | -    | 
    -               | aaaa | Working copy: aaaaaaaa 11111111
    -               | aaaa |   wc
    -               | aaaa |   Alice <alice@example.com>
    -               | -    | 
    -               | bbbb | Parent commit: bbbbbbbb 22222222
    -               | bbbb |   parent
    -               | bbbb |   Alice <alice@example.com>
    -               | -    | 
    files           | aaaa | Working copy changes (2):
    file:src/foo.ts | aaaa |   M src/foo.ts
    file:src/foo.ts | aaaa | diff --git a/src/foo.ts b/src/foo.ts
    file:src/foo.ts | aaaa | @@ -1 +1 @@
    file:src/foo.ts | aaaa | -old
    file:src/foo.ts | aaaa | +new
    file:src/bar.ts | aaaa |   A src/bar.ts
    -               | -    | "
  `);
});

test('section collapsed: every file under the section hidden', () => {
  const fold = new Map<string, boolean>([['files', true]]);
  const r = render(buildTree(REPO, DATA), fold);
  expect(annotate(r)).toMatchInlineSnapshot(`
    "effective:
      files = collapsed

    lines (fold | change | text):
    -     | -    | edamajutsu: status
    -     | -    | 
    -     | -    | Repository: /repo
    -     | -    | 
    -     | aaaa | Working copy: aaaaaaaa 11111111
    -     | aaaa |   wc
    -     | aaaa |   Alice <alice@example.com>
    -     | -    | 
    -     | bbbb | Parent commit: bbbbbbbb 22222222
    -     | bbbb |   parent
    -     | bbbb |   Alice <alice@example.com>
    -     | -    | 
    files | aaaa | Working copy changes (2):
    -     | -    | "
  `);
});

test('no files: tree has no section node and no fold ids', () => {
  const r = render(buildTree(REPO, { workingCopy: WORKING, parent: PARENT, files: [] }), EMPTY);
  expect(r.text).not.toContain('Working copy changes');
  expect(r.lineToFoldId.every((id) => id === undefined)).toBe(true);
  expect(r.effective.size).toBe(0);
});

test('root parent is suppressed', () => {
  const root: Change = { ...PARENT, changeId: changeId('zzzzzzzz') };
  const r = render(
    buildTree(REPO, { workingCopy: WORKING, parent: root, files: [] }),
    EMPTY
  );
  expect(r.text).not.toContain('Parent commit:');
});

test('toggling a default-folded file expands it', () => {
  const tree = buildTree(REPO, DATA);
  const r1 = render(tree, EMPTY);
  const fold = new Map<string, boolean>();
  // Simulate StatusView.toggleFoldAtLine: look up fold id at the file's path
  // line, flip current effective state.
  const lines1 = r1.text.split('\n');
  const fooLine = lines1.findIndex((l) => l.includes('M src/foo.ts'));
  const id = r1.lineToFoldId[fooLine];
  expect(id).toBe('file:src/foo.ts');
  fold.set(id!, !r1.effective.get(id!));
  const r2 = render(tree, fold);
  expect(r2.text).toContain('+new');
});

test('render is pure on plain data', () => {
  const tree = buildTree(REPO, DATA);
  const a = render(tree, EMPTY).text;
  const b = render(tree, EMPTY).text;
  expect(a).toBe(b);
});
