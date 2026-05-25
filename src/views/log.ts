import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { formatJjError, JjSpawnError } from '../jj/errors';
import { GraphLine } from '../jj/parse';
import { findJjRepo, JjRepo } from '../jj/repo';
import { Change } from '../model/change';
import { DecorationRanges } from '../render/decoratedText';
import { formatChangeOneLine } from '../render/formatChange';

export const LOG_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'log.edamajutsu' });

type Rendered = {
  readonly text: string;
  // For each rendered line, the Change displayed on that line (if any). Used
  // by future `RET` handling. Phase 3 builds the map but doesn't consume it.
  readonly lineToChange: ReadonlyArray<Change | undefined>;
};

const INITIAL: Rendered = { text: 'Loading...', lineToChange: [] };

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
    return new Map();
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
      return renderNoRepo();
    }
    try {
      const lines = await new JjDriver({ repoRoot: repo.root }).logGraph({ snapshot });
      return renderLog(lines);
    } catch (err) {
      return renderError(repo, err);
    }
  }
}

export async function openLog(view: LogView): Promise<void> {
  await view.refresh(false);
  const doc = await vscode.workspace.openTextDocument(LOG_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function renderLog(lines: ReadonlyArray<GraphLine>): Rendered {
  const text: string[] = [];
  const lineToChange: Array<Change | undefined> = [];

  for (const line of lines) {
    if (line.kind === 'change') {
      text.push(`${line.graphPrefix}${formatChangeOneLine(line.change)}`);
      lineToChange.push(line.change);
    } else {
      text.push(line.text);
      lineToChange.push(undefined);
    }
  }

  return { text: text.join('\n'), lineToChange };
}

function renderNoRepo(): Rendered {
  return {
    text: [
      'edamajutsu: log',
      '',
      'No jj repository found in the current workspace.',
      ''
    ].join('\n'),
    lineToChange: []
  };
}

function renderError(repo: JjRepo, err: unknown): Rendered {
  const message = formatJjError(err);
  const hint = err instanceof JjSpawnError
    ? ['', 'Hint: the `jj` binary was not found on PATH.']
    : [];
  return {
    text: [
      'edamajutsu: log',
      '',
      `Repository: ${repo.root}`,
      '',
      'Failed to read jj log:',
      ...message.split('\n').map((l) => `  ${l}`),
      ...hint,
      ''
    ].join('\n'),
    lineToChange: []
  };
}
