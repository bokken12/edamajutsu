import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjUnexpectedOutput } from '../jj/errors';
import { findJjRepo, JjRepo } from '../jj/repo';
import { Change, ChangeId } from '../model/change';
import { FileChange } from '../model/fileChange';
import { DecoratedLine, DecorationRanges, LineBuilder } from '../render/decoratedText';
import { fileKindGlyph } from '../render/fileKind';
import { BlankLineView, RenderContext, TextLineView, View } from './viewTree';

export const COMMIT_DETAIL_URI = vscode.Uri.from({
  scheme: 'edamajutsu',
  path: 'commit.edamajutsu'
});

export type Detail = {
  readonly change: Change;
  readonly files: ReadonlyArray<FileChange>;
  readonly diff: string;
};

export type Rendered = {
  readonly text: string;
  readonly decorations: DecorationRanges;
  // Root of the view tree used to render `text`. Kept around so toggleFold
  // can mutate it in place before the next render. Mirrors status.ts.
  readonly root: View;
};

const INITIAL: Rendered = {
  text: 'No change selected.',
  decorations: new Map(),
  root: new BlankLineView()
};

export class CommitDetailView implements vscode.TextDocumentContentProvider {
  private current: ChangeId | undefined;
  private rendered: Rendered = INITIAL;
  private refreshToken = 0;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  readonly uri = COMMIT_DETAIL_URI;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.rendered.text;
  }

  getDecorations(): DecorationRanges {
    return this.rendered.decorations;
  }

  currentChangeId(): ChangeId | undefined {
    return this.current;
  }

  // Toggle fold of the deepest foldable view containing `line`. Returns
  // true when a view was found and toggled; mirrors StatusView's behavior.
  toggleFoldAtLine(line: number): boolean {
    const target = this.rendered.root.foldableAt(line);
    if (!target) {
      return false;
    }
    target.folded = !target.folded;
    this.rendered = renderRoot(this.rendered.root);
    this.onDidChangeEmitter.fire(COMMIT_DETAIL_URI);
    return true;
  }

  async show(changeId: ChangeId, snapshot: boolean): Promise<void> {
    this.current = changeId;
    await this.refresh(snapshot);
  }

  async refresh(snapshot: boolean): Promise<void> {
    const token = ++this.refreshToken;
    const next = await this.produce(snapshot);
    if (token !== this.refreshToken) {
      return;
    }
    this.rendered = next;
    this.onDidChangeEmitter.fire(COMMIT_DETAIL_URI);
  }

  private async produce(snapshot: boolean): Promise<Rendered> {
    if (this.current === undefined) {
      return INITIAL;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
    if (!repo) {
      return renderRoot(buildTextRoot(renderNoRepo()));
    }
    try {
      const detail = await fetchDetail(new JjDriver({ repoRoot: repo.root }), this.current, snapshot);
      return renderDetail(detail);
    } catch (err) {
      return renderRoot(buildTextRoot(renderError(repo, err, this.current)));
    }
  }
}

async function fetchDetail(driver: JjDriver, revset: ChangeId, snapshot: boolean): Promise<Detail> {
  // Independent reads of the same revset — fire them in parallel. All three
  // are passed the same `snapshot` flag so they all see the same view of the
  // repo (snapshot acquires a lock; if it happens, only the first command to
  // run actually snapshots, the rest are no-ops).
  const [changes, files, diff] = await Promise.all([
    driver.log({ revset, limit: 1, snapshot }),
    driver.diffSummary({ revset, snapshot }),
    driver.diffText({ revset, snapshot })
  ]);
  const change = changes[0];
  if (!change) {
    throw new JjUnexpectedOutput(`change not found: ${revset}`);
  }
  return { change, files, diff };
}

function renderNoRepo(): string {
  return [
    'edamajutsu: commit',
    '',
    'No jj repository found in the current workspace.',
    ''
  ].join('\n');
}

function renderError(repo: JjRepo, err: unknown, changeId: ChangeId): string {
  const message = formatJjError(err);
  return [
    'edamajutsu: commit',
    '',
    `Repository: ${repo.root}`,
    `Change: ${changeId}`,
    '',
    'Failed to load commit detail:',
    ...message.split('\n').map((l) => `  ${l}`),
    ''
  ].join('\n');
}

// Pure rendering entry point — builds a fresh root view tree from the data
// and immediately renders it. Re-exported for tests.
export function renderDetail(detail: Detail): Rendered {
  return renderRoot(buildDetailRoot(detail));
}

export function renderRoot(root: View): Rendered {
  const ctx = new RenderContext();
  root.render(ctx);
  return {
    text: ctx.text(),
    decorations: ctx.decorations(),
    root
  };
}

export function buildDetailRoot(detail: Detail): View {
  const { change, files, diff } = detail;
  const root = new CommitDocumentView(change.changeId);
  root.subViews.push(new TextLineView(plainLine(`edamajutsu: commit ${change.changeId.slice(0, 8)}`)));
  root.subViews.push(new BlankLineView());

  root.subViews.push(new MetaSectionView(change));
  root.subViews.push(new BlankLineView());

  root.subViews.push(new DescriptionSectionView(change));
  root.subViews.push(new BlankLineView());

  if (files.length > 0) {
    root.subViews.push(new CommitFilesSectionView(files));
    root.subViews.push(new BlankLineView());
  }

  const diffBlocks = splitDiff(diff);
  if (diffBlocks.length > 0) {
    root.subViews.push(new DiffSectionView(change.changeId, diffBlocks));
    root.subViews.push(new BlankLineView());
  }
  return root;
}

