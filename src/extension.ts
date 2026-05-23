import * as vscode from 'vscode';

import { StatusView, STATUS_URI, openStatus } from './views/status';
import { StatusFoldingProvider } from './views/folding';

export const EDAMAJUTSU_LANGUAGE = 'edamajutsu';
export const EDAMAJUTSU_SCHEME = 'edamajutsu';

export function activate(context: vscode.ExtensionContext): void {
  const statusView = new StatusView();
  const documentSelector: vscode.DocumentSelector = {
    scheme: EDAMAJUTSU_SCHEME,
    language: EDAMAJUTSU_LANGUAGE
  };

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(EDAMAJUTSU_SCHEME, statusView),
    vscode.languages.registerFoldingRangeProvider(documentSelector, new StatusFoldingProvider(statusView)),
    vscode.commands.registerCommand('edamajutsu.openStatus', () => openStatus(statusView)),
    vscode.commands.registerCommand('edamajutsu.refresh', () => onRefresh(statusView))
  );
}

async function onRefresh(view: StatusView): Promise<void> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (!activeUri || activeUri.toString() !== STATUS_URI.toString()) {
    return;
  }
  await view.refresh(true);
}

export function deactivate(): void {
  // nothing to clean up
}
