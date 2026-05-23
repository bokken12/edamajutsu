import * as vscode from 'vscode';

import { StatusView } from './status';

// The status renderer emits its folding ranges alongside the rendered text;
// this provider just hands them back to VSCode. No text-shape heuristics.
export class StatusFoldingProvider implements vscode.FoldingRangeProvider {
  constructor(private readonly view: StatusView) {}

  provideFoldingRanges(_document: vscode.TextDocument): vscode.FoldingRange[] {
    return [...this.view.getFoldingRanges()];
  }
}
