import * as vscode from 'vscode';

import { EdamajutsuContentProvider } from './views/contentProvider';
import { StatusFoldingProvider } from './views/folding';
import { LogView, LOG_URI, openLog } from './views/log';
import { StatusView, STATUS_URI, openStatus } from './views/status';

export const EDAMAJUTSU_LANGUAGE = 'edamajutsu';
export const EDAMAJUTSU_SCHEME = 'edamajutsu';

export function activate(context: vscode.ExtensionContext): void {
  const statusView = new StatusView();
  const logView = new LogView();
  const contentProvider = new EdamajutsuContentProvider(statusView, logView);
  // Scope folding to the status URI only — the log view doesn't use folding,
  // and registering for the whole language would mis-fold the log document
  // with the status view's ranges.
  const statusSelector: vscode.DocumentSelector = {
    scheme: EDAMAJUTSU_SCHEME,
    language: EDAMAJUTSU_LANGUAGE,
    pattern: STATUS_URI.path
  };

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(EDAMAJUTSU_SCHEME, contentProvider),
    vscode.languages.registerFoldingRangeProvider(statusSelector, new StatusFoldingProvider(statusView)),
    vscode.commands.registerCommand('edamajutsu.openStatus', () => openStatus(statusView)),
    vscode.commands.registerCommand('edamajutsu.openLog', () => openLog(logView)),
    vscode.commands.registerCommand('edamajutsu.refresh', () => onRefresh(statusView, logView))
  );
}

async function onRefresh(status: StatusView, log: LogView): Promise<void> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (!activeUri) {
    return;
  }
  const uriString = activeUri.toString();
  if (uriString === STATUS_URI.toString()) {
    await status.refresh(true);
  } else if (uriString === LOG_URI.toString()) {
    await log.refresh(true);
  }
}

export function deactivate(): void {
  // nothing to clean up
}
