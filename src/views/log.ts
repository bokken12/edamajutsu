import { Effect } from 'effect';
import * as vscode from 'vscode';

import { JjDriver, JjDriverLive, jjConfigLayer } from '../jj/driver';
import { JjDriverError } from '../jj/errors';
import { GraphLine } from '../jj/parse';
import { JjRepo } from '../jj/repo';
import { activeRepo } from '../jj/workspace';
import { Change } from '../model/change';
import { DecorationRanges } from '../render/decoratedText';
import { formatChangeOneLine } from '../render/formatChange';
import { formatDriverError } from './status';

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
    const next = await Effect.runPromise(produce(snapshot));
    if (token !== this.refreshToken) {
      return;
    }
    this.rendered = next;
    this.onDidChangeEmitter.fire(LOG_URI);
  }
}

export async function openLog(view: LogView): Promise<void> {
  await view.refresh(false);
  const doc = await vscode.workspace.openTextDocument(LOG_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

// See status.ts for the produce/withDriver shape and why catchAll runs inside
// withDriver — same pattern, narrower body.
function produce(snapshot: boolean): Effect.Effect<Rendered, never> {
  return activeRepo.pipe(
    Effect.flatMap((repo) => withDriver(repo, snapshot)),
    Effect.catchTag('NoRepoError', () => Effect.succeed(renderNoRepo()))
  );
}

function withDriver(repo: JjRepo, snapshot: boolean): Effect.Effect<Rendered, never> {
  return Effect.gen(function* () {
    const driver = yield* JjDriver;
    const lines = yield* driver.logGraph({ snapshot });
    return renderLog(lines);
  }).pipe(
    Effect.catchAll((err) => Effect.succeed(renderError(repo, err))),
    Effect.provide(JjDriverLive),
    Effect.provide(jjConfigLayer(repo.root))
  );
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
    text: ['edamajutsu: log', '', 'No jj repository found in the current workspace.', ''].join(
      '\n'
    ),
    lineToChange: []
  };
}

function renderError(repo: JjRepo, err: JjDriverError): Rendered {
  const message = formatDriverError(err);
  const hint =
    err._tag === 'JjSpawnError' ? ['', 'Hint: the `jj` binary was not found on PATH.'] : [];
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
