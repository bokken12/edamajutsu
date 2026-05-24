# edamajutsu — Current State and Next Steps

This doc is the **current-state snapshot** for someone picking the project up cold. `docs/DESIGN.md` is the original V1 design plan; it remains accurate about the architecture but doesn't reflect everything we've shipped since. Read this first for orientation, then `DESIGN.md` if you want the reasoning behind core decisions.

## One-paragraph overview

Edamajutsu is a VSCode extension that gives a magit-style interface for [Jujutsu (jj)](https://github.com/jj-vcs/jj). Inspired by [edamagit](https://github.com/kahole/edamagit) (git/magit in VSCode) and [majutsu](https://github.com/Pakeira/majutsu) (jj/magit in Emacs). The original V1 (read-only views: status / log / commit detail / op log) is done. V2 (mutations) is largely done — most magit-equivalent verbs are wired. The remaining work splits between **a few missing mutations that need richer UX** (interactive split, multi-line commit message editor), **polish** (transient menus, persistent fold state, decorations beyond the status view), and **refactors that unlock future features** (view composition).

## Codebase orientation

```
edamajutsu/
├── package.json                  # extension manifest: commands, keybindings, language
├── tsconfig.json
├── vitest.config.ts              # restricts vitest discovery to src/**/*.test.ts
├── webpack.config.js
├── languages/edamajutsu.language-configuration.json
├── .github/workflows/ci.yml      # CI: type-check, test, build on every PR
├── docs/
│   ├── DESIGN.md                 # original V1 design doc (historical, mostly accurate)
│   └── STATE.md                  # this file
└── src/
    ├── extension.ts              # activate(): wires views + AppContext + commands
    ├── commands/
    │   └── appContext.ts         # owns every command handler + plumbing (runMutation, pickBookmark, …)
    ├── jj/
    │   ├── driver.ts             # `JjDriver`: spawns `jj`, runs queries / mutations. Thin layer.
    │   ├── parse.ts              # parses jj's structured output (log / op-log / diff-summary / graph)
    │   ├── repo.ts               # `findJjRepo(dir)` walks up looking for `.jj/`
    │   └── templates.ts          # source of truth for log / op-log / diff templates. Single
    │                             #   `LOG_FIELDS` array drives both the template string and the
    │                             #   parsed shape via `RecordOf<typeof LOG_FIELDS>`.
    ├── model/
    │   ├── change.ts             # `Change` record + branded ChangeId / CommitId
    │   ├── fileChange.ts         # `FileChange` { kind, path }
    │   └── operation.ts          # `Operation` record + branded OperationId
    ├── render/
    │   ├── decoratedText.ts      # `LineBuilder` + `DecoratedDocBuilder` for tagging text spans
    │   ├── decorationManager.ts  # subscribes to editor events, applies decorations
    │   ├── decorations.ts        # `createDecorationTypes()` → ThemeColor-keyed decoration types
    │   ├── fileKind.ts           # A/M/D/R/C glyph helper
    │   └── formatChange.ts       # one-line summary (shared by view + demos)
    ├── views/
    │   ├── status.ts             # `StatusView`: working copy / parent / files / bookmarks
    │   ├── log.ts                # `LogView`: jj-rendered graph + parsed records
    │   ├── opLog.ts              # `OpLogView`: `jj op log` records (passive refresh only)
    │   ├── commitDetail.ts       # `CommitDetailView`: drill-in for a change (description + files + diff)
    │   ├── contentProvider.ts    # dispatches `edamajutsu:` URIs to the right view
    │   └── folding.ts            # `EdamajutsuFoldingProvider` (dispatches by URI)
    ├── demo/
    │   ├── log.ts                # `npm run demo:log` — prints parsed Change[] from cwd
    │   └── logGraph.ts           # `npm run demo:log:graph` — graph + records, useful for sanity
    └── test/
        ├── repo.test.ts          # unit: findJjRepo
        ├── parse.test.ts         # unit: parsers, inline snapshots
        └── driver.test.ts        # integration: spawns real `jj` against a deterministic fixture
```

### How a refresh round-trips

1. User presses `g` (refresh) → `edamajutsu.refresh` command → `AppContext.refreshActive()`.
2. `refreshActive` looks at `vscode.window.activeTextEditor.document.uri` to pick a view, then calls `withPreservedCursor(URI, () => view.refresh(true))`.
3. The view's `refresh()` spawns `jj` via the driver, parses, builds the rendered text + folding ranges + decoration ranges, and fires `onDidChange`.
4. VSCode re-fetches `provideTextDocumentContent`, applies the new text, fires `onDidChangeTextDocument`.
5. The decoration manager reapplies decorations; `withPreservedCursor` restores cursor position; the user sees the updated view.

### How a mutation round-trips

1. User presses (e.g.) `r` rebase → `edamajutsu.rebase` → `AppContext.rebase()`.
2. The method prompts (input box / QuickPick) for parameters, then calls `runMutation(label, driver => driver.rebase(...))`.
3. `runMutation` resolves the workspace's jj repo, constructs a `JjDriver`, awaits the action, catches errors → popup, then calls `refreshOpenViews()` which refreshes every visible edamajutsu view passively.

The mutation snapshots the working copy as part of `jj`'s normal command flow. Subsequent refreshes are passive (`--ignore-working-copy`).

## Conventions

- **Snapshot semantics**: every `driver.<read>` defaults to `--ignore-working-copy`; mutating methods pass `snapshot: true`. Op log refreshes are always passive (snapshotting would inject phantom "snapshot working copy" entries).
- **Templates emit structured output**: `LOG_FIELDS` (in `jj/templates.ts`) declares each field's name, jj-template expression, and decode kind. The parser iterates this array, so adding a field is one place. User-data fields go through jj's `escape_json()` so commit messages can contain any bytes safely.
- **All change/commit/op ids are branded types** (`ChangeId & {readonly __ChangeIdBrand: true}`) — no raw strings flowing between layers.
- **Views own three parallel artifacts per render**: text, folding ranges, decoration ranges (and `lineToChange` for views that support drill-in). Same builder pass emits all of them.
- **`AppContext` captures view references once**; command handlers are zero-arg methods. No view threading.
- **Per-jj-invocation seed bumping in tests** (`makeDriver` proxy + counter): `JJ_RANDOMNESS_SEED` re-seeds per process, so two jj invocations with the same seed produce colliding change ids. The proxy bumps `process.env.JJ_RANDOMNESS_SEED` before every spawn.
- **Vitest inline snapshots** for parser tests. `npm run test:update` rewrites snapshots; rerunning is byte-stable.

## Verbs shipped

| Key | Command | jj |
|---|---|---|
| `g` | refresh active view | (read) |
| `l` | open log | (open) |
| `o` | open op log | (open) |
| `q` | close view | `workbench.action.closeActiveEditor` |
| `?` | help (palette filtered) | (palette) |
| `enter` | drill into change at point | (open) |
| `u` | undo | `jj undo` |
| `shift+u` | redo | `jj redo` |
| `n` | new change | `jj new` |
| `c` | describe @ | `jj describe -m` |
| `k` | abandon | `jj abandon` |
| `e` | edit | `jj edit` |
| `y` | duplicate | `jj duplicate -r` |
| `shift+v` | revert (insert-after @) | `jj revert -r --insert-after @` |
| `s` | squash @ into @- | `jj squash --use-destination-message` |
| `r` | rebase + descendants | `jj rebase -s -d` |
| `a` | absorb | `jj absorb` |
| `b c` / `b s` / `b d` / `b r` / `b f` | bookmark create/set/delete/rename/forget | `jj bookmark *` |
| `shift+g p` / `shift+g f` | git push / fetch | `jj git push --allow-new` / `jj git fetch` |

Single-source-of-truth for the keymap is `package.json`'s `contributes.keybindings`.

## Remaining work

### Missing mutations (need richer UX)

1. **`s`/`S` interactive split** — `jj split` opens `$EDITOR` for hunk selection. The magit-equivalent is a per-hunk picker buffer where each hunk has `s` (include) / `u` (exclude). Prerequisite: view composition refactor (see below) so each hunk is a clickable subview. **Highest user-visible value of all remaining items.**
2. **`C` commit with multi-line editor** — currently `c` (describe) is single-line via `showInputBox`. The magit pattern: open a virtual untitled document, user types multi-line description, save+close to submit. Needs a "transient document with submit/cancel commands" infrastructure. Modest size.
3. **`r r` / `r s` / `r b` rebase variants** — current `r` is `jj rebase -s SOURCE -d DEST`. Variants (`-r` single commit, `-b` whole branch, `-A`/`-B` insert-after/before) come trivially once transient menus exist (next section).
4. **`G P` push specific bookmark** — current `G p` pushes all. Worth doing once you have multi-bookmark workflows.

### Polish backlog (from edamagit comparison, in priority order)

1. **P1 — Transient menus.** When user presses a prefix key (`b`, `G`, future `c`/`r`), show a `vscode.window.showQuickPick` listing the sub-actions with descriptions. Currently chords are silent — fine if you know them, opaque otherwise. Edamagit's `menu/menu.ts` is ~150 lines and supports descriptions, switches (`--foo`), and options (`--bar=baz`). Build the abstraction; apply to `b` and `G` first.
2. **P2 — Status-bar feedback during mutations.** `vscode.window.setStatusBarMessage('Running jj rebase...')` before spawn, cleared after. One-line addition in `runMutation`. Currently long jj operations look frozen.
3. **P3 — Persistent fold state across refresh.** Currently `g` re-expands everything you'd folded. Edamagit uses a static `Map<viewId, boolean>` keyed on stable section ids. We'd need to add `id` to each section in the renderer, then preserve fold state across refreshes.
4. **P4 — Decorations for log / op log / commit detail.** Status view has colors (change ids dim, file kinds A/M/D in their git colors, conflict markers, bookmarks). Log and commit detail still render flat. The `LineBuilder` / `DecoratedDocBuilder` infrastructure is already in place; just need to use it in each view's renderer.
5. **P5 — Process log buffer.** A read-only buffer that records every `jj` invocation and its output. Edamagit binds it to `$`. Useful for debugging when something fails. Low priority.
6. **P6 — Passive file watcher.** Per the original design doc's three-tier refresh rule, react to repo state changing under us (someone ran `jj` in a terminal) by re-rendering with `--ignore-working-copy`. Currently views go silently stale until `g`. Lightweight file watcher on `.jj/` would close this.

### Architectural refactor (prerequisite for split, also tidies the rendering layer)

**View composition** — currently each view renders by calling functions that return `string[]`, with parallel arrays for folding ranges, decoration ranges, and `lineToChange`. Edamagit's pattern (`src/views/general/view.ts`): each section is a `View` class with `subViews`, `range`, `folded`, `id`, and `render(startLineNumber): string[]` that tracks its own line range. The buffer is a tree of `View`s. Per-view click handling falls out naturally (each view knows what it owns). This is *prerequisite for interactive split* (each hunk = a subview with its own include/exclude state).

Big refactor. ~600–800 lines net diff. Don't do it without a clear reason; do it before split.

### Cleanups

- **`refreshActive` vs `refreshOpenViews`** — names could read clearer. `refreshActive` is the `g` command (focused view); `refreshOpenViews` is the post-mutation broadcast.
- **`onChangeAtCursor` / `onBookmarkPick` private helpers** in `AppContext` — fine as is, but if they grow they could become free functions taking just `(ctx, ...args)`.
- **Decoration manager** doesn't currently react to focus changes from VSCode (only `onDidChangeVisibleTextEditors` + `onDidChangeTextDocument`). If a user opens a new editor pane, decorations may not appear until next refresh. Worth testing.
- **`closeView` and `help`** are tiny `executeCommand` wrappers. Could live outside `AppContext` if you wanted, but moving them out would be premature.

## Things that might confuse a new agent

- **`a` was abandon, now absorb.** In an earlier PR `a` bound to abandon. The "majutsu parity" PR moved abandon to `k` (magit's "kill at point") and later we added `a` for absorb (magit's pattern). If you see old PR descriptions mention `a` abandon, that's why.
- **`s` was `shift+s` (squash).** Same PR moved squash from `shift+s` to `s`, since lowercase `s` is magit's squash convention and capital `S` is reserved for the future interactive split.
- **`JJ_RANDOMNESS_SEED` reseeds per process** — the most surprising jj behavior we've encountered. Test code bumps the seed before every spawn (via a proxy on `JjDriver`). If you see a test failing with "Change ID is divergent", the fixture probably ran two jj commands with the same seed and got colliding change ids; check that the `makeDriver` proxy or `jjSync` helper is being used.
- **`escape_json` doesn't exist on jj's `Email` type.** `LOG_FIELDS` emits `author.email()` raw rather than through escape_json. Real-world emails don't contain control bytes, so this is safe. There's a comment in `templates.ts` flagging the assumption.
- **`jj op log` always-passive refresh** — refreshing the op log with a snapshot would insert a "snapshot working copy" entry into the very list the user is looking at. `OpLogView.refresh()` hard-codes the passive read.
- **Op log `snapshot working copy` entries are filtered in the driver integration test** — they're inserted implicitly by jj on every command (no config to disable). The test filters them out so the snapshot captures only operations the fixture explicitly requested.
- **Cross-fork stacked PRs combine diffs until lower ones merge.** crouton-ai → bokken12 PRs all target `bokken12:main` since GitHub PR bases must be in the base repo and we don't push to bokken12. A stacked PR's diff includes its ancestors' content until they merge.

## Specific concrete next tasks

If you sit down to work, in rough priority:

1. **Apply decorations to log + commit detail views** (P4). Mechanical: replicate what `status.ts` does using `LineBuilder` in `log.ts`'s `renderLog()` and `commitDetail.ts`'s `renderDetail()`. Each view's `Rendered` type already supports `decorations: DecorationRanges`. Should be one PR.
2. **Status-bar feedback** (P2). One-line change in `runMutation`. Trivial.
3. **Transient menus** (P1). Real new infrastructure (~150 lines for a `Menu` abstraction over `showQuickPick`). Apply to `b` and `G` first. Once it exists, `r` variants and `c` (commit/amend) follow easily.
4. **Multi-line description editor** (`C` commit). Open an untitled `edamajutsu:commit-message.edamajutsu` document, user types, save+close submits. Couple this with `c` describe — `c` opens the input box for one-line, `C` opens the editor.
5. **Persistent fold state** (P3). Track `Map<sectionId, boolean>` keyed on stable ids (e.g. `"working-copy"`, `"parent"`, `"files"`). Section ids need to be added to the renderer output.
6. **View composition refactor** (P4 architectural). Substantial — only do if you're committing to interactive split next.
7. **Interactive split** (`s`/`S`). The showcase feature. Per-hunk picker; needs the view composition refactor as foundation.

A new agent landing should also read `docs/DESIGN.md` for the original rationale (templates + JSON escape, two-tier refresh, the TextDocument+decorations rendering choice) — those decisions are still load-bearing.
