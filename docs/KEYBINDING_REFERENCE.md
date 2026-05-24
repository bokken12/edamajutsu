# Keybinding Reference: magit / edamagit / majutsu

Reference for keybinding work in edamajutsu. Each tree was assembled from the canonical source for that project:

- **magit** — `transient-define-prefix` forms from `magit/lisp/magit-*.el` on `main` (Emacs, git, the original).
- **edamagit** — `package.json` `contributes.keybindings` + the menu tree in `src/menu/` (VSCode, git, this workspace's `edamagit/`).
- **majutsu** — `transient-define-prefix` forms from `majutsu-*.el` files (Emacs, jj, this workspace's `majutsu/`).

For each project: top-level keys in the status/main buffer, then each transient menu the top-level keys dispatch to.

Switches (`-x`) and options (`=x`) inside transients are listed where applicable but only with their short name — see the source for full descriptions of every flag.

---

## (a) magit (Emacs, git)

Source: <https://github.com/magit/magit/tree/main/lisp>. Where keys differ between "operation in progress" and "operation not in progress" states, both are shown.

### Status buffer — top level

Sections / navigation:
```
TAB         toggle section at point
C-<tab>     cycle visibility (section + children)
M-<tab>     cycle visibility (all diff sections)
S-<tab>     cycle visibility (all sections)
1 2 3 4     show surrounding sections to level N
M-1..M-4    globally show sections to level N
^           goto parent section
p / n       prev / next section
M-p / M-n   prev / next sibling section
RET         visit thing at point
SPC / DEL   scroll up / down
j           jump to section
```

Buffer:
```
g           refresh current buffer
G           refresh all magit buffers
q           bury buffer  (C-u q kill)
$           process buffer
H           describe section at point
C-x m       describe-mode
```

Apply / stage:
```
s           stage
S           stage all unstaged
u           unstage
U           unstage all
a           apply at point
v           reverse at point
k           discard at point
```

Dispatch (`magit-dispatch`, bound to `C-x M-g` and to `h`/`?` in many configs):
```
A   Apply (cherry-pick)        b   Branch
B   Bisect                     c   Commit
C   Clone                      d   Diff
D   Diff (refresh)             e   Ediff (dwim)
E   Ediff                      f   Fetch
F   Pull                       h   Help
H   Section info               i   Ignore
I   Init                       j   Display status
J   Display buffer             l   Log
L   Log (refresh)              m   Merge
M   Remote                     o   Submodule
O   Subtree                    P   Push
Q   Command                    r   Rebase
t   Tag                        T   Note
V   Revert                     w   Apply patches
W   Format patches             X   Reset
y   Show Refs                  Y   Cherries
z   Stash                      Z   Worktree
!   Run
```

Misc top-level shortcuts (outside dispatch):
```
x       reset --mixed     C-u x   reset --hard
i       ignore (shared)
I       ignore (private)
:       git-command
```

### Branch (`b` → `magit-branch`)
```
b    checkout branch                  l    checkout local
c    new branch and checkout          s    new spin-off
n    new branch                       S    new spin-out
o    new orphan                       w    new worktree checkout
W    new worktree branch              C    configure
m    rename                           x    reset
k    delete                           h    shelve
H    unshelve                         d    description configure
u    merge/remote configure           r    rebase configure
p    pushRemote configure             R    pull.rebase default
P    remote.pushDefault default       B    update default branch
-r   recurse submodules
```

### Commit (`c` → `magit-commit`)
```
c   Commit              e   Extend          a   Amend
w   Reword              d   Reshelve        f   Fixup
s   Squash              A   Alter           n   Augment
W   Revise              F   Instant fixup   S   Instant squash
R   Reword past         x   Modified files  X   Updated modules
```

### Diff (`d` → `magit-diff`)
```
d   Dwim                r   Diff range      p   Diff paths
u   Diff unstaged       s   Diff staged     w   Diff worktree
c   Show commit         t   Show stash
```
Refresh (`D` → `magit-diff-refresh`):
```
g  buffer    s  set defaults    w  save defaults
t  hunk refine    T  hunk font   F  file filter
b  buffer lock   r  range type   f  flip revisions
```
Switches: `--` files / `-b -w` whitespace / `-D` no-preimage / `-U` context / `-W` funcs / `-A` algo / `-X` merges / `-i` submods / `-m =w` moved / `-R` reverse / `-x` no-external / `-s` stat / `=g` signature

### Fetch (`f` → `magit-fetch`)
```
p   from pushremote     u   from upstream     e   elsewhere
a   all remotes         o   another branch    r   refspec
m   modules             C   configure
```

### Pull (`F` → `magit-pull`)
```
p   from pushremote     u   from upstream     e   elsewhere
f   remotes             F   remotes + prune
o   another branch      s   explicit refspec
m   submodules          r   branch.<x>.rebase  C   variables
```
Switches: `-f` ff-only / `-r` rebase / `-A` autostash / `-F` force

### Log (`l` → `magit-log`)
```
l   current             o   other              h   HEAD
u   related             L   branches           b   all branches
a   all                 B   matching branches  T   matching tags
m   merged              r   reflog current     O   reflog other
H   reflog HEAD         i   wip-log-index      w   wip-log-worktree
s   shortlog
```
Refresh (`L`): `g` refresh / `s` set / `w` save / `b` toggle lock

### Push (`P` → `magit-push`)
```
p   current to pushremote   u   current to upstream   e   current elsewhere
o   another branch          r   refspecs              m   matching branches
T   a tag                   t   all tags              n   a note ref
C   set variables
```
Switches: `-f` force-with-lease / `-F` force / `-h` no-hooks / `-n` dry-run / `-u` set-upstream / `-T` all tags / `-t` related tags

### Rebase (`r` → `magit-rebase`)
```
Onto:    p   pushremote      u   upstream      e   elsewhere
Rebase:  i   interactively   s   a subset      m   to modify
         w   to reword       k   to remove     f   to autosquash
         t   to change dates
In progress: r continue   s skip   e edit   a abort
```
Switches: `-k` keep-empty / `-p` preserve / `-r` rebase-merges / `-u` update-refs / `-X` algo / `-f` force / `-d` author-date / `-t` now / `-a` autosquash / `-A` autostash / `-i` interactive / `-h` no-hooks / `-x` exec

### Merge (`m` → `magit-merge`)
```
Not in progress:
  m   Merge              e   Merge + edit msg     n   Merge no-commit
  a   Absorb             p   Preview              s   Squash merge
  d   Dissolve
In progress:
  m   Commit merge       a   Abort merge
```
Switches: `-f` ff-only / `-n` no-ff / `-s` strategy / `-X` strat-opt / `-b -w` whitespace / `--gpg-sign --signoff`

### Reset (`X` → `magit-reset`)
```
b   branch              f   file                m   mixed
s   soft                h   hard                k   keep
i   index               w   worktree
```

### Revert (`V` → `magit-revert`)
```
Not in progress:   V revert commit(s)   v revert changes
In progress:       V continue   s skip   a abort
```
Switches: `-m` merge-parent / `-e` edit / `-E` no-edit / `=s` strategy

### Cherry-pick / Apply (`A` → `magit-cherry-pick`)
```
Apply here:        A pick   a apply   h harvest   m squash
Apply elsewhere:   d donate   n spinout   s spinoff
In progress:       A continue   s skip   a abort
```
Switches: `-m` merge-parent / `=s` strategy / `-F` ff / `-x` reference / `-e` edit / gpg / signoff

### Apply patches (`w` → `magit-am`)
```
Apply:   m maildir   w patches   a plain patch
In progress: w continue   s skip   a abort
```
Switches: `-3` 3way / `-p` strip / `-c` scissors / `-k` keep cruft / `-b` limit cruft / `-d` author-date / `-t` now / gpg / signoff

### Stash (`z` → `magit-stash`)
```
z   stash both          i   stash index         w   stash worktree
x   stash keeping idx   P   stash push
Z   snapshot both       I   snapshot index      W   snapshot worktree
r   snapshot to wip
a   apply               p   pop                 k   drop
l   list                v   show
b   branch from stash   B   branch here         f   format patch
```
Switches: `-u` include-untracked / `-a` all

### Tag (`t` → `magit-tag`)
```
t   tag                 r   release             k   delete
p   prune
```
Switches: `-f` force / `-e` edit / `-a` annotate / `-s` sign / `-u` sign-as

### Remote (`M` → `magit-remote`)
```
a   add                 r   rename              k   remove
C   configure           p   prune branches      P   prune refspecs
z   unshallow           d u update default branch
```
Switches: `-f` fetch-after-add

### Worktree (`Z` → `magit-worktree`)
```
b   worktree            c   branch and worktree
m   move                k   delete              g   visit
```

### Submodule (`o` → `magit-submodule`)
```
a   add                 r   register            p   populate
u   update              s   synchronize         d   unpopulate
k   remove              l   list                f   fetch all
```
Switches: `-f` force / `-r` recursive / `-N` no-fetch / `-C` checkout-tip / `-R` rebase / `-M` merge / `-U` use-upstream

### Bisect (`B` → `magit-bisect`)
```
Not in progress:   B start   s start script
In progress:       B bad   g good   m mark   k skip   r reset   s run script
```

### Notes (`T` → `magit-notes`)
```
T   edit                r   remove              m   merge
p   prune               c   commit merge        a   abort merge
c   set local notesRef  d   set local display ref
C   set global notesRef D   set global display ref
```
Switches: `-n` dry-run / `-r` ref / `-s` strategy

### Ignore (`i` / `I` → `magit-gitignore`)
```
t   shared .gitignore   s   shared subdir       p   private .git/info/exclude
g   global excludesfile
w   skip-worktree       W   no-skip-worktree
u   assume-unchanged    U   no-assume-unchanged
```

### Run (`!` → `magit-run`)
```
!   git in topdir       p   git in cwd          s   shell in topdir
S   shell in cwd        k   gitk                a   gitk --all
b   gitk --branches     g   git gui             m   git mergetool
```

### File dispatch (`magit-file-dispatch`, often `C-c M-g`)
```
s   stage               u   unstage             x   untrack
r   rename              k   delete              c   checkout
D   diff popup          d   diff                L   log popup
l   log                 t   trace               M   merged
B   blame popup         b   blame               m   blame echo
q   quit blame          p   prev blob           n   next blob
v   goto blob           V   goto file           g   goto status
G   goto magit          e   edit line
```

---

## (b) edamagit (VSCode, git)

Source: `edamagit/package.json` (`contributes.keybindings`) and `edamagit/src/menu/`. Top-level keys are active when `editorTextFocus && editorLangId == 'magit'`. Sub-menu keys are dispatched by edamagit's own quick-pick menu, not VSCode keybindings.

### Status buffer — top level

```
g           refresh                    q           close buffer
TAB         toggle fold
C-j / C-k   next / prev entity
RET         visit at point
s / S       stage / stage all          u / U       unstage / unstage all
a           apply at point             v           reverse at point
k           discard at point
$           process log                ? / -       help
x           reset --mixed              C-u x       reset --hard
```

Top-level prefixes:
```
A   Cherry-pick         b   Branch              B   Bisect
c   Commit              d   Diff                f   Fetch
F   Pull                i   Ignore (local)      I   Ignore (global)
l   Log                 m   Merge               M   Remote
o   Submodule           P   Push                r   Rebase
t   Tag                 V   Revert              X   Reset
y   Show refs           z   Stash               %   Worktree
!   Run
M-x g       magit.status               M-x C-g     magit.dispatch
M-x M-g     magit.file-popup
```

### Commit (`c`)
```
c   Commit              a   Amend               e   Extend
w   Reword              f   Fixup               F   Instant fixup
```
Switches: `-a` all / `-e` allow-empty / `-s` signoff / `-n` no-verify / `-S` gpg-sign

### Branch (`b`)
```
b   Checkout            l   Checkout local      c   Checkout new
s   Spin-off            n   Create new          m   Rename
x   Reset               k   Delete              y   Checkout PR (forge)
```

### Log (`l`)
```
l   Log current         o   Log other           h   Log HEAD
L   Log local branches  b   Log branches        a   Log all refs
```
Switches: `-D` simplify-by-decoration / `-g` graph / `-d` decorate / `-p` first-parent
Options: `=n` limit (default 256)

### Push (`P`)
```
p   To push-remote      u   To upstream         e   Elsewhere
o   Other               T   Push a tag          t   Push all tags
```
Switches: `-f` force-with-lease / `-F` force / `-i` force-if-includes / `-h` no-verify / `-d` dry-run

### Pull (`F`)
```
p   From push-remote    u   From upstream       e   Elsewhere
```
Switches: `-r` rebase

### Fetch (`f`)
```
p   From push-remote    u   From upstream       e   Elsewhere
a   All remotes         o   Another branch      s   Submodules
```
Switches: `-p` prune

### Merge (`m`)
```
Not merging:
  m   Merge             e   Merge + edit msg    n   No-commit
  s   Squash            a   Absorb
While merging:
  m   Commit merge      a   Abort merge
```
Switches: `-f` ff-only / `-n` no-ff / `-v` no-verify

### Rebase (`r`)
```
Not rebasing:
  p   Onto push-remote (if configured)
  u   Onto upstream (if configured)
  e   Onto elsewhere    i   Interactively
While rebasing:
  r   Continue          s   Skip                e   Edit todo
  a   Abort
```
Switches: `-k` keep-empty / `-p` rebase-merges / `-c` committer=author / `-a` autosquash / `-A` autostash / `-i` interactive / `-h` no-verify / `-u` update-refs

### Reset (`X`)
```
m   Mixed               s   Soft                h   Hard
i   Index               w   Worktree
```

### Diff (`d`)
```
r   Range               p   Paths               u   Unstaged
s   Staged              w   Worktree            c   Show commit
t   Show stash
```

### Cherry-pick (`A`)
```
Not picking:   A pick   a apply
While picking: A continue   s skip   a abort
```
Switches: `-e` edit / `-x` reference

### Revert (`V`)
```
Not reverting:   V revert commit(s)   v revert changes
While reverting: V continue   s skip   a abort
```
Switches: `-e` edit (default on) / `-E` no-edit

### Stash (`z`)
```
z   Save                p   Pop                 a   Apply
k   Drop                i   Stash index         w   Stash worktree
x   Save keeping index
```
Switches: `-u` untracked / `-a` all / `-S` staged

### Tag (`t`)
```
t   Create              k   Delete
```
Switches: `-a` annotate / `-f` force

### Remote (`M`)
```
a   Add                 r   Rename              k   Remove
```

### Submodule (`o`)
```
a   Add                 r   Register            p   Populate
u   Update              s   Synchronize         d   Unpopulate
k   Remove              l   List all            f   Fetch all
```
Switches: `-f` force / `-r` recursive / `-N` no-fetch / `-C` checkout / `-R` rebase / `-M` merge / `-U` remote

### Worktree (`%`)
```
b   New worktree from existing branch
c   New branch + worktree
```

### Bisect (`B`)
```
Not bisecting:   s start
While bisecting: g good   b bad   r reset
```

### Ignore (`i` / `I`)
```
l   Locally (.git/info/exclude)
g   Globally (.gitignore)
```

### Run (`!`)
```
!   git subcommand in topdir
p   git subcommand in cwd
```

Commit / rebase-todo editor:
```
C-c C-c     save and close
C-c C-k     abort
```

---

## (c) majutsu (Emacs, jj)

Source: `majutsu-*.el` (`transient-define-prefix` blocks and `define-key` calls on `majutsu-mode-map` / `majutsu-log-mode-map` / `majutsu-diff-mode-map`).

### Status / log buffer — top level

```
RET         visit thing at point       g           refresh buffer
q           bury buffer                $           process buffer
?           dispatch (show all)        C-x m       describe all keys
```

Top-level verbs (most open transients):
```
c   Describe (direct)          C   Commit (direct)
o   New                        e   Edit change (direct)
d   Diff                       r   Rebase
s   Squash                     S   Split
V   Revert                     R   Restore
y   Duplicate                  a   Absorb
k   Abandon                    b   Bookmarks
m   Metaedit                   P   Simplify parents
l   Log (options)              E   Ediff
G   Git                        Z   Workspaces
%   Workspaces (alt)           >   Sparse
C-/ Undo                       C-? Redo
```

Log-mode extras (in `majutsu-log-mode`):
```
n / p       next / prev change         [ / ]       parent / child
O           new (dwim)                 D           diff (dwim)
Y           duplicate (dwim)
B           new (before at point)      A           new (after at point)
w           copy (sub-transient)
```

Diff-mode extras (in `majutsu-diff-mode`):
```
t           toggle hunk refinement
+ / -       more / less context        0           default context
j           jump (diffstat ↔ diff)
```

### Dispatch (`?`)

Re-exposes the same verbs as the top-level — every transient listed below, plus the direct commands (`g`, `q`, `?`, `$`, `c`, `C`, `e`, etc.).

### New (`o`)
```
Selections (toggle at point):     r parent   a after   b before
Selections (input revset):        -r parent  -A after  -B before
Options:                          -m message  -e no-edit
                                  c clear selections
Actions:                          o / RET execute   q quit
```

### Rebase (`r`)
```
Source (toggle):    s source   b branch   r revisions
Source (input):     -s         -b         -r
Destination (tog):  o onto     a after    B before
Destination (in):   -o         -A         -B
                    c clear
Options:            -ke skip-emptied   -kd keep-divergent
Actions:            RET execute   q quit
```

### Bookmark (`b`)
```
l   List                         c   Create
a   Advance bookmark(s)          A   Advance to revset
p   Advance name/pattern         s   Set
m   Move                         M   Move --allow-backwards
r   Rename                       t   Track remote
u   Untrack remote               d   Delete
f   Forget                       q   Quit
```

### Tag (`t`, accessible via dispatch)
```
l   List                         s   Set
m   Move                         d   Delete                q   Quit
```

### Metaedit (`m`)
```
Selection:    -r=revision (default @)
Metadata:     -m message   -a author   -t author-timestamp
Options:      -c update-change-id   -u update-author
              -U update-author-timestamp   -f force-rewrite
Actions:      m / RET execute   q quit
```

### Diff (`d`)
```
Selection (tog):  r revisions   f from   t to
Selection (in):   -r            -f       -t
                  c clear
Paths:            -- limit files
Options:          -W color-words   -g git-style   -S stats   -s summary
                  -c context   -w ignore-ws   -b ignore-space-changes
Actions:          d execute   s save defaults   g refresh   q quit
```

### Squash (`s`)
```
Selection (tog):  r revision   f from   t into   o onto
                  a insert-after   b insert-before
Selection (in):   -r  -f  -t  -o  -A  -B
                  c clear
Patch (if interactive available):
                  hunk / file / region selection   C clear
Paths (else):     -- limit files
Options:          -k keep-emptied
Actions:          s / RET execute   q quit
```

### Split (`S`)
```
Selection (tog):  r revision   o onto   a insert-after   b insert-before
Selection (in):   -r  -o  -A  -B
                  c clear   -m message
Patch (if interactive available):
                  hunk / file / region selection   C clear
Paths (else):     -- limit files
Options:          -i interactive   -p parallel   -e editor   -t tool
Actions:          s / RET execute   q quit
```

### Absorb (`a`)
```
Selection (tog):  f from   t into
Selection (in):   -f  -t
                  c clear
Paths:            -- limit files
Actions:          a / RET execute   q quit
```

### Revert (`V`)
```
Selection (tog):  r revisions          c clear
Selection (in):   -r
Destination (tog): o onto   a insert-after   b insert-before
Destination (in):  -o  -A  -B
Actions:          _ / V / RET execute   q quit
```

### Duplicate (`y`)
```
Source (tog):     r source         c clear
Source (in):      -r
Placement (tog):  o onto   a after   b before
Placement (in):   -o  -A  -B
Actions:          y / RET execute   q quit
```

### Restore (`R`)
```
Selection (tog):  f from   t to   c changes-in
Selection (in):   -f  -t  -c
                  x clear
Patch (if interactive):  hunk / file / region   C clear
Paths (else):     -- limit files
Options:          -i interactive   -d restore-descendants
Actions:          r restore   q quit
```

### Simplify-parents (`P`)
```
Selection (tog):  s source   r revisions   c clear
Selection (in):   -s  -r
Actions:          P / RET execute   q quit
```

### Log (`l`)
```
Revisions:        r set revset   -n limit   -v reverse-order
                  -G hide-graph   R clear revset
Paths:            -- limit filesets
Actions:          g refresh   s set + refresh
                  w save defaults   0 reset options   q quit
```

### Log copy sub-transient (`w` in log mode)
```
s   Copy section value           f   Copy visible field at point
F   Copy entry field (dialog)    h   Copy commit hash
m   Copy visible module at point
```

### Git (`G`)
```
Sync:        p push (transient)   f fetch (transient)
             e export             m import
Remotes:     r manage remotes (transient)   o copy git root
Repository:  c clone (transient)   i init (transient)
                                              q quit
```

Git push transient: `-b bookmark (multi)` … `p push   q quit`
Git fetch transient: standard fetch flags … `f fetch   q quit`
Git remote transient: `l list   a add   r remove   n rename   u set-url   q quit`
Git clone transient: standard flags … `c clone   q quit`
Git init transient: standard flags … `i init   q quit`

### Workspace (`Z` / `%`)
```
View:    l list   v visit   r copy root
Manage:  a add   f forget   n rename   u update stale
```

### Sparse (`>`)
```
Query:    l list patterns
Modify:   s set (add)   S set (replace)   a add   r remove
Advanced: e edit in editor   R reset to all
```

### Ediff (`E`)
Opens Ediff for 2-way / 3-way file diffs (no transient sub-keys; commands available from Ediff itself).

### Section-specific bindings

Within a `jj-commit` section:
```
RET     edit changeset
```
Within a `jj-file` / `jj-hunk` section:
```
RET     visit file
C-j     visit workspace file
C-RET   visit workspace file
```

---

## Notes & caveats

- Magit's `g` is "refresh current buffer"; `G` is "refresh all magit buffers". Edamagit reuses `g` for refresh and has no `G`. Majutsu uses `g` for refresh too (no `G` binding for refresh — `G` is the git transient prefix).
- Magit's `s`/`u` are stage/unstage; edamagit mirrors. Majutsu uses `s` for **squash** (jj has no staging concept).
- Magit's `r` opens the rebase transient. Majutsu's `r` does too. Edamagit's `r` opens its rebase menu but only has a single action (`-s -d`) currently — see `EDA-9` for the variant menu issue.
- Magit's `c` is the commit transient; majutsu's `c` is **direct** describe (one-shot), and `C` is **direct** commit. Edamagit's `c` opens a commit transient. The "magit-style transient for describe" vs "direct invocation" split is intentional in majutsu.
- Magit's `S` is "stage all"; edamagit's `S` is stage-all; majutsu's `S` is **split**. (Same letter, very different semantics.)
- Magit's `k` is discard-at-point; edamagit's `k` is discard-at-point; majutsu's `k` is **abandon**. (Majutsu inherits magit's "kill" mnemonic but the kill-target is a change, not a file.)
- Magit's `a` is apply-at-point; edamagit's `a` is apply-at-point; majutsu's `a` is **absorb**. (Magit `a` ⇒ cherry-pick apply; majutsu's apply analogue is via dispatch / `A` in older versions.)
- Magit's `V` is revert; edamagit's `V` is revert; majutsu's `V` is revert (full agreement here).
- Magit's `b` is branch; edamagit's `b` is branch; majutsu's `b` is **bookmark**. (jj's "bookmark" plays the role of git's "branch", so this is semantic alignment, just different vocab.)
- Magit's `P` is push, `F` is pull, `f` is fetch. Edamagit follows. Majutsu folds push/fetch under `G` (git transient) since jj's first-class verbs aren't push/pull.
- Magit's `o` is submodule; edamagit's `o` is submodule; majutsu's `o` is **new**. (Submodule has no jj analogue.)
- Magit's `l` is log; edamagit's `l` is log; majutsu's `l` is log **options** (the log is the buffer; `l` configures it).
- Magit's `m` is merge; edamagit's `m` is merge; majutsu's `m` is **metaedit** (jj merges are implicit via parents, no merge verb).
- Magit's `t` is tag; edamagit's `t` is tag; majutsu's `t` is **tag** (accessible from dispatch; same letter, same role).
- Magit's `z` is stash; edamagit's `z` is stash. Majutsu has no `z` binding (jj's working-copy-as-commit model makes stash unnecessary).
- Magit's `X` is reset, `x` is reset --mixed. Edamagit follows. Majutsu has no `x`/`X` (jj has no destructive history reset; closest is `edit`/`abandon`).
- Magit's `?` is dispatch. Edamagit's `?` shows VSCode's command palette filtered to magit commands. Majutsu's `?` opens its full dispatch transient.
