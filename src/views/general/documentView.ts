import * as vscode from 'vscode';

import { Change } from '../../model/change';
import { DecoratedLine, DecorationRanges } from '../../render/decoratedText';
import { DecorationKey } from '../../render/decorations';
import { View } from './view';

// What a single render of a root view produces. The text/decorations come
// from the rendered lines; foldingRanges and line-to-change fall out of
// the View tree itself.
export type Rendered = {
  readonly text: string;
  readonly decorations: DecorationRanges;
  readonly foldingRanges: ReadonlyArray<vscode.FoldingRange>;
  readonly lineToChange: ReadonlyArray<Change | undefined>;
};

// Renders a view subtree into a complete Rendered. After this call, every
// View in the tree has its startLine/endLine populated, so callers can
// query foldingRanges/changeAtLine on the root.
export function renderRoot(root: View): Rendered {
  const lines = root.render(0);

  const byKey = new Map<DecorationKey, vscode.Range[]>();
  const text: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    text.push(line.text);
    for (const span of line.spans) {
      const range = new vscode.Range(i, span.start, i, span.end);
      const existing = byKey.get(span.key);
      if (existing) {
        existing.push(range);
      } else {
        byKey.set(span.key, [range]);
      }
    }
  }

  const lineToChange: Array<Change | undefined> = [];
  for (let i = 0; i < lines.length; i++) {
    lineToChange.push(root.changeAtLine(i));
  }

  return {
    text: text.join('\n'),
    decorations: byKey,
    foldingRanges: root.foldingRanges(),
    lineToChange
  };
}

// Exposed for tests: render a tree and return the materialized lines.
export function renderToLines(root: View): DecoratedLine[] {
  return root.render(0);
}
