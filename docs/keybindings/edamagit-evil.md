# edamagit (evil)

> **Source:** `edamagit/README.md` § "Vim support (VSCodeVim)" — the opt-in `keybindings.json` snippet users paste in to relocate the worst vim/magit collisions.
> **Surface:** same as `edamagit-holy.md` (magit buffers, vim-mode guard), but **only after the user pastes the README snippet into their personal `keybindings.json`**. Edamagit does not ship this enabled.
> **Vim-friendly:** partial — relocates the 4 worst vim ↔ magit collisions (`k` / `v` / `V` / `X`) and reclaims `g` as a chord prefix. The remaining magit-holy verbs (`s c b r m t i l d y u a A f F P` …) are still on their original letters; the overlay does not attempt a full evil-style remap.
> **Notes:** Tables below show the **full effective keymap with the overlay applied**, so this doc stands on its own. The implementation uses `-magit.<command>` negative bindings to remove the original locations and re-binds the magit command at the new key, scoped by `editorLangId == 'magit' && vim.mode =~ …`.

## Universal

*Differences from `edamagit-holy.md`: `g r` replaces `g` (refresh); `g g` added for vim cursor-top; `TAB` re-asserted for fold via `vim_tab` suppression.*

| Key | Action |
|---|---|
| `alt+x g` | Status (entry) |
| `alt+x C-g` | Dispatch (entry) |
| `alt+x alt+g` | File popup (entry) |
| `g r` | Refresh |
| `g g` | Cursor-top (vim default, re-enabled inside magit) |
| `?` (also `shift+-`) | Help |
| `q` | Quit / close view |
| `RET` | Visit at point |
| `TAB` | Toggle fold (inside magit; `vim_tab` is suppressed here) |

## Movement

*Unchanged from `edamagit-holy.md`.*

| Key | Action |
|---|---|
| (VSCode default) | Next / prev line |
| `C-j` / `C-k` | Move next / previous entity |
| — | Next / prev sibling section |
| (VSCode default) | Goto top / bottom |

## Views (popups)

*Unchanged from `edamagit-holy.md`.*

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

*Differences from `edamagit-holy.md`: `x` replaces `k` (discard); `-` replaces `v` (reverse); `_` (`shift+-`) replaces `V` / `shift+v` (reverting popup); `O` (`shift+o`) replaces `X` / `shift+x` (resetting popup). The `x` (reset-mixed) and `C-u x` (reset-hard) holy bindings are removed in the overlay.*

| Key | Action |
|---|---|
| `s` | Stage |
| `S` (`shift+s`) | Stage all |
| `u` | Unstage |
| `U` (`shift+u`) | Unstage all |
| `a` | Apply at point |
| `x` | Discard at point |
| `-` | Reverse at point |
| `c` | Commit popup |
| `f` | Fetch popup |
| `P` (`shift+p`) | Pushing popup |
| `F` (`shift+f`) | Pulling popup |
| `O` (`shift+o`) | Resetting popup |
| `A` (`shift+a`) | Cherry-pick popup |
| `_` (`shift+-`) | Reverting popup |

## Editor (commit / description buffers)

*Unchanged from `edamagit-holy.md`.*

| Key | Action |
|---|---|
| `C-c C-c` | Save and close editor |
| `C-c C-k` | Clear and abort editor |

## Notes

- **The overlay is small on purpose.** It targets the keys most likely to surprise a vim user inside magit (`k` colliding with vim "prev line" is the worst), and leaves the rest of magit-holy on its original letters because edamagit assumes the user *wants* magit-like ergonomics inside magit.
- **Negative-binding pattern.** Each relocation pairs a positive binding (e.g. `x` → `magit.discard-at-point`, scoped to magit buffer) with a negative binding (e.g. `k` → `-magit.discard-at-point`, no scope) so the old location no longer fires.
- **`vim_tab` suppression.** The snippet binds `TAB` → `extension.vim_tab` *outside* magit (`editorLangId != 'magit'`) and `TAB` → `-extension.vim_tab` globally, then the unconditional default `TAB` → `magit.toggle-fold` from edamagit-holy wins inside magit. This pattern (suppress vim's binding inside our buffer, re-enable elsewhere) is the canonical reference for how to do similar `TAB`-style claims in edamajutsu.
- **What's notably absent.** No relocation of `s` (vim substitute), `c` (vim change), `r` (vim replace), `b` (vim word-back), `y` (vim yank), `m` (vim mark), `t` (vim till), `d` (vim delete), `u` (vim undo) — all of which collide. The overlay accepts the collision rather than relocate further. Edamajutsu's V1 overlay follows the same scope.
