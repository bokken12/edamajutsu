import * as vscode from 'vscode';

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
    )
  );
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
    await status.refresh(true);
  } else if (uriString === LOG_URI.toString()) {
    await log.refresh(true);
  } else if (uriString === COMMIT_DETAIL_URI.toString()) {
    await commit.refresh(true);
  } else if (uriString === OP_LOG_URI.toString()) {
    // Op log refresh is always passive — see OpLogView for why.
    await opLog.refresh();
  }
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
