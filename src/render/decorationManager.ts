import * as vscode from 'vscode';

import { DecorationKey, DecorationTypes } from './decorations';
import { DecorationRanges } from './decoratedText';

// Anything the manager treats as a view: an identifying URI plus a way to
// fetch the current decoration ranges for that view.
export type DecoratedView = {
  readonly uri: vscode.Uri;
  getDecorations(): DecorationRanges;
};

// Subscribes to editor- and view-lifecycle events and keeps each visible
// edamajutsu editor's decorations in sync with the owning view. Initial
// application happens when an editor becomes visible; subsequent updates
// happen when the view's content changes (re-applied once VSCode lands the
// new text via onDidChangeTextDocument).
export class DecorationManager {
  private readonly byUri: Map<string, DecoratedView>;

  constructor(
    private readonly types: DecorationTypes,
    views: ReadonlyArray<DecoratedView>
  ) {
    this.byUri = new Map(views.map((v) => [v.uri.toString(), v]));
  }

  register(context: vscode.ExtensionContext): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.apply(editor);
    }
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) {
          this.apply(editor);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const view = this.byUri.get(e.document.uri.toString());
        if (!view) {
          return;
        }
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.uri.toString() === view.uri.toString()) {
            this.apply(editor);
          }
        }
      })
    );
  }

  private apply(editor: vscode.TextEditor): void {
    const view = this.byUri.get(editor.document.uri.toString());
    if (!view) {
      return;
    }
    const ranges = view.getDecorations();
    for (const key of Object.keys(this.types) as DecorationKey[]) {
      editor.setDecorations(this.types[key], [...(ranges.get(key) ?? [])]);
    }
  }
}
