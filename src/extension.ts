import * as vscode from 'vscode';

import { JjDriver } from './jj/driver';
import { findJjRepo } from './jj/repo';
import { ChangeId } from './model/change';
import { DecorationManager } from './render/decorationManager';
import { createDecorationTypes } from './render/decorations';
import { CommitDetailView, COMMIT_DETAIL_URI } from './views/commitDetail';
import { EdamajutsuContentProvider } from './views/contentProvider';
import { EdamajutsuFoldingProvider } from './views/folding';
import { LogView, LOG_URI, openLog } from './views/log';
import { OpLogView, OP_LOG_URI, openOpLog } from './views/opLog';
import { StatusView, STATUS_URI, openStatus } from './views/status';

export const EDAMAJUTSU_LANGUAGE = 'edamajutsu';
export const EDAMAJUTSU_SCHEME = 'edamajutsu';

export function activate(context: vscode.ExtensionContext): void {
  const statusView = new StatusView();
  const logView = new LogView();
  const commitView = new CommitDetailView();
  const opLogView = new OpLogView();
  const contentProvider = new EdamajutsuContentProvider(
    statusView,
    logView,
    commitView,
    opLogView
  );
  const foldingSelector: vscode.DocumentSelector = [
    { scheme: EDAMAJUTSU_SCHEME, language: EDAMAJUTSU_LANGUAGE, pattern: STATUS_URI.path },
    { scheme: EDAMAJUTSU_SCHEME, language: EDAMAJUTSU_LANGUAGE, pattern: COMMIT_DETAIL_URI.path }
  ];

  const decorationTypes = createDecorationTypes();
  context.subscriptions.push(...Object.values(decorationTypes));
  new DecorationManager(decorationTypes, [statusView, logView, commitView, opLogView]).register(context);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(EDAMAJUTSU_SCHEME, contentProvider),
    vscode.languages.registerFoldingRangeProvider(
      foldingSelector,
      new EdamajutsuFoldingProvider(statusView, commitView)
    ),
    vscode.commands.registerCommand('edamajutsu.openStatus', () => openStatus(statusView)),
    vscode.commands.registerCommand('edamajutsu.openLog', () => openLog(logView)),
    vscode.commands.registerCommand('edamajutsu.openOpLog', () => openOpLog(opLogView)),
    vscode.commands.registerCommand('edamajutsu.refresh', () =>
      onRefresh(statusView, logView, commitView, opLogView)
    ),
    vscode.commands.registerCommand('edamajutsu.visitAtPoint', () =>
      onVisitAtPoint(statusView, logView, commitView)
    ),
    vscode.commands.registerCommand('edamajutsu.undo', () =>
      runMutation('jj undo', statusView, logView, commitView, opLogView, (d) => d.undo())
    ),
    vscode.commands.registerCommand('edamajutsu.new', () =>
      onNew(statusView, logView, commitView, opLogView)
    ),
    vscode.commands.registerCommand('edamajutsu.describe', () =>
      onDescribe(statusView, logView, commitView, opLogView)
    ),
    vscode.commands.registerCommand('edamajutsu.abandon', () =>
      onAbandon(statusView, logView, commitView, opLogView)
    )
  );
}

// Returns the change-id of the change the user's intent is currently focused
// on: from cursor position in status/log, or the commit currently displayed
// in commit detail. Undefined if there's no edamajutsu view active or the
// cursor isn't on a change row.
function activeChangeId(
  status: StatusView,
  log: LogView,
  commit: CommitDetailView
): ChangeId | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const uri = editor.document.uri.toString();
  if (uri === STATUS_URI.toString()) {
    return status.changeAtLine(editor.selection.active.line)?.changeId;
  }
  if (uri === LOG_URI.toString()) {
    return log.changeAtLine(editor.selection.active.line)?.changeId;
  }
  if (uri === COMMIT_DETAIL_URI.toString()) {
    return commit.currentChangeId();
  }
  return undefined;
}

async function onAbandon(
  status: StatusView,
  log: LogView,
  commit: CommitDetailView,
  opLog: OpLogView
): Promise<void> {
  const changeId = activeChangeId(status, log, commit);
  if (!changeId) {
    vscode.window.showInformationMessage('edamajutsu: no change selected to abandon.');
    return;
  }
  const short = changeId.slice(0, 8);
  const choice = await vscode.window.showWarningMessage(
    `Abandon change ${short}? (Recoverable via \`u\`.)`,
    { modal: true },
    'Abandon'
  );
  if (choice !== 'Abandon') {
    return;
  }
  await runMutation(
    `jj abandon ${short}`,
    status,
    log,
    commit,
    opLog,
    (d) => d.abandon(changeId)
  );
}

