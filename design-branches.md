# Feature design branches: shared dev baseline

Denzel's workflow, 24 October 2026. Each teammate replaces **only their own**
feature branch with one published `dev` commit, works on their feature UI/UX, and
pushes that feature branch. Denzel later creates/reviews PRs **into `dev`** and
merges them sequentially. Nobody merges into `main` as part of this process.

The one-time replacement rewrites the feature branch. It is appropriate only
after preserving existing work and confirming the branch owner agrees to replace
it. It does not authorise resetting `dev`, another person's branch, or a shared
checkout. Existing feature PRs may change when their branch is rewritten; flag
those to Denzel before proceeding rather than closing or merging them yourself.

## Read first and coordinate ownership

Read [AGENTS.md](AGENTS.md), [README](README.md), [decisions](decisions.md),
[status](status.md), [testing](docs/testing.md), [design system](docs/design/design-system.md)
and [design review](docs/design/design-review.md). Local agent skills and original
materials in `docs/resources/` are optional and are not normal-clone dependencies.

Verified remote: `https://github.com/kohkwg/WAD2-Project.git`.

| Owner | Only branch to replace/work on | UI scope |
| --- | --- | --- |
| Aishani | `aish` | Discover, profile, recommendations presentation (F1) |
| Gregory | `gregory` | Creation, public RSVP, My RSVPs, registration/waitlist management presentation (F2) |
| Huxley | `huxley` | Attendance/check-in/tickets and shared UI coordination (F3) |
| Denzel | `denzel` | Manage Event, tasks, announcements, budget and weather (F4) |
| Timothy | `tim` | Authentication presentation and backend/infrastructure coordination (F5) |
| Vivienne | `vivi` | Floor plans, venue/programme/team placement presentation (F6) |

`dev`, `dev2`, `main` and `integrate/*` are **not** personal design branches.
Do not invent a branch name from a teammate's full name. The names above are the
actual remote names. If a branch disappears or ownership is unclear, stop.

Each teammate should use their own clone/working directory. Do not share a live
Git checkout across people, or run Git simultaneously on a Windows/server pair
whose `.git` directory is synchronised. Finish/stop Git activity on the other copy
first; a separate clone is preferable for concurrent work.

## 1. Denzel publishes and announces the baseline

This preparation happens on `dev`, before any teammate resets a branch:

```sh
git branch --show-current
git status --short
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/dev
```

The branch must be `dev`. Review local changes and the ignore/secret/resource
checks before staging. If remote work is ahead/divergent, preserve local work and
integrate it; **never force-push `dev`**. Commit the reviewed source/assets/docs,
then publish with a normal push:

```sh
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m "Publish shared frontend design baseline"
git push origin dev
git rev-parse HEAD
git ls-remote origin refs/heads/dev
```

The two hashes must match. Denzel sends that **full commit SHA** to everyone as
`DEV_BASELINE_SHA`. It is supplied in the kickoff message, not embedded in this
file: a commit cannot contain its own final hash. Freeze this published baseline
until everyone has completed the one-time replacement. A later PR merge is not
a new invitation to reset branches.

## Getting this guide from an older branch

The old personal branch may not contain this file yet. Fetch and read the version
on `origin/dev` without copying it into the working tree:

```sh
git fetch origin --prune
git show origin/dev:design-branches.md
git show origin/dev:AGENTS.md
git show origin/dev:docs/design/design-system.md
```

Read the other linked files with the same `git show origin/dev:<path>` syntax.
After replacement they will be ordinary files in your working tree. Do not check
out individual dev files over unpreserved local changes just to read them.

## 2. Each teammate prepares their own branch

These instructions are for PowerShell (including Windows PowerShell). Run from
your own repository root. The helper stops immediately on a failed Git command;
PowerShell normally does not stop just because a native command returns an error.
Do not paste the entire guide at once. Inspect each stage before proceeding.

```powershell
function gitc {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw "Git failed; stop and inspect the output." }
}

# Change these two values only, using the ownership table and Denzel's message.
$FeatureBranch = 'aish'
$Baseline = '<DEV_BASELINE_SHA_FROM_DENZEL>'

$AllowedBranches = @('aish', 'gregory', 'huxley', 'denzel', 'tim', 'vivi')
if ($FeatureBranch -notin $AllowedBranches) { throw 'Not an approved personal branch.' }
if ($Baseline -notmatch '^[0-9a-fA-F]{40}$') { throw 'Paste the full baseline commit SHA.' }
gitc rev-parse --show-toplevel
gitc remote get-url origin
gitc status --short
gitc branch --show-current
```

