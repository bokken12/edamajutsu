import * as vscode from 'vscode';

import { JjDriver } from '../jj/driver';
import { findJjRepo, JjRepo } from '../jj/repo';
import { ChangeId } from '../model/change';
import { CommitDetailView, COMMIT_DETAIL_URI } from '../views/commitDetail';
import { LogView, LOG_URI, openLog } from '../views/log';
import { OpLogView, OP_LOG_URI, openOpLog } from '../views/opLog';
import { StatusView, STATUS_URI, openStatus } from '../views/status';

type ChangeQuickPickItem = vscode.QuickPickItem & { changeId: ChangeId };

// Holds references to every view and exposes high-level command handlers
// that the extension's `activate` registers as VSCode commands. The point of
// this layer is to keep each handler's signature down to "no args (or just
// the user input you need)" — view threading happens once, in the
// constructor.
//
// Internal helpers (`runMutation`, `withPreservedCursor`, `pickBookmark`,
// etc.) live here too so they share access to the same view set.
export class AppContext {
  constructor(
    private readonly status: StatusView,
    private readonly log: LogView,
    private readonly commit: CommitDetailView,
    private readonly opLog: OpLogView
  ) {}

  // ---- View-opening commands ----

  openStatus(): Promise<void> {
    return openStatus(this.status);
  }

  openLog(): Promise<void> {
    return openLog(this.log);
  }

  openOpLog(): Promise<void> {
    return openOpLog(this.opLog);
  }

  async closeView(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }

  async help(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.quickOpen', '>Edamajutsu: ');
  }

  // ---- Refresh / navigation ----

  // Refresh whichever edamajutsu view is currently focused. Triggered by `g`.
  async refreshActive(): Promise<void> {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (!activeUri) {
      return;
    }
    const uriString = activeUri.toString();
    if (uriString === STATUS_URI.toString()) {
      await this.withPreservedCursor(STATUS_URI, () => this.status.refresh(true));
    } else if (uriString === LOG_URI.toString()) {
      await this.withPreservedCursor(LOG_URI, () => this.log.refresh(true));
    } else if (uriString === COMMIT_DETAIL_URI.toString()) {
      await this.withPreservedCursor(COMMIT_DETAIL_URI, () => this.commit.refresh(true));
    } else if (uriString === OP_LOG_URI.toString()) {
      // Op log refresh is always passive — see OpLogView for why.
      await this.withPreservedCursor(OP_LOG_URI, () => this.opLog.refresh());
    }
  }

