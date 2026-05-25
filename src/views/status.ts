import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjSpawnError, JjUnexpectedOutput } from '../jj/errors';
import { JjRepo, findJjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { DecorationRanges } from '../render/decoratedText';
import { StatusData, buildTree } from './statusTree';
import { Node, Rendered, render } from './viewTree';

export const STATUS_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'status.edamajutsu' });

const INITIAL: Rendered = {
  text: 'Loading...',
  decorations: new Map(),
  lineToChange: [],
  lineToFoldId: [],
  effective: new Map()
};

export class StatusView implements vscode.TextDocumentContentProvider {
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
  readonly uri = STATUS_URI;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.rendered.text;
  }

  getDecorations(): DecorationRanges {
    return this.rendered.decorations;
  }

  changeAtLine(line: number): Change | undefined {
    return this.rendered.lineToChange[line];
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
      // Defensive: a fold id appears in lineToFoldId iff render emitted at
      // least its header, which always records the effective state.
      return;
    }
    this.fold.set(id, !current);
    this.rendered = render(this.tree, this.fold);
    this.onDidChangeEmitter.fire(STATUS_URI);
  }

  async refresh(snapshot: boolean): Promise<void> {
    const token = ++this.refreshToken;
    const next = await this.produce(snapshot);
    if (token !== this.refreshToken) {
      return;
    }
    this.tree = next.tree;
    this.rendered = next.rendered;
    this.onDidChangeEmitter.fire(STATUS_URI);
  }

  private async produce(snapshot: boolean): Promise<{
    tree: ReadonlyArray<Node> | undefined;
    rendered: Rendered;
  }> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
    if (!repo) {
      return { tree: undefined, rendered: plainRendered(renderNoRepo()) };
    }
    try {
      const data = await fetchStatus(new JjDriver({ repoRoot: repo.root }), snapshot);
      const tree = buildTree(repo, data);
      return { tree, rendered: render(tree, this.fold) };
    } catch (err) {
      return { tree: undefined, rendered: plainRendered(renderError(repo, err)) };
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
