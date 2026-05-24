# leaderkey

> **Source:** [jimmyzjx/leaderkey-vscode](https://marketplace.visualstudio.com/items?itemName=jimmyzjx.leaderkey) — `jimmyzjx.leaderkey` VSCode extension. (Inspect the user's local `settings.json` for the actual configured leader, since the trigger is user-configured.)
> **Surface:** VSCode globally; user-configured trigger key opens a leader-key chord menu
> **Vim-friendly:** N/A — Spacemacs-style leader layer, conventionally bound to `<Space>` in vscodevim normal mode (the same way Spacemacs binds it under evil)
> **Notes:** Reference-only doc. Leaderkey is a known friction point — when leaderkey is mid-chord, our buffer bindings should ideally yield. The V1 fix is "don't conflict with the leader trigger"; "yield to leaderkey when a chord is in progress" is a possible follow-up.

## Typical leader configuration

| Setting | Common value | Notes |
|---|---|---|
| Leader trigger (normal mode) | `<Space>` | Spacemacs-style. Most common setup. |
| Alternate trigger | `,` | Used by some vim users instead of `<Space>`. |
| Trigger in non-vim editors | varies | Sometimes `alt+x` or extension-default chord. |

## Collisions to avoid

| Key | Why |
|---|---|
| `<Space>` (normal mode) | The most common leader trigger; binding it inside edamajutsu would either break leader entirely or only allow our binding when not preceded by another chord (impossible to express in `when` clauses cleanly). |
| `,` (normal mode) | Some users use comma-leader. Less universal but worth noting. |
| Anything *after* the leader | leaderkey owns the entire chord namespace once the leader fires; we don't need to plan around specific post-leader keys, but if our extension exposes a leaderkey-compatible action we'd register it in leaderkey's config rather than as a VSCode keybinding. |

## Detecting leaderkey-active state

VSCode does not natively expose "leaderkey is mid-chord" as a context key. To make our bindings yield, the options are:

- **Register with leaderkey** — expose our buffer-scoped commands so leaderkey can show them under a `<Space> j` (or whatever) chord, rather than binding them ourselves. Lowest-friction for leaderkey users.
- **Detect via leaderkey context key** — if the extension exposes a `when` context like `leaderkey.active`, we can guard our bindings with `&& !leaderkey.active`. Needs verification against the extension's actual `contributes.contextKeys`.
- **Don't worry about it** — leaderkey is opt-in; users who configure it can also add their own per-buffer overrides. V1 acceptable.

## Notes

- Long-term goal: detect when we've entered leaderkey-mid-chord and disable our commands in that state, working both in the presence and the absence of leaderkey. V1 scope is narrower — "avoid obvious conflicts with common vim keys for navigation" — and leaderkey awareness is explicitly a follow-up.
- This doc deliberately stays thin until we audit the user's actual leaderkey config and confirm which trigger they use.
