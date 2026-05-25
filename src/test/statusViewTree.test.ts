import { beforeEach, expect, test, vi } from 'vitest';

// status.ts imports `vscode`. Stub the handful of APIs the view tree touches
// so the renderer can run in plain Node — same shape as help.test.ts.
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

import { FileDiff } from '../jj/parse';
import { JjRepo } from '../jj/repo';
import { Change, changeId, commitId } from '../model/change';
import { buildStatusRoot, renderRoot, renderStatus, StatusData, StatusView } from '../views/status';
import { resetFoldMemory, View } from '../views/viewTree';

// Reset the module-level fold memory between tests so a fold flip in one
// test does not leak into the next.
beforeEach(() => {
  resetFoldMemory();
});

const REPO: JjRepo = { root: '/tmp/repo' };

const WORKING_COPY: Change = {
  changeId: changeId('wcwcwcwcwcwcwcwc'),
  commitId: commitId('cmcmcmcmcmcmcmcm'),
  description: 'wip\nbody',
  descriptionFirstLine: 'wip',
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  parents: [changeId('parentid')],
  bookmarks: [],
  isConflicted: false,
  isEmpty: false,
  isWorkingCopy: true
};

const PARENT: Change = {
  changeId: changeId('papapapapapapapa'),
  commitId: commitId('pcpcpcpcpcpcpcpc'),
  description: 'parent change',
  descriptionFirstLine: 'parent change',
  authorName: 'Bob',
  authorEmail: 'bob@example.com',
  parents: [],
  bookmarks: ['main'],
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
      '@@ -1,2 +1,2 @@',
      '-old foo',
      '+new foo'
    ]
  },
  {
    kind: 'added',
    path: 'src/bar.ts',
    body: ['diff --git a/src/bar.ts b/src/bar.ts', '@@ -0,0 +1 @@', '+brand new']
  },
  {
    kind: 'modified',
    path: 'src/baz.ts',
    body: ['diff --git a/src/baz.ts b/src/baz.ts', '@@ -1 +1 @@', '-baz one', '+baz two']
  }
];

const STATUS: StatusData = {
  workingCopy: WORKING_COPY,
  parent: PARENT,
  files: FILES
};

// Drop-in line counter for tests that just want to know whether something
// is visible in the rendered document.
function lineCount(text: string): number {
  return text.split('\n').length;
}

test('default render folds every per-file diff body', () => {
  const rendered = renderStatus(REPO, STATUS);
  expect(rendered.text).toMatchInlineSnapshot(`
    "edamajutsu: status

    Repository: /tmp/repo

    Working copy: wcwcwcwc cmcmcmcm
      wip
      Alice <alice@example.com>

    Parent commit: papapapa pcpcpcpc [main]
      parent change
      Bob <bob@example.com>

    Working copy changes (3):
      M src/foo.ts
      A src/bar.ts
      M src/baz.ts
    "
  `);
  // None of the diff body lines should appear in the rendered text.
  expect(rendered.text).not.toContain('@@');
  expect(rendered.text).not.toContain('+brand new');
});

test('expanding one file shows that file diff while others stay folded', () => {
  const root = buildStatusRoot(REPO, STATUS);
  // First render is needed so each FileView has a populated range.
  renderRoot(root);

  // Locate the FileView for foo.ts and flip it open.
  let fooView: View | undefined;
  for (const view of root.walk()) {
    if (view.isFoldable && view.id === 'status:file:src/foo.ts') {
      fooView = view;
    }
  }
  expect(fooView).toBeDefined();
  fooView!.folded = false;

  const rendered = renderRoot(root);
  expect(rendered.text).toMatchInlineSnapshot(`
    "edamajutsu: status

    Repository: /tmp/repo

    Working copy: wcwcwcwc cmcmcmcm
      wip
      Alice <alice@example.com>

    Parent commit: papapapa pcpcpcpc [main]
      parent change
      Bob <bob@example.com>

    Working copy changes (3):
      M src/foo.ts
    diff --git a/src/foo.ts b/src/foo.ts
    @@ -1,2 +1,2 @@
    -old foo
    +new foo
      A src/bar.ts
      M src/baz.ts
    "
  `);
});

