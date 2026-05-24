import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { GraphLine } from '../jj/parse';
import { findJjRepo, JjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { DecorationRanges } from '../render/decoratedText';
import { formatChangeOneLine } from '../render/formatChange';
import { Rendered, renderRoot } from './general/documentView';
import { TextView } from './general/textView';
import { View } from './general/view';

export const LOG_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'log.edamajutsu' });

const INITIAL: Rendered = {
  text: 'Loading...',
  foldingRanges: [],
  lineToChange: [],
  decorations: new Map()
};

// Owns the rendered text and line-index → Change map for the log view. Same
// shape as StatusView: only `refresh` talks to jj; a refresh token guards
// against stale results overwriting a newer in-flight refresh.
export class LogView implements vscode.TextDocumentContentProvider {
  private rendered: Rendered = INITIAL;
  private refreshToken = 0;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  readonly uri = LOG_URI;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.rendered.text;
  }

  // Decorations land in a follow-up PR; expose the no-op stub now so the
  // DecorationManager has a uniform interface to talk to.
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
    this.onDidChangeEmitter.fire(LOG_URI);
  }

  private async produce(snapshot: boolean): Promise<Rendered> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
    if (!repo) {
      return plainRendered(renderNoRepo());
    }
    try {
      const lines = await new JjDriver({ repoRoot: repo.root }).logGraph({ snapshot });
      return renderRoot(buildLogTree(lines));
    } catch (err) {
      return plainRendered(renderError(repo, err));
    }
  }
}

export async function openLog(view: LogView): Promise<void> {
  await view.refresh(false);
  const doc = await vscode.workspace.openTextDocument(LOG_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function buildLogTree(lines: ReadonlyArray<GraphLine>): View {
  const root = new View();
  for (const line of lines) {
    if (line.kind === 'change') {
      root.addSubview(
        TextView.plain(`${line.graphPrefix}${formatChangeOneLine(line.change)}`, line.change)
      );
    } else {
      root.addSubview(TextView.plain(line.text));
    }
  }
  return root;
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
    'edamajutsu: log',
    '',
    'No jj repository found in the current workspace.',
    ''
  ].join('\n');
}

function renderError(repo: JjRepo, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const hint = /\bENOENT\b/.test(message)
    ? ['', 'Hint: the `jj` binary was not found on PATH.']
    : [];
  return [
    'edamajutsu: log',
    '',
    `Repository: ${repo.root}`,
    '',
    'Failed to read jj log:',
    ...message.split('\n').map((l) => `  ${l}`),
    ...hint,
    ''
  ].join('\n');
}
