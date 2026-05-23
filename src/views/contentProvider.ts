import * as vscode from 'vscode';

import { LogView, LOG_URI } from './log';
import { StatusView, STATUS_URI } from './status';

// VSCode lets us register only one TextDocumentContentProvider per scheme.
// This dispatches the `edamajutsu:` scheme to the right view by URI.
export class EdamajutsuContentProvider implements vscode.TextDocumentContentProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly status: StatusView,
    private readonly log: LogView
  ) {
    status.onDidChange((uri) => this.emitter.fire(uri));
    log.onDidChange((uri) => this.emitter.fire(uri));
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = uri.toString();
    if (key === STATUS_URI.toString()) {
      return this.status.provideTextDocumentContent(uri);
    }
    if (key === LOG_URI.toString()) {
      return this.log.provideTextDocumentContent(uri);
    }
    // We only open URIs we control; anything else is a programmer error.
    throw new Error(`unrecognized edamajutsu URI: ${key}`);
  }
}