Check that `origin` is the repository above (its equivalent SSH URL is fine).
Your human must confirm `$FeatureBranch` is **their** branch; membership in the
list alone does not establish ownership. If another worktree has it checked out,
use that worktree or coordinate with its owner; never force-detach it.

If there are changes, **do not reset or switch yet**. Preserve them on the current
branch with a local stash, or make a reviewed WIP commit before continuing:

```powershell
# Only if status showed changes; includes untracked files, not ignored secrets.
gitc stash push --include-untracked -m 'Before shared design baseline'
gitc stash list
gitc status --short
```

Keep that stash until its owner has inspected/recovered what matters. Do not
blindly pop it onto the new design: that may reintroduce the old UI. Ignored `.env`
and sessions remain local; do not run `git clean`. A stash is local-only, so retain
this clone until any recovery is complete.

Fetch, verify the baseline is still the published dev tip, and switch to your own
branch. For an existing local branch:

```powershell
if (@(gitc status --porcelain).Count -ne 0) { throw 'Working tree must be clean.' }
gitc fetch origin --prune
$DevTip = (gitc rev-parse refs/remotes/origin/dev).Trim()
if ($DevTip -ne $Baseline) { throw 'dev changed; ask Denzel which baseline to use.' }
gitc cat-file -e "${Baseline}^{commit}"
gitc switch $FeatureBranch
$Current = (gitc branch --show-current).Trim()
if ($Current -ne $FeatureBranch) { throw 'Wrong branch; do not continue.' }
if (@(gitc status --porcelain).Count -ne 0) { throw 'Working tree must be clean.' }
```

If the local branch does **not** exist, use this **instead of** the `gitc switch`
line above, then run the same branch/status checks:

```powershell
gitc switch --track -c $FeatureBranch "origin/$FeatureBranch"
```

Do not create a differently named fallback branch or switch to `dev` to bypass a
failure. `git status` must be clean before backup/reset. If you used a WIP commit,
it will be protected by the local-tip backup below.

## 3. Back up both tips, then replace your branch once

Run only after the branch owner has explicitly agreed to the replacement. These
commands are for that owner's branch only. The local and remote tips can differ;
backing up just one can lose the other person's commits.

```powershell
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LocalBackup = "backup/design-baseline/$FeatureBranch/$Stamp-local"
$RemoteBackup = "backup/design-baseline/$FeatureBranch/$Stamp-remote"
$ExpectedRemote = (gitc rev-parse "refs/remotes/origin/$FeatureBranch").Trim()
$Current = (gitc branch --show-current).Trim()
if ($Current -ne $FeatureBranch) { throw 'Wrong branch.' }
if (@(gitc status --porcelain).Count -ne 0) { throw 'Unpreserved work; stop.' }

# Protect the existing local history, then the fetched remote history.
gitc branch $LocalBackup HEAD
gitc push origin "refs/heads/${LocalBackup}:refs/heads/${LocalBackup}"
gitc push origin "refs/remotes/origin/${FeatureBranch}:refs/heads/${RemoteBackup}"

# STOP if either backup push fails. Never replace a branch without its backups.
gitc reset --hard $Baseline
$Actual = (gitc rev-parse HEAD).Trim()
if ($Actual -ne $Baseline) { throw 'Baseline mismatch.' }

# The explicit expected SHA rejects a push if somebody changed the remote tip.
gitc push "--force-with-lease=refs/heads/${FeatureBranch}:${ExpectedRemote}" origin "HEAD:refs/heads/${FeatureBranch}"
gitc fetch origin
$Published = (gitc rev-parse "refs/remotes/origin/$FeatureBranch").Trim()
if ($Published -ne $Baseline) { throw 'Remote branch does not match the baseline.' }
gitc branch --set-upstream-to="origin/$FeatureBranch" $FeatureBranch
gitc status --short
```

A rejected lease means the remote changed. **Stop. Do not replace the expected SHA
with the new tip and retry blindly.** Fetch/review that work with its author and
Denzel, back it up, and agree on the next action. If branch protection rejects the
rewrite, stop and coordinate an approved alternative; do not disable protection.
Never use plain `--force`, and never run this force-with-lease command against
`dev`, `main`, or another teammate's branch.

This is the **only** reset/rewrite in the workflow. Record the baseline SHA and
both backup names in your handoff to your human. Denzel can now verify all six
remote tips point to the same baseline. Backups are retained until integration is
accepted; no cleanup/deletion is part of these instructions.

### Bash/Linux agents: equivalent one-time replacement

