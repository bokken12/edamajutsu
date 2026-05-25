import { Change } from '../model/change';
import { DecoratedDocBuilder, DecoratedLine, DecorationRanges } from '../render/decoratedText';

// A node in an edamajutsu view tree. Either a single line (optionally tied to
// a change for RET navigation) or a collapsible fold with a header line and a
// body of child nodes. No mutable state, no per-node `range` field — the
// renderer is the only thing that computes line indices.
export type Node =
  | { readonly kind: 'line'; readonly line: DecoratedLine; readonly change?: Change }
  | {
      readonly kind: 'fold';
      readonly id: string;
      readonly foldedByDefault: boolean;
      readonly header: DecoratedLine;
      readonly body: ReadonlyArray<Node>;
      readonly change?: Change;
    };

// User-explicit fold overrides keyed by fold id. Anything missing falls back
// to the node's `foldedByDefault`. Stored separately from the tree so a
// re-rendered tree (after refresh) keeps the user's choices.
export type FoldState = ReadonlyMap<string, boolean>;

export type Rendered = {
  readonly text: string;
  readonly decorations: DecorationRanges;
  // Per-line: the Change that line belongs to (RET navigation target).
  readonly lineToChange: ReadonlyArray<Change | undefined>;
  // Per-line: the innermost fold id containing that line. Used by `toggleFold`
  // to know which fold the cursor sits inside.
  readonly lineToFoldId: ReadonlyArray<string | undefined>;
  // Effective fold state per fold id from this render — what `toggleFold`
  // flips. Includes both folds that were closed and folds that were open,
  // so a node that's collapsed (and whose body wasn't visited) is still in
  // here.
  readonly effective: ReadonlyMap<string, boolean>;
};

// Pure render. Walks `tree`, emits lines for visible content, accumulates
// decorations + the per-line maps. Collapsed fold nodes emit only their
// header.
export function render(tree: ReadonlyArray<Node>, fold: FoldState): Rendered {
  const doc = new DecoratedDocBuilder();
  const lineToChange: Array<Change | undefined> = [];
  const lineToFoldId: Array<string | undefined> = [];
  const effective = new Map<string, boolean>();
  // Stack of currently-open fold ids; `lineToFoldId[i]` is the top of stack
  // when line `i` is emitted.
  const stack: string[] = [];

  const pushLine = (line: DecoratedLine, change: Change | undefined): void => {
    doc.push(line);
    lineToChange.push(change);
    lineToFoldId.push(stack.length > 0 ? stack[stack.length - 1] : undefined);
  };

  const visit = (nodes: ReadonlyArray<Node>): void => {
    for (const node of nodes) {
      if (node.kind === 'line') {
        pushLine(node.line, node.change);
        continue;
      }
      const collapsed = fold.has(node.id) ? fold.get(node.id)! : node.foldedByDefault;
      effective.set(node.id, collapsed);
      // The header line itself is part of the fold (so Tab on the header
      // toggles that fold rather than its parent).
      stack.push(node.id);
      pushLine(node.header, node.change);
      if (!collapsed) {
        visit(node.body);
      }
      stack.pop();
    }
  };

  visit(tree);

  return {
    text: doc.text(),
    decorations: doc.decorations(),
    lineToChange,
    lineToFoldId,
    effective
  };
}
