# edamagit (holy)

> **Source:** in-repo `edamagit/package.json` — the default keybindings shipped by the extension.
> **Surface:** VSCode buffers with `editorTextFocus && editorLangId == 'magit'`. Every default binding is guarded by `vim.mode =~ /^(?!SearchInProgressMode|CommandlineInProgress).*$/` so it doesn't fire during vim `/` search or `:` cmdline.
> **Vim-friendly:** **coexistence yes, bindings-style no.** Inside magit buffers the bindings claim vim normal-mode operator letters (`s c b r m i y d t v k u`) and win over vim there; outside magit buffers vim is untouched. So "vim still works for me" is genuinely true even though the magit-buffer letters themselves are holy.
> **Notes:** Defaults only. The opt-in `keybindings.json` overlay from `edamagit/README.md` § "Vim support (VSCodeVim)" lives in `edamagit-evil.md`.

## Universal

| Key | Action |
|---|---|
| `alt+x g` | Status (entry) |
| `alt+x C-g` | Dispatch (entry) |
| `alt+x alt+g` | File popup (entry) |
| `g` | Refresh |
| `?` (also `shift+-`) | Help |
| `q` | Quit / close view |
| `RET` | Visit at point |
| `TAB` | Toggle fold |

## Movement

| Key | Action |
|---|---|
| (VSCode default) | Next / prev line |
| `C-j` / `C-k` | Move next / previous entity |
| — | Next / prev sibling section |
| (VSCode default) | Goto top / bottom |

## Views (popups)

| Key | Action |
|---|---|
| `l` | Log popup |
| `d` | Diffing popup |
| `y` | Show refs |
| `t` | Tagging popup |
| `b` | Branching popup |
| `m` | Merging popup |
| `r` | Rebasing popup |
| `M` (`shift+m`) | Remoting popup |
| `o` | Submodules popup |
| `z` | Stashing popup |
| `i` (also `I`) | Ignoring popup |
| `B` (`shift+b`) | Bisect popup |
| `%` (`shift+5`) | Worktree popup |
| `$` (`shift+4`) | Process log |
| `!` (`shift+1`) | Run popup |

## Verbs (git)

| Key | Action |
|---|---|
| `s` | Stage |
| `S` (`shift+s`) | Stage all |
| `u` | Unstage |
| `U` (`shift+u`) | Unstage all |
| `a` | Apply at point |
| `k` | Discard at point |
| `v` | Reverse at point |
| `c` | Commit popup |
| `f` | Fetch popup |
| `P` (`shift+p`) | Pushing popup |
| `F` (`shift+f`) | Pulling popup |
| `X` (`shift+x`) | Resetting popup |
| `x` | Reset (mixed) |
| `C-u x` | Reset (hard) |
| `A` (`shift+a`) | Cherry-pick popup |
| `V` (`shift+v`) | Reverting popup |

## Editor (commit / description buffers)

| Key | Action |
|---|---|
| `C-c C-c` | Save and close editor |
| `C-c C-k` | Clear and abort editor |

## Notes

- The `vim.mode` guard means edamagit yields while you're typing in `/` search or `:` cmdline, but it does **not** suppress collisions with normal-mode operators. Inside a magit buffer, `s` fires `magit.stage` *instead of* vim's substitute. Outside the buffer, vim's `s` is untouched.
- This is buffer-scoped coexistence rather than vim-style ergonomics. To get a partial vim-style ergonomic layer on top, paste the README's "Vim support" snippet — see `edamagit-evil.md`.
