import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjSpawnError, JjUnexpectedOutput } from '../jj/errors';
import { FileDiff } from '../jj/parse';
import { JjRepo, findJjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { FileChangeKind } from '../model/fileChange';
import { DecoratedLine, DecorationRanges, LineBuilder } from '../render/decoratedText';
import { DecorationKey } from '../render/decorations';
import { fileKindGlyph } from '../render/fileKind';
import { BlankLineView, RenderContext, TextLineView, View } from './viewTree';

export const STATUS_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'status.edamajutsu' });

export type StatusData = {
  readonly workingCopy: Change;
  readonly parent: Change | undefined;
  // Each entry carries both its file kind (for the path-line decoration) and
  // its unified-diff body (rendered inline beneath the path with its own
  // fold range). Comes from a single combined `jj log -T` call — see
  // `JjDriver.revisionDiff`.
  readonly files: ReadonlyArray<FileDiff>;
};

export type Rendered = {
  readonly text: string;
  // For each line index, the Change that line "belongs to" (used by `RET`
  // to drill into the commit detail). Undefined for header / blank / non-
  // change rows.
  readonly lineToChange: ReadonlyArray<Change | undefined>;
  readonly decorations: DecorationRanges;
  // The root view used to render `text`. Kept around so the toggle command
  // can look up the foldable view at a given line and mutate it in place
  // before re-rendering on the next refresh.
  readonly root: View;
};

const INITIAL: Rendered = {
  text: 'Loading...',
  lineToChange: [],
  decorations: new Map(),
  root: new BlankLineView()
};

export class StatusView implements vscode.TextDocumentContentProvider {
  private rendered: Rendered = INITIAL;
  private refreshToken = 0;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  readonly uri = STATUS_URI;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.rendered.text;
  }

  // Status view manages folding via the view tree, not VSCode folding
  // ranges — collapsed content is literally absent from the document text,
  // so there is nothing for VSCode to fold.
  getFoldingRanges(): ReadonlyArray<vscode.FoldingRange> {
    return [];
  }

  getDecorations(): DecorationRanges {
    return this.rendered.decorations;
  }

  changeAtLine(line: number): Change | undefined {
    return this.rendered.lineToChange[line];
  }

  // Toggle fold state of the deepest foldable view containing `line`, then
  // re-render. Returns true if a view was toggled. Callers use the return
  // value to decide whether to fall back to VSCode's editor.toggleFold for
  // lines outside any foldable view.
  toggleFoldAtLine(line: number): boolean {
    const target = this.rendered.root.foldableAt(line);
    if (!target) {
      return false;
    }
    target.folded = !target.folded;
    this.rendered = renderRoot(this.rendered.root);
    this.onDidChangeEmitter.fire(STATUS_URI);
    return true;
  }

  async refresh(snapshot: boolean): Promise<void> {
    const token = ++this.refreshToken;
    const next = await this.produce(snapshot);
    if (token !== this.refreshToken) {
      return;
    }
    this.rendered = next;
    this.onDidChangeEmitter.fire(STATUS_URI);
  }

  private async produce(snapshot: boolean): Promise<Rendered> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
    if (!repo) {
      return renderRoot(buildTextRoot(renderNoRepo()));
    }
    try {
      const data = await fetchStatus(new JjDriver({ repoRoot: repo.root }), snapshot);
      return renderStatus(repo, data);
    } catch (err) {
      return renderRoot(buildTextRoot(renderError(repo, err)));
    }
  }
}

