export type FileChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

export type FileChange = {
  readonly path: string;
  readonly kind: FileChangeKind;
};
