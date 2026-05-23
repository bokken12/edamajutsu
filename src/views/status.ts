import * as vscode from 'vscode';
import { JjRepo, findJjRepo } from '../jj/repo';

const STATUS_URI = vscode.Uri.parse('edamajutsu:status');

export class StatusDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    const repo = currentRepo();
    return renderStatus(repo);
  }

  refresh(): void {
    this._onDidChange.fire(STATUS_URI);
  }
}

export async function openStatus(provider: StatusDocumentProvider): Promise<void> {
  provider.refresh();
  const doc = await vscode.workspace.openTextDocument(STATUS_URI);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function currentRepo(): JjRepo | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  return findJjRepo(folder.uri.fsPath);
}

function renderStatus(repo: JjRepo | undefined): string {
  if (!repo) {
    return [
      'edamajutsu: status',
      '',
      'No jj repository found in the current workspace.',
      'Open a folder containing a .jj/ directory to get started.',
      ''
    ].join('\n');
  }
  return [
    'edamajutsu: status',
    '',
    `Repository: ${repo.root}`,
    '',
    '(Phase 0 placeholder — real status renders in Phase 2.)',
    ''
  ].join('\n');
}
