# edamajutsu

A [Magit](https://magit.vc/)-style interface for [Jujutsu (jj)](https://github.com/jj-vcs/jj) in VSCode. Keyboard-first, cursor-driven, single-buffer feel; faithful to jj's model (changes, op log, no index).

## Inspirations

- **[Magit](https://magit.vc/)** — the Emacs porcelain whose interaction model this tries to inherit: a status buffer as the home base, foldable sections, single-letter verbs at point, drill-in via `RET`.
- **[Jujutsu (jj)](https://github.com/jj-vcs/jj)** — the VCS this is a porcelain *for*. The interaction language follows jj's primitives (changes, not commits; op log instead of reflog; no staging area).
- **[edamagit](https://github.com/kahole/edamagit)** — Magit for git inside VSCode. Architectural blueprint: virtual `TextDocument` + decorations + folding-range provider, no custom widgets.
- **[majutsu](https://github.com/Pakeira/majutsu)** — Magit for jj in Emacs. The reference for what verbs to bind and how jj's quirks map onto Magit's conventions.

The name is `edamagit + majutsu`. The project owes both.

## Goals

- A magit-style surface for jj — status, log, op log, commit detail — inside VSCode.
- Cursor-driven, keyboard-first. Same buffer-scoped verb model as Magit.
- Faithful to jj's data model. Changes are first-class; the op log is a real view; there is no index.
- Personal daily-driver first, with a clean enough architecture to publish later.

## Non-goals

- A from-scratch graph renderer. We use jj's own graph output verbatim.
- Multi-workspace / multi-repo UX. Single jj repo per workspace folder; surface a clear "no jj repo" state otherwise.
- Performance work beyond what jj itself provides (no Watchman, no custom indexes).
- Marketplace polish, i18n, telemetry.

## Architecture

### Layers

1. **Commands** (`src/commands/`) — what the user invokes. `AppContext` holds view references and exposes zero-arg method handlers; one place for prompting + `runMutation` plumbing.
2. **Views** (`src/views/`) — orchestrate one virtual document per view type (status, log, op log, commit detail). Each view's `refresh()` spawns jj, parses, and emits text + folding ranges + decoration ranges in a single builder pass.
3. **Model** (`src/model/`) — typed records at the boundary: `Change`, `Operation`, `FileChange`. Branded id types (`ChangeId`, `CommitId`, `OperationId`) — no raw strings flow between layers.
4. **jj driver** (`src/jj/`) — spawns `jj`, applies templates, parses NUL-separated records, returns typed values. Thin.

### Rendering: TextDocument + decorations

Each view is a virtual `TextDocument` populated with rendered text and overlaid with [DecorationOptions](https://code.visualstudio.com/api/references/vscode-api#DecorationOptions), exactly as edamagit does it. Folding is provided via VSCode's folding-range provider on section markers.

The payoff: cursor-keyboard navigation, `/` search, font/theme integration, and `RET` / quick-jump all come from VSCode for free. The cost: no rich interactive widgets — acceptable for a Magit-style UI.

### jj driver: templates + jj's own graph

Structured queries use jj's template language to emit NUL-separated fields with a record-separator between rows:

```
jj log -T 'change_id ++ "\0" ++ commit_id.shortest() ++ "\0" ++ description.first_line() ++ "\x1e"' \
  --no-pager --color=never
```

The parser splits on `\x1e`, then `\0`, then assigns to typed fields. No regex, no scraping. `LOG_FIELDS` in `src/jj/templates.ts` is the single source of truth — one array drives both the emitted template and the parsed record shape (via `RecordOf<typeof LOG_FIELDS>`).

For views that want a graph (log, op log), we keep jj's default graph output: the first columns of each line are jj's glyphs (`├ ┤ │ ╮ ╯ ○`), the rest is our parsed payload. We treat the glyph column as opaque text.

User-data fields (descriptions, author names) go through jj's `escape_json()` so arbitrary bytes are safe to parse. Email is an exception (jj's `Email` type doesn't support `escape_json`); we emit it raw and rely on real-world emails not containing control bytes.

### Two-tier refresh

jj snapshots the working copy on most commands. We don't want passive view updates flooding the op log with snapshot entries.

| Trigger | Behavior |
|---|---|
| Passive (view open, focus regain, repo state observed to change) | `--ignore-working-copy` — re-read, no snapshot. |
| Explicit `g` refresh | Normal jj invocation — real snapshot. |
| Mutation | Snapshot as part of the mutating command's normal flow; subsequent view refreshes are passive. |

Op log refreshes are *always* passive: snapshotting would inject a "snapshot working copy" entry into the very list the user is looking at.

### Repo discovery

On activation, walk up from the workspace folder looking for `.jj/`. If none is found, surface a clear "no jj repo" state instead of failing silently.

## Project layout

```
edamajutsu/
├── package.json                  # extension manifest: commands, keybindings, language
├── tsconfig.json
├── vitest.config.ts              # restricts vitest discovery to src/**/*.test.ts
├── webpack.config.js
├── languages/                    # language configuration for .edamajutsu files
├── install.sh                    # package + reinstall into local VSCode
├── docs/
│   └── keybindings/              # per-source keybinding references + analysis
└── src/
    ├── extension.ts              # activate(): wires views + AppContext + commands
    ├── commands/
    │   └── appContext.ts         # command handlers + runMutation plumbing
    ├── jj/
    │   ├── driver.ts             # spawn jj, run queries / mutations
    │   ├── parse.ts              # parse NUL-separated template output
    │   ├── repo.ts               # findJjRepo: walk up looking for .jj/
    │   └── templates.ts          # LOG_FIELDS etc — templates + decoded shape together
    ├── model/                    # Change / FileChange / Operation + branded ids
    ├── render/                   # LineBuilder, DecoratedDocBuilder, decoration manager
    ├── views/                    # status, log, opLog, commitDetail, contentProvider, folding
    ├── demo/                     # `npm run demo:log` etc — parser smoke tests against cwd
    └── test/                     # unit + driver-integration tests
```

## Conventions

- **Snapshot semantics live in the driver.** Reads default to `--ignore-working-copy`; mutating methods pass `snapshot: true`. Op log reads hard-code the passive path.
- **Templates are the contract.** Adding or changing a field on a view is one edit to `LOG_FIELDS` (or sibling). The decoded record type follows automatically.
- **Branded ids only.** `ChangeId`, `CommitId`, `OperationId` are nominal — raw strings never flow between layers.
- **Three parallel artifacts per render pass.** Text, folding ranges, decoration ranges (plus `lineToChange` where drill-in applies). One builder emits all of them so they can't drift.
- **Zero-arg command handlers on `AppContext`.** Views are captured once at wiring; handlers don't thread view references.
- **Inline snapshots for parser tests.** `npm run test:update` rewrites them; reruns are byte-stable.

## Keybindings

The keymap is defined in `package.json`'s `contributes.keybindings` — that's the single source of truth. The default is magit-style (holy); see [`docs/keybindings/edamajutsu-holy.md`](./docs/keybindings/edamajutsu-holy.md). A vim-friendly overlay snippet lives in [`docs/keybindings/edamajutsu-evil.md`](./docs/keybindings/edamajutsu-evil.md). The [`docs/keybindings/`](./docs/keybindings/) directory also has per-source references (magit, edamagit, majutsu, vscodevim, leaderkey) and an [`analysis.md`](./docs/keybindings/analysis.md) comparing them.

Bindings are buffer-scoped: vim works untouched outside edamajutsu buffers; inside them, the holy verbs win.

## Building and installing

```sh
npm install
./install.sh        # packages a .vsix and (re)installs into the local VSCode
```

`npm run build` / `npm test` / `npm run test:update` cover the inner dev loop.

## Worth knowing

- **`JJ_RANDOMNESS_SEED` is per-process, not per-invocation.** Two jj spawns with the same seed produce colliding change ids. Tests bump the env var before every spawn via a `JjDriver` proxy — if you see a "Change ID is divergent" failure, that's the cause.
- **Op log "snapshot working copy" entries** are inserted implicitly by jj on every command and can't be disabled. The driver integration test filters them so the fixture's snapshot captures only operations the test explicitly requested.
