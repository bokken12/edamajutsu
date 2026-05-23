import * as vscode from 'vscode';
import { StatusDocumentProvider, openStatus } from './views/status';

export function activate(context: vscode.ExtensionContext): void {
  const statusProvider = new StatusDocumentProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('edamajutsu', statusProvider),
    vscode.commands.registerCommand('edamajutsu.openStatus', () => openStatus(statusProvider))
  );
}

export function deactivate(): void {
  // nothing to clean up
}
