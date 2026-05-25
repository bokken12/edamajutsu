import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjUnexpectedOutput } from '../jj/errors';
import { findJjRepo, JjRepo } from '../jj/repo';
import { Change, ChangeId } from '../model/change';
import { FileChange } from '../model/fileChange';
import { DecorationRanges } from '../render/decoratedText';
import { fileKindGlyph } from '../render/fileKind';

export const COMMIT_DETAIL_URI = vscode.Uri.from({
  scheme: 'edamajutsu',
  path: 'commit.edamajutsu'
});

type Detail = {
  readonly change: Change;
  readonly files: ReadonlyArray<FileChange>;
  readonly diff: string;
};

type Rendered = {
  readonly text: string;
  readonly foldingRanges: ReadonlyArray<vscode.FoldingRange>;
};

const INITIAL: Rendered = { text: 'No change selected.', foldingRanges: [] };

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

  getFoldingRanges(): ReadonlyArray<vscode.FoldingRange> {
    return this.rendered.foldingRanges;
  }

  getDecorations(): DecorationRanges {
    return new Map();
  }

  currentChangeId(): ChangeId | undefined {
    return this.current;
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
      return { text: renderNoRepo(), foldingRanges: [] };
    }
    try {
      const detail = await fetchDetail(new JjDriver({ repoRoot: repo.root }), this.current, snapshot);
      return renderDetail(detail);
    } catch (err) {
      return { text: renderError(repo, err, this.current), foldingRanges: [] };
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

function renderDetail(detail: Detail): Rendered {
  const out = new DocBuilder();
  const { change, files, diff } = detail;

  out.push(`edamajutsu: commit ${change.changeId.slice(0, 8)}`);
  out.push('');
  out.push(`Change:    ${change.changeId}`);
  out.push(`Commit:    ${change.commitId}`);
  out.push(`Author:    ${change.authorName} <${change.authorEmail}>`);
  if (change.parents.length > 0) {
    out.push(`Parents:   ${change.parents.map((p) => p.slice(0, 8)).join(', ')}`);
  }
  if (change.bookmarks.length > 0) {
    out.push(`Bookmarks: ${change.bookmarks.join(', ')}`);
  }
  const flags = [change.isEmpty ? 'empty' : '', change.isConflicted ? 'conflict' : '']
    .filter(Boolean)
    .join(', ');
  if (flags) {
    out.push(`Flags:     ${flags}`);
  }
  out.push('');

  out.section('Description:', () => renderDescription(change));
  if (files.length > 0) {
    out.section(`Files (${files.length}):`, () => renderFiles(files));
  }
  if (diff.trim() !== '') {
    out.section('Diff:', () => renderDiff(diff, out));
  }

  return out.build();
}

function renderDescription(change: Change): string[] {
  const body = change.description.trimEnd();
  if (body === '') {
    return ['  (no description set)'];
  }
  return body.split('\n').map((line) => `  ${line}`);
}

function renderFiles(files: ReadonlyArray<FileChange>): string[] {
  return files.map((f) => `  ${fileKindGlyph(f.kind)} ${f.path}`);
}

// Renders the diff text verbatim and records a folding range for each
// `diff --git ...` block. Returns the lines so DocBuilder.section() can
// place them; emits inner folding ranges into the same builder.
function renderDiff(diff: string, builder: DocBuilder): string[] {
  const lines = diff.split('\n');
  // Drop trailing empty line that `split` produces from a terminal newline.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  // baseLine: the line index in the final document where this diff section's
  // first line will land. DocBuilder.section() pushes lines after a header,
  // so the first diff line will be at builder.currentLine() + 1 from the
  // header — but we don't need exact bookkeeping here because we register
  // ranges relative to the builder by using `markPendingDiffRanges`.
  builder.queueDiffRanges(lines);
  return lines;
}

class DocBuilder {
  private readonly lines: string[] = [];
  private readonly ranges: vscode.FoldingRange[] = [];

  push(line: string): void {
    this.lines.push(line);
  }

  // Emits a foldable section: header line, then body lines, then a blank
  // separator. The fold covers header through last body line.
  section(header: string, produce: () => string[]): void {
    const start = this.lines.length;
    this.lines.push(header);
    for (const line of produce()) {
      this.lines.push(line);
    }
    const end = this.lines.length - 1;
    if (end > start) {
      this.ranges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
    }
    this.lines.push('');
  }

  // Called by renderDiff while it's producing its body lines. We can't
  // compute absolute line numbers until the lines actually land, so we walk
  // the lines after the fact to find `diff --git ` boundaries.
  queueDiffRanges(diffLines: ReadonlyArray<string>): void {
    // The diff lines will be placed after the current end (which is the
    // header line). The first diff line lands at this.lines.length, since
    // section() pushes the header before calling produce().
    const base = this.lines.length;
    const headers: number[] = [];
    diffLines.forEach((line, idx) => {
      if (line.startsWith('diff --git ')) {
        headers.push(base + idx);
      }
    });
    for (let i = 0; i < headers.length; i += 1) {
      const start = headers[i]!;
      const end = (i + 1 < headers.length ? headers[i + 1]! : base + diffLines.length) - 1;
      if (end > start) {
        this.ranges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
      }
    }
  }

  build(): Rendered {
    return { text: this.lines.join('\n'), foldingRanges: this.ranges };
  }
}