Use this **instead of**, not after, the PowerShell backup/reset block. First read
all safeguards above, preserve dirty/untracked work with the stash command from
step 2 (`git stash push --include-untracked -m 'Before shared design baseline'`
in Bash), verify the remote/owner, and replace both variables. This script aborts on
errors. It creates both durable backups before resetting only your personal branch.

```bash
set -euo pipefail
FEATURE_BRANCH='aish'
BASELINE='<DEV_BASELINE_SHA_FROM_DENZEL>'
case "$FEATURE_BRANCH" in aish|gregory|huxley|denzel|tim|vivi) ;; *) exit 1 ;; esac
[[ "$BASELINE" =~ ^[0-9a-fA-F]{40}$ ]]
test -z "$(git status --porcelain)"
git fetch origin --prune
test "$(git rev-parse refs/remotes/origin/dev)" = "$BASELINE"
git cat-file -e "${BASELINE}^{commit}"
if git show-ref --verify --quiet "refs/heads/$FEATURE_BRANCH"; then
    git switch "$FEATURE_BRANCH"
else
    git switch --track -c "$FEATURE_BRANCH" "origin/$FEATURE_BRANCH"
fi
test "$(git branch --show-current)" = "$FEATURE_BRANCH"
test -z "$(git status --porcelain)"
EXPECTED_REMOTE=$(git rev-parse "refs/remotes/origin/$FEATURE_BRANCH")
STAMP=$(date +%Y%m%d-%H%M%S)
LOCAL_BACKUP="backup/design-baseline/$FEATURE_BRANCH/$STAMP-local"
REMOTE_BACKUP="backup/design-baseline/$FEATURE_BRANCH/$STAMP-remote"
git branch "$LOCAL_BACKUP" HEAD
git push origin "refs/heads/${LOCAL_BACKUP}:refs/heads/${LOCAL_BACKUP}"
git push origin "refs/remotes/origin/${FEATURE_BRANCH}:refs/heads/${REMOTE_BACKUP}"
git reset --hard "$BASELINE"
test "$(git rev-parse HEAD)" = "$BASELINE"
git push "--force-with-lease=refs/heads/${FEATURE_BRANCH}:${EXPECTED_REMOTE}" origin "HEAD:refs/heads/${FEATURE_BRANCH}"
git fetch origin
test "$(git rev-parse "refs/remotes/origin/$FEATURE_BRANCH")" = "$BASELINE"
git branch --set-upstream-to="origin/$FEATURE_BRANCH" "$FEATURE_BRANCH"
git status --short
```

The same stop-on-backup/lease/protection failure rules apply. In later Bash
commands, use `$FEATURE_BRANCH` instead of the PowerShell `$FeatureBranch` variable.
Do not run the reset block again once feature work begins.

## 4. Install and work on your feature UI

From the root, with Node 22 and pnpm:

```powershell
gitc branch --show-current
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir server install --frozen-lockfile --ignore-scripts
pnpm --dir client dev
# A separate terminal, only when recommendations/uploads are needed:
pnpm --dir server dev
```

Agents must check each pnpm command's exit code and stop on failure. Use the
examples to create local `.env` files with values supplied privately by the team;
never commit credentials. Original private PDFs, raw artwork, Graphify outputs
and local skill folders are unnecessary for installation/building. Runtime art,
fonts/licences and shareable design documentation are in Git.

Before every work session, check `git branch --show-current` and `git status --short`.
You must still be on your own branch. Make focused changes to your feature and
preserve backend/API contracts. Commit and push only reviewed changes:

```powershell
gitc diff --check
gitc status --short
# Stage explicit reviewed paths for your feature, not unrelated concurrent work.
# Example for Gregory; replace with your actual reviewed files:
gitc add client/src/views/CreateEventView.vue
gitc diff --cached --stat
gitc diff --cached --check
gitc commit -m 'Refine event creation UI'
gitc push origin "HEAD:refs/heads/${FeatureBranch}"
```

Do not reset to dev again after starting work. If Denzel asks you to incorporate
new dev changes, merge them **into your own branch**, resolving conflicts there:

```powershell
gitc fetch origin
gitc switch $FeatureBranch
gitc merge origin/dev
# Resolve conflicts in your feature branch; inspect, stage, and commit resolutions.
gitc push origin "HEAD:refs/heads/${FeatureBranch}"
```

Do not rebase or force-push shared feature history after the initial replacement
without its owner's explicit approval. Do not run database migrations, deploy,
reset shared events, create PRs or merge dev/main just because this guide exists.

