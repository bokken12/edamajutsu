# Analysis — edamajutsu keymap rationale

Comparison of the source keymaps in this folder, and the rationale for edamajutsu's V1 keymap decision.

The starting concern: edamajutsu's pre-decision keymap collided in a few ways with `vscodevim` (the most painful: `k` for abandon vs. vim's "prev line" motion) and with `jimmyzjx.leaderkey`. This folder is the audit that fed into the V1 fix; the follow-up implementation task turns the sketch in `edamajutsu-evil.md` into a concrete `keybindings.json` snippet documented in the extension's user-facing README.

## Decision (recorded)

> **edamajutsu V1 keeps a magit/edamagit-style holy keymap as the default and ships an opt-in evil overlay snippet — the same model as edamagit.**
>
> The default ([`edamajutsu-holy.md`](./edamajutsu-holy.md)) uses single-letter verb keys (`s` squash, `c` describe, `r` rebase, `b _` bookmark transient, etc.). Bindings are buffer-scoped to `editorLangId == edamajutsu` so vim is untouched outside edamajutsu buffers. Inside the buffer, the holy verbs take over the corresponding vim normal-mode operators — which is what the user wants when they're using edamajutsu.
>
> The opt-in overlay ([`edamajutsu-evil.md`](./edamajutsu-evil.md)) relocates only the universally-painful collision (`k` → `x` for abandon, since `j`/`k` is fundamental vim line navigation) and frees `g` as a chord prefix (`g r` for refresh, `g g` re-enabling vim cursor-top). Users paste it into `keybindings.json`; the extension doesn't ship it enabled. This mirrors `edamagit-evil.md`'s scope and approach.
>
> **Why this and not evil-default?** Considered. The initial leaning was evil-default — argued by "edamajutsu's audience is niche and likely all-vim-user, so the default should be vim-friendly". Reversed after the side-by-side audit revealed:
>
> 1. `edamagit`'s holy-default-plus-opt-in-overlay is widely observed to "work fine with vim" in practice — bindings are buffer-scoped, so vim works untouched outside magit buffers, and inside the buffer the user wants magit's verbs to win anyway.
> 2. Going evil-default the right way means roughly what `evil-collection-magit` does — relocate ~12 letters into chord prefixes — which is invasive, harder to remember, harder to teach, and harder for new users coming from Magit / majutsu / edamagit to recognize.
> 3. The lighter touch of `majutsu-evil.el` (only relocate the worst vim-motion collisions) relies on Emacs evil-state precedence, which VSCode + vscodevim doesn't give us; we'd have to either negative-bind across the namespace or chord-prefix everything.
> 4. Holy default keeps `edamajutsu`'s vocabulary aligned with `Magit` / `edamagit` / `majutsu` — tutorials and shared examples speak the same letters.
>
> The audience may include vim users but doesn't *have to*. Vim users get relief via the documented overlay; everyone else gets a keymap that matches the rest of the magit-family.

## Side-by-side: navigation + universal

These are the keys that vary most across the holy/evil divide. Verbs vary by VCS (git vs jj) so they're broken out separately below.

| Action | magit-holy | magit-evil | edamagit-holy | edamagit-evil | majutsu-holy | majutsu-evil | edamajutsu-holy | edamajutsu-evil |
|---|---|---|---|---|---|---|---|---|
| Refresh | `g` | `g r` | `g` | `g r` | `g` | `g r` | `g` | `g r` |
| Help / dispatch | `?` | `?` | `?` | `?` | `?` | `?` | `?` | `?` |
| Close view | `q` | `q` | `q` | `q` | `q` | `q` | `q` | `q` |
| Visit thing | `RET` | `RET` | `RET` | `RET` | `RET` | `RET` | `RET` | `RET` |
| Fold / unfold | `TAB` | `TAB` | `TAB` | `TAB` (vim_tab suppressed) | (section remap) | (inherits) | — | `TAB` (vim_tab suppressed) |
| Next line | (Emacs default) | `j` | (VSCode default) | (VSCode default) | (Emacs default) | `j` | (VSCode default) | (VSCode default) |
| Next section | `M-n` | `C-j` | `C-j` | `C-j` | (section default) | `C-j` | — | — |
| Next sibling section | (section default) | `g j` / `]` | — | — | (section default) | `g j` / `]` | — | — |
| Goto top / bottom | `M-<` / `M->` | `gg` / `G` | (VSCode default) | `g g` / (VSCode default) | `M-<` / `M->` | `gg` / `G` | (VSCode default) | `g g` / (VSCode default) |
| Log view | `l` | `l` | `l` | `l` | `l` | `L` | `l` | `l` |
| Op log | n/a (git) | n/a | n/a | n/a | (via `?` dispatch) | (via `?` dispatch) | `o` | `o` |

