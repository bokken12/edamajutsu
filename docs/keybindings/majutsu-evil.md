# majutsu (evil) — `majutsu-evil.el`

> **Source:** in-repo `majutsu/majutsu-evil.el`
> **Surface:** majutsu buffers under `evil-mode` — normal / visual / motion states; some bindings are normal-only (e.g. mutating verbs like `y`, conflict-resolution submenus)
> **Vim-friendly:** yes — vim adaptation of majutsu, designed in parallel with `evil-collection-magit`
> **Notes:** The single closest precedent for what edamajutsu wants. Note the approach: it does *not* relocate most magit-style verbs off `s`/`c`/`r`/`e` — instead it relies on evil's state machine so those keys fire only in normal/motion/visual state inside majutsu buffers. In VSCode, vscodevim doesn't give us the same state-precedence cleanly, so we'll likely need more relocation than this file does.

## Universal (`majutsu-mode-map`)

| Key | Action |
|---|---|
| `g r` | Refresh (relocated off the default `r`/`g` to free `r` for rebase and `g` as a chord prefix) |
| `?` | Dispatch (inherits from default) |
| `q` | Bury buffer (inherits from default) |
| `RET` | Visit thing |
| (inherits) | Fold / unfold section (magit-section remaps) |

## Movement

| Key | Action |
|---|---|
| `j` / `k` | Next / prev line (vim default) |
| `C-j` / `C-k` | Next / prev section (replaces magit-section default, see "Section-map adjustments" below) |
| `g j` / `g k` | Next / prev sibling section |
| `]` / `[` | Next / prev sibling section (alt) |
| `gg` / `G` | Goto top / bottom (vim default) |

## Views

| Key | Action |
|---|---|
| `L` | Log transient (note: capital — default majutsu used `l`) |
| `d` | Diff transient |
| `D` | Diff (dwim) |
| `b` | Bookmark transient |
| `*` | Workspace |
| `>` | Sparse |
| `E` | Ediff |
| `` ` `` | Process buffer (replaces default `$`) |

## Verbs

| Key | Action |
|---|---|
| `c` | Describe |
| `C` | Commit |
| `o` | New change |
| `e` | Edit changeset |
| `x` | Abandon (relocated off `k`, which is vim "prev line") |
| `r` | Rebase |
| `s` | Squash |
| `S` | Split |
| `a` | Absorb |
| `y` (normal) | Duplicate |
| `Y` (normal) | Duplicate (dwim) |
| `_` | Revert (relocated off `V` — `V` is explicitly unbound to free vim "visual line") |
| `R` | Restore |
| `u` | Undo (note: shadows vim's undo inside majutsu buffers) |
| `C-r` | Redo |

## Log mode (`majutsu-log-mode-map`)

| Key | Action |
|---|---|
| `.` | Goto `@` |
| `[` / `]` | Goto parent / child |
| `O` | New (dwim) |
| `I` | New with before |
| `A` | New with after |

## Diff mode (`majutsu-diff-mode-map`)

| Key | Action |
|---|---|
| `+` | More context |
| `=` | Less context (replaces default `-`, freeing `-` for revert) |
| `~` | Default context (replaces default `0`) |
| `g d` | Jump to diffstat or diff |
| `C-<return>` | Diff visit workspace file |

## Conflict mode (`majutsu-conflict-mode-map`, normal state)

| Key | Action |
|---|---|
| `gj` / `]]` | Next conflict |
| `gk` / `[[` | Prev conflict |
| `gb` | Keep base |
| `gr` | Resolve submenu (numeric keys 1-9) |
| `gR` | Before submenu |
| `ge` | Refine |

## Blob mode (`majutsu-blob-mode-map`)

| Key | Action |
|---|---|
| `p` / `n` | Prev / next blob |
| `q` | Bury or kill buffer |
| `b` | Annotate addition |
| `e` | Blob edit start |
| `i` | Blob insert (dwim) |
| `RET` | Edit changeset |
| `g r` (normal) | `revert-buffer` |

### Blob edit mode

| Key | Action |
|---|---|
| `ZZ` (normal) | Edit finish |
| `ZQ` (normal) | Edit abort |
| `<escape>` (normal) | Edit exit |
| `[remap evil-write]` | Edit finish (catches `:w`) |

## Section-map adjustments (unbindings)

`majutsu-evil--adjust-section-bindings` unbinds `C-j` from `majutsu-diff-section-map`, `majutsu-file-section-map`, and `majutsu-hunk-section-map` so the global `C-j` "next section" binding takes precedence inside diffs.

## Notes

- **Relocation pattern:** verbs that collide with vim normal-mode motions (`k`, `V`, `0`, `-`) get moved (`k`→`x` for abandon, `V`→`_` for revert, `0`→`~` and `-`→`=` in diff). Verbs that collide with vim operators (`s`, `c`, `r`, `y`, `d`) are left in place and rely on evil's state precedence to win inside majutsu buffers.
- **`g _` prefix:** used for `g r` (refresh), `g j` / `g k` (sibling section), `g d` (diff jump), and the conflict-mode submenus `gj` / `gk` / `gb` / `gr` / `gR` / `ge`.
- **`Z _` chord:** wdired-style edit-finish/abort (`ZZ` / `ZQ`) in blob-edit mode.
- **`evil-snipe-mode` is explicitly disabled** in majutsu buffers to avoid further binding conflicts.
- **`majutsu-evil-initial-state`** (custom var, default `'normal`) controls which evil state majutsu buffers enter.
- This is the closest source-of-truth for what an evil-default edamajutsu *should* feel like — most binding choices in `analysis.md`'s keymap proposal mirror this file.