  // RET: drill into the change at point.
  async visitAtPoint(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const uri = editor.document.uri.toString();
    const line = editor.selection.active.line;
    const change =
      uri === STATUS_URI.toString()
        ? this.status.changeAtLine(line)
        : uri === LOG_URI.toString()
          ? this.log.changeAtLine(line)
          : undefined;
    if (!change) {
      return;
    }
    await this.commit.show(change.changeId, false);
    const doc = await vscode.workspace.openTextDocument(COMMIT_DETAIL_URI);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  // ---- Mutations ----

  undo(): Promise<void> {
    return this.runMutation('jj undo', (d) => d.undo());
  }

  redo(): Promise<void> {
    return this.runMutation('jj redo', (d) => d.redo());
  }

  squash(): Promise<void> {
    return this.runMutation('jj squash', (d) => d.squashIntoParent());
  }

  absorb(): Promise<void> {
    return this.runMutation('jj absorb', (d) => d.absorb());
  }

  gitPush(): Promise<void> {
    return this.runMutation('jj git push', (d) => d.gitPush());
  }

  gitFetch(): Promise<void> {
    return this.runMutation('jj git fetch', (d) => d.gitFetch());
  }

  duplicate(): Promise<void> {
    return this.onChangeAtCursor('duplicate', (d, id) => d.duplicate(id));
  }

  revert(): Promise<void> {
    return this.onChangeAtCursor('revert', (d, id) => d.revert(id));
  }

  edit(): Promise<void> {
    return this.onChangeAtCursor('edit', (d, id) => d.edit(id));
  }

  async newChange(): Promise<void> {
    const message = await vscode.window.showInputBox({
      prompt: 'Description for the new change',
      placeHolder: '(leave blank for an empty change)'
    });
    if (message === undefined) {
      return; // cancelled
    }
    await this.runMutation('jj new', (d) => d.newChange(message));
  }

  async describe(): Promise<void> {
    const repo = this.resolveRepo();
    if (!repo) {
      return;
    }
    // Pre-fill with the current first line so it's an edit, not a rewrite.
    // Multi-line descriptions get truncated to the first line here; users
    // wanting a multi-line edit need a richer editor flow (TODO).
    let current = '';
    try {
      const [head] = await new JjDriver({ repoRoot: repo.root }).log({ revset: '@', limit: 1 });
      current = head?.descriptionFirstLine ?? '';
    } catch {
      // Fall through with empty default — describe will surface the real error.
    }

    const message = await vscode.window.showInputBox({
      prompt: 'New description for @',
      value: current
    });
    if (message === undefined) {
      return;
    }
    await this.runMutation('jj describe', (d) => d.describe(message));
  }

  async abandon(): Promise<void> {
    const changeId = this.activeChangeId();
    if (!changeId) {
      vscode.window.showInformationMessage('edamajutsu: no change selected to abandon.');
      return;
    }
    const short = changeId.slice(0, 8);
    const choice = await vscode.window.showWarningMessage(
      `Abandon change ${short}?`,
      { modal: true },
      'Abandon'
    );
    if (choice !== 'Abandon') {
      return;
    }
    await this.runMutation(`jj abandon ${short}`, (d) => d.abandon(changeId));
  }

  async rebase(): Promise<void> {
    const sourceId = this.activeChangeId();
    if (!sourceId) {
      vscode.window.showInformationMessage('edamajutsu: no change selected to rebase.');
      return;
    }
    const repo = this.resolveRepo();
    if (!repo) {
      return;
    }
    let candidates: ReadonlyArray<{ changeId: ChangeId; descriptionFirstLine: string }>;
    try {
      candidates = await new JjDriver({ repoRoot: repo.root }).log({});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`edamajutsu: listing destinations failed — ${message}`);
      return;
    }
    const items: ChangeQuickPickItem[] = candidates
      .filter((c) => c.changeId !== sourceId)
      .map((c) => ({
        label: c.changeId.slice(0, 8),
        description: c.descriptionFirstLine || '(no description)',
        changeId: c.changeId
      }));
    if (items.length === 0) {
      vscode.window.showInformationMessage('edamajutsu: no destination changes available.');
      return;
    }
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Rebase ${sourceId.slice(0, 8)} (+ descendants) onto...`
    });
    if (!picked) {
      return;
    }
    await this.runMutation(
      `jj rebase -s ${sourceId.slice(0, 8)} -d ${picked.label}`,
      (d) => d.rebase({ source: sourceId, destination: picked.changeId })
    );
  }

  // ---- Bookmark mutations ----

  async bookmarkCreate(): Promise<void> {
    const changeId = this.activeChangeId();
    if (!changeId) {
      vscode.window.showInformationMessage('edamajutsu: no change selected for the bookmark.');
      return;
    }
    const name = await vscode.window.showInputBox({
      prompt: `Create bookmark at ${changeId.slice(0, 8)}`,
      placeHolder: 'errors if a bookmark with this name already exists'
    });
    if (name === undefined || name.trim() === '') {
      return;
    }
    await this.runMutation(`jj bookmark create ${name}`, (d) =>
      d.createBookmark(name.trim(), changeId)
    );
  }

  async bookmarkSet(): Promise<void> {
    const changeId = this.activeChangeId();
    if (!changeId) {
      vscode.window.showInformationMessage('edamajutsu: no change selected for the bookmark.');
      return;
    }
    const picked = await this.pickBookmark(`Move which bookmark to ${changeId.slice(0, 8)}?`);
    if (!picked) {
      return;
    }
    await this.runMutation(`jj bookmark set ${picked}`, (d) => d.setBookmark(picked, changeId));
  }

  bookmarkDelete(): Promise<void> {
    return this.onBookmarkPick('Delete which bookmark?', 'jj bookmark delete', (d, name) =>
      d.deleteBookmark(name)
    );
  }

  bookmarkForget(): Promise<void> {
    return this.onBookmarkPick('Forget which bookmark?', 'jj bookmark forget', (d, name) =>
      d.forgetBookmark(name)
    );
  }

  async bookmarkRename(): Promise<void> {
    const oldName = await this.pickBookmark('Rename which bookmark?');
    if (!oldName) {
      return;
    }
    const newName = await vscode.window.showInputBox({
      prompt: `New name for ${oldName}`,
      value: oldName
    });
    if (newName === undefined || newName.trim() === '' || newName.trim() === oldName) {
      return;
    }
    await this.runMutation(`jj bookmark rename ${oldName} ${newName.trim()}`, (d) =>
      d.renameBookmark(oldName, newName.trim())
    );
  }

  // ---- Internal helpers ----

  // Returns the change-id under the user's intent: cursor position in
  // status/log, or commit-detail's current change. Undefined if no edamajutsu
  // view is active or the cursor isn't on a change row.
  private activeChangeId(): ChangeId | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    const uri = editor.document.uri.toString();
    if (uri === STATUS_URI.toString()) {
      return this.status.changeAtLine(editor.selection.active.line)?.changeId;
    }
    if (uri === LOG_URI.toString()) {
      return this.log.changeAtLine(editor.selection.active.line)?.changeId;
    }
    if (uri === COMMIT_DETAIL_URI.toString()) {
      return this.commit.currentChangeId();
    }
    return undefined;
  }

  // Resolves the workspace folder's jj repo. Shows a warning and returns
  // undefined if there isn't one.
  private resolveRepo(): JjRepo | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
    if (!repo) {
      vscode.window.showWarningMessage('edamajutsu: no jj repository in the current workspace.');
      return undefined;
    }
    return repo;
  }

  // Resolves the repo, runs the mutation, surfaces any failure via popup,
  // then refreshes every open view.
  private async runMutation(
    label: string,
    action: (driver: JjDriver) => Promise<void>
  ): Promise<void> {
    const repo = this.resolveRepo();
    if (!repo) {
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
    await this.refreshOpenViews();
  }

  // Common pattern: get active change, runMutation against it.
  private async onChangeAtCursor(
    verb: string,
    action: (driver: JjDriver, id: ChangeId) => Promise<void>
  ): Promise<void> {
    const changeId = this.activeChangeId();
    if (!changeId) {
      vscode.window.showInformationMessage(`edamajutsu: no change selected to ${verb}.`);
      return;
    }
    await this.runMutation(`jj ${verb} ${changeId.slice(0, 8)}`, (d) => action(d, changeId));
  }

  // Common pattern for `b d` / `b f`: pick a bookmark, runMutation.
  private async onBookmarkPick(
    prompt: string,
    label: string,
    action: (driver: JjDriver, name: string) => Promise<void>
  ): Promise<void> {
    const picked = await this.pickBookmark(prompt);
    if (!picked) {
      return;
    }
    await this.runMutation(`${label} ${picked}`, (d) => action(d, picked));
  }

  // Lists local bookmarks via jj and shows a QuickPick. Returns undefined on
  // any failure (popups shown), if there are no bookmarks, or if the user
  // cancels.
  private async pickBookmark(prompt: string): Promise<string | undefined> {
    const repo = this.resolveRepo();
    if (!repo) {
      return undefined;
    }
    let bookmarks: string[];
    try {
      bookmarks = await new JjDriver({ repoRoot: repo.root }).listBookmarks();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`edamajutsu: listing bookmarks failed — ${message}`);
      return undefined;
    }
    if (bookmarks.length === 0) {
      vscode.window.showInformationMessage('edamajutsu: no bookmarks.');
      return undefined;
    }
    return vscode.window.showQuickPick(bookmarks, { placeHolder: prompt });
  }

  // Refreshes every open edamajutsu view, passively. Cursor is preserved.
  private async refreshOpenViews(): Promise<void> {
    const openUris = new Set(
      vscode.window.visibleTextEditors.map((e) => e.document.uri.toString())
    );
    const tasks: Promise<void>[] = [];
    if (openUris.has(STATUS_URI.toString())) {
      tasks.push(this.withPreservedCursor(STATUS_URI, () => this.status.refresh(false)));
    }
    if (openUris.has(LOG_URI.toString())) {
      tasks.push(this.withPreservedCursor(LOG_URI, () => this.log.refresh(false)));
    }
    if (openUris.has(COMMIT_DETAIL_URI.toString())) {
      tasks.push(this.withPreservedCursor(COMMIT_DETAIL_URI, () => this.commit.refresh(false)));
    }
    if (openUris.has(OP_LOG_URI.toString())) {
      tasks.push(this.withPreservedCursor(OP_LOG_URI, () => this.opLog.refresh()));
    }
    await Promise.all(tasks);
  }

  // Runs `refresh` and restores the cursor to its prior position, clamped to
  // the new document length. Without this, VSCode tends to drop the cursor
  // when the document content changes via TextDocumentContentProvider.
  private async withPreservedCursor(
    uri: vscode.Uri,
    refresh: () => Promise<void>
  ): Promise<void> {
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
}
