# edamajutsu (evil)

> **Source:** *(proposal — not yet shipped)*. Will live as a paste-in `keybindings.json` snippet documented in the extension's user-facing README, mirroring [`edamagit-evil.md`](./edamagit-evil.md)'s pattern.
> **Surface:** edamajutsu virtual buffers (`editorTextFocus && editorLangId == edamajutsu`), with one global rule to suppress `extension.vim_tab` so `TAB` keeps doing fold inside our buffers.
> **Vim-friendly:** partial — relocates the one universally-painful collision (`k` for abandon vs. vim "prev line") and frees `g` as a chord prefix. Everything else inherits unchanged from [`edamajutsu-holy.md`](./edamajutsu-holy.md); the snippet does **not** attempt a full evil-style remap.
> **Notes:** Minimal-by-design, matching edamagit-evil's scope. The point is to fix the one collision that breaks vim line-navigation muscle memory, while leaving the rest of the magit-style verbs on the letters that match `majutsu-holy.md` / `edamagit-holy.md`. Tables below show the **full effective keymap with the overlay applied**, so this doc stands on its own.

## Universal

*Differences from `edamajutsu-holy.md`: `g r` replaces `g` (refresh); `g g` added for vim cursor-top; `TAB` added for fold (via `vim_tab` suppression).*

| Key | Action |
|---|---|
| `g r` | Refresh |
| `g g` | Cursor-top (vim default, re-enabled inside edamajutsu) |
| `?` | Help |
| `q` | Close / exit view |
| `RET` | Visit / drill in |
| `TAB` | Toggle fold (inside edamajutsu; `vim_tab` is suppressed in our buffers) |

## Movement

*Unchanged from `edamajutsu-holy.md`.*

| Key | Action |
|---|---|
| (VSCode default) | Next / prev line |
| — | Next / prev section |
| — | Next / prev sibling section |
| (VSCode default) | Goto top / bottom |

## Views

*Unchanged from `edamajutsu-holy.md`.*

| Key | Action |
|---|---|
| (command palette) | Status (`Edamajutsu: Open Status`) |
| `l` | Log |
| `o` | Op log |
| — | Diff / commit detail |

## Verbs

*Differences from `edamajutsu-holy.md`: `x` replaces `k` (abandon).*

| Key | Action |
|---|---|
| `c` | Describe (commit-style) |
| `n` | New change |
| `e` | Edit change |
| `x` | Abandon |
| `r` | Rebase (change + descendants) |
| `s` | Squash (@ into parent) |
| — | Split |
| `a` | Absorb |
| `y` | Duplicate |
| `V` | Revert (apply reverse) |
| `u` | Undo |
| `U` | Redo |
| `b c` | Bookmark create |
| `b s` | Bookmark move (set) |
| `b d` | Bookmark delete |
| `b r` | Bookmark rename |
| `b f` | Bookmark forget |
| `G p` | Git push |
| `G f` | Git fetch |

## Notes

- **Why only these four overlay changes.** `k` for abandon is the single binding that breaks fundamental vim muscle memory (line navigation). The other holy-default collisions (`s` substitute, `c` change, `r` replace-char, `e` end-of-word, `n` search-next, `y` yank, `a` append, `V` visual-line, `b _` chord on word-back, `u` undo) are vim operators that the user has no real reason to invoke inside a read-only edamajutsu status / log / op-log buffer. Relocating them adds chord depth without adding clarity. See `analysis.md` § "Collision audit" for the full scoring.
- **Reclaiming `g`.** Moving refresh to `g r` frees `g` as a chord prefix. This matches `evil-collection-magit`'s convention and lets a user who *does* want more vim-style ergonomics extend their personal `keybindings.json` with `g d` (jump to diff), `g x` (abandon — duplicating `x`), `g _` jumpers like majutsu-evil's `g j` / `g k`, etc.
- **`TAB` for fold.** Same pattern as edamagit-evil: bind `TAB` → `extension.vim_tab` only outside our buffers (`editorLangId != edamajutsu`), remove the global `extension.vim_tab` binding, and the default `magit-section`-style fold (once we have one) takes over inside edamajutsu.
- **`G _` shadows vim's `G`.** `G` is bound directly to `edamajutsu.git.menu` (the implementation is a quickpick transient, not a raw chord binding — see `edamajutsu-holy.md` § Notes), so pressing `G` immediately opens our menu. Vim's `G` (goto last line) does *not* fire even after a delay. A user who frequently wants goto-last-line inside edamajutsu's log buffer will be inconvenienced. Worth measuring in dogfood; if it bites, a future overlay could relocate the git transient to e.g. `g G` so vim's `G` is preserved.
- **Sketch only.** The actual JSON to paste lives in the extension's README; this file is the *spec* of what the snippet should bind. Task to ship: design the literal `keybindings.json` block + `-edamajutsu.*` negative bindings, ensure scope is correct.