test('folding the section header collapses everything under it', () => {
  const root = buildStatusRoot(REPO, STATUS);
  renderRoot(root);

  let section: View | undefined;
  for (const view of root.walk()) {
    if (view.isFoldable && view.id === 'status:workingCopyChanges') {
      section = view;
    }
  }
  expect(section).toBeDefined();
  section!.folded = true;

  const rendered = renderRoot(root);
  expect(rendered.text).toMatchInlineSnapshot(`
    "edamajutsu: status

    Repository: /tmp/repo

    Working copy: wcwcwcwc cmcmcmcm
      wip
      Alice <alice@example.com>

    Parent commit: papapapa pcpcpcpc [main]
      parent change
      Bob <bob@example.com>

    Working copy changes (3):
    "
  `);
  expect(rendered.text).not.toContain('foo.ts');
  expect(rendered.text).not.toContain('bar.ts');
});

test('lineToChange maps every visible line in the files section to the working copy', () => {
  const rendered = renderStatus(REPO, STATUS);
  const lines = rendered.text.split('\n');
  const headerIdx = lines.findIndex((l) => l.startsWith('Working copy changes'));
  expect(headerIdx).toBeGreaterThan(0);

  // The four lines of the section (header + 3 file path lines) should all
  // point to the working copy change.
  for (let i = headerIdx; i < headerIdx + 4; i++) {
    expect(rendered.lineToChange[i]?.changeId).toBe(WORKING_COPY.changeId);
  }
});

test('toggleFoldAtLine on a file path line flips that file open', () => {
  const view = new StatusView();
  // Reach into the rendered state by stubbing produce — easier: just call
  // refresh via a synthetic state by injecting through the public surface.
  // We use the renderer directly: assign rendered then call toggle.
  const rendered = renderStatus(REPO, STATUS);
  // `rendered` is what refresh() would have produced; install it so the view
  // can find its root.
  (view as unknown as { rendered: typeof rendered }).rendered = rendered;

  const lines = rendered.text.split('\n');
  const fooIdx = lines.findIndex((l) => l.includes('src/foo.ts'));
  expect(fooIdx).toBeGreaterThan(0);

  const before = lineCount(view.provideTextDocumentContent({} as never));
  const toggled = view.toggleFoldAtLine(fooIdx);
  expect(toggled).toBe(true);
  const after = view.provideTextDocumentContent({} as never);
  expect(after).toContain('@@ -1,2 +1,2 @@');
  expect(after).toContain('+new foo');
  expect(lineCount(after)).toBeGreaterThan(before);
});

test('toggleFoldAtLine past the document end returns false', () => {
  const view = new StatusView();
  const rendered = renderStatus(REPO, STATUS);
  (view as unknown as { rendered: typeof rendered }).rendered = rendered;

  const totalLines = rendered.text.split('\n').length;
  // A line beyond the document is not inside any view's range; toggleFold
  // returns false so the caller can fall back to VSCode's editor.toggleFold.
  expect(view.toggleFoldAtLine(totalLines + 5)).toBe(false);
});

test('fold memory persists across rebuilds (refresh simulation)', () => {
  // Render once, open foo, then throw the tree away and rebuild from
  // scratch — foo should remain open because its `id` looks up the previous
  // user choice in the module-level memory map.
  const root1 = buildStatusRoot(REPO, STATUS);
  renderRoot(root1);
  for (const view of root1.walk()) {
    if (view.id === 'status:file:src/foo.ts') {
      view.folded = false;
    }
  }

  const root2 = buildStatusRoot(REPO, STATUS);
  const rendered = renderRoot(root2);
  expect(rendered.text).toContain('+new foo');
  // bar and baz remain folded.
  expect(rendered.text).not.toContain('+brand new');
});

test('status view exposes no folding ranges (folding is in the tree, not VSCode)', () => {
  const view = new StatusView();
  expect(view.getFoldingRanges()).toEqual([]);
});
