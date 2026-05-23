import { FileChangeKind } from '../model/fileChange';

export function fileKindGlyph(kind: FileChangeKind): string {
  switch (kind) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
  }
}
