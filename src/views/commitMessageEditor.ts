import * as vscode from 'vscode';

import { stripCommentsFromMessage } from './commitMessageBuffer';

// Multi-line describe editor, magit's `C`. A transient virtual file
// (`edamajutsu-commit:/commit-message.txt`) is opened in a tab,
// prepopulated with the current change's description plus a comment-header
// template. Saving submits via the configured submit callback (which calls
// `jj describe` under the hood); closing without saving cancels.
//
// We back the buffer with a `FileSystemProvider` rather than an untitled
// document so VSCode's native Save (Ctrl+S / Cmd+S) routes through us — no
// custom keybinding is needed for submit. Cancel is just closing the editor
// (VSCode's "Don't Save" prompt on a dirty buffer doubles as confirmation).

export const COMMIT_MESSAGE_SCHEME = 'edamajutsu-commit';

// The buffer is plain text — deliberately NOT given the `.edamajutsu`
// extension so the existing edamajutsu keybindings (`q`, `g`, `c`, ...)
// don't fire while the user is typing a description. Only one editor is
// open at a time — magit convention; collisions would be ambiguous.
export const COMMIT_MESSAGE_URI = vscode.Uri.from({
  scheme: COMMIT_MESSAGE_SCHEME,
  path: '/commit-message.txt'
});

// Callback invoked when the user saves the buffer. Returning successfully
// signals the editor was submitted (we then close the tab). Throwing or
// rejecting leaves the buffer open so the user can fix and retry.
export type SubmitHandler = (message: string) => Promise<void>;

// Backs the `edamajutsu-commit` scheme. We hold the single buffer's bytes
// in memory; readFile returns them, writeFile updates them AND fires the
// submit handler with the post-strip message. There's exactly one URI we
// answer for — anything else throws (URIs we don't own are programmer
// errors).
export class CommitMessageEditor implements vscode.FileSystemProvider {
  private buffer: Uint8Array | undefined;
  // Set while a submit is in flight so writeFile's invocation by VSCode's
  // own save pipeline doesn't loop into another submit.
  private submitting = false;
  private submitHandler: SubmitHandler | undefined;

  // Emitter is required by the FileSystemProvider interface but our buffer
  // is single-editor, single-window — external watchers don't exist.
  private readonly onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

  // Opens the editor with the given initial buffer content. The submit
  // handler is captured here (it's per-open, since it closes over the
  // current repo/driver). If an editor is already open for the same URI,
  // it gets repopulated and refocused.
  async open(initialContent: string, submitHandler: SubmitHandler): Promise<void> {
    this.buffer = Buffer.from(initialContent, 'utf8');
    this.submitHandler = submitHandler;
    this.onDidChangeFileEmitter.fire([
      { type: vscode.FileChangeType.Changed, uri: COMMIT_MESSAGE_URI }
    ]);
    const doc = await vscode.workspace.openTextDocument(COMMIT_MESSAGE_URI);
    // If the buffer was already open and dirty, the editor's in-memory copy
    // won't be replaced by our new content. Force a revert so the user sees
    // the fresh template populated from the current change.
    if (doc.isDirty) {
      await vscode.commands.executeCommand('workbench.action.files.revert', doc.uri);
    }
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  // FileSystemProvider implementation -------------------------------------

  stat(uri: vscode.Uri): vscode.FileStat {
    this.assertOurUri(uri);
    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: this.buffer?.byteLength ?? 0
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    this.assertOurUri(uri);
    if (this.buffer === undefined) {
      // The buffer's pristine state. Shouldn't happen — open() always
      // initializes — but we'd rather return empty bytes than crash the
      // editor host.
      return new Uint8Array();
    }
    return this.buffer;
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    this.assertOurUri(uri);
    this.buffer = content;
    // Re-entrant calls during submit (e.g. if the close below triggers
    // another save) would loop forever. Guard with a flag.
    if (this.submitting) {
      return;
    }
    const handler = this.submitHandler;
    if (!handler) {
      throw new Error('commit message editor saved before being opened');
    }
    const text = Buffer.from(content).toString('utf8');
    const message = stripCommentsFromMessage(text);
    this.submitting = true;
    try {
      await handler(message);
    } finally {
      this.submitting = false;
    }
    // Submit succeeded — drop the in-flight handler and close the tab.
    // (If the handler throws, the buffer stays open so the user can edit
    // and re-save.)
    this.submitHandler = undefined;
    await this.closeOpenEditors();
  }

  // The rest of FileSystemProvider is required by the interface but our
  // single-file scheme doesn't support it. Throwing FileSystemError makes
  // the failure mode self-documenting in the dev console.

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  readDirectory(): [string, vscode.FileType][] {
    throw vscode.FileSystemError.NoPermissions(COMMIT_MESSAGE_URI);
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions(COMMIT_MESSAGE_URI);
  }

  delete(): void {
    throw vscode.FileSystemError.NoPermissions(COMMIT_MESSAGE_URI);
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions(COMMIT_MESSAGE_URI);
  }

  // Helpers ---------------------------------------------------------------

  private assertOurUri(uri: vscode.Uri): void {
    if (uri.toString() !== COMMIT_MESSAGE_URI.toString()) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  // Close every editor showing our buffer. Used after a successful submit.
  // Iterates tab groups directly (rather than focusing then calling
  // closeActiveEditor) so we don't disturb the user's focus stack.
  private async closeOpenEditors(): Promise<void> {
    const ourUriString = COMMIT_MESSAGE_URI.toString();
    const toClose: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (input instanceof vscode.TabInputText && input.uri.toString() === ourUriString) {
          toClose.push(tab);
        }
      }
    }
    if (toClose.length > 0) {
      await vscode.window.tabGroups.close(toClose, true);
    }
  }
}