// Runs a mutation against the workspace's jj repo, refreshes all open views,
// and surfaces any jj failure via a popup.
async function runMutation(
  label: string,
  status: StatusView,
  log: LogView,
  commit: CommitDetailView,
  opLog: OpLogView,
  action: (driver: JjDriver) => Promise<void>
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
  if (!repo) {
    vscode.window.showWarningMessage('edamajutsu: no jj repository in the current workspace.');
    return;
  }
  try {
    await action(new JjDriver({ repoRoot: repo.root }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`edamajutsu: ${label} failed — ${message}`);
    return;
  }
  // The mutation already snapshotted; refreshes can stay passive.
  await refreshOpenViews(status, log, commit, opLog);
}

async function onNew(
  status: StatusView,
  log: LogView,
  commit: CommitDetailView,
  opLog: OpLogView
): Promise<void> {
  const message = await vscode.window.showInputBox({
    prompt: 'Description for the new change',
    placeHolder: '(leave blank for an empty change)'
  });
  if (message === undefined) {
    return; // cancelled
  }
  await runMutation('jj new', status, log, commit, opLog, (d) => d.newChange(message));
}

async function onDescribe(
  status: StatusView,
  log: LogView,
  commit: CommitDetailView,
  opLog: OpLogView
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
  if (!repo) {
    vscode.window.showWarningMessage('edamajutsu: no jj repository in the current workspace.');
    return;
  }

  // Pre-fill with the current first line so it's an edit, not a rewrite.
  // Multi-line descriptions get truncated to the first line through this
  // entry point; users who want a multi-line edit can fall back to the
  // terminal until we add a real editor flow.
  let current = '';
  try {
    const [head] = await new JjDriver({ repoRoot: repo.root }).log({ revset: '@', limit: 1 });
    current = head?.descriptionFirstLine ?? '';
  } catch {
    // If the read fails, fall through with an empty default — describe will
    // surface the real error.
  }

  const message = await vscode.window.showInputBox({
    prompt: 'New description for @',
    value: current
  });
  if (message === undefined) {
    return;
  }
  await runMutation('jj describe', status, log, commit, opLog, (d) => d.describe(message));
}

// Re-renders every edamajutsu view that's currently open, passively. Used
// after a mutation to bring all views in sync with the new repo state.
async function refreshOpenViews(
  status: StatusView,
  log: LogView,
  commit: CommitDetailView,
  opLog: OpLogView
): Promise<void> {
  const openUris = new Set(
    vscode.window.visibleTextEditors.map((e) => e.document.uri.toString())
  );
  const tasks: Promise<void>[] = [];
  if (openUris.has(STATUS_URI.toString())) {
    tasks.push(withPreservedCursor(STATUS_URI, () => status.refresh(false)));
  }
  if (openUris.has(LOG_URI.toString())) {
    tasks.push(withPreservedCursor(LOG_URI, () => log.refresh(false)));
  }
  if (openUris.has(COMMIT_DETAIL_URI.toString())) {
    tasks.push(withPreservedCursor(COMMIT_DETAIL_URI, () => commit.refresh(false)));
  }
  if (openUris.has(OP_LOG_URI.toString())) {
    tasks.push(withPreservedCursor(OP_LOG_URI, () => opLog.refresh()));
  }
  await Promise.all(tasks);
}

async function onRefresh(
  status: StatusView,
  log: LogView,
  commit: CommitDetailView,
  opLog: OpLogView
): Promise<void> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (!activeUri) {
    return;
  }
  const uriString = activeUri.toString();
  if (uriString === STATUS_URI.toString()) {
    await withPreservedCursor(STATUS_URI, () => status.refresh(true));
  } else if (uriString === LOG_URI.toString()) {
    await withPreservedCursor(LOG_URI, () => log.refresh(true));
  } else if (uriString === COMMIT_DETAIL_URI.toString()) {
    await withPreservedCursor(COMMIT_DETAIL_URI, () => commit.refresh(true));
  } else if (uriString === OP_LOG_URI.toString()) {
    // Op log refresh is always passive — see OpLogView for why.
    await withPreservedCursor(OP_LOG_URI, () => opLog.refresh());
  }
}

async function withPreservedCursor(uri: vscode.Uri, refresh: () => Promise<void>): Promise<void> {
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === uri.toString()
  );
  if (!editor) {
    await refresh();
    return;
  }

  const saved = editor.selection.active;

  // VSCode applies content from TextDocumentContentProvider asynchronously
  // after onDidChange fires; wait for the update before measuring line count.
  // An unchanged refresh emits no event — fall through after 250ms.
  const documentChanged = new Promise<void>((resolve) => {
    const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === uri.toString()) {
        disposable.dispose();
        resolve();
      }
    });
    setTimeout(() => {
      disposable.dispose();
      resolve();
    }, 250);
  });

  await refresh();
  await documentChanged;

  const maxLine = Math.max(0, editor.document.lineCount - 1);
  const line = Math.min(saved.line, maxLine);
  const lineText = editor.document.lineAt(line).text;
  const character = Math.min(saved.character, lineText.length);
  const position = new vscode.Position(line, character);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position));
}

async function onVisitAtPoint(
  status: StatusView,
  log: LogView,
  commit: CommitDetailView
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const uri = editor.document.uri.toString();
  const line = editor.selection.active.line;

  const change =
    uri === STATUS_URI.toString()
      ? status.changeAtLine(line)
      : uri === LOG_URI.toString()
        ? log.changeAtLine(line)
        : undefined;

  if (!change) {
    return;
  }
  await commit.show(change.changeId, false);
  const doc = await vscode.workspace.openTextDocument(COMMIT_DETAIL_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

export function deactivate(): void {
  // nothing to clean up
}
