import { Change } from '../model/change';

// One-line summary used by the log view and any tooling that wants the same
// shape. Kept in a vscode-free module so the demo scripts can reuse it.
export function formatChangeOneLine(change: Change): string {
  const bookmarks =
    change.bookmarks.length > 0 ? ` [${change.bookmarks.join(', ')}]` : '';
  const conflict = change.isConflicted ? ' (conflict)' : '';
  const empty = change.isEmpty ? ' (empty)' : '';
  const desc = change.descriptionFirstLine || '(no description set)';
  return `${change.changeId.slice(0, 8)} ${change.commitId.slice(0, 8)}${bookmarks}${empty}${conflict} ${desc}`;
}
