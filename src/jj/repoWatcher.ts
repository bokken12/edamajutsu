import * as vscode from 'vscode';

import { Debouncer } from './debouncer';
import { resolveJjRepoStore } from './repo';

// Watches a jj repo's op-head pointer and fires `onRepoChanged` (debounced)
// when an external operation lands. The op-head is a single file under
// `<repo-store>/op_heads/heads/<opid>` that is replaced — old removed, new
// created — by every jj operation, so one operation produces exactly two
// (or three, with the directory mtime) file-system events. Debouncing
// collapses them into one refresh.
//
// We resolve the repo store ourselves (handling the case where `.jj/repo`
// is a workspace pointer to a sibling) so a single watcher catches activity
// from every workspace sharing the store. If the resolve fails (corrupt
// `.jj/`), we return undefined and the extension continues without a
// passive watcher — `g` still works.
export type RepoWatcher = {
  readonly suppressNext: () => void;
  readonly disarm: () => void;
  readonly dispose: () => void;
};

export function startRepoWatcher(
  repoRoot: string,
  onRepoChanged: () => void,
  quietMs = 250
): RepoWatcher | undefined {
  let storeDir: string;
  try {
    storeDir = resolveJjRepoStore(repoRoot);
  } catch {
    return undefined;
  }

  const debouncer = new Debouncer(quietMs, onRepoChanged);
  const pattern = new vscode.RelativePattern(storeDir, 'op_heads/heads/*');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const fire = (): void => debouncer.trigger();
  watcher.onDidCreate(fire);
  watcher.onDidChange(fire);
  watcher.onDidDelete(fire);

  return {
    suppressNext: () => debouncer.suppressNext(),
    disarm: () => debouncer.disarm(),
    dispose: () => {
      watcher.dispose();
      debouncer.dispose();
    }
  };
}
