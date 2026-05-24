import * as vscode from 'vscode';

import { Change } from '../../model/change';
import { DecoratedLine } from '../../render/decoratedText';

// Edamagit-style composable view tree. Each View renders to a list of
// DecoratedLines and tracks its own line range in the resulting buffer.
// Line-to-change mapping and folding ranges fall out of the tree: each
// section knows what it spans, each row knows what change it "belongs to".
//
// `render(startLine)` is the only mutation: it populates startLine/endLine
// on this view and all subviews. Call it once per refresh from the root.

// In-memory fold-state per view id. Survives across renders so a fold that
// the user has explicitly toggled stays where they put it; new views fall
// back to `foldedByDefault`. Cleared only on extension reload.
const viewFoldStatusMemory = new Map<string, boolean>();

export class View {
  subViews: View[] = [];
  isFoldable = false;
  foldedByDefault = false;

  // Inclusive line range this view occupies in the rendered buffer. Set
  // by `render`; -1 before the first render. Subviews of a folded ancestor
  // retain whatever lines they computed before the fold collapsed them —
  // walk()/changeAtLine() skip into folded subtrees so those stale values
  // never leak out.
  startLine = -1;
  endLine = -1;

  private _folded = false;

  // Stable identity used to persist fold state across re-renders. Subviews
  // override this; if undefined, the view's fold state isn't remembered.
  get id(): string | undefined {
    return undefined;
  }

  // What change this view "represents" for navigation purposes. Inherited
  // by every line the view (or a non-overriding subview) covers. Undefined
  // means clicks on this view's lines drill into nothing.
  get change(): Change | undefined {
    return undefined;
  }

  get folded(): boolean {
    return this._folded;
  }

  set folded(value: boolean) {
    if (this.id) {
      viewFoldStatusMemory.set(this.id, value);
    }
    this._folded = value;
  }

  protected retrieveFold(): void {
    if (this.isFoldable && this.id) {
      this._folded = viewFoldStatusMemory.get(this.id) ?? this.foldedByDefault;
    }
  }

  addSubview(...views: View[]): void {
    this.subViews.push(...views);
  }

  // Renders this view's content at `startLine` and returns the resulting
  // DecoratedLines. The default implementation just composes subviews; leaf
  // views (TextView, etc.) override to emit their own content. Always sets
  // this.startLine / this.endLine; subviews that are *skipped* due to a
  // folded ancestor retain startLine=endLine=-1.
  render(startLine: number): DecoratedLine[] {
    this.retrieveFold();

    let line = startLine;
    const out: DecoratedLine[] = [];

    for (const sub of this.subViews) {
      const rendered = sub.render(line);
      out.push(...rendered);
      line += rendered.length;
    }

    this.startLine = startLine;
    // A view with no lines (e.g. an empty section that produced no
    // children) gets an empty range — endLine = startLine - 1 — so
    // changeAtLine/foldingRanges treat it as occupying no rows.
    this.endLine = line - 1;

    if (this.folded && out.length > 0) {
      // Folded views keep only their first line. The view still owns the
      // full original range so click handling on the visible folded header
      // resolves to the view itself.
      this.endLine = startLine;
      return [out[0]];
    }
    return out;
  }

  // Walks the subtree in depth-first order, skipping the body of folded
  // views (their first line — the visible header — counts as the view
  // itself, which is yielded). Useful for collecting per-line metadata and
  // folding ranges after a render.
  *walk(): Generator<View> {
    yield this;
    if (this.folded) {
      return;
    }
    for (const sub of this.subViews) {
      yield* sub.walk();
    }
  }

  // Returns the most specific view containing `line` whose `change` is
  // defined. Walks from this view downward, preferring deeper subviews
  // (the leaf that actually owns the row wins over an enclosing section).
  // Folded subviews are opaque — their body is hidden, so we don't descend.
  changeAtLine(line: number): Change | undefined {
    if (line < this.startLine || line > this.endLine) {
      return undefined;
    }
    if (!this.folded) {
      for (const sub of this.subViews) {
        const subChange = sub.changeAtLine(line);
        if (subChange !== undefined) {
          return subChange;
        }
      }
    }
    return this.change;
  }

  // Folding ranges contributed by this view (and its subviews). A view
  // contributes a fold iff it's marked foldable and covers >1 line. The
  // root view recurses to collect every contributing range.
  foldingRanges(): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];
    for (const node of this.walk()) {
      if (node.isFoldable && node.endLine > node.startLine && node.startLine >= 0) {
        ranges.push(new vscode.FoldingRange(node.startLine, node.endLine, vscode.FoldingRangeKind.Region));
      }
    }
    return ranges;
  }
}