export async function openStatus(view: StatusView): Promise<void> {
  await view.refresh(false);
  const doc = await vscode.workspace.openTextDocument(STATUS_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function fetchStatus(driver: JjDriver, snapshot: boolean): Promise<StatusData> {
  // Three independent reads of working-copy state — fired in parallel. All
  // three get the same `snapshot` flag so they end up consistent: jj
  // serialises snapshotting on a lock, the first command to acquire it
  // actually snapshots, the rest are no-ops on the lock and then run against
  // the post-snapshot state. `revisionDiff` does in one jj subprocess what
  // a `diffSummary` + `diffText` pair used to do separately.
  const [workingCopyRecords, parentRecords, files] = await Promise.all([
    driver.log({ revset: '@', limit: 1, snapshot }),
    driver.log({ revset: '@-', limit: 1, snapshot }),
    driver.revisionDiff({ revset: '@', snapshot })
  ]);
  const workingCopy = workingCopyRecords[0];
  if (!workingCopy) {
    throw new JjUnexpectedOutput('jj log @ returned no records');
  }
  return { workingCopy, parent: parentRecords[0], files };
}

function renderNoRepo(): string {
  return [
    'edamajutsu: status',
    '',
    'No jj repository found in the current workspace.',
    'Open a folder containing a .jj/ directory to get started.',
    ''
  ].join('\n');
}

function renderError(repo: JjRepo, err: unknown): string {
  const message = formatJjError(err);
  const hint = err instanceof JjSpawnError
    ? ['', 'Hint: the `jj` binary was not found on PATH. Install Jujutsu and re-open this view.']
    : [];
  return [
    'edamajutsu: status',
    '',
    `Repository: ${repo.root}`,
    '',
    'Failed to read jj state:',
    ...message.split('\n').map((l) => `  ${l}`),
    ...hint,
    ''
  ].join('\n');
}

// Pure rendering entry point — builds a fresh root view tree from the data
// and immediately renders it. Re-exported for tests so they can render
// without spinning up a `StatusView` (which needs vscode workspace state).
export function renderStatus(repo: JjRepo, data: StatusData): Rendered {
  return renderRoot(buildStatusRoot(repo, data));
}

// Render `root` into a fresh document. Called from refresh() and from the
// toggle-fold path (where the tree is reused but its fold flags changed).
export function renderRoot(root: View): Rendered {
  const ctx = new RenderContext();
  root.render(ctx);
  return {
    text: ctx.text(),
    lineToChange: ctx.changes(),
    decorations: ctx.decorations(),
    root
  };
}

export function buildStatusRoot(repo: JjRepo, data: StatusData): View {
  const root = new StatusDocumentView();
  root.subViews.push(new TextLineView(plainLine('edamajutsu: status')));
  root.subViews.push(new BlankLineView());
  root.subViews.push(new TextLineView(plainLine(`Repository: ${repo.root}`)));
  root.subViews.push(new BlankLineView());

  root.subViews.push(new ChangeSummaryView('Working copy:', data.workingCopy));
  root.subViews.push(new BlankLineView());

  if (data.parent && !isRootChange(data.parent)) {
    root.subViews.push(new ChangeSummaryView('Parent commit:', data.parent));
    root.subViews.push(new BlankLineView());
  }

  if (data.files.length > 0) {
    root.subViews.push(new StatusFilesSectionView(data.workingCopy, data.files));
    root.subViews.push(new BlankLineView());
  }
  return root;
}

// Wraps a fixed string (e.g. the error / no-repo path) in a minimal view
// tree so renderRoot can produce the standard Rendered shape.
function buildTextRoot(text: string): View {
  const root = new StatusDocumentView();
  for (const line of text.split('\n')) {
    root.subViews.push(new TextLineView(plainLine(line)));
  }
  return root;
}

function plainLine(text: string): DecoratedLine {
  return new LineBuilder().plain(text).build();
}

// The root view for a status document. Not foldable itself.
class StatusDocumentView extends View {
  override get id(): string | undefined {
    return 'status:root';
  }
}

// A change summary block: header line + description + author. Foldable so
// users can collapse the parent commit's details if they want, but stays
// expanded by default since the description is the useful bit.
class ChangeSummaryView extends View {
  override isFoldable = true;
  override foldedByDefault = false;

  constructor(
    private readonly label: string,
    private readonly _change: Change
  ) {
    super();
    this.subViews = [
      new TextLineView(buildChangeHeaderLine(label, _change), _change),
      new TextLineView(
        new LineBuilder()
          .plain('  ')
          .plain(_change.descriptionFirstLine || '(no description set)')
          .build(),
        _change
      ),
      new TextLineView(
        new LineBuilder()
          .plain(`  ${_change.authorName} <${_change.authorEmail}>`)
          .build(),
        _change
      )
    ];
  }

  override get id(): string {
    // Keyed by the label (Working copy / Parent commit) so the user's fold
    // choice rides through a refresh that may bring a different change in
    // under the same label.
    return `status:changeSummary:${this.label}`;
  }

  override get change(): Change {
    return this._change;
  }
}

// "Working copy changes (N):" section. Foldable; foldedByDefault stays
// false so the section header expands to its file list on first view.
class StatusFilesSectionView extends View {
  override isFoldable = true;
  override foldedByDefault = false;

  constructor(workingCopy: Change, files: ReadonlyArray<FileDiff>) {
    super();
    this.subViews = [
      new TextLineView(
        new LineBuilder()
          .dec('sectionHeader', `Working copy changes (${files.length}):`)
          .build(),
        workingCopy
      ),
      ...files.map((file) => new FileView(workingCopy, file))
    ];
  }

  override get id(): string {
    return 'status:workingCopyChanges';
  }
}

// One file within "Working copy changes": the path-line header + the diff
// body. Foldable and foldedByDefault — the user starts seeing just the
// path; pressing Tab expands the diff.
class FileView extends View {
  override isFoldable = true;
  override foldedByDefault = true;

  constructor(workingCopy: Change, private readonly file: FileDiff) {
    super();
    this.subViews = [
      new TextLineView(buildFilePathLine(file), workingCopy),
      ...file.body.map((diffLine) => new TextLineView(plainLine(diffLine), workingCopy))
    ];
  }

  override get id(): string {
    return `status:file:${this.file.path}`;
  }
}

function buildChangeHeaderLine(header: string, change: Change): DecoratedLine {
  const headerLine = new LineBuilder()
    .dec('sectionHeader', header)
    .plain(' ')
    .dec('changeId', change.changeId.slice(0, 8))
    .plain(' ')
    .dec('commitId', change.commitId.slice(0, 8));

  if (change.bookmarks.length > 0) {
    headerLine.plain(' ').dec('bookmark', `[${change.bookmarks.join(', ')}]`);
  }
  if (change.isConflicted) {
    headerLine.dec('conflict', ' (conflict)');
  }
  if (change.isEmpty) {
    headerLine.dec('empty', ' (empty)');
  }
  return headerLine.build();
}

function buildFilePathLine(file: FileDiff): DecoratedLine {
  return new LineBuilder()
    .plain('  ')
    .dec(fileKindDecoration(file.kind), fileKindGlyph(file.kind))
    .plain(` ${file.path}`)
    .build();
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

function isRootChange(change: Change): boolean {
  return /^z+$/.test(change.changeId);
}
