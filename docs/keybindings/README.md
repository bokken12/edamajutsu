# Keybindings docs

Reference material for choosing a keymap that plays nicely alongside vscodevim and leaderkey — comparing what other Magit-family tools do, auditing collisions, and recording the decisions edamajutsu makes.

## Files

| File | What it is |
|---|---|
| `edamajutsu-holy.md` | **edamajutsu's V1 default keymap.** Magit/edamagit-style; the bindings extension ships out of the box. |
| `edamajutsu-evil.md` | The **opt-in** vim-overlay snippet (sketch — to ship as paste-in JSON in the extension README). Relocates the worst vim collision (`k` → `x` for abandon) and frees `g` as a chord prefix. |
| `magit-holy.md` | Magit's default Emacs bindings (no evil). The convention edamagit was built on. |
| `magit-evil.md` | `evil-magit` / `evil-collection-magit` — the canonical vim adaptation of magit. |
| `edamagit-holy.md` | edamagit's default VSCode bindings (magit-holy letters, vim-mode-aware via `when` guards). |
| `edamagit-evil.md` | The opt-in `keybindings.json` overlay from `edamagit/README.md` § "Vim support" — relocates the 4 worst vim/magit collisions. |
| `majutsu-holy.md` | majutsu's default Emacs bindings (jj-flavoured magit). |
| `majutsu-evil.md` | `majutsu-evil.el` — vim adaptation of majutsu. Closest analog to what we want. |
| `vscodevim.md` | vscodevim normal-mode bindings we must not stomp on. |
| `leaderkey.md` | leaderkey (jimmyzjx.leaderkey) trigger / chord prefixes. |
| `analysis.md` | Side-by-side comparison + rationale for our key choices. |

## Shared file format

So files compare cleanly side-by-side, every binding-source file follows this shape:

```markdown
# <Source name>

> **Source:** <upstream link or in-repo path>
> **Surface:** <which buffer/view this applies to>
> **Vim-friendly:** yes | no | partial — <one-line why>
> **Notes:** <one-line context: when, who, distinctive choices>

## Universal

| Key | Action |
|---|---|
| … | Refresh |
| … | Help |
| … | Close / exit view |
| … | Fold / unfold section |
| … | Visit / drill in |

## Movement

| Key | Action |
|---|---|
| … | Next / prev line |
| … | Next / prev section |
| … | Next / prev sibling section |
| … | Goto top / bottom |

## Views

| Key | Action |
|---|---|
| … | Status |
| … | Log |
| … | Op log |
| … | Diff / commit detail |

## Verbs

| Key | Action |
|---|---|
| … | Commit / describe |
| … | New change |
| … | Edit change |
| … | Abandon |
| … | Rebase |
| … | Squash |
| … | Split |
| … | Bookmark set |
| … | Undo |
| … | Redo |

## Notes

Free-form: collisions, gotchas, mode-specific quirks, version drift.
```

**Rules:**

- Columns are **`Key | Action`** in per-source files. Key on the left because keys have roughly uniform width, which gives clean column alignment in source and renderers.
- Keep section order fixed (Universal → Movement → Views → Verbs → Notes) even if a section is empty — write `*(none)*` in the table body rather than dropping the header. Parallel structure is the whole point.
- Keep the action rows in the order above. If a source has actions outside this taxonomy, add them at the bottom of the relevant section.
- For unbound actions in the canonical taxonomy: use `—` (em-dash) in the Key column. For actions that don't apply to a given source (e.g. jj-only verbs in magit files): use `n/a`. Avoid stuffing long prose into the Key column — move it to Notes.
- Use literal key names: `g`, `g r`, `C-j`, `RET`, `TAB`, `M-x`. No prose ("press g then r").
- Reference-only files (`vscodevim.md`, `leaderkey.md`) may diverge from the table taxonomy — they document what to *avoid colliding with*, not actions to perform — but should still carry the metadata header so the headers line up.

### Exception: `analysis.md`

`analysis.md` contains the **cross-source comparison table** — one column per source, one row per action. Action is the row anchor there, so its columns are `Action | <source1> | <source2> | …`. Don't flip this one to Key-first; it would break the comparison.
