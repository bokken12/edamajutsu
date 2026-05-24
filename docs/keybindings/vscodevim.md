# vscodevim

> **Source:** [VSCodeVim/Vim](https://github.com/VSCodeVim/Vim) — `vscodevim.vim` extension
> **Surface:** every VSCode editor when `vim.active`; bindings fire in modes other than `Insert`, `SearchInProgressMode`, and `CommandlineInProgress` (the `vim.mode =~ /^(?!Search…|Cmd…).*$/` guard edamagit uses to gate magit bindings)
> **Vim-friendly:** N/A — this *is* the vim layer we must not stomp on
> **Notes:** Reference-only doc. Lists the normal-mode keys edamajutsu must avoid colliding with (or must explicitly negative-bind via `-extension.vim_*` in any vim-aware overrides). Reproduces standard vim normal-mode conventions; nothing exotic.

## Collisions to avoid (normal mode)

### Motion keys (must remain free)

| Key | Vim meaning |
|---|---|
| `h` `j` `k` `l` | Character / line motion |
| `w` `W` `b` `B` `e` `E` | Word motion |
| `0` `$` `^` | Line motion |
| `gg` `G` | File-top / file-bottom |
| `f` `F` `t` `T` | Find-char forward / backward / till |
| `/` `?` `n` `N` | Search + repeat |
| `%` | Match-pair / file-percent |
| `H` `M` `L` | Viewport top / middle / bottom |
| `*` `#` | Search under cursor |

### Operators / verb keys

| Key | Vim meaning |
|---|---|
| `c` `C` | Change |
| `d` `D` | Delete |
| `y` `Y` | Yank |
| `r` `R` | Replace-char / replace-mode |
| `s` `S` | Substitute char / substitute line |
| `x` `X` | Delete-char |
| `p` `P` | Paste after / before |
| `u` `U` | Undo / restore-line |
| `C-r` | Redo |
| `.` | Repeat last command |
| `~` | Toggle case |
| `<` `>` | Indent / outdent |
| `=` | Format |

### Mode-entry keys

| Key | Vim meaning |
|---|---|
| `i` `I` `a` `A` | Enter insert mode |
| `o` `O` | Open line below / above |
| `v` `V` `C-v` | Visual character / line / block |
| `:` `/` `?` `q:` | Command line / search |

### `g`-prefix chords (occupying `g` blocks all of these)

| Key | Vim meaning |
|---|---|
| `gg` | Goto first line |
| `gd` `gD` | Goto definition / declaration |
| `gh` | Hover |
| `gt` `gT` | Next / prev tab |
| `gx` | Open URL |
| `gv` | Re-select last visual |
| `gu` `gU` | Lowercase / uppercase operator |
| `g~` | Toggle-case operator |
| `g;` `g,` | Jump in change-list |

### Marks / macros / folds

| Key | Vim meaning |
|---|---|
| `m _` | Set mark |
| `' _` ``` ` _ ``` | Jump to mark |
| `q _` | Record macro |
| `@ _` | Replay macro |
| `z _` | Fold operations (`zz` / `zt` / `zb` / `zf` / `zo` / `zc` / …) |

## Notes

- **Per-buffer disabling:** vscodevim bindings can be suppressed inside edamajutsu buffers with `when` clauses like `editorLangId == edamajutsu && vim.mode != 'Insert'`. Negative bindings (`-extension.vim_<key>`) can also remove specific vim defaults inside our buffers. The V1 design goal is that this surgery is *not required* — the holy default plus the opt-in evil overlay together should keep the common normal-mode operators from being an active problem.
- **`vim.mode` regex** edamagit uses (`/^(?!SearchInProgressMode|CommandlineInProgress).*$/`) is the standard pattern: extension bindings fire in normal/visual/operator-pending/etc. but yield while the user is typing into vim's `/` search or `:` cmdline.
- **What this file is for:** the negative-space of edamajutsu's keymap. Any letter listed above that we still want to claim as a top-level edamajutsu binding will cause real user pain unless deliberately negative-bound or scoped behind a chord.
