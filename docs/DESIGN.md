# Edamajutsu — Design Doc

A Magit-style interface for [Jujutsu (jj)](https://github.com/jj-vcs/jj) in VSCode. Inspired by [edamagit](../edamagit) (git/magit in VSCode) and [majutsu](../majutsu) (jj/magit in Emacs).

## Goals & Non-Goals

### Goals (V1)

- A read-only, magit-style status surface for a jj repo inside VSCode.
- Single-buffer feel: cursor-driven navigation, foldable sections, keyboard-first.
- Faithful to jj's model: changes (not commits), op log, no index.
- Personal tool first; clean architecture so it can be published later.

### Non-Goals (V1)

- Any mutating jj commands (`commit`, `split`, `squash`, `rebase`, `abandon`, `new`, `edit`, …). These come in V2 once V1 has been used enough to settle the interaction model.
- Multi-workspace / multi-repo UX. Single jj repo per workspace folder; surface a clear "no jj repo" state otherwise.
- Marketplace publishing, i18n, telemetry, contribution docs.
- A from-scratch graph renderer.
- Watchman / large-repo perf work beyond what jj itself provides.

## Audience & Workflow

Built for me (Joel), as a daily driver for jj inside VSCode. Magit muscle memory for navigation; jj-native verbs for jj-specific actions.

## Architecture

### Language & Shape

- TypeScript VSCode extension. Same shape as edamagit (`package.json`, `src/extension.ts`, command/keybinding registration, webpack bundle).
- No runtime framework. Stdlib + `vscode` API + `child_process` to spawn `jj`.
- Logical layers, top-down:
  1. **Commands** — what the user invokes (open status, refresh, drill into commit, …).
  2. **Views** — orchestrate rendering of a virtual document for each view type.
  3. **Repo model** — typed records (`Change`, `Operation`, `FileChange`, …) representing parsed jj output. The boundary between "stringy jj output" and the rest of the extension.
  4. **jj driver** — spawns `jj` with templates / flags, parses NUL-separated records, returns typed records.

### Rendering

[VSCode TextDocument](https://code.visualstudio.com/api/references/vscode-api#TextDocument) with [DecorationOptions](https://code.visualstudio.com/api/references/vscode-api#DecorationOptions), exactly as edamagit does it. Each view is a virtual document populated with a rendered string; decorations color graph glyphs, change IDs, diff hunks, etc. Folding via VSCode's folding-range provider applied to section markers.

This is the call that most determines whether the UX feels like magit. We get:
- Cursor-keyboard model (j/k, gg/G, page, search via `/`) for free.
- Native VSCode font/theme integration.
- `RET` / "Go to definition" / quick-jump come naturally.

We give up: rich interactive widgets. Acceptable for V1.

### jj Driver: Templates + jj's Graph

We spawn `jj` as a subprocess and parse its output. Two flavors:

**Structured queries** use jj's template language to emit NUL-separated fields, record-separated records:

```
jj log -T 'change_id ++ "\0" ++ commit_id.shortest() ++ "\0" ++ description.first_line() ++ "\0" ++ author.name() ++ "\x1e"' --no-pager --color=never
```

Parser: split on `\x1e` → split each on `\0` → assign to typed fields. No regex, no scraping. One template per view (4 templates for V1).

**Graph rendering**: we keep jj's graph drawing. For the log view we run jj *with* its default graph rendering, but with our template appended after the graph. The first "column" of each line is graph glyphs (`├ ┤ │ ╮ ╯ ○`), the rest is our parsed data. We treat the glyph column as opaque text to be rendered verbatim.

**Why custom templates beat scraping**:
- Stable across jj versions and unaffected by user config.
- Parser is mechanical (split, split, assign) — no regex on rendered output.
- Failure mode is loud (template fails to compile) rather than silent (regex matches wrong column).

**Cost**: ~4 templates to write and maintain. Fine.

### Refresh Model

jj snapshots the working copy on most commands. We don't want to silently flood the op log with snapshot ops every time the extension polls.

Two-tier rule:

| Trigger | Behavior |
|---|---|
| Passive (view open, focus regain, repo-state change observed) | Run jj with `--ignore-working-copy` — no snapshot, just re-read repo state. |
| Explicit `g` (refresh) | Run jj normally — real snapshot. |

We do **not** snapshot on file save / file-watcher events: that would create *more* snapshots than CLI usage (one per save vs one per intentional jj command). The status buffer may lag the on-disk state until the user hits `g`. This matches the cadence of `jj status` in normal CLI workflow.

A light file watcher may still drive *passive* re-renders so the view reacts when the repo state changes underneath us (e.g., another tool ran `jj` in the terminal), but it never forces a snapshot.

### Repo Discovery

On extension activation, locate the jj repo for the workspace folder by walking up looking for `.jj/`. If not found, surface a clear "no jj repo here" state in the status buffer rather than failing silently. (V1: single workspace folder; multi-root deferred.)

## V1 Views

All four views are TextDocuments. They share section/folding/decoration infrastructure.

### 1. Status (the home view)

The entry point. Mirrors `magit-status` / edamagit's status doc. Sections:

- **Working copy** — `@` change id, description, conflict marker.
- **Working copy changes** — files changed since `@-`, file kind (A/M/D/R/C), expandable per-file diff.
- **Parent commit** — `@-` summary.
- **Bookmarks** — local & remote bookmarks pointing at or near `@`.
- **Conflicts** — list of conflicted changes in the visible revset, if any.
- **Recent operations** — last few entries from `jj op log`, collapsed by default.

Sections fold/unfold via `TAB`.

### 2. Log

`jj log` rendered with jj's default graph + our template. Uses the user's configured default revset (`revsets.log`) — no in-extension override in V1. Columns: graph glyphs, change-id (short), description (first line), author, bookmarks/tags. `RET` on a line opens the Commit Detail view for that change.

### 3. Op Log

`jj op log` rendered similarly: op id, timestamp, op description, tags. Allows the user to see and reason about what jj has done (snapshots, rebases, undos). Read-only in V1 — no `jj op restore` / `jj undo` yet (that's a mutation, V2).

### 4. Commit Detail

Drill-in for a single change. Shows: change id, commit id, full description, author, parents/children, bookmarks, conflict markers, file list, per-file diffs (collapsed by default). Reached via `RET` from the log view or the working-copy section of status.

## Keybindings

Magit-style for navigation/control. jj-native letters for verbs (so V2 mutations slot in naturally).

**Universal (all views)**:

| Key | Action |
|---|---|
| `g` | Refresh (snapshots) |
| `q` | Close current view |
| `?` | Show help / keymap for current view |
| `TAB` | Fold / unfold section under cursor |
| `RET` | Visit / drill in |
| `j` / `k`, arrows | Move (VSCode default) |

**View shortcuts (from status)**:

| Key | Opens |
|---|---|
| `l` | Log view |
| `o` | Op log view |

V2 verb space (reserved, unimplemented in V1): `c` commit/describe, `n` new, `s` split, `S` squash, `r` rebase, `a` abandon, `e` edit, `b` bookmark, `u` undo. Mentioned here so V1 doesn't accidentally claim them.

## Data Model

Typed records at the boundary between jj-driver and views. Sketch:

```ts
type ChangeId = string & { __brand: 'ChangeId' };
type CommitId = string & { __brand: 'CommitId' };
type OperationId = string & { __brand: 'OperationId' };

interface Change {
  changeId: ChangeId;
  commitId: CommitId;
  descriptionFirstLine: string;
  description: string;
  authorName: string;
  authorEmail: string;
  parents: ChangeId[];
  bookmarks: string[];
  isConflicted: boolean;
  isEmpty: boolean;
  isWorkingCopy: boolean;
}

interface FileChange {
  path: string;
  kind: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  fromPath?: string; // for renames/copies
}

interface Operation {
  opId: OperationId;
  timestamp: string;
  user: string;
  description: string;
  tags: string[];
}
```

These are the public surface of the jj-driver. Views consume them; never the raw string.

## Project Layout

```
edamajutsu/
├── package.json          # extension manifest, commands, keybindings
├── tsconfig.json
├── webpack.config.js
├── src/
│   ├── extension.ts      # activate / deactivate
│   ├── commands/         # one file per user-invokable command
│   ├── views/
│   │   ├── status.ts
│   │   ├── log.ts
│   │   ├── opLog.ts
│   │   └── commitDetail.ts
│   ├── render/           # section/folding/decoration helpers shared by views
│   ├── jj/
│   │   ├── driver.ts     # spawn jj, run a template, return raw records
│   │   ├── templates.ts  # template strings, separators, field schemas
│   │   ├── parse.ts      # NUL-split → typed records
│   │   └── repo.ts       # repo discovery (find .jj/)
│   └── model/            # typed records (Change, Operation, FileChange, …)
└── DESIGN.md (this file)
```

## Plan of Action

Phase 0 isn't optional; later phases are sized so each one ends with something usable.

### Phase 0 — Skeleton (afternoon)

- Scaffold the extension (`package.json`, `tsconfig`, `webpack`, `src/extension.ts`).
- One command registered: `edamajutsu.openStatus`. Opens an empty TextDocument titled "edamajutsu: status".
- Repo discovery: walk up from workspace folder looking for `.jj/`; show "no jj repo" placeholder if absent.

**Done when**: F1 → "Edamajutsu: Open Status" opens a buffer that says either "no jj repo" or the repo root.

### Phase 1 — Driver & Models

- `jj/driver.ts`: spawn jj, capture stdout/stderr, surface errors.
- `jj/templates.ts` + `jj/parse.ts`: define the four V1 templates and NUL-split parser.
- `model/`: typed records.
- Unit-testable: feed a recorded jj-output fixture through the parser, assert records.

**Done when**: a one-off script can call `driver.log()` and print typed `Change[]`.

### Phase 2 — Status View

- Render the working-copy + working-copy-changes + parent + bookmarks sections.
- Section folding via folding-range provider.
- Decorations for change-ids, file kinds, conflict markers.
- `g` triggers a real refresh (snapshot); passive refresh uses `--ignore-working-copy`.

**Done when**: opening status in a real jj repo shows live, accurate working-copy state and `g` refreshes it.

### Phase 3 — Log View

- `l` from status opens the log view.
- Render jj's default-revset log with graph glyphs + parsed fields.
- `RET` on a line is wired but is a no-op (Commit Detail isn't built yet).

**Done when**: `l` shows a usable, scrollable, graph-rendered log of the configured revset.

### Phase 4 — Commit Detail

- `RET` from log or from status's working-copy section opens Commit Detail for the selected change.
- Renders description, parents, files, per-file diffs (collapsed by default).

**Done when**: drilling from log into a change shows its full diff.

### Phase 5 — Op Log

- `o` from status opens the op log view.
- Renders `jj op log` records.

**Done when**: `o` shows the op log; useful for reasoning about what jj just did.

### Phase 6 — Polish & Dogfood

- Use it daily. Note rough edges, fix the worst.
- Decorations / colors tuned to feel right against common VSCode themes.
- Help overlay (`?`) per view.

After Phase 6: revisit V2 (mutations) with concrete intuition about what feels right, what's missing, what should be cut.

## Open Questions (to revisit, not block on)

- Does the log view need its own revset prompt before V2, or is the configured default enough in practice?
- Is the op log readable enough as a flat list, or does it want a tree/graph rendering (`jj op log --graph`)?
- Multi-workspace folders: how does the status view present "which repo is this?" — header line? per-folder views?
- Conflict viewer: a dedicated drill-in view, or just expandable sections in status / commit detail?
- Performance on very large logs: do we need pagination, or does jj's default revset keep things small enough in practice?
