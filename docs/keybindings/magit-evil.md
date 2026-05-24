# Magit (evil) — `evil-collection-magit`

> **Source:** [emacs-evil/evil-collection — `modes/magit/evil-collection-magit.el`](https://github.com/emacs-evil/evil-collection/blob/master/modes/magit/evil-collection-magit.el) (formerly the standalone `evil-magit` package, since merged into evil-collection). Line numbers below are against the upstream master branch as of audit.
> **Surface:** magit buffers under `evil-mode`. Default initial state is `motion` (or `normal` if `evil-collection-magit-use-y-for-yank` is enabled, which it is by default).
> **Vim-friendly:** yes — designed to give magit users vim-style motion *and* aggressively relocate magit verbs off vim normal-mode operators. The relocations are **much more extensive** than `majutsu-evil.el`'s lighter touch.
> **Notes:** Canonical vim adaptation of magit; the closest external precedent for what edamajutsu wants. Important: behaviour is heavily configurable via feature flags (see § Feature flags below) — multiple bindings change based on user options. The bindings listed here assume the **default option values**, which is what most users will see.

## Universal

| Key | Action |
|---|---|
| `g r` | Refresh (relocated from `g`) |
| `g R` | Refresh all (relocated from `G`) |
| `?` | Dispatch (popup of popups) |
| `q` | Bury buffer / close view |
| `RET` | Visit thing (in file/hunk sections; default visits worktree file — see `evil-collection-magit-visit-worktree-file-on-return`) |
| `TAB` | Toggle fold (inherits from magit) |
| `C-z` | Switch to emacs state (escape hatch) |

## Movement

| Key | Action |
|---|---|
| `j` / `k` | Next / prev line (vim default) |
| `C-j` / `C-k`, also `M-j` / `M-k` | Next / prev section (relocated from `n` / `p`) |
| `g j` / `g k`, also `]` / `[` | Next / prev sibling section (relocated from `M-n` / `M-p`) |
| `g h` | Section up (relocated from `^`) |
| `gg` / `G` | Goto first / last line (vim default, re-asserted in magit map) |
| `C-d` / `C-u` | Half-page down / up |
| `C-f` / `C-b` | Full page down / up |

## Status-mode jumpers (under `g _` prefix)

| Key | Action |
|---|---|
| `g s` | Jump to staged |
| `g u` | Jump to unstaged |
| `g t` | Jump to tracked |
| `g n` | Jump to untracked |
| `g z` | Jump to stashes |
| `g f u` | Jump to unpulled from upstream |
| `g f p` | Jump to unpulled from pushremote |
| `g p u` | Jump to unpushed to upstream |
| `g p p` | Jump to unpushed to pushremote |
| `g d` | Jump to diffstat or diff (in diff mode) |

## Views (popups, mostly inherited from magit-holy)

| Key | Action |
|---|---|
| `l` | Log popup |
| `d` | Diff popup |
| `t` | Tag popup |
| `b` | Branch popup |
| `m` | Merge popup |
| `r` | Rebase popup |
| `M` | Remote popup |
| `c` | Commit popup |
| `z` | Stash popup (unless `use-z-for-folds` is enabled → moves to `Z`) |
| `B` | Bisect popup |
| `%` | Worktree popup (moves to `Z` under `use-z-for-folds`) |
| `$` | Process log (moves to `` ` `` if `use-$-for-end-of-line` is enabled — **default true**, so process log is normally on `` ` ``) |
| `!` | Run popup |
| `'` | Submodule popup (relocated from `o`) |
| `"` | Subtree popup (relocated from `O`) |

## Verbs (git)

| Key | Action |
|---|---|
| `s` | Stage at point (kept on `s` — collides with vim "substitute" but evil-state wins inside magit buffers) |
| `S` | Stage all |
| `u` | Unstage at point |
| `U` | Unstage all |
| `a` | Apply at point |
| `x` | Delete / discard (relocated from `k` — vim's "prev line") |
| `X` | File untrack (relocated from `K`) |
| `-` | Revert no-commit (relocated from `v` — vim's "visual char") |
| `_` | Revert popup (relocated from `V` — vim's "visual line") |
| `o` | Reset quickly (relocated from `x`) |
| `O` | Reset popup (relocated from `X`) |
| `p` | Push (relocated from `P`) |
| `P` | Pull popup (Magit's `F` is also pull; `P` here is the magit-push popup repurposed) |
| `f` | Fetch popup |
| `F` | Pull popup |
| `c` | Commit popup |
| `A` | Cherry-pick popup |
| `\|` | Git command (relocated from `:` — vim cmdline) |
| `=` | Diff less context (relocated from `-`); in log mode, toggle commit limit |

## Diff mode

| Key | Action |
|---|---|
| `g d` | Jump to diffstat or diff (relocated from `j`) |
| `=` | Less context |
| `~` | Default context (relocated from `0` when `use-0-for-beginning-of-line` is enabled — **default true**) |
| `S-SPC` / `S-DEL` | Scroll show buffer up / down |

## Visual / yank (under `evil-collection-magit-use-y-for-yank`, default true)

| Key | Action |
|---|---|
| `y` (prefix) | Yank-prefix activates |
| `y y` | Yank whole line |
| `y r` | Show refs (relocated from `y`) |
| `y s` | Copy section value |
| `y b` | Copy buffer revision |
| `v` | Visual char (vim default; in this mode magit's normal `v` for reverse is moved to `-`) |
| `V` | Visual line |
| `y` (visual state) | Copy section value |

When `use-y-for-yank` is *disabled* (`nil`): `v` and `V` become `set-mark-command`; `y` remains on `magit-show-refs`; no yank-prefix.

## Rebase mode (`git-rebase-mode-map`)

| Key | Action |
|---|---|
| `p` | Pick |
| `r` | Reword |
| `e` | Edit |
| `s` | Squash |
| `f` | Fixup |
| `x` | Exec |
| `d` | Drop (kill line) |
| `u` | Undo |
| `j` / `k` | Next / prev line |
| `M-j` / `M-k` | Move line down / up |
| `Z Z` | Finish (with-editor-finish) |
| `Z Q` | Cancel (with-editor-cancel) |

## Section-map adjustments

- `C-j` is unbound from file/hunk section maps so the global `C-j` "next section" wins.
- `I` (file section): stage untracked file with intent.
- `RET` in file/hunk sections visits worktree file (vs. revision blob) by default; flip with `evil-collection-magit-visit-worktree-file-on-return = nil`.

## Popup (transient) layout changes

evil-collection-magit also rewrites the `magit-dispatch` and other popup transients so the letters shown in the menu match the new locations. Key dispatch-popup remaps:

| Old (in transient) | New | Command |
|---|---|---|
| `Z` | `z` | Stash (under `use-z-for-folds`) |
| `%` | `Z` | Worktree (under `use-z-for-folds`) |
| `'` | `o` | Submodule (in transient menu — note this is the *transient* layout, not the keymap; the buffer-map version goes the other way: `o`→`'`) |
| `"` | `O` | Subtree (transient) |
| `_` | `V` | Revert (transient) |
| `O` | `X` | Reset (transient) |
| `-` | `v` | Reverse (transient) |
| `x` | `k` | Discard (transient) |

(These keep the transient menus consistent with traditional magit letters even when buffer bindings have moved.)

## Feature flags

| Option | Default | Effect |
|---|---|---|
| `evil-collection-magit-use-y-for-yank` | `t` | Enables `y _` yank prefix; relocates `magit-show-refs` to `y r`; rebinds `v`/`V` to visual-mode entry. |
| `evil-collection-magit-want-horizontal-movement` | `nil` | Binds `h`/`l` for char motion; relocates `magit-dispatch` to `H`, `magit-log` to `L`, refresh to `C-l`. |
| `evil-collection-magit-use-z-for-folds` | `nil` | Reserves `z _` for fold commands; moves stash popup to `Z`, worktree popup to `z`. |
| `evil-collection-magit-use-v-for-visual-line` | `nil` | When true, `v` → `evil-visual-line` (line-wise) instead of `evil-visual-char`. |
| `evil-collection-magit-use-$-for-end-of-line` | `t` | Binds `$` to `evil-end-of-line`; relocates process-buffer to `` ` ``. |
| `evil-collection-magit-use-0-for-beginning-of-line` | `t` | Binds `0` to `evil-beginning-of-line`; relocates default diff context from `0` to `~`. |
| `evil-collection-magit-visit-worktree-file-on-return` | `t` | `RET` visits worktree file; `S-<return>` visits revision blob. Flip to swap. |

## Notes

- **Aggressive relocation, not light touch.** Where `majutsu-evil.el` only moves `k`→`x` and `V`→`_`, evil-collection-magit relocates roughly a dozen letters (every uppercase verb that collides with a vim motion plus several lowercase ones). This is closer to what edamajutsu will need to do, since VSCode + vscodevim doesn't give us the clean state-precedence model that lets majutsu-evil leave `s`/`c`/`r` in place.
- **`g _` prefix used heavily.** Refresh (`g r`), refresh-all (`g R`), section up (`g h`), siblings (`g j`/`g k`), diff jump (`g d`), and all the status-mode jumpers (`g s`/`g u`/`g t`/`g n`/`g z`/`g f _`/`g p _`). This is the strongest endorsement of the `g _` chord-prefix pattern for vim-friendly magit-style keymaps.
- **Configurable behaviour matters.** Several bindings change based on feature flags. The defaults above are what most users see, but anyone copy-pasting from the source for their own config will land in different places.
- **Section-context rebindings:** `RET` and `I` in file/hunk sections have their own bindings on top of the global map. Edamajutsu will likely need analogous per-section bindings once we have folded sections.
- **Popup transient layout** is rewritten separately from the keymap so the in-menu letters track the relocated bindings — this is something edamajutsu doesn't need (we use VSCode quickpick, not Magit transients).
