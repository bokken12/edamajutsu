import { beforeEach, expect, test, vi } from 'vitest';

// commitDetail.ts imports `vscode`. Stub the same handful of APIs as the
// status-view tests so the renderer can run in plain Node.
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
      public startChar: number,
      public endLine: number,
      public endChar: number
    ) {}
    get start() {
      return { line: this.startLine, character: this.startChar };
    }
    get end() {
      return { line: this.endLine, character: this.endChar };
    }
  },
  FoldingRange: class {
    constructor(
      public start: number,
      public end: number,
      public kind?: unknown
    ) {}
  },
  FoldingRangeKind: { Region: 0 },
  workspace: { workspaceFolders: undefined },
  window: { activeTextEditor: undefined },
  commands: { executeCommand: () => Promise.resolve() }
}));

import { FileChange } from '../model/fileChange';
import { Change, changeId, commitId } from '../model/change';
import {
  buildDetailRoot,
  CommitDetailView,
  Detail,
  renderDetail,
  renderRoot
} from '../views/commitDetail';
import { resetFoldMemory, View } from '../views/viewTree';

beforeEach(() => {
  resetFoldMemory();
});

const CHANGE: Change = {
  changeId: changeId('abcdabcdabcdabcd'),
  commitId: commitId('11112222333344445555'),
  description: 'subject line\n\nbody paragraph',
  descriptionFirstLine: 'subject line',
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  parents: [changeId('parentid1'), changeId('parentid2')],
  bookmarks: ['feature/x'],
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
  '@@ -1,2 +1,2 @@',
  '-old foo',
  '+new foo',
  'diff --git a/src/bar.ts b/src/bar.ts',
  '@@ -0,0 +1 @@',
  '+brand new',
  ''
].join('\n');

const DETAIL: Detail = { change: CHANGE, files: FILES, diff: DIFF };

function lineCount(text: string): number {
  return text.split('\n').length;
}

function findById(root: View, id: string): View | undefined {
  for (const v of root.walk()) {
    if (v.id === id) {
      return v;
    }
  }
  return undefined;
}

test('default render hides per-file diff bodies but keeps headers visible', () => {
  const rendered = renderDetail(DETAIL);
  expect(rendered.text).toMatchInlineSnapshot(`
    "edamajutsu: commit abcdabcd

    Change:    abcdabcdabcdabcd
    Commit:    11112222333344445555
    Author:    Alice <alice@example.com>
    Parents:   parentid, parentid
    Bookmarks: feature/x

    Description:
      subject line
      
      body paragraph

    Files (2):
      M src/foo.ts
      A src/bar.ts

    Diff:
    diff --git a/src/foo.ts b/src/foo.ts
    diff --git a/src/bar.ts b/src/bar.ts
    "
  `);
  // Diff bodies should not appear.
  expect(rendered.text).not.toContain('@@');
  expect(rendered.text).not.toContain('+new foo');
  expect(rendered.text).not.toContain('+brand new');
});

test('expanding one diff file shows that body while others stay folded', () => {
  const root = buildDetailRoot(DETAIL);
  renderRoot(root);

  const fooDiff = findById(root, `commit:diff:${CHANGE.changeId}:src/foo.ts`);
  expect(fooDiff).toBeDefined();
  fooDiff!.folded = false;

  const rendered = renderRoot(root);
  expect(rendered.text).toContain('diff --git a/src/foo.ts b/src/foo.ts');
  expect(rendered.text).toContain('@@ -1,2 +1,2 @@');
  expect(rendered.text).toContain('+new foo');
  // bar stays folded.
  expect(rendered.text).toContain('diff --git a/src/bar.ts b/src/bar.ts');
  expect(rendered.text).not.toContain('+brand new');
});

test('folding the Diff section header collapses every per-file block', () => {
  const root = buildDetailRoot(DETAIL);
  renderRoot(root);

  const diffSection = findById(root, `commit:diff:${CHANGE.changeId}`);
  expect(diffSection).toBeDefined();
  diffSection!.folded = true;

  const rendered = renderRoot(root);
  expect(rendered.text).toContain('Diff:');
  expect(rendered.text).not.toContain('diff --git');
  expect(rendered.text).not.toContain('src/foo.ts b/src/foo.ts');
});

test('folding the Description section hides the body but keeps the header', () => {
  const root = buildDetailRoot(DETAIL);
  renderRoot(root);

  const desc = findById(root, 'commit:description');
  expect(desc).toBeDefined();
  desc!.folded = true;

  const rendered = renderRoot(root);
  expect(rendered.text).toContain('Description:');
  expect(rendered.text).not.toContain('subject line');
  expect(rendered.text).not.toContain('body paragraph');
});

test('folding the Files section hides the file list but keeps the header', () => {
  const root = buildDetailRoot(DETAIL);
  renderRoot(root);

  const files = findById(root, 'commit:files');
  expect(files).toBeDefined();
  files!.folded = true;

  const rendered = renderRoot(root);
  expect(rendered.text).toContain('Files (2):');
  // The path rows are gone…
  expect(rendered.text).not.toMatch(/^ {2}M src\/foo\.ts$/m);
  expect(rendered.text).not.toMatch(/^ {2}A src\/bar\.ts$/m);
});

test('toggleFoldAtLine on a diff-header line flips that file open', () => {
  const view = new CommitDetailView();
  const rendered = renderDetail(DETAIL);
  (view as unknown as { rendered: typeof rendered }).rendered = rendered;

  const lines = rendered.text.split('\n');
  const fooHeaderIdx = lines.findIndex((l) => l === 'diff --git a/src/foo.ts b/src/foo.ts');
  expect(fooHeaderIdx).toBeGreaterThan(0);

  const before = lineCount(view.provideTextDocumentContent({} as never));
  const toggled = view.toggleFoldAtLine(fooHeaderIdx);
  expect(toggled).toBe(true);
  const after = view.provideTextDocumentContent({} as never);
  expect(after).toContain('@@ -1,2 +1,2 @@');
  expect(after).toContain('+new foo');
  expect(lineCount(after)).toBeGreaterThan(before);
});

test('toggleFoldAtLine past the document end returns false', () => {
  const view = new CommitDetailView();
  const rendered = renderDetail(DETAIL);
  (view as unknown as { rendered: typeof rendered }).rendered = rendered;

  const totalLines = rendered.text.split('\n').length;
  expect(view.toggleFoldAtLine(totalLines + 5)).toBe(false);
});

test('fold memory persists across rebuilds (refresh simulation)', () => {
  // Render once, open foo's diff, then throw the tree away and rebuild from
  // scratch — foo should remain open because its `id` looks up the previous
  // user choice in the module-level memory map.
  const root1 = buildDetailRoot(DETAIL);
  renderRoot(root1);
  const foo1 = findById(root1, `commit:diff:${CHANGE.changeId}:src/foo.ts`);
  expect(foo1).toBeDefined();
  foo1!.folded = false;

  const root2 = buildDetailRoot(DETAIL);
  const rendered = renderRoot(root2);
  expect(rendered.text).toContain('+new foo');
  // bar remains folded.
  expect(rendered.text).not.toContain('+brand new');
});

test('CommitDetailView with no current change reports the placeholder text', () => {
  const view = new CommitDetailView();
  expect(view.provideTextDocumentContent({} as never)).toBe('No change selected.');
  expect(view.currentChangeId()).toBeUndefined();
});
