import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { JjRepo, findJjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { FileChange, FileChangeKind } from '../model/fileChange';
import { DecorationRanges, LineBuilder } from '../render/decoratedText';
import { DecorationKey } from '../render/decorations';
import { fileKindGlyph } from '../render/fileKind';
import { Rendered, renderRoot } from './general/documentView';
import { SectionView } from './general/sectionView';
import { LineBreakView, TextView } from './general/textView';
import { View } from './general/view';

export const STATUS_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'status.edamajutsu' });

type StatusData = {
  readonly workingCopy: Change;
  readonly parent: Change | undefined;
  readonly files: ReadonlyArray<FileChange>;
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
      return renderRoot(buildStatusTree(repo, data));
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

// A flat list of sections under a fixed header. Each section is foldable;
// the section's `change` (if any) flows down to every row inside it for
// cursor → change navigation.
function buildStatusTree(repo: JjRepo, data: StatusData): View {
  const root = new View();
  root.addSubview(
    TextView.plain('edamajutsu: status'),
    new LineBreakView(),
    TextView.plain(`Repository: ${repo.root}`),
    new LineBreakView()
  );

  root.addSubview(buildChangeSection('working-copy', 'Working copy:', data.workingCopy));
  root.addSubview(new LineBreakView());
  if (data.parent && !isRootChange(data.parent)) {
    root.addSubview(buildChangeSection('parent', 'Parent commit:', data.parent));
    root.addSubview(new LineBreakView());
  }
  if (data.files.length > 0) {
    // Files belong to the working copy — pressing RET on a file row drills
    // into @'s commit detail.
    root.addSubview(buildFilesSection(data.workingCopy, data.files));
    root.addSubview(new LineBreakView());
  }
  return root;
}

function buildChangeSection(sectionId: string, header: string, change: Change): View {
  const section = new SectionView(`status:${sectionId}:${change.changeId}`, change);

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

  section.addSubview(
    new TextView(headerLine.build(), change),
    new TextView(
      new LineBuilder()
        .plain('  ')
        .plain(change.descriptionFirstLine || '(no description set)')
        .build(),
      change
    ),
    new TextView(
      new LineBuilder().plain(`  ${change.authorName} <${change.authorEmail}>`).build(),
      change
    )
  );
  return section;
}

function buildFilesSection(change: Change, files: ReadonlyArray<FileChange>): View {
  const section = new SectionView(`status:files:${change.changeId}`, change);
  section.addSubview(
    new TextView(
      new LineBuilder().dec('sectionHeader', `Working copy changes (${files.length}):`).build(),
      change
    )
  );
  for (const file of files) {
    section.addSubview(
      new TextView(
        new LineBuilder()
          .plain('  ')
          .dec(fileKindDecoration(file.kind), fileKindGlyph(file.kind))
          .plain(` ${file.path}`)
          .build(),
        change
      )
    );
  }
  return section;
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
