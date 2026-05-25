import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjSpawnError, JjUnexpectedOutput } from '../jj/errors';
import { FileDiff } from '../jj/parse';
import { JjRepo, findJjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { FileChangeKind } from '../model/fileChange';
import { DecoratedDocBuilder, DecoratedLine, DecorationRanges, LineBuilder } from '../render/decoratedText';
import { DecorationKey } from '../render/decorations';
import { fileKindGlyph } from '../render/fileKind';

export const STATUS_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'status.edamajutsu' });

type StatusData = {
  readonly workingCopy: Change;
  readonly parent: Change | undefined;
  // Each entry carries both its file kind (for the path-line decoration) and
  // its unified-diff body (rendered inline beneath the path with its own
  // fold range). Comes from a single combined `jj log -T` call — see
  // `JjDriver.revisionDiff`.
  readonly files: ReadonlyArray<FileDiff>;
};

type Rendered = {
  readonly text: string;
  readonly foldingRanges: ReadonlyArray<vscode.FoldingRange>;
  // Start lines of folds that should be collapsed when the view is first
  // shown — the per-file diff bodies under "Working copy changes". See
  // `collapseDefaultFolds` for how this list gets applied.
  readonly defaultCollapsedLines: ReadonlyArray<number>;
  // For each line index, the Change that line "belongs to" (used by `RET`
  // to drill into the commit detail). Undefined for header / blank / non-
  // change rows.
  readonly lineToChange: ReadonlyArray<Change | undefined>;
  readonly decorations: DecorationRanges;
};

const INITIAL: Rendered = {
  text: 'Loading...',
  foldingRanges: [],
  defaultCollapsedLines: [],
  lineToChange: [],
  decorations: new Map()
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

  getFoldingRanges(): ReadonlyArray<vscode.FoldingRange> {
    return this.rendered.foldingRanges;
  }

  getDefaultCollapsedLines(): ReadonlyArray<number> {
    return this.rendered.defaultCollapsedLines;
  }

  getDecorations(): DecorationRanges {
    return this.rendered.decorations;
  }

  changeAtLine(line: number): Change | undefined {
    return this.rendered.lineToChange[line];
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
      return plainRendered(renderNoRepo());
    }
    try {
      const data = await fetchStatus(new JjDriver({ repoRoot: repo.root }), snapshot);
      return renderStatus(repo, data);
    } catch (err) {
      return plainRendered(renderError(repo, err));
    }
  }
}

export async function openStatus(view: StatusView): Promise<void> {
  await view.refresh(false);
  const doc = await vscode.workspace.openTextDocument(STATUS_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
  await collapseDefaultFolds(view);
}

// VSCode's FoldingRange API has no "start collapsed" bit — instead we drive
// the fold UI via `editor.fold` after the document is visible. Its
// `selectionLines` arg folds the innermost range containing each given line.
async function collapseDefaultFolds(view: StatusView): Promise<void> {
  const lines = view.getDefaultCollapsedLines();
  if (lines.length === 0) {
    return;
  }
  await vscode.commands.executeCommand('editor.fold', { selectionLines: [...lines] });
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

function plainRendered(text: string): Rendered {
  const lines = text.split('\n');
  return {
    text,
    foldingRanges: [],
    defaultCollapsedLines: [],
    lineToChange: lines.map(() => undefined),
    decorations: new Map()
  };
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

function renderStatus(repo: JjRepo, data: StatusData): Rendered {
  const out = new StatusBuilder();
  out.plain('edamajutsu: status');
  out.plain('');
  out.plain(`Repository: ${repo.root}`);
  out.plain('');

  out.section(data.workingCopy, () => renderChangeSection('Working copy:', data.workingCopy));
  if (data.parent && !isRootChange(data.parent)) {
    out.section(data.parent, () => renderChangeSection('Parent commit:', data.parent!));
  }
  if (data.files.length > 0) {
    // Files belong to the working copy — pressing RET on a file row drills
    // into @'s commit detail. Inside the section, each file gets its own
    // fold range covering the file path line + its inline diff body so Tab
    // on a file row collapses just that file rather than the whole section.
    renderFilesSection(out, data.workingCopy, data.files);
  }
  return out.build();
}

// Wraps DecoratedDocBuilder with the status-specific bookkeeping: folding
// ranges per section and the line-to-change map for `RET` navigation.
class StatusBuilder {
  private readonly doc = new DecoratedDocBuilder();
  private readonly foldingRanges: vscode.FoldingRange[] = [];
  private readonly defaultCollapsedLines: number[] = [];
  private readonly lineToChange: Array<Change | undefined> = [];

  // Plain un-decorated text. `change` defaults to undefined — pass one to
  // attach the line to a change for RET navigation (e.g. the diff bodies
  // under each file belong to the working copy).
  plain(text: string, change?: Change): void {
    this.doc.pushPlain(text);
    this.lineToChange.push(change);
  }

  // Decorated line associated with `change` for RET navigation. Used by
  // callers that need to interleave their own folding ranges with the lines
  // (the standard `section()` helper doesn't expose intermediate line
  // indices).
  push(line: DecoratedLine, change: Change | undefined): void {
    this.doc.push(line);
    this.lineToChange.push(change);
  }

  // Records a fold range from `start` (inclusive) to `end` (inclusive).
  // No-op if the range would cover one line or less — VSCode refuses to
  // collapse a fold that doesn't span at least one additional line.
  // `collapsedByDefault` flags this fold to start collapsed on initial open.
  fold(start: number, end: number, collapsedByDefault = false): void {
    if (end > start) {
      this.foldingRanges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
      if (collapsedByDefault) {
        this.defaultCollapsedLines.push(start);
      }
    }
  }

  currentLine(): number {
    return this.doc.currentLine();
  }

  section(change: Change, produce: () => DecoratedLine[]): void {
    const start = this.doc.currentLine();
    const body = produce();
    for (const line of body) {
      this.doc.push(line);
      this.lineToChange.push(change);
    }
    this.fold(start, this.doc.currentLine() - 1);
    this.doc.pushPlain('');
    this.lineToChange.push(undefined);
  }

  build(): Rendered {
    return {
      text: this.doc.text(),
      foldingRanges: this.foldingRanges,
      defaultCollapsedLines: this.defaultCollapsedLines,
      lineToChange: this.lineToChange,
      decorations: this.doc.decorations()
    };
  }
}

function renderChangeSection(header: string, change: Change): DecoratedLine[] {
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

  return [
    headerLine.build(),
    new LineBuilder()
      .plain('  ')
      .plain(change.descriptionFirstLine || '(no description set)')
      .build(),
    new LineBuilder().plain(`  ${change.authorName} <${change.authorEmail}>`).build()
  ];
}

function renderFilesSection(
  out: StatusBuilder,
  workingCopy: Change,
  files: ReadonlyArray<FileDiff>
): void {
  const sectionStart = out.currentLine();
  out.push(
    new LineBuilder().dec('sectionHeader', `Working copy changes (${files.length}):`).build(),
    workingCopy
  );
  for (const file of files) {
    const fileStart = out.currentLine();
    out.push(
      new LineBuilder()
        .plain('  ')
        .dec(fileKindDecoration(file.kind), fileKindGlyph(file.kind))
        .plain(` ${file.path}`)
        .build(),
      workingCopy
    );
    for (const diffLine of file.body) {
      out.plain(diffLine, workingCopy);
    }
    out.fold(fileStart, out.currentLine() - 1, true);
  }
  out.fold(sectionStart, out.currentLine() - 1);
  out.plain('');
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
