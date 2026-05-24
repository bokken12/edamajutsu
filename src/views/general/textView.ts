import { Change } from '../../model/change';
import { DecoratedLine } from '../../render/decoratedText';
import { View } from './view';

// Leaf view that owns a single rendered line. The line is either a plain
// string (no decorations) or a fully built DecoratedLine. Use this for
// every row in a section: header lines, change rows, file rows, blank
// spacers, etc.
//
// Optional `ownedChange` makes the row navigable: cursor-on-row → change.
export class TextView extends View {
  constructor(
    private readonly line: DecoratedLine,
    private readonly ownedChange?: Change
  ) {
    super();
  }

  static plain(text: string, ownedChange?: Change): TextView {
    return new TextView({ text, spans: [] }, ownedChange);
  }

  override get change(): Change | undefined {
    return this.ownedChange;
  }

  override render(startLine: number): DecoratedLine[] {
    this.retrieveFold();
    this.startLine = startLine;
    this.endLine = startLine;
    return [this.line];
  }
}

// Convenience: a blank line. Always a single empty row, never navigable.
export class LineBreakView extends TextView {
  constructor() {
    super({ text: '', spans: [] });
  }
}
