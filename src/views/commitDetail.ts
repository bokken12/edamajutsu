import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { findJjRepo, JjRepo } from '../jj/repo';
import { Change, ChangeId } from '../model/change';
import { FileChange } from '../model/fileChange';
import { DecorationRanges } from '../render/decoratedText';
import { fileKindGlyph } from '../render/fileKind';
import { Rendered, renderRoot } from './general/documentView';
import { SectionView } from './general/sectionView';
import { LineBreakView, TextView } from './general/textView';
import { View } from './general/view';

export const COMMIT_DETAIL_URI = vscode.Uri.from({
  scheme: 'edamajutsu',
  path: 'commit.edamajutsu'
});

type Detail = {
  readonly change: Change;
  readonly files: ReadonlyArray<FileChange>;
  readonly diff: string;
};

const INITIAL: Rendered = {
  text: 'No change selected.',
  foldingRanges: [],
  lineToChange: [],
  decorations: new Map()
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

  getFoldingRanges(): ReadonlyArray<vscode.FoldingRange> {
    return this.rendered.foldingRanges;
  }

  getDecorations(): DecorationRanges {
    return this.rendered.decorations;
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
      return plainRendered(renderNoRepo());
    }
    try {
      const detail = await fetchDetail(new JjDriver({ repoRoot: repo.root }), this.current, snapshot);
      return renderRoot(buildDetailTree(detail));
    } catch (err) {
      return plainRendered(renderError(repo, err, this.current));
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
    throw new Error(`change not found: ${revset}`);
  }
  return { change, files, diff };
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
    'edamajutsu: commit',
    '',
    'No jj repository found in the current workspace.',
    ''
  ].join('\n');
}

function renderError(repo: JjRepo, err: unknown, changeId: ChangeId): string {
  const message = err instanceof Error ? err.message : String(err);
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

function buildDetailTree(detail: Detail): View {
  const { change, files, diff } = detail;
  const root = new View();

  root.addSubview(TextView.plain(`edamajutsu: commit ${change.changeId.slice(0, 8)}`));
  root.addSubview(new LineBreakView());
  root.addSubview(TextView.plain(`Change:    ${change.changeId}`));
  root.addSubview(TextView.plain(`Commit:    ${change.commitId}`));
  root.addSubview(TextView.plain(`Author:    ${change.authorName} <${change.authorEmail}>`));
  if (change.parents.length > 0) {
    root.addSubview(
      TextView.plain(`Parents:   ${change.parents.map((p) => p.slice(0, 8)).join(', ')}`)
    );
  }
  if (change.bookmarks.length > 0) {
    root.addSubview(TextView.plain(`Bookmarks: ${change.bookmarks.join(', ')}`));
  }
  const flags = [change.isEmpty ? 'empty' : '', change.isConflicted ? 'conflict' : '']
    .filter(Boolean)
    .join(', ');
  if (flags) {
    root.addSubview(TextView.plain(`Flags:     ${flags}`));
  }
  root.addSubview(new LineBreakView());

  root.addSubview(buildDescriptionSection(change));
  root.addSubview(new LineBreakView());

  if (files.length > 0) {
    root.addSubview(buildFilesSection(files));
    root.addSubview(new LineBreakView());
  }

  if (diff.trim() !== '') {
    root.addSubview(buildDiffSection(diff));
    root.addSubview(new LineBreakView());
  }

  return root;
}

function buildDescriptionSection(change: Change): View {
  const section = new SectionView(`commit:description:${change.changeId}`);
  section.addSubview(TextView.plain('Description:'));
  const body = change.description.trimEnd();
  if (body === '') {
    section.addSubview(TextView.plain('  (no description set)'));
  } else {
    for (const line of body.split('\n')) {
      section.addSubview(TextView.plain(`  ${line}`));
    }
  }
  return section;
}

function buildFilesSection(files: ReadonlyArray<FileChange>): View {
  const section = new SectionView(`commit:files`);
  section.addSubview(TextView.plain(`Files (${files.length}):`));
  for (const f of files) {
    section.addSubview(TextView.plain(`  ${fileKindGlyph(f.kind)} ${f.path}`));
  }
  return section;
}

// The diff section contains a header line plus one inner SectionView per
// `diff --git ...` block. Each inner section is independently foldable, so
// users can collapse a single file's diff without losing the surrounding
// scaffold.
function buildDiffSection(diff: string): View {
  const section = new SectionView('commit:diff');
  section.addSubview(TextView.plain('Diff:'));

  const lines = diff.split('\n');
  // Drop trailing empty line that `split` produces from a terminal newline.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  // Split into per-file blocks at `diff --git ` boundaries. Anything before
  // the first such boundary is preamble inside the outer section header.
  let currentBlock: SectionView | undefined;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      currentBlock = new SectionView(`commit:diff:${line}`);
      currentBlock.addSubview(TextView.plain(line));
      section.addSubview(currentBlock);
      continue;
    }
    if (currentBlock) {
      currentBlock.addSubview(TextView.plain(line));
    } else {
      // Preamble before the first `diff --git` — rare but possible. Attach
      // it to the outer section directly so it still renders.
      section.addSubview(TextView.plain(line));
    }
  }
  return section;
}
