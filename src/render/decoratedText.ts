import * as vscode from 'vscode';

import { DecorationKey } from './decorations';

// A range scoped to a single line — `start`/`end` are character offsets
// within the line. Conversion to vscode.Range needs the line index.
export type LineSpan = {
  readonly key: DecorationKey;
  readonly start: number;
  readonly end: number;
};

// A line of rendered text plus the decoration spans inside it.
export type DecoratedLine = {
  readonly text: string;
  readonly spans: ReadonlyArray<LineSpan>;
};

// Fluent builder for a single line. Tags spans by `key` as you append.
export class LineBuilder {
  private out = '';
  private readonly spans: LineSpan[] = [];

  plain(text: string): this {
    this.out += text;
    return this;
  }

  dec(key: DecorationKey, text: string): this {
    const start = this.out.length;
    this.out += text;
    this.spans.push({ key, start, end: this.out.length });
    return this;
  }

  build(): DecoratedLine {
    return { text: this.out, spans: this.spans };
  }
}

// Map of decoration key → vscode.Range[] across the whole document, ready to
// hand to `editor.setDecorations`.
export type DecorationRanges = ReadonlyMap<DecorationKey, ReadonlyArray<vscode.Range>>;

// Accumulator that takes a sequence of plain or decorated lines and ends up
// holding both the final document text and the per-key range map.
export class DecoratedDocBuilder {
  private readonly lines: string[] = [];
  private readonly byKey = new Map<DecorationKey, vscode.Range[]>();

  pushPlain(text: string): void {
    this.lines.push(text);
  }

  push(line: DecoratedLine): void {
    const lineIdx = this.lines.length;
    this.lines.push(line.text);
    for (const span of line.spans) {
      const range = new vscode.Range(lineIdx, span.start, lineIdx, span.end);
      const existing = this.byKey.get(span.key);
      if (existing) {
        existing.push(range);
      } else {
        this.byKey.set(span.key, [range]);
      }
    }
  }

  currentLine(): number {
    return this.lines.length;
  }

  text(): string {
    return this.lines.join('\n');
  }

  decorations(): DecorationRanges {
    return this.byKey;
  }
}
