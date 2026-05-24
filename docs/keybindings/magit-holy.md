# Magit (holy)

> **Source:** [magit.vc](https://magit.vc) — default Emacs bindings (no evil). In-repo proxy: `edamagit/package.json`, which faithfully ports Magit's bindings to VSCode.
> **Surface:** `magit-status-mode` and derived modes inside Emacs (`magit-log-mode`, `magit-diff-mode`, `magit-refs-mode`, …)
> **Vim-friendly:** no — single-letter verbs assume Emacs movement (`C-n` / `C-p` / `C-f` / `C-b`), not `h` / `j` / `k` / `l`. Most letter keys are popup-launchers, not commands.
> **Notes:** The convention Magit was built on; the baseline edamagit, majutsu, and edamajutsu's own holy keymap all mirror. Verbs are organized as **transient popups** under letter keys — `b` opens a branching menu, `r` opens rebasing, `c` opens committing, etc.

## Universal

| Key | Action |
|---|---|
| `g` | Refresh |
| `?` (also `h`) | Help / dispatch popup |
| `q` | Bury buffer |
| `RET` | Visit thing |
| `TAB` | Toggle fold under cursor |
| `M-x magit-status` | Entry into status (often bound to `C-x g`) |

## Movement

| Key | Action |
|---|---|
| (Emacs default `C-n` / `C-p`) | Next / prev line |
| `M-n` / `M-p` | Next / prev section (also `C-<tab>` cycle) |
| `n` / `p` (in log) | Next / prev log entry |
| (Emacs default `M-<` / `M->`) | Goto top / bottom |

## Views (popups)

| Key | Action |
|---|---|
| `l` | Log popup |
| `d` | Diff popup |
| `y` | Show refs |
| `t` | Tag popup |
| `b` | Branch popup |
| `m` | Merge popup |
| `r` | Rebase popup |
| `M` | Remote popup |
| `o` | Submodule popup |
| `z` | Stash popup |
| `i` | Ignore popup |
| `I` | Init repo |
| `B` | Bisect popup |
| `%` | Worktree popup |
| `$` | Process log |
| `!` | Run / shell command popup |

## Verbs (git)

The universal `magit-mode-map` binds `a` `k` `v` to *generic dispatchers* (`magit-cherry-apply`, `magit-delete-thing`, `magit-revert-no-commit`) that delegate to the section under point. In practice the user-facing effect is "apply / discard / reverse at point", which is what the rows below describe.

| Key | Action |
|---|---|
| `s` | Stage at point |
| `S` | Stage all |
| `u` | Unstage at point |
| `U` | Unstage all |
| `a` | Apply at point (`magit-cherry-apply`) |
| `k` | Discard at point (`magit-delete-thing`) |
| `v` | Reverse at point (`magit-revert-no-commit`) |
| `c` | Commit popup |
| `f` | Fetch popup |
| `F` | Pull popup |
| `P` | Push popup |
| `X` | Reset popup |
| `A` | Cherry-pick popup |
| `V` | Revert popup |

## Notes

- **Popups, not commands.** Most letter keys open a transient popup (à la `magit-rebase-popup`) where further keys pick a specific action and arguments. This is why Magit can fit so many actions onto so few top-level letters.
- **No `j` / `k` for navigation** — those are free for `discard` (`k`) and an alias for `magit-jump-to-diffstat` (`j` in some buffers). In Magit-holy, motion is Emacs-native.
- **Inheritance:** `magit-status-mode-map` extends `magit-mode-map`, which extends `magit-section-mode-map`. Section-level keys (`TAB`, `S-TAB`, `M-1`–`M-4`) come from the section map.
- This file is a *short* reference — full canonical lists live at [magit.vc/manual/magit/Keystroke-Index.html](https://magit.vc/manual/magit/Keystroke-Index.html). Bindings here are the ones edamajutsu's analysis cares about.
- The verb taxonomy ("Verbs (git)") deliberately doesn't try to fit the README's jj-oriented row taxonomy — Magit is git, so it has `stage`/`unstage`/`branch popup`/etc. instead of `abandon`/`squash`/`split`/etc.
