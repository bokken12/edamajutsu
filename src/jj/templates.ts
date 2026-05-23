// Separators used to transport structured data through jj's template language.
//
// jj templates emit plain text — including any control bytes that happen to
// appear inside commit messages, author names, or bookmark names. To make
// parsing robust against adversarial input we run every user-data string
// through jj's `escape_json` template method and JSON-decode it on the way
// back in. Fields known to contain only safe characters (hex ids, boolean
// flags, lists of hex ids) are emitted raw.
export const FIELD_SEP = '\x1e';      // RS — between fields in a record
export const LIST_ITEM_SEP = '\x1c';  // FS — between items in a list field

// Log template fields, in order. `expr` is the jj-template expression that
// produces the field's value; `kind` tells parse.ts how to decode it.
//
// Keep this array as the single source of truth for the log template — the
// template string, the field count, and the parser all derive from it.
export type LogFieldKind = 'raw' | 'json' | 'list-raw' | 'list-json' | 'bool';

export type LogFieldSpec = {
  readonly name: string;
  readonly expr: string;
  readonly kind: LogFieldKind;
};

export const LOG_FIELDS: ReadonlyArray<LogFieldSpec> = [
  { name: 'changeId',             expr: 'change_id',                                                       kind: 'raw' },
  { name: 'commitId',             expr: 'commit_id',                                                       kind: 'raw' },
  { name: 'descriptionFirstLine', expr: 'description.first_line().escape_json()',                          kind: 'json' },
  { name: 'authorName',           expr: 'author.name().escape_json()',                                     kind: 'json' },
  // author.email() returns jj's structured `Email` type which lacks
  // escape_json(). Real-world email syntax doesn't permit control bytes, so
  // emitting it raw is safe in practice.
  { name: 'authorEmail',          expr: 'author.email()',                                                  kind: 'raw' },
  { name: 'parents',              expr: 'parents.map(|p| p.change_id()).join("\\x1c")',                    kind: 'list-raw' },
  { name: 'bookmarks',            expr: 'bookmarks.map(|b| b.name().escape_json()).join("\\x1c")',         kind: 'list-json' },
  { name: 'isConflicted',         expr: 'if(conflict, "1", "0")',                                          kind: 'bool' },
  { name: 'isEmpty',              expr: 'if(empty, "1", "0")',                                             kind: 'bool' },
  { name: 'isWorkingCopy',        expr: 'if(current_working_copy, "1", "0")',                              kind: 'bool' }
];

export const LOG_TEMPLATE =
  LOG_FIELDS.map((f) => f.expr).join(' ++ "\\x1e" ++ ') + ' ++ "\\n"';

// Diff template for `jj diff -T`. Emits `<status>\x1e<path>\n` per changed
// file. `status` is one of "added" | "modified" | "removed" | "renamed" |
// "copied"; paths are repo-relative POSIX strings (no control bytes in
// practice).
export const DIFF_SUMMARY_TEMPLATE = 'status ++ "\\x1e" ++ path ++ "\\n"';

