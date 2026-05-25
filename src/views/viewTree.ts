import * as vscode from 'vscode';

import { Change } from '../model/change';
import { DecoratedDocBuilder, DecoratedLine, DecorationRanges } from '../render/decoratedText';

// Direct port of edamagit's `View` class hierarchy (src/views/general/view.ts).
//
// A status document is rendered by building a tree of View instances and
// asking the root to render itself. Foldable views consult a static memory
// map (`foldMemory`) keyed by their `id` so user fold choices persist across
// refreshes — when we throw the tree away and rebuild it from fresh jj
// output, the new views look up their previous fold state by id.
//
// Folded views emit only their first sub-view at render time; the rest of
// their content is simply absent from the document text. That's why the
// status view no longer needs a `FoldingRangeProvider`: there is nothing to
// fold inside the document — folding is implemented by re-rendering.

// Fold state keyed by `view.id`. Module-level so it survives the rebuild
// that happens on every refresh.
const foldMemory = new Map<string, boolean>();

// Test helper: wipe the memory between tests so one test's fold flips don't
// leak into the next.
export function resetFoldMemory(): void {
  foldMemory.clear();
}

// Accumulates the rendered document as views call back into it. Mirrors
// `DecoratedDocBuilder` but also tracks per-line change ownership (for `RET`
// navigation).
export class RenderContext {
  private readonly doc = new DecoratedDocBuilder();
  private readonly lineToChange: Array<Change | undefined> = [];

  get currentLine(): number {
    return this.doc.currentLine();
  }

  pushLine(line: DecoratedLine, change: Change | undefined): void {
    this.doc.push(line);
    this.lineToChange.push(change);
  }

  pushPlain(text: string, change: Change | undefined): void {
    this.doc.pushPlain(text);
    this.lineToChange.push(change);
  }

  text(): string {
    return this.doc.text();
  }

  decorations(): DecorationRanges {
    return this.doc.decorations();
  }

  changes(): ReadonlyArray<Change | undefined> {
    return this.lineToChange;
  }
}

export abstract class View {
  // Sub-views are rendered in order; the first sub-view is treated as the
  // "header" — when this view is folded, only the first sub-view's lines are
  // emitted.
  subViews: View[] = [];
  isFoldable = false;
  foldedByDefault = false;
  // The line range this view (after rendering) occupies. Inclusive on both
  // ends; lines refer to the document the view was rendered into.
  range = new vscode.Range(0, 0, 0, 0);

  // Override to give this view a stable identity across refreshes. Without
  // an `id`, fold state is never persisted.
  get id(): string | undefined {
    return undefined;
  }

  // Override on leaf views that own a Change for `RET` navigation. The
  // status view uses this only via `lineToChange`; individual sub-views push
  // their own ownership during render.
  get change(): Change | undefined {
    return undefined;
  }

  private _folded = false;

  get folded(): boolean {
    return this._folded;
  }

  set folded(value: boolean) {
    this._folded = value;
    if (this.id) {
      foldMemory.set(this.id, value);
    }
  }

  // Pull the previously-remembered fold state for this view, falling back
  // to `foldedByDefault`. Called at the top of `render` so a newly-built
  // tree picks up the user's existing choices.
  protected retrieveFold(): void {
    if (this.isFoldable && this.id) {
      this._folded = foldMemory.get(this.id) ?? this.foldedByDefault;
    }
  }

  // Render this view's sub-tree into `ctx`. When folded, only the first
  // sub-view emits — that sub-view is the section/file header that always
  // stays visible. After rendering, `this.range` covers every line emitted
  // by this view (including the header).
  render(ctx: RenderContext): void {
    this.retrieveFold();
    const start = ctx.currentLine;
    const toRender = this.folded ? this.subViews.slice(0, 1) : this.subViews;
    for (const sub of toRender) {
      sub.render(ctx);
    }
    const end = Math.max(start, ctx.currentLine - 1);
    this.range = new vscode.Range(start, 0, end, 0);
  }

  // Depth-first traversal including this view. Used to find the deepest
  // foldable view containing a clicked line.
  *walk(): Generator<View> {
    yield this;
    for (const sub of this.subViews) {
      yield* sub.walk();
    }
  }

  // Find the deepest foldable view whose post-render range contains `line`.
  // Returns undefined when no foldable view covers that line — e.g. clicking
  // on a blank trailing line.
  foldableAt(line: number): View | undefined {
    let best: View | undefined = undefined;
    for (const view of this.walk()) {
      if (view.isFoldable && view.range.start.line <= line && line <= view.range.end.line) {
        best = view;
      }
    }
    return best;
  }
}

// A single line of text owned by an optional Change. The simplest leaf view.
export class TextLineView extends View {
  constructor(
    private readonly line: DecoratedLine,
    private readonly _change: Change | undefined = undefined
  ) {
    super();
  }

  override get change(): Change | undefined {
    return this._change;
  }

  override render(ctx: RenderContext): void {
    const lineIdx = ctx.currentLine;
    ctx.pushLine(this.line, this._change);
    this.range = new vscode.Range(lineIdx, 0, lineIdx, this.line.text.length);
  }
}

// A blank line, used to separate sections. Owned by no change so `RET` on
// the gap does nothing.
export class BlankLineView extends View {
  override render(ctx: RenderContext): void {
    const lineIdx = ctx.currentLine;
    ctx.pushPlain('', undefined);
    this.range = new vscode.Range(lineIdx, 0, lineIdx, 0);
  }
}
