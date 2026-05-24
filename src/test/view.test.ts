import { expect, test, vi } from 'vitest';

vi.mock('vscode', () => {
  class Position {
    constructor(public line: number, public character: number) {}
  }
  class Range {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number
    ) {}
    get start() { return new Position(this.startLine, this.startChar); }
    get end() { return new Position(this.endLine, this.endChar); }
    contains(p: Position): boolean {
      return (
        (p.line > this.startLine || (p.line === this.startLine && p.character >= this.startChar)) &&
        (p.line < this.endLine || (p.line === this.endLine && p.character <= this.endChar))
      );
    }
  }
  const FoldingRangeKind = { Region: 'Region' };
  class FoldingRange {
    constructor(public start: number, public end: number, public kind: string) {}
  }
  return { Position, Range, FoldingRange, FoldingRangeKind };
});

import { LineBuilder } from '../render/decoratedText';
import { renderRoot } from '../views/general/documentView';
import { SectionView } from '../views/general/sectionView';
import { LineBreakView, TextView } from '../views/general/textView';
import { View } from '../views/general/view';
import { Change, changeId, commitId } from '../model/change';


function mkChange(id: string): Change {
  return {
    changeId: changeId(id.padEnd(8, 'a')),
    commitId: commitId(id.padEnd(8, 'b')),
    description: `desc-${id}`,
    descriptionFirstLine: `desc-${id}`,
    authorName: 'Author',
    authorEmail: 'a@example.com',
    parents: [],
    bookmarks: [],
    isConflicted: false,
    isEmpty: false,
    isWorkingCopy: true
  };
}

test('TextView reports a one-line range and its owning change', () => {
  const change = mkChange('aa');
  const root = new View();
  root.addSubview(TextView.plain('hello', change));

  const rendered = renderRoot(root);
  expect(rendered.text).toBe('hello');
  expect(rendered.lineToChange).toEqual([change]);
  expect(rendered.foldingRanges).toHaveLength(0);
});

test('SectionView contributes a folding range spanning its rows', () => {
  const root = new View();
  const section = new SectionView('s1');
  section.addSubview(
    TextView.plain('header'),
    TextView.plain('  row1'),
    TextView.plain('  row2')
  );
  root.addSubview(section);

  const rendered = renderRoot(root);
  expect(rendered.text).toBe('header\n  row1\n  row2');
  expect(rendered.foldingRanges).toHaveLength(1);
  expect(rendered.foldingRanges[0]!.start).toBe(0);
  expect(rendered.foldingRanges[0]!.end).toBe(2);
});

test('SectionView change propagates to its rows but not to trailing siblings', () => {
  const change = mkChange('bb');
  const root = new View();
  const section = new SectionView('s2', change);
  section.addSubview(TextView.plain('header'), TextView.plain('  body'));
  root.addSubview(section, new LineBreakView(), TextView.plain('after'));

  const rendered = renderRoot(root);
  expect(rendered.lineToChange).toEqual([change, change, undefined, undefined]);
});

test('Inner row override wins over enclosing section', () => {
  const sectionChange = mkChange('cc');
  const rowChange = mkChange('dd');
  const root = new View();
  const section = new SectionView('s3', sectionChange);
  section.addSubview(
    TextView.plain('header', sectionChange),
    new TextView(new LineBuilder().plain('overridden').build(), rowChange)
  );
  root.addSubview(section);

  const rendered = renderRoot(root);
  expect(rendered.lineToChange[1]).toBe(rowChange);
});

test('Decoration spans land at the right absolute line numbers', () => {
  const root = new View();
  root.addSubview(
    TextView.plain('intro'),
    new TextView(new LineBuilder().dec('changeId', 'abcd1234').build()),
    new TextView(new LineBuilder().plain('  ').dec('bookmark', 'main').build())
  );

  const rendered = renderRoot(root);
  expect(rendered.decorations.get('changeId')).toHaveLength(1);
  expect(rendered.decorations.get('changeId')![0]).toMatchObject({
    startLine: 1,
    startChar: 0,
    endLine: 1,
    endChar: 8
  });
  expect(rendered.decorations.get('bookmark')![0]).toMatchObject({
    startLine: 2,
    startChar: 2,
    endLine: 2,
    endChar: 6
  });
});

test('Folded section keeps only its header and reports a single-line range', () => {
  const root = new View();
  const section = new SectionView('persistent-id');
  section.foldedByDefault = true;
  section.addSubview(
    TextView.plain('header'),
    TextView.plain('  hidden1'),
    TextView.plain('  hidden2')
  );
  root.addSubview(section);

  const rendered = renderRoot(root);
  expect(rendered.text).toBe('header');
  expect(section.startLine).toBe(0);
  expect(section.endLine).toBe(0);
  // Folded views collapse to one line; no folding range is emitted for
  // them (the range would be zero-length).
  expect(rendered.foldingRanges).toHaveLength(0);
});

test('Empty subview never claims rows from a sibling', () => {
  // An empty section before a populated section must not claim row 0.
  const change = mkChange('ee');
  const empty = new SectionView('empty', change);
  const real = new SectionView('real');
  real.addSubview(TextView.plain('hello'));
  const root = new View();
  root.addSubview(empty, real);

  const rendered = renderRoot(root);
  // The leaf row belongs to its own section, not the empty one — so
  // line-to-change is undefined (real has no change), not `change`.
  expect(rendered.lineToChange).toEqual([undefined]);
});

test('Folded section does not emit phantom child folding ranges', () => {
  const root = new View();
  const outer = new SectionView('outer-fold');
  outer.foldedByDefault = true;
  const inner = new SectionView('inner-fold');
  inner.addSubview(TextView.plain('inner-h'), TextView.plain('inner-1'), TextView.plain('inner-2'));
  outer.addSubview(TextView.plain('outer-h'), inner);
  root.addSubview(outer, TextView.plain('after'));

  const rendered = renderRoot(root);
  // Only the outer header is visible.
  expect(rendered.text).toBe('outer-h\nafter');
  // No folding ranges leak through — the outer collapses to one line, the
  // inner is hidden entirely.
  expect(rendered.foldingRanges).toHaveLength(0);
});

test('Non-foldable container with foldable children still collects child ranges', () => {
  const root = new View();
  const sectionA = new SectionView('a');
  sectionA.addSubview(TextView.plain('A1'), TextView.plain('A2'));
  const sectionB = new SectionView('b');
  sectionB.addSubview(TextView.plain('B1'), TextView.plain('B2'), TextView.plain('B3'));
  root.addSubview(sectionA, new LineBreakView(), sectionB);

  const rendered = renderRoot(root);
  expect(rendered.foldingRanges).toHaveLength(2);
  expect(rendered.foldingRanges[0]).toMatchObject({ start: 0, end: 1 });
  expect(rendered.foldingRanges[1]).toMatchObject({ start: 3, end: 5 });
});
