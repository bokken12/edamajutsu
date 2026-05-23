import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { JjRepo, findJjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { FileChange } from '../model/fileChange';
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
};

const INITIAL: Rendered = { text: 'Loading...', foldingRanges: [], lineToChange: [] };

// Owns the rendered text and folding ranges for the status view. The
// TextDocumentContentProvider reads the cache; `refresh` is the only thing
// that talks to jj.
export class StatusView implements vscode.TextDocumentContentProvider {
  private rendered: Rendered = INITIAL;
  private refreshToken = 0;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.rendered.text;
  }

  getFoldingRanges(): ReadonlyArray<vscode.FoldingRange> {
    return this.rendered.foldingRanges;
  }

  changeAtLine(line: number): Change | undefined {
    return this.rendered.lineToChange[line];
  }

  async refresh(snapshot: boolean): Promise<void> {
    const token = ++this.refreshToken;
    const next = await this.produce(snapshot);
    // A newer refresh started while ours was in flight — drop our result.
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
      return emptyRendered(renderNoRepo());
    }
    try {
      const data = await fetchStatus(new JjDriver({ repoRoot: repo.root }), snapshot);
      return renderStatus(repo, data);
    } catch (err) {
      return emptyRendered(renderError(repo, err));
    }
  }
}

export async function openStatus(view: StatusView): Promise<void> {
  await view.refresh(false);
  const doc = await vscode.workspace.openTextDocument(STATUS_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function fetchStatus(driver: JjDriver, snapshot: boolean): Promise<StatusData> {
  // Only the first call passes `snapshot: true`. After it runs, jj has nothing
  // new to snapshot, so the follow-ups can stay passive.
  const [workingCopy] = await driver.log({ revset: '@', limit: 1, snapshot });
  if (!workingCopy) {
    throw new Error('jj log @ returned no records');
  }
  const [parent] = await driver.log({ revset: '@-', limit: 1 });
  const files = await driver.diffSummary();
  return { workingCopy, parent, files };
}

function emptyRendered(text: string): Rendered {
  const lines = text.split('\n');
  return { text, foldingRanges: [], lineToChange: lines.map(() => undefined) };
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

// Renderer that builds the status text, folding ranges, and per-line change
// map in lockstep: each section call records both the [start, end] line range
// it produced and the Change those lines refer to.
function renderStatus(repo: JjRepo, data: StatusData): Rendered {
  const out = new SectionBuilder();
  out.push(`edamajutsu: status`);
  out.push('');
  out.push(`Repository: ${repo.root}`);
  out.push('');

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

class SectionBuilder {
  private readonly lines: string[] = [];
  private readonly ranges: vscode.FoldingRange[] = [];
  private readonly lineToChange: Array<Change | undefined> = [];

  push(line: string): void {
    this.lines.push(line);
    this.lineToChange.push(undefined);
  }

  section(change: Change, produce: () => string[]): void {
    const start = this.lines.length;
    const body = produce();
    for (const line of body) {
      this.lines.push(line);
      this.lineToChange.push(change);
    }
    const end = this.lines.length - 1;
    if (end > start) {
      this.ranges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
    }
    this.lines.push('');
    this.lineToChange.push(undefined);
  }

  build(): Rendered {
    return {
      text: this.lines.join('\n'),
      foldingRanges: this.ranges,
      lineToChange: this.lineToChange
    };
  }
}

function renderChangeSection(header: string, change: Change): string[] {
  const bookmarksTag =
    change.bookmarks.length > 0 ? ` [${change.bookmarks.join(', ')}]` : '';
  const conflictTag = change.isConflicted ? ' (conflict)' : '';
  const emptyTag = change.isEmpty ? ' (empty)' : '';
  return [
    `${header} ${change.changeId.slice(0, 8)} ${change.commitId.slice(0, 8)}` +
      `${bookmarksTag}${conflictTag}${emptyTag}`,
    `  ${change.descriptionFirstLine || '(no description set)'}`,
    `  ${change.authorName} <${change.authorEmail}>`
  ];
}

function renderFilesSection(files: ReadonlyArray<FileChange>): string[] {
  const lines: string[] = [`Working copy changes (${files.length}):`];
  for (const file of files) {
    lines.push(`  ${fileKindGlyph(file.kind)} ${file.path}`);
  }
  return lines;
}

function isRootChange(change: Change): boolean {
  // jj's root change has the all-z change_id.
  return /^z+$/.test(change.changeId);
}
