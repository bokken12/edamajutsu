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
// Marks the start of our payload on a graph-rendered log line. Lines without
// this byte are graph-only continuation rows (e.g. `│`, `~`).
export const RECORD_PREFIX = '\x1d';  // GS

// `kind` controls how parse.ts decodes a field. `DecodedOf<K>` below is the
// matching TS type, so the parsed record's shape is derived from this enum
// rather than spelled out separately.
export type FieldKind = 'raw' | 'json' | 'list-raw' | 'list-json' | 'bool';

export type FieldSpec = {
  readonly name: string;
  readonly expr: string;
  readonly kind: FieldKind;
};

export type DecodedOf<K extends FieldKind> = K extends 'raw' | 'json'
  ? string
  : K extends 'list-raw' | 'list-json'
    ? string[]
    : K extends 'bool'
      ? boolean
      : never;

// Maps an ordered array of FieldSpecs to the record shape they decode into.
// Combined with `as const satisfies ReadonlyArray<FieldSpec>` on the spec
// array, this turns the field-name-and-kind into a compile-time type. Rename
// a field and every consumer of the renamed name becomes a typecheck error;
// reorder fields and the parser (which dispatches by index using each spec's
// own `kind`) keeps working.
export type RecordOf<F extends ReadonlyArray<FieldSpec>> = {
  readonly [P in F[number] as P['name']]: DecodedOf<P['kind']>;
};

// Single source of truth for the change log template. The template string,
// the parser's field count, and the typed shape of a parsed record all
// derive from this array.
export const LOG_FIELDS = [
  { name: 'changeId',             expr: 'change_id',                                                       kind: 'raw' },
  { name: 'commitId',             expr: 'commit_id',                                                       kind: 'raw' },
  { name: 'description',          expr: 'description.escape_json()',                                       kind: 'json' },
  { name: 'descriptionFirstLine', expr: 'description.first_line().escape_json()',                          kind: 'json' },
  { name: 'authorName',           expr: 'author.name().escape_json()',                                     kind: 'json' },
  // author.email() returns jj's structured `Email` type which lacks
  // escape_json(). Real-world email syntax doesn't permit control bytes, so
  // emitting it raw is safe in practice — but this is the only user-data
  // field that depends on jj's own validation rather than escape_json(). If
  // jj ever loosens email validation, this will start producing garbled
  // records and parseRecord's field-count check will fail loudly.
  { name: 'authorEmail',          expr: 'author.email()',                                                  kind: 'raw' },
  { name: 'parents',              expr: 'parents.map(|p| p.change_id()).join("\\x1c")',                    kind: 'list-raw' },
  { name: 'bookmarks',            expr: 'bookmarks.map(|b| b.name().escape_json()).join("\\x1c")',         kind: 'list-json' },
  { name: 'isConflicted',         expr: 'if(conflict, "1", "0")',                                          kind: 'bool' },
  { name: 'isEmpty',              expr: 'if(empty, "1", "0")',                                             kind: 'bool' },
  { name: 'isWorkingCopy',        expr: 'if(current_working_copy, "1", "0")',                              kind: 'bool' }
] as const satisfies ReadonlyArray<FieldSpec>;

export type LogRecord = RecordOf<typeof LOG_FIELDS>;

export const LOG_TEMPLATE =
  LOG_FIELDS.map((f) => f.expr).join(' ++ "\\x1e" ++ ') + ' ++ "\\n"';

// Graph variant: same fields, prefixed with the record marker so we can
// distinguish data rows from jj's graph-only continuation rows.
export const LOG_GRAPH_TEMPLATE = '"\\x1d" ++ ' + LOG_TEMPLATE;

// Diff template for `jj diff -T`. Emits `<status>\x1e<path>\n` per changed
// file. `status` is one of "added" | "modified" | "removed" | "renamed" |
// "copied"; paths are repo-relative POSIX strings (no control bytes in
// practice).
export const DIFF_SUMMARY_TEMPLATE = 'status ++ "\\x1e" ++ path ++ "\\n"';

// Combined template for `jj log -T` — emits the file summary (same shape as
// DIFF_SUMMARY_TEMPLATE) followed by `\x1f` and then the unified git diff
// for the commit. One jj invocation produces everything the status view
// needs to render a file list with per-file diff bodies, replacing a
// separate `jj diff -T summary` + `jj diff --git` pair. `\x1f` (US) is
// otherwise unused in our protocol and won't appear in git diff output.
export const REVISION_DIFF_WITH_SUMMARY_TEMPLATE =
  'self.diff().files()' +
  '.map(|f| f.status() ++ "\\x1e" ++ f.path() ++ "\\n").join("")' +
  ' ++ "\\x1f" ++ self.diff().git()';

// Separates the summary section from the git diff section in
// REVISION_DIFF_WITH_SUMMARY_TEMPLATE output.
export const DIFF_SECTION_SEP = '\x1f'; // US

// Op-log fields, same shape as LOG_FIELDS. jj's op log operates on its own
// type (`Operation`) with its own keywords — id, description, user, time.
export const OP_LOG_FIELDS = [
  { name: 'id',                   expr: 'id',                                                              kind: 'raw' },
  { name: 'description',          expr: 'description.escape_json()',                                       kind: 'json' },
  { name: 'descriptionFirstLine', expr: 'description.first_line().escape_json()',                          kind: 'json' },
  { name: 'user',                 expr: 'user.escape_json()',                                              kind: 'json' },
  // `time.start()` renders as a human-readable timestamp like
  // "2026-05-23 13:29:43.395 -07:00" — no control bytes, safe raw.
  { name: 'time',                 expr: 'time.start()',                                                    kind: 'raw' }
] as const satisfies ReadonlyArray<FieldSpec>;

export type OpLogRecord = RecordOf<typeof OP_LOG_FIELDS>;

export const OP_LOG_TEMPLATE =
  OP_LOG_FIELDS.map((f) => f.expr).join(' ++ "\\x1e" ++ ') + ' ++ "\\n"';
