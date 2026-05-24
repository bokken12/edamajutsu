# majutsu (holy)

> **Source:** in-repo `majutsu/*.el` (default keymaps; this file omits the evil overlay, which lives in `majutsu-evil.md`)
> **Surface:** `majutsu-mode` (universal base) and derived modes inside Emacs — `majutsu-log-mode`, `majutsu-diff-mode`, `majutsu-bookmark-list-mode`, `majutsu-tag-list-mode`, `majutsu-op-log-mode`, etc.
> **Vim-friendly:** no — mirrors magit-holy conventions; assumes Emacs movement (`C-n` / `C-p` / `C-f` / `C-b`), not `h` / `j` / `k` / `l`
> **Notes:** jj-flavoured magit. Closest source for the *verb set* edamajutsu wants to mirror (since both wrap jj). `majutsu-mode-map` is the universal base; other view modes inherit from it.

## Universal (`majutsu-mode-map`)

| Key | Action |
|---|---|
| `g` | Refresh |
| `?` | Dispatch (help popup) |
| `q` | Bury buffer (close view) |
| `RET` | Visit thing |
| (magit-section remap) | Fold / unfold section (via `<remap> <magit-section-toggle>` etc.) |
| `$` | Process buffer |

## Movement

| Key | Action |
|---|---|
| (Emacs default `C-n` / `C-p`) | Next / prev line |
| (magit-section default) | Next / prev section |
| (magit-section default) | Next / prev sibling section |
| (Emacs default `M-<` / `M->`) | Goto top / bottom |

## Views

| Key | Action |
|---|---|
| (entry via `M-x majutsu-status`) | Status |
| `l` | Log transient |
| `d` | Diff transient |
| `Z` (also `%`) | Workspace transient |
| `>` | Sparse transient |
| `G` | Git transient |
| `b` | Bookmark transient |

## Verbs

| Key | Action |
|---|---|
| `c` | Describe |
| `C` | Commit |
| `o` | New change |
| `e` | Edit changeset |
| `k` | Abandon |
| `r` | Rebase |
| `s` | Squash |
| `S` | Split |
| `a` | Absorb |
| `y` | Duplicate |
| `V` | Revert |
| `R` | Restore |
| `C-/` | Undo |
| `C-?` | Redo |

## Log mode (`majutsu-log-mode-map`)

| Key | Action |
|---|---|
| `n` / `p` | Next / prev changeset |
| `[` / `]` | Goto parent / child |
| `O` | New (dwim) |
| `B` | New with before |
| `A` | New with after |
| `D` | Diff (dwim) |
| `Y` | Duplicate (dwim) |

## Diff mode (`majutsu-diff-mode-map`)

| Key | Action |
|---|---|
| `t` | Toggle refine hunk |
| `+` / `-` | More / less context |
| `0` | Default context |
| `j` | Jump to diffstat or diff |

## Notes

- `majutsu-mode-map`'s parent is `magit-section-mode-map`, so all section-level keys (toggle/show/hide/cycle, level-1..4 show) are inherited via `<remap>`s.
- `majutsu-bookmark-list-mode-map`, `majutsu-tag-list-mode-map`, `majutsu-op-log-mode-map`, and `majutsu-workspace-mode-map` add no bindings beyond the parent — they exist as derived modes so font-lock / line-number behavior can differ.
- `majutsu-process-mode-map` deliberately disables `g` (refresh) and adds `k` for `majutsu-process-kill`.
- `majutsu-conflict-mode-map` uses a `C-c ^` prefix for all conflict navigation (next/prev/keep-base/refine) and dynamically binds numeric keys for keep-side actions.
- The dispatch transient (`?`) exposes additional commands not on the base map: `t` (Tags), `m` (metaedit), `E` (ediff), `P` (simplify parents), `w` (log-copy-transient, in log mode).
