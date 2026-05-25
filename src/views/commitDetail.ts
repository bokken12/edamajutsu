import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjUnexpectedOutput } from '../jj/errors';
import { findJjRepo, JjRepo } from '../jj/repo';
import { ChangeId } from '../model/change';
import { DecorationRanges } from '../render/decoratedText';
import { CommitDetail, buildTree } from './commitTree';
import { Node, Rendered, render } from './viewTree';

export const COMMIT_DETAIL_URI = vscode.Uri.from({
  scheme: 'edamajutsu',
  path: 'commit.edamajutsu'
});

const INITIAL: Rendered = {
  text: 'No change selected.',
  decorations: new Map(),
  lineToChange: [],
  lineToFoldId: [],
  effective: new Map()
};

export class CommitDetailView implements vscode.TextDocumentContentProvider {
  private current: ChangeId | undefined;
  private rendered: Rendered = INITIAL;
  // The last successfully built tree, if any. Re-rendered on fold toggle so
  // we don't re-spawn jj for a UI-only change.
  private tree: ReadonlyArray<Node> | undefined = undefined;
  // User-explicit fold overrides keyed by fold id. Survives refreshes; only
  // user input mutates it.
  private readonly fold = new Map<string, boolean>();
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

  // Tab handler: flips the innermost fold under the cursor. No-op if the
  // line isn't inside any fold. Re-renders against the existing tree (no
  // jj round-trip) and fires onDidChange so VSCode picks up the new text.
  toggleFoldAtLine(line: number): void {
    const id = this.rendered.lineToFoldId[line];
    if (!id || !this.tree) {
      return;
    }
    const current = this.rendered.effective.get(id);
    if (current === undefined) {
      return;
    }
    this.fold.set(id, !current);
    this.rendered = render(this.tree, this.fold);
    this.onDidChangeEmitter.fire(COMMIT_DETAIL_URI);
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
    this.tree = next.tree;
    this.rendered = next.rendered;
    this.onDidChangeEmitter.fire(COMMIT_DETAIL_URI);
  }

  private async produce(snapshot: boolean): Promise<{
    tree: ReadonlyArray<Node> | undefined;
    rendered: Rendered;
  }> {
    if (this.current === undefined) {
      return { tree: undefined, rendered: INITIAL };
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
    if (!repo) {
      return { tree: undefined, rendered: plainRendered(renderNoRepo()) };
    }
    try {
      const detail = await fetchDetail(new JjDriver({ repoRoot: repo.root }), this.current, snapshot);
      const tree = buildTree(detail);
      return { tree, rendered: render(tree, this.fold) };
    } catch (err) {
      return { tree: undefined, rendered: plainRendered(renderError(repo, err, this.current)) };
    }
  }
}

async function fetchDetail(driver: JjDriver, revset: ChangeId, snapshot: boolean): Promise<CommitDetail> {
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

function plainRendered(text: string): Rendered {
  const lines = text.split('\n');
  return {
    text,
    decorations: new Map(),
    lineToChange: lines.map(() => undefined),
    lineToFoldId: lines.map(() => undefined),
    effective: new Map()
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
