import { Effect } from 'effect';
import * as vscode from 'vscode';

import { JjDriver, JjDriverLive, JjDriverOps, jjConfigLayer } from '../jj/driver';
import { JjDriverError, JjUnexpectedOutput } from '../jj/errors';
import { JjRepo } from '../jj/repo';
import { activeRepo } from '../jj/workspace';
import { Change } from '../model/change';
import { FileChange, FileChangeKind } from '../model/fileChange';
import { DecoratedDocBuilder, DecoratedLine, DecorationRanges, LineBuilder } from '../render/decoratedText';
import { DecorationKey } from '../render/decorations';
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
  readonly decorations: DecorationRanges;
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
    const next = await Effect.runPromise(produce(snapshot));
    if (token !== this.refreshToken) {
      return;
    }
    this.rendered = next;
    this.onDidChangeEmitter.fire(STATUS_URI);
  }
}

export async function openStatus(view: StatusView): Promise<void> {
  await view.refresh(false);
  const doc = await vscode.workspace.openTextDocument(STATUS_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

// The view's contract is "show *something* to the user" — never reject. The
// effect resolves the repo first; if missing, render the placeholder. With
// a repo in hand, build the driver layer scoped to that repo, fetch the jj
// state, and render. The catchAll inside `withDriver` flattens every typed
// driver error (spawn / non-zero / parse / unexpected-empty) into an inline
// error page so the caller sees Effect<Rendered, never>.
function produce(snapshot: boolean): Effect.Effect<Rendered, never> {
  return activeRepo.pipe(
    Effect.flatMap((repo) => withDriver(repo, snapshot)),
    Effect.catchTag('NoRepoError', () => Effect.succeed(plainRendered(renderNoRepo())))
  );
}

function withDriver(repo: JjRepo, snapshot: boolean): Effect.Effect<Rendered, never> {
  return Effect.gen(function* () {
    const driver = yield* JjDriver;
    const data = yield* fetchStatus(driver, snapshot);
    return renderStatus(repo, data);
  }).pipe(
    Effect.catchAll((err) => Effect.succeed(plainRendered(renderError(repo, err)))),
    Effect.provide(JjDriverLive),
    Effect.provide(jjConfigLayer(repo.root))
  );
}

function fetchStatus(
  driver: JjDriverOps,
  snapshot: boolean
): Effect.Effect<StatusData, JjDriverError> {
  return Effect.gen(function* () {
    const [workingCopy] = yield* driver.log({ revset: '@', limit: 1, snapshot });
    if (!workingCopy) {
      return yield* Effect.fail(
        new JjUnexpectedOutput({ message: 'jj log @ returned no records' })
      );
    }
    // @- runs in parallel with the diff summary — they're independent reads
    // of the same revset and a refresh of the status view fires both anyway.
    const [parent, files] = yield* Effect.all(
      [
        driver.log({ revset: '@-', limit: 1 }).pipe(Effect.map(([p]) => p)),
        driver.diffSummary()
      ],
      { concurrency: 2 }
    );
    return { workingCopy, parent, files };
  });
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

function renderError(repo: JjRepo, err: JjDriverError): string {
  const message = formatDriverError(err);
  const hint =
    err._tag === 'JjSpawnError'
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

// Shared formatter for any typed driver error. The error classes already
// expose a `.message`; the tag prefix is helpful only when developers are
// reading the popup, so we elide it from the user-facing string.
function formatDriverError(err: JjDriverError): string {
  return 'message' in err && typeof err.message === 'string' ? err.message : String(err);
}

export { formatDriverError };

function renderStatus(repo: JjRepo, data: StatusData): Rendered {
  const out = new StatusBuilder();
  out.plain('edamajutsu: status');
  out.plain('');
  out.plain(`Repository: ${repo.root}`);
  out.plain('');

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

// Wraps DecoratedDocBuilder with the status-specific bookkeeping: folding
// ranges per section and the line-to-change map for `RET` navigation.
class StatusBuilder {
  private readonly doc = new DecoratedDocBuilder();
  private readonly foldingRanges: vscode.FoldingRange[] = [];
  private readonly lineToChange: Array<Change | undefined> = [];

  plain(text: string): void {
    this.doc.pushPlain(text);
    this.lineToChange.push(undefined);
  }

  section(change: Change, produce: () => DecoratedLine[]): void {
    const start = this.doc.currentLine();
    const body = produce();
    for (const line of body) {
      this.doc.push(line);
      this.lineToChange.push(change);
    }
    const end = this.doc.currentLine() - 1;
    if (end > start) {
      this.foldingRanges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
    }
    this.doc.pushPlain('');
    this.lineToChange.push(undefined);
  }

  build(): Rendered {
    return {
      text: this.doc.text(),
      foldingRanges: this.foldingRanges,
      lineToChange: this.lineToChange,
      decorations: this.doc.decorations()
    };
  }
}

function renderChangeSection(header: string, change: Change): DecoratedLine[] {
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

  return [
    headerLine.build(),
    new LineBuilder()
      .plain('  ')
      .plain(change.descriptionFirstLine || '(no description set)')
      .build(),
    new LineBuilder().plain(`  ${change.authorName} <${change.authorEmail}>`).build()
  ];
}

function renderFilesSection(files: ReadonlyArray<FileChange>): DecoratedLine[] {
  const lines: DecoratedLine[] = [
    new LineBuilder().dec('sectionHeader', `Working copy changes (${files.length}):`).build()
  ];
  for (const file of files) {
    lines.push(
      new LineBuilder()
        .plain('  ')
        .dec(fileKindDecoration(file.kind), fileKindGlyph(file.kind))
        .plain(` ${file.path}`)
        .build()
    );
  }
  return lines;
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
