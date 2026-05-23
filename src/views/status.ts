import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { JjRepo, findJjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { FileChange, FileChangeKind } from '../model/fileChange';
import { DecoratedDocBuilder, DecoratedLine, DecorationRanges, LineBuilder } from '../render/decoratedText';
import { DecorationKey } from '../render/decorations';
import { fileKindGlyph } from '../render/fileKind';

export const STATUS_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'status.edamajutsu' });

type StatusData = {
  readonly workingCopy: Change;
  readonly parent: Change | undefined;
  readonly files: ReadonlyArray<FileChange>;
};

type Rendered = {
  readonly text: string;
  readonly foldingRanges: ReadonlyArray<vscode.FoldingRange>;
  // For each line index, the Change that line "belongs to" (used by `RET`
  // to drill into the commit detail). Undefined for header / blank / non-
  // change rows.
  readonly lineToChange: ReadonlyArray<Change | undefined>;
  readonly decorations: DecorationRanges;
};

const INITIAL: Rendered = {
  text: 'Loading...',
  foldingRanges: [],
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
}

async function fetchStatus(driver: JjDriver, snapshot: boolean): Promise<StatusData> {
  const [workingCopy] = await driver.log({ revset: '@', limit: 1, snapshot });
  if (!workingCopy) {
    throw new Error('jj log @ returned no records');
  }
  const [parent] = await driver.log({ revset: '@-', limit: 1 });
  const files = await driver.diffSummary();
  return { workingCopy, parent, files };
}

function plainRendered(text: string): Rendered {
  const lines = text.split('\n');
  return {
    text,
    foldingRanges: [],
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
  const message = err instanceof Error ? err.message : String(err);
  const hint = /\bENOENT\b/.test(message)
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
    // into @'s commit detail.
    out.section(data.workingCopy, () => renderFilesSection(data.files));
  }
  return out.build();
}

// Wraps DecoratedDocBuilder with the status-specific bookkeeping: folding
// ranges per section and the line-to-change map for `RET` navigation.
class StatusBuilder {
  private readonly doc = new DecoratedDocBuilder();
  private readonly foldingRanges: vscode.FoldingRange[] = [];
  private readonly lineToChange: Array<Change | undefined> = [];

  plain(text: string): void {
    this.doc.pushPlain(text);
    this.lineToChange.push(undefined);
  }

  section(change: Change, produce: () => DecoratedLine[]): void {
    const start = this.doc.currentLine();
    const body = produce();
    for (const line of body) {
      this.doc.push(line);
      this.lineToChange.push(change);
    }
    const end = this.doc.currentLine() - 1;
    if (end > start) {
      this.foldingRanges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
    }
    this.doc.pushPlain('');
    this.lineToChange.push(undefined);
  }

  build(): Rendered {
    return {
      text: this.doc.text(),
      foldingRanges: this.foldingRanges,
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

function renderFilesSection(files: ReadonlyArray<FileChange>): DecoratedLine[] {
  const lines: DecoratedLine[] = [
    new LineBuilder().dec('sectionHeader', `Working copy changes (${files.length}):`).build()
  ];
  for (const file of files) {
    lines.push(
      new LineBuilder()
        .plain('  ')
        .dec(fileKindDecoration(file.kind), fileKindGlyph(file.kind))
        .plain(` ${file.path}`)
        .build()
    );
  }
  return lines;
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