## 5. Shared design guidelines

The current design direction is the baseline, not a ban on improvement. Refine
layout, motion, hierarchy and responsive behaviour within it. Propose a global
palette/font change to the team first rather than silently restyling six features.

- **Typography:** retain self-hosted Bricolage Grotesque for headings/wordmark and
  DM Sans for body, labels, forms and navigation. Prefer size/weight/line-length
  improvements to adding a third family. Keep readable body text and balanced heads.
- **Palette:** use `--bookedz-*` semantic tokens. Light canvas/surface/ink are
  `#fff8ec` / `#fffdfa` / `#34334a`; dark are `#141b22` / `#1e2932` / `#f3eee4`.
  Coral action is `#aa3e2c` in light and `#ffad97` in dark; use
  `--bookedz-on-action` for its text. Check both themes rather than hard-coding white.
- **Theme:** preserve System/Light/Dark defaults, persistence and native control
  colour schemes. Don't force one feature to light mode. Map/cover artwork retains
  its own colours; editor canvas content need not be recoloured as UI chrome.
- **Components:** prefer existing Bootstrap/project components and ticket-like
  `.event-cta` actions. Status badges are labelled status, not pretend buttons.
  Avoid duplicate buttons, decorative dashboards and extra card-within-card layers.
- **Hierarchy:** show event/title/time/venue and actionable state before decoration.
  Keep public details readable; organiser tools should make the next task obvious.
  Use actual RSVP/capacity/budget values, never fabricated metrics or simulated guests.
- **Motion:** use existing GSAP/ScrollTrigger, Motion for Vue and CSS. Animate
  transforms/opacity, respond to actions and avoid simultaneous competing effects.
  Preserve pause controls, offscreen/tab pausing, reduced motion and keyboard access.
  Scroll reveals must not hide focused controls or block reading/submission.
- **Layout/accessibility:** preserve one shell-owned main, 44px touch targets,
  labels, visible focus, long-content wrapping, drafts/retry/cancel states, status
  announcements and responsive reflow. Check affected layouts at 375/575/768/1280px.
- **Scope:** Vue Composition API, JS templates, Router and Bootstrap remain. No
  incidental dependency upgrades, Tailwind/TypeScript/Pinia/SSR introduction, schema
  change or API rewrite during feature styling. Do not change ranking, waitlist,
  exact cents, ownership/RLS, protected check-in or trusted weather semantics.

Coordinate edits to `App.vue`, `NavBar.vue`, `assets/main.css`, `lib/theme.js`,
shared status/action components, router and package/lockfiles with Huxley and Denzel
before changing them. F1 owns discovery visuals, but its shared theme/motion effects
still need coordination. Prefer scoped feature styles using existing tokens.

## 6. Evidence and handoff, then Denzel's PRs

Run only relevant checks for your changes; full suites and production builds wait
for explicit instruction. Follow [testing](docs/testing.md) for exact commands.
Report what you actually ran, viewport/theme/motion states, screenshots, remaining
limits and any shared-file conflicts. Update feature-relevant status/design notes
and preserve README's detailed teammate/AI/library disclosure. Do not claim an
older full-suite checkpoint verifies your new changes.

Each teammate sends Denzel: branch name, final pushed SHA, baseline SHA, changed
features/shared files, check results, screenshots and known limits. Denzel creates
PRs with **base `dev`, compare that teammate's branch**; nobody opens PRs into main
for this round. Keep each PR scoped. Review shared components/theme/lockfiles
explicitly, preserve the newer intended behaviour when resolving conflicts, and
merge one PR at a time with checks appropriate to the combined result.

After merging, later PRs may need a merge from `origin/dev` into their feature
branch (step 4). Never reset a feature branch containing unmerged work. Do not
reset all branches again after each PR. Keep backups until the combined dev is
accepted; an ordinary feature push after baseline setup never needs a force push.

## Agent starter message for each teammate

> Read design-branches.md and the linked project/design/testing docs. I own
> `<name>` / branch `<exact branch>`. Denzel's published DEV_BASELINE_SHA is
> `<full 40-character SHA>`. Preserve all local and remote work using the guide's
> backups before the one-time replacement. Do not touch dev/main or another
> person's branch. After baseline verification, implement UI/UX improvements only
> for my feature, following the shared fonts/colours/theme/motion guidance. Run
> necessary targeted checks, update relevant docs and push my reviewed changes to
> my branch. Stop on branch mismatches, dirty/unpreserved work, backup/lease
> failures, protection rejection or unexpected remote changes. Leave PR creation
> and merging to Denzel.
