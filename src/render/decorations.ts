import * as vscode from 'vscode';

// Semantic decoration classes. Renderers tag spans with these; the
// decoration manager wires each class to a concrete style. Keep the set
// small — every new key requires a matching style below.
export type DecorationKey =
  | 'changeId'
  | 'commitId'
  | 'bookmark'
  | 'conflict'
  | 'empty'
  | 'sectionHeader'
  | 'fileAdded'
  | 'fileModified'
  | 'fileDeleted'
  | 'fileRenamed'
  | 'fileCopied';

export type DecorationTypes = Readonly<Record<DecorationKey, vscode.TextEditorDecorationType>>;

// Builds the set of TextEditorDecorationType instances used across all views.
// Each refers to a built-in VSCode `ThemeColor` so colours follow the active
// editor theme rather than being hard-coded. The caller is responsible for
// disposing each type at extension teardown.
export function createDecorationTypes(): DecorationTypes {
  const make = (color: string, extras?: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType =>
    vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor(color),
      ...extras
    });

  return {
    changeId: make('descriptionForeground'),
    commitId: make('descriptionForeground'),
    bookmark: make('gitDecoration.untrackedResourceForeground'),
    conflict: make('errorForeground', { fontWeight: 'bold' }),
    empty: make('descriptionForeground', { fontStyle: 'italic' }),
    sectionHeader: vscode.window.createTextEditorDecorationType({ fontWeight: 'bold' }),
    fileAdded: make('gitDecoration.addedResourceForeground'),
    fileModified: make('gitDecoration.modifiedResourceForeground'),
    fileDeleted: make('gitDecoration.deletedResourceForeground'),
    fileRenamed: make('gitDecoration.renamedResourceForeground'),
    fileCopied: make('gitDecoration.renamedResourceForeground')
  };
}
