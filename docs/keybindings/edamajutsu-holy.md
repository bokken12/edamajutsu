# edamajutsu (holy)

> **Source:** in-repo `package.json` (this extension)
> **Surface:** edamajutsu virtual buffers (`editorTextFocus && editorLangId == edamajutsu`)
> **Vim-friendly:** **coexistence yes, bindings-style no.** Buffer-scoped, so vim is untouched outside edamajutsu buffers. Inside the buffer, single-letter verbs (`s r c e y n u a` plus the `b _` and `G _` two-key sequences) take over vim's normal-mode operators — which is what the user wants when they're using edamajutsu. The one truly painful collision is `k` for abandon, since `j`/`k` is universal vim line navigation; that's what `edamajutsu-evil.md`'s overlay relocates.
> **Notes:** Magit / edamagit-style (holy) with jj-flavoured verbs. **This is edamajutsu's V1 default.** Vim users who want a lighter ergonomic layer paste the snippet from [`edamajutsu-evil.md`](./edamajutsu-evil.md) into their `keybindings.json`. Rationale and comparison live in `analysis.md`.

## Universal

| Key | Action |
|---|---|
| `g` | Refresh |
| `?` | Help |
| `q` | Close / exit view |
| `RET` | Visit / drill in |
| `TAB` | Fold / unfold section at cursor (delegates to VSCode `editor.toggleFold`) |

## Movement

| Key | Action |
|---|---|
| (VSCode default) | Next / prev line |
| — | Next / prev section |
| — | Next / prev sibling section |
| (VSCode default) | Goto top / bottom |

## Views

| Key | Action |
|---|---|
| (command palette) | Status (`Edamajutsu: Open Status`) |
| `l` | Log |
| `o` | Op log |
| — | Diff / commit detail |

## Verbs

| Key | Action |
|---|---|
| `c` | Describe (commit-style) |
| `n` | New change |
| `e` | Edit change |
| `k` | Abandon |
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

- All bindings are gated by `editorTextFocus && editorLangId == edamajutsu` — only active inside edamajutsu virtual buffers.
- `g` as an immediate refresh prevents using `g` as a chord prefix (which vim uses for `gg`, `gd`, `gx`, `gt`, …). `G` as the first key of a `G _` sequence also collides with vim's "goto last line".
- **`b _` and `G _` are implemented as transient menus, not raw chord bindings.** Pressing `b` triggers `edamajutsu.bookmark.menu`, which opens a VSCode quickpick listing the bookmark actions; the user picks one with a labeled hotkey (`c` / `s` / `d` / `r` / `f`). The user-facing keystroke sequence (`b` then `c` etc.) is identical to a chord, but the implementation route differs — useful to know if you're tracing why a binding fires. Same for `G` → `edamajutsu.git.menu` → `p` / `f`.
