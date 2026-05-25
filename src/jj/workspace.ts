import { Data, Effect } from 'effect';
import * as vscode from 'vscode';

import { findJjRepo, JjRepo } from './repo';

// Raised when there is no `.jj/` ancestor in the first workspace folder, OR
// no workspace folder is open. Views distinguish this from a driver failure
// so they can render the "no jj repository found" placeholder instead of an
// error popup.
export class NoRepoError extends Data.TaggedError('NoRepoError')<{}> {}

// Resolve the jj repository for the active workspace. Synchronous under the
// hood (a couple of stat() calls), but expressed as an Effect so callers can
// fold it into Effect.gen pipelines without sprinkling early-return guards
// across every view.
export const activeRepo: Effect.Effect<JjRepo, NoRepoError> = Effect.suspend(() => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const repo = folder ? findJjRepo(folder.uri.fsPath) : undefined;
  return repo ? Effect.succeed(repo) : Effect.fail(new NoRepoError());
});
