declare const OperationIdBrand: unique symbol;

export type OperationId = string & { readonly [OperationIdBrand]: true };

export function operationId(value: string): OperationId {
  return value as OperationId;
}

export type Operation = {
  readonly id: OperationId;
  readonly description: string;
  readonly descriptionFirstLine: string;
  readonly user: string;
  // Operation start time as jj's default human-readable string
  // (e.g. "2026-05-23 13:29:43.395 -07:00"). Free-form for now.
  readonly time: string;
};