**Pattern:** edamajutsu-evil and edamagit-evil agree completely — both relocate refresh to `g r`, re-enable `g g` for vim cursor-top, and suppress `vim_tab` inside the buffer so `TAB` keeps doing fold. Both leave per-line navigation to VSCode defaults (since the buffer isn't text the user is editing in vim normal mode). Neither attempts the more aggressive `C-j` / `C-k` section navigation or `g j` / `g k` sibling navigation that `majutsu-evil` / `magit-evil` add — those would be future enhancements once `edamajutsu` actually has folded sections.

## Side-by-side: jj verbs

| Action | majutsu-holy | majutsu-evil | edamajutsu-holy | edamajutsu-evil |
|---|---|---|---|---|
| Describe | `c` | `c` | `c` | `c` (unchanged) |
| Commit | `C` | `C` | — | — |
| New change | `o` | `o` | `n` | `n` (unchanged) |
| Edit changeset | `e` | `e` | `e` | `e` (unchanged) |
| Abandon | `k` | `x` (relocated) | `k` | **`x`** (relocated) |
| Rebase | `r` | `r` | `r` | `r` (unchanged) |
| Squash | `s` | `s` | `s` | `s` (unchanged) |
| Split | `S` | `S` | — | — |
| Absorb | `a` | `a` | `a` | `a` (unchanged) |
| Duplicate | `y` | `y` (normal-only) | `y` | `y` (unchanged) |
| Revert | `V` | `_` (relocated) | `V` | `V` (unchanged) |
| Restore | (dispatch) | `R` | — | — |
| Undo | `C-/` | `u` | `u` | `u` (unchanged) |
| Redo | `C-?` | `C-r` | `U` | `U` (unchanged) |
| Bookmark | `b` (transient) | `b` (transient) | `b _` (chord) | `b _` (unchanged) |
| Git push / fetch | (via `G` transient) | (via `G` transient) | `G p` / `G f` | `G p` / `G f` (unchanged) |

**Pattern:** the edamajutsu-evil overlay touches one verb (`k` → `x` for abandon). Everything else inherits unchanged. This is the lightest possible overlay that fixes the one collision breaking vim's universal `j`/`k` line motion; anything beyond that is a judgement call left to users who want to extend.

## Collision audit (vscodevim ↔ edamajutsu-holy)

From `vscodevim.md`, the keys edamajutsu-holy collides with:

| Key | Vim normal-mode meaning | edamajutsu-holy | Painful? |
|---|---|---|---|
| `k` | Prev line motion | Abandon | **Yes** — `j`/`k` is universal vim navigation. Overlay fixes via `x`. |
| `g` | Chord prefix (gg, gd, gx, gt, …) | Refresh | Mild — vim's `g` chords don't fire because edamajutsu's `g` is immediate. Overlay frees `g` via `g r`. |
| `c` | Change operator | Describe | No — read-only buffer, `c` has nothing to change. |
| `e` | End of word | Edit change | No — buffer isn't text the user edits with vim motion. |
| `n` | Next search match | New change | No — `/` search works inside the buffer if needed; `n` for "next match" is rarely useful. |
| `r` | Replace char | Rebase | No — read-only. |
| `s` | Substitute char | Squash | No — read-only. |
| `y` | Yank operator | Duplicate | Mild — user might want to yank text. Acceptable trade-off. |
| `u` | Undo | Undo | Semantically aligned; not a real collision. |
| `U` | Restore line | Redo | Vim's `U` is rare; effectively no-collision. |
| `a` | Enter insert (append) | Absorb | No — read-only. |
| `b` | Word back motion | Bookmark chord prefix | Mild — `b` is one of the more frequent vim word motions, but again the buffer isn't text the user is editing. |
| `o` | Open line below | Op log view | No — read-only. |
| `V` | Visual line | Revert | No — visual-line selection in a read-only buffer is rare. |
| `G` | Goto last line | Git menu (`G p`, `G f` via transient) | Mild-to-painful — `G` is bound to `edamajutsu.git.menu` and fires immediately, so vim's "goto last line" is shadowed inside the buffer. Acceptable in V1 because the buffer is short, but worth revisiting if log-view navigation needs `G` more. |

Only `k` is universally painful. Everything else is "vim would do X, but in a read-only status buffer there's nothing to do" — the collision is theoretical rather than practical. This is exactly the reasoning behind the minimal overlay.

## Opt-in overlay design (mirroring edamagit-evil)

See [`edamajutsu-evil.md`](./edamajutsu-evil.md) for the spec. Summary:

| Key | Action | Replaces (holy) |
|---|---|---|
| `g r` | Refresh | `g` |
| `g g` | Cursor-top (vim default) | — (new) |
| `TAB` | Toggle fold (suppress `vim_tab` inside our buffers) | — (re-asserted) |
| `x` | Abandon | `k` |

**Implementation pattern:** for each relocated key, pair a positive binding (new location → command, scoped to `editorLangId == edamajutsu`) with a negative binding (old location → `-<command>`, scoped to `editorLangId == edamajutsu`). For `TAB`, additionally bind `extension.vim_tab` outside edamajutsu and add a global negative `-extension.vim_tab` so the buffer-default `TAB` → `<fold command>` wins inside us. Canonical reference: `edamagit-evil.md` § "Notes".

## What we explicitly do *not* do

- **No `C-j` / `C-k` section navigation** in V1, holy or evil. Edamajutsu doesn't have folded sections yet; once it does, section navigation should land in `edamajutsu-holy` (useful regardless of vim) rather than only in the overlay.
- **No `g _` chord-prefix tree for verbs** like `g c` describe / `g x` abandon / `g e` edit. The lighter overlay leaves verbs on their natural letters because the buffer is read-only and the collisions are theoretical.
- **No automatic vim-mode detection.** edamajutsu doesn't try to detect whether vscodevim is installed. The overlay is opt-in; users who don't have vscodevim simply don't paste it.
- **No leaderkey awareness in V1.** The V1 fix is "don't conflict with the leader trigger" (typically `<Space>`, which edamajutsu doesn't bind). "Yield to leaderkey mid-chord" is a follow-up that depends on the leaderkey extension exposing a `when` context key, which it does not currently expose.

## Open questions

- **Does dogfood show non-`k` collisions also need overlay relocation?** Specifically `b` (vim word-back) and `y` (vim yank) collide with edamajutsu's bookmark chord and duplicate verb. Both are mild and accepted in V1. Revisit if real use shows they're more painful than predicted.
- **Where does the overlay live in V2?** Three options: (a) paste-in snippet in the extension README (matches edamagit; lowest friction to ship); (b) a separate file in the repo users can include via VSCode's `keybindings.json` `extends` mechanism (if such a thing existed — it doesn't); (c) a VSCode extension setting `edamajutsu.vimOverlay: enable | disable` that swaps the contributed bindings at activation. Option (a) is the path of least resistance.
- **`G` shadows vim's goto-last-line.** `G` is bound directly to `edamajutsu.git.menu` (a quickpick transient), so pressing `G` immediately opens the menu. Vim's `G` does not fire. Worth measuring in dogfood; if it bites, a future overlay could relocate the git transient (e.g. `g G`).
