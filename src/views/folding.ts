import * as vscode from 'vscode';

import { CommitDetailView, COMMIT_DETAIL_URI } from './commitDetail';
import { StatusView, STATUS_URI } from './status';

// Each view emits its folding ranges alongside the rendered text; the
// provider just hands the right view's ranges back to VSCode based on the
// document's URI. No text-shape heuristics.
export class EdamajutsuFoldingProvider implements vscode.FoldingRangeProvider {
  constructor(
    private readonly status: StatusView,
    private readonly commit: CommitDetailView
  ) {}

  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const key = document.uri.toString();
    if (key === STATUS_URI.toString()) {
      return [...this.status.getFoldingRanges()];
    }
    if (key === COMMIT_DETAIL_URI.toString()) {
      return [...this.commit.getFoldingRanges()];
    }
    return [];
  }
}