// Wraps a fixed string (the no-repo / error path) so renderRoot can produce
// a uniform Rendered shape.
function buildTextRoot(text: string): View {
  const root = new CommitDocumentView(undefined);
  for (const line of text.split('\n')) {
    root.subViews.push(new TextLineView(plainLine(line)));
  }
  return root;
}

function plainLine(text: string): DecoratedLine {
  return new LineBuilder().plain(text).build();
}

// A single `diff --git a/<from> b/<to>` block parsed out of the raw diff
// text. `from` is the path used in the fold id so the user's fold choice
// rides through refresh.
type DiffBlock = {
  readonly from: string;
  readonly lines: ReadonlyArray<string>;
};

// Split the verbatim diff text into per-file blocks. Anything before the
// first `diff --git ` header is dropped (there shouldn't be any from `jj
// diff --git`, but be defensive).
function splitDiff(diff: string): DiffBlock[] {
  const lines = diff.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const blocks: DiffBlock[] = [];
  let current: { from: string; lines: string[] } | undefined;
  for (const line of lines) {
    const match = /^diff --git a\/(\S+) b\/\S+/.exec(line);
    if (match) {
      if (current) {
        blocks.push(current);
      }
      current = { from: match[1]!, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    blocks.push(current);
  }
  return blocks;
}

// Root view for a commit detail document. Not foldable; carries an id so the
// tree has a stable root identity.
class CommitDocumentView extends View {
  constructor(private readonly changeId: ChangeId | undefined) {
    super();
  }

  override get id(): string {
    return this.changeId ? `commit:root:${this.changeId}` : 'commit:root';
  }
}

// The Change/Commit/Author/Parents/Bookmarks/Flags block at the top of the
// document. Not foldable — it's small and always useful.
class MetaSectionView extends View {
  constructor(change: Change) {
    super();
    this.subViews.push(new TextLineView(plainLine(`Change:    ${change.changeId}`)));
    this.subViews.push(new TextLineView(plainLine(`Commit:    ${change.commitId}`)));
    this.subViews.push(
      new TextLineView(plainLine(`Author:    ${change.authorName} <${change.authorEmail}>`))
    );
    if (change.parents.length > 0) {
      this.subViews.push(
        new TextLineView(
          plainLine(`Parents:   ${change.parents.map((p) => p.slice(0, 8)).join(', ')}`)
        )
      );
    }
    if (change.bookmarks.length > 0) {
      this.subViews.push(new TextLineView(plainLine(`Bookmarks: ${change.bookmarks.join(', ')}`)));
    }
    const flags = [change.isEmpty ? 'empty' : '', change.isConflicted ? 'conflict' : '']
      .filter(Boolean)
      .join(', ');
    if (flags) {
      this.subViews.push(new TextLineView(plainLine(`Flags:     ${flags}`)));
    }
  }
}

// "Description:" section. Foldable, default open — the description is the
// main piece of human content on this page.
class DescriptionSectionView extends View {
  override isFoldable = true;
  override foldedByDefault = false;

  constructor(change: Change) {
    super();
    this.subViews.push(new TextLineView(plainLine('Description:')));
    const body = change.description.trimEnd();
    const lines = body === '' ? ['  (no description set)'] : body.split('\n').map((l) => `  ${l}`);
    for (const line of lines) {
      this.subViews.push(new TextLineView(plainLine(line)));
    }
  }

  override get id(): string {
    return 'commit:description';
  }
}

// "Files (N):" section. Foldable, default open. Distinct from status's
// StatusFilesSectionView because the file rows here don't carry diff bodies
// — the diff bodies live in their own section below.
class CommitFilesSectionView extends View {
  override isFoldable = true;
  override foldedByDefault = false;

  constructor(files: ReadonlyArray<FileChange>) {
    super();
    this.subViews.push(new TextLineView(plainLine(`Files (${files.length}):`)));
    for (const file of files) {
      this.subViews.push(new TextLineView(plainLine(`  ${fileKindGlyph(file.kind)} ${file.path}`)));
    }
  }

  override get id(): string {
    return 'commit:files';
  }
}

// "Diff:" section. Foldable, default open — when a user opens a commit they
// expect to see the file list of diffs (with bodies collapsed).
class DiffSectionView extends View {
  override isFoldable = true;
  override foldedByDefault = false;

  constructor(private readonly changeId: ChangeId, blocks: ReadonlyArray<DiffBlock>) {
    super();
    this.subViews.push(new TextLineView(plainLine('Diff:')));
    for (const block of blocks) {
      this.subViews.push(new DiffFileView(changeId, block));
    }
  }

  override get id(): string {
    return `commit:diff:${this.changeId}`;
  }
}

// One per-file diff block inside "Diff:". Foldable AND foldedByDefault so
// the user opens to a list of `diff --git` headers and expands on demand.
class DiffFileView extends View {
  override isFoldable = true;
  override foldedByDefault = true;

  constructor(
    private readonly changeId: ChangeId,
    private readonly block: DiffBlock
  ) {
    super();
    for (const line of block.lines) {
      this.subViews.push(new TextLineView(plainLine(line)));
    }
  }

  override get id(): string {
    // Scope the fold id by changeId so the same path in different commits
    // doesn't share fold state. Status uses an unqualified `status:file:`
    // because there's only one working copy at a time.
    return `commit:diff:${this.changeId}:${this.block.from}`;
  }
}
