import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjSpawnError } from '../jj/errors';
import { findJjRepo, JjRepo } from '../jj/repo';
import { Operation } from '../model/operation';
import { DecorationRanges } from '../render/decoratedText';

export const OP_LOG_URI = vscode.Uri.from({
  scheme: 'edamajutsu',
  path: 'op-log.edamajutsu'
});

type Rendered = { readonly text: string };

const INITIAL: Rendered = { text: 'Loading...' };

// Read-only `jj op log` view. Same lifecycle as the other views: only
// `refresh` talks to jj; a monotonic refreshToken guards against stale
// results overwriting a newer in-flight refresh.
//
// Unlike the other views, `refresh` here is always passive — never
// snapshots. Snapshotting from this view would write a "snapshot working
// copy" entry into the very list the user is looking at, making `g` appear
// to spawn a phantom entry. Read-only observation only.
export class OpLogView implements vscode.TextDocumentContentProvider {
  private rendered: Rendered = INITIAL;
  private refreshToken = 0;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  readonly uri = OP_LOG_URI;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.rendered.text;
  }

  getDecorations(): DecorationRanges {
    return new Map();
  }

  async refresh(): Promise<void> {
    const token = ++this.refreshToken;
    const next = await this.produce();
    if (token !== this.refreshToken) {
      return;
    }
    this.rendered = next;
    this.onDidChangeEmitter.fire(OP_LOG_URI);
  }

  private async produce(): Promise<Rendered> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
    if (!repo) {
      return { text: renderNoRepo() };
    }
    try {
      const ops = await new JjDriver({ repoRoot: repo.root }).opLog();
      return { text: renderOpLog(ops) };
    } catch (err) {
      return { text: renderError(repo, err) };
    }
  }
}

export async function openOpLog(view: OpLogView): Promise<void> {
  await view.refresh();
  const doc = await vscode.workspace.openTextDocument(OP_LOG_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function renderOpLog(ops: ReadonlyArray<Operation>): string {
  const lines: string[] = ['edamajutsu: op log', ''];
  if (ops.length === 0) {
    lines.push('(no operations)');
    lines.push('');
    return lines.join('\n');
  }
  for (const op of ops) {
    lines.push(`${op.id.slice(0, 12)}  ${op.time}  ${op.user}`);
    lines.push(`  ${op.descriptionFirstLine || '(no description)'}`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderNoRepo(): string {
  return [
    'edamajutsu: op log',
    '',
    'No jj repository found in the current workspace.',
    ''
  ].join('\n');
}

function renderError(repo: JjRepo, err: unknown): string {
  const message = formatJjError(err);
  const hint = err instanceof JjSpawnError
    ? ['', 'Hint: the `jj` binary was not found on PATH.']
    : [];
  return [
    'edamajutsu: op log',
    '',
    `Repository: ${repo.root}`,
    '',
    'Failed to read jj op log:',
    ...message.split('\n').map((l) => `  ${l}`),
    ...hint,
    ''
  ].join('\n');
}
