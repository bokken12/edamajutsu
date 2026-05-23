declare const ChangeIdBrand: unique symbol;
declare const CommitIdBrand: unique symbol;

export type ChangeId = string & { readonly [ChangeIdBrand]: true };
export type CommitId = string & { readonly [CommitIdBrand]: true };

export function changeId(value: string): ChangeId {
  return value as ChangeId;
}

export function commitId(value: string): CommitId {
  return value as CommitId;
}

export type Change = {
  readonly changeId: ChangeId;
  readonly commitId: CommitId;
  readonly descriptionFirstLine: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly parents: ReadonlyArray<ChangeId>;
  readonly bookmarks: ReadonlyArray<string>;
  readonly isConflicted: boolean;
  readonly isEmpty: boolean;
  readonly isWorkingCopy: boolean;
};
