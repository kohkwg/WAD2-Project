# Bookedz: AI Tools and Agent Merge Guide

Prepared 17 October 2026. Reviewed outline approved by Denzel.

Give this Markdown file to the agent helping integrate Bookedz team contributions.
It identifies useful upstream repositories, skill-selection rules, project
adaptations, and integration checks. Assume the receiving agent and repository
have no prior setup. When a user asks an agent to follow this guide, the task
includes configuring missing local agent instructions, skills, and Graphify,
verifying that setup, and then preparing a merge-readiness review. Preserve any
compatible setup already present. This does not authorize application feature
changes, a merge, commit, push, branch creation, deployment, or hosted mutation.

All application paths below are relative to the Bookedz repository root. Locate
the recipient's checkout; do not assume the original author's machine paths.

## 1. Read current project evidence first

Read the current checkout's `AGENTS.md`, `docs/README.md`, `docs/feature4.md`,
`docs/handoff.md`, and `docs/testing.md` when present. Consult
`docs/iteration2-teammate-handoff.md` for unresolved integration contracts.
Read the incoming owners' handoffs as they become available.

Do not assume these files exist on a teammate's branch. If they are missing,
inspect the actual README, package manifests, source layout, tests, and supplied
handoff. Record absent documents and unverified contracts, continue independent
setup, and request the missing handoff when needed for an integration decision.
Do not claim Feature 4 or another owner's code exists merely because this guide
describes it. Create missing repository guidance as directed in the next section.

Current user instructions and repository agreements take precedence over this
dated guide and conflicting third-party skill defaults. Some older local adapters
still describe the original course restrictions or an earlier scaffold. Use the
current `AGENTS.md` and public README's AI disclosure for updated guidance;
do not reintroduce obsolete restrictions or treat a historical test result as a
fresh result on the combined branch.

Feature 4 is a verified local demo with real weather HTTP reads. Hosted
authentication, database persistence, RLS, and multi-user concurrency require
separate integration acceptance. Imported Supabase code/SQL is not evidence that
a hosted system is deployed or correct. No private PDF, graph, or installed skill
is required for a normal clone to build and test.

## 2. Bootstrap a repository and agent that have no setup

Complete this section before the merge-readiness review. It is an instruction to
configure missing local tooling, not merely a list of optional links. Skip each
installation or edit that is already correctly configured. Do not install tools
again, bulk-update skills, replace existing instructions, or change user-global
profiles just to reproduce Denzel's machine layout.

### A. Detect the actual environment

- Identify the repository root and run `git status --short`. Preserve the current
  branch, local modifications, untracked files, and existing configuration.
- Identify the receiving assistant and its supported skill/plugin discovery
  mechanism from its actual runtime. Do not assume it is Codex. Inspect existing
  instructions and project/user skill catalogs before choosing install targets.
- Check Node, pnpm, Python, pipx/uv, Graphify, installed application dependencies,
  and browser tooling only as relevant. Distinguish an installed package from a
  command available on PATH. Use OS-appropriate commands and paths.
- Build a short inventory: present and usable, missing, or conflicting. Use the
  current repository's evidence for versions and scripts; do not invent commands.

### B. Create or extend repository instructions

If root `AGENTS.md` is absent, create it from verified local facts and this guide's
project agreements. If it exists, preserve its content and add only missing,
compatible instructions. Use the host's supported instruction file to point to
the shared guide if the host does not automatically read `AGENTS.md`.

Include the following working agreements, adjusted to the actual checkout:

- The stack is JavaScript, Vue templates, Bootstrap 5, Node 22, and pnpm; verify
  installed versions and preserve existing shared styling/API conventions.
- Record feature ownership, known async interfaces, current demo/live boundaries,
  and the paths of handoffs and verification docs that actually exist.
- Use the task-to-skill table in this document automatically. Read the selected
  SKILL.md before using it and load only relevant supporting references.
- Query a usable local Graphify graph before source browsing, verify located facts
  in source, and update structural graph data after authorized code changes.
- Preserve other contributions. Do not merge, commit, push, create branches,
  deploy, or mutate hosted services without an explicit request for that action.
- Record available verification commands and their limits. Keep secrets and
  Restricted material out of shared files and maintain AI/library attribution.

Merge missing local-tool exclusions into `.gitignore` without replacing existing
rules. Cover the skill/config directories actually created, generated graphs,
private notes, and temporary tool environments. Typical local paths are `.agents/`,
`.codex/`, `.claude/`, `.cursor/`, `graphify-out/`, `.graphifyignore`, and
`docs/local/`. Keep a portable root `AGENTS.md` and public handoffs shareable; do
not blanket-ignore application configuration, Markdown, JSON, or lockfiles.

Configure `.graphifyignore` to exclude dependencies, builds, generated graphs,
installed agent tooling, secrets, and private material not approved for indexing.
Preserve existing compatible rules. Do not upload private course documents to a
semantic backend as an incidental setup action.

### C. Install only missing approved skills for the detected host

Inspect the source repositories in the next section, including their license and
current installation instructions. Prefer project-scoped installation. Preserve
the complete skill folder, including required references, scripts, data, and
licenses; copying SKILL.md alone may leave it unusable. If a plugin is already
available from the host, reuse its skills instead of installing duplicate names.

Ensure the baseline Vue skills are available: `vue-best-practices`,
`vue-router-best-practices`, `vue-debug-guides`, and `vue-testing-best-practices`.
Also configure `frontend-design`, `webapp-testing`, `ui-ux-pro-max`, Graphify, and
the relevant Superpowers review/debugging/verification workflows. Keep their
actual invocation conditional on the task. Add the four conditional Vue skills
only when the owner's existing code or explicit request needs them.

For hosts supported by the [Vercel skills installer](https://github.com/vercel-labs/skills),
the following are project-scoped Codex examples, to run only for missing skills:

```sh
npx skills add vuejs-ai/skills --agent codex --skill vue-best-practices vue-router-best-practices vue-debug-guides vue-testing-best-practices
npx skills add anthropics/skills --agent codex --skill frontend-design webapp-testing
```

First inspect the available skills with the installer's `--list` option. Replace
`codex` with the verified supported target for the actual assistant; do not run
Codex-targeted commands for another host. Select only absent names if some are
already installed. Use a native installer or a reviewed manual project-local
copy if the host does not support this installer. Resolve and record the selected
source revisions and installer versions; do not treat these examples as a request
to upgrade an existing setup.

For a missing UI UX Pro Max installation, its native CLI supports host-specific
setup and a preview. Codex example:

```sh
npx ui-ux-pro-max-cli init --ai codex --dry-run
npx ui-ux-pro-max-cli init --ai codex
```

Inspect the preview, protect existing files, and run the second command only when
the skill is absent and the intended project-local writes are understood. Choose
the actual host's supported `--ai` target. Reuse an available `uipro` installation
instead of downloading a duplicate. Superpowers has host-specific plugin/skill
installation instructions in its repository; follow the receiving host's route.
If that route requires a UI action, report the exact action rather than claiming
the plugin was installed. Do not enable unrelated plugins or agent features.

### D. Apply the Bookedz adaptations and register skill discovery

An upstream installation is not the finished setup. Apply section 5's project
adaptations to newly installed entrypoints and repository instructions. Preserve
original upstream snapshots and licenses, and record local changes and revisions
in a local source manifest. Do not overwrite existing adapted skills with upstream
defaults. Use short trigger descriptions and keep automatic selection enabled
where the host supports it.

In particular, retain JavaScript and Bootstrap, replace Claude-only script paths
with paths resolved from the installed skill, use current package scripts, and
separate test design from browser execution. Do not introduce a second framework
or toolchain just because an upstream example uses it.

Confirm that the host discovers the installed entrypoints. Common project
locations include `.agents/skills/` for Codex and `.claude/skills/` for Claude Code;
verify the current host's supported location rather than assuming all assistants
scan both. If an installer writes elsewhere, register that location or create a
compatible local link. Check the link target and avoid duplicate discovery.
Reload the skill catalog or request the necessary restart if the host requires it.
File existence alone is not proof that automatic skill selection works.

### E. Install and initialize Graphify if missing

Check `graphify --version` first. If unavailable, install the official `graphifyy`
package using an existing isolated tool manager, for example `pipx install
graphifyy` or `uv tool install graphifyy`; the executable is named `graphify`.
Use one method, verify PATH, and avoid modifying system Python. Add optional PDF
support only if approved local PDF indexing is actually needed.

Register the skill for this project and the actual assistant. Codex example:

```sh
graphify install --project --platform codex
```

Inspect supported platform values for another assistant. Preserve existing
instructions/configuration when registering, then verify skill discovery as above.
If `graphify-out/graph.json` is absent, invoke the installed skill to build an
initial graph of the current checkout; do not simply skip initialization because
the graph is missing. Start with local structural/code extraction and record its
coverage. Use the current skill/CLI's supported build flow. Add documentation
semantics through the host agent only when useful and permitted; do not configure
an external backend incidentally. Existing graphs should be checked for freshness
instead of rebuilt unconditionally.

Verify one scoped query against a symbol actually present in the receiving
checkout, and confirm the reported source exists. Keep graph output local/ignored.

### F. Verify setup before proceeding

Check skill metadata and local reference/script paths, run bundled tool `--help`
and one relevant local search, verify Graphify's query, and inspect Git exclusions.
Test task selection on a Vue route review, keyboard-focus review, and README typo:
the first two should select the matching specialists; the typo should not load
frontend/design skills. A generic host can demonstrate this by reading the correct
entrypoint; do not claim automatic discovery if only manual loading works.

Report each tool as **reused**, **installed and configured**, **manually loaded**,
**not needed**, or **blocked**, with verification evidence. Record remaining user
actions such as a restart, missing runtime, or platform permission. Respect the
receiving environment's approval controls; do not bypass them or repeatedly ask
for setup already authorized by the user's request. When installation is genuinely
blocked, explain the concrete blocker and use the documented source-review
fallback for work that can continue. Do not present a partial setup as complete.

Local agent/tool setup may create guidance, ignore rules, installed skills, and
generated graphs. It must not change application business logic, package
dependencies, lockfiles, SQL, or Git branch state. After setup, continue with the
skill routing and merge-readiness workflow below.

## 3. Repositories to inspect

These are upstream sources used in the development environment, not application
dependencies to install wholesale. Inspect the linked repository and relevant
SKILL.md before applying a workflow.

| Repository | Relevant skills or tooling | Evidence and integration role |
| --- | --- | --- |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | `graphify`; query, path, explain, update | Graphify was configured and used for project/source navigation, also recorded in the public README. Use it to locate shared contracts and callers; verify results against source. |
| [vuejs-ai/skills](https://github.com/vuejs-ai/skills) | `vue-best-practices`, `vue-router-best-practices`, `vue-debug-guides`, `vue-testing-best-practices`; conditional skills listed below | Eight skills were installed and adapted locally. This establishes availability, not that every skill authored application code. Use the relevant specialist for Vue integration questions. |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `ui-ux-pro-max`; local design/UX search | Installed, adapted, and search-smoke-tested. Use for focused accessibility, responsive, interaction, color, or chart questions when reconciling screens. |
| [anthropics/skills](https://github.com/anthropics/skills) | `frontend-design`, `webapp-testing` | These two skills were installed and adapted. Use for visual consistency and browser-verification workflows. The rest of the repository was not installed for this frontend setup. |
| [obra/superpowers](https://github.com/obra/superpowers) | `systematic-debugging`, `receiving-code-review`, `requesting-code-review`, `verification-before-completion`, `test-driven-development` | Process skills were used during setup, debugging, validation, and review work in the development session. Use the pertinent workflow; availability is host-dependent. |
| [microsoft/playwright](https://github.com/microsoft/playwright) | Playwright browser automation and the existing `@playwright/test` suite | Confirmed project verification tooling, not itself an AI skill. Use existing browser tests and inspect affected user journeys. It complements the `webapp-testing` skill. |

Do not conflate agent-tool attribution with runtime library attribution. Preserve
the README's detailed AI disclosure and the existing library credits, including
SortableJS and Playwright. Neither this catalog nor an installed skill proves a
feature was implemented or tested.

## 4. How any agent should select and call skills

1. Identify the actual task and available local skills. Select only skills whose
   trigger matches it, read their full entrypoints, and briefly state the selection.
2. Prefer project-adapted entrypoints where present. Load supporting references
   only for the concern being investigated; reuse instructions already read during
   the task instead of repeatedly loading the catalog.
3. Use the host's supported invocation mechanism. In Codex, explicit examples are
   `$graphify`, `$vue-router-best-practices`, `$ui-ux-pro-max`, and
   `$webapp-testing`. Other assistants may use different commands or direct
   SKILL.md loading; a `$` prefix is not a universal shell command.
4. If a selected skill is missing, complete the relevant bootstrap step first.
   Use an equivalent supported workflow only when installation is blocked or the
   host lacks skill support, and state that limitation. Do not pretend an
   invocation occurred, bulk-install unrelated skills, or overwrite adaptations.

| Task or symptom | Skill/workflow to use | Keep scope focused |
| --- | --- | --- |
| Which files share an API, component, or event model? | `graphify` when CLI and graph exist | Query first, then verify located source. Fall back to scoped source search when unavailable or insufficient. |
| Vue templates, props/emits, reactive state, component boundaries | `vue-best-practices` | Load the relevant data-flow/reactivity/SFC reference, not every reference. |
| Route conflicts, changed event IDs, guards, stale reused pages | `vue-router-best-practices` | Check actual dependency versions; add debugging guidance only for an observed symptom. |
| Runtime errors, races, stale responses, warnings | `vue-debug-guides`; `systematic-debugging` for investigation | Reproduce and locate the cause before proposing a fix. |
| Regression/unit/component/E2E test design | `vue-testing-best-practices`; `test-driven-development` for fixes | Test observable contracts; use actual configured runners. |
| Running UI journeys, screenshots, console or request checks | `webapp-testing` with available Playwright tooling | Reuse the project suite/driver; avoid introducing a second browser stack. |
| Visual consistency across teammate pages | `frontend-design` | Preserve the existing theme and Huxley's shared UI decisions; a review is not a redesign request. |
| Focus, accessibility, responsive reflow, specific UX decisions | `ui-ux-pro-max` | Use a narrow search; generate a whole design system only when requested. |
| Reusable value/ref/getter composable contracts | `create-adaptable-composable` | Use only where actual reuse/input flexibility matters. |
| Existing or explicitly requested Options API, Pinia, or Vue JSX work | `vue-options-api-best-practices`, `vue-pinia-best-practices`, or `vue-jsx-best-practices` | Installation does not authorize introducing these technologies. |
| Reviewing a proposed integration or receiving findings | `requesting-code-review` / `receiving-code-review` | Check findings against current source and contracts; do not implement suggestions blindly. |
| Claiming the integrated work is ready | `verification-before-completion` | Fresh evidence from the combined state, with limitations stated. |

A route-only review need not load visual-design skills. A README typo need not
load Vue/browser skills. Use independent reviewers or subagents only when the
host, current instructions, and task support delegation; tools are not prerequisites
for ordinary source review.

## 5. Preserve the project's adaptations

- Use Vue 3 Composition API, JavaScript ES modules, Vue SFC templates, Bootstrap 5,
  and the established CSS/theme. Keep existing API styles during focused changes.
- Use Node 22 and pnpm. Preserve npm lockfiles. Avoid incidental dependency upgrades
  or introducing TypeScript, Tailwind, React, Pinia, JSX, SSR, or new infrastructure.
- Verify version-specific upstream examples. Router guidance originally targeted
  Router 4; this branch declares `vue-router` as `^5.4.0`. Inspect the incoming
  branch, lockfile, installed version, and official documentation before applying
  an API-specific recommendation. Do not downgrade to match a skill example.
- Check current package scripts. `test:unit` now runs Feature 4 Node tests; the
  separate waitlist Vitest spec remains unconfigured. Old local setup notes saying
  there are no test scripts are historical.
- Use native web semantics, visible focus, keyboard controls, readable contrast,
  loading/error feedback, and responsive reflow. Preserve isolated test storage.
- For live-update pages, await observable loaded/data/error states; do not make
  unconditional `networkidle` or arbitrary sleeps the readiness gate.

On the original development machine, adapted skills live in `.agents/skills/`;
Graphify's local entrypoint is in `.codex/skills/graphify/`. They are ignored and
may not exist in another checkout. Optional `sources.json`, licenses, and preserved
upstream snapshots document the original installations. Never copy credentials,
Restricted PDFs, generated graphs, or machine-specific paths into a shared guide.

## 6. Graphify during preparation and conflict resolution

If the CLI and a local graph already exist, use scoped queries such as:

```sh
graphify query "getEventOperations announcements effective venue" --budget 1500
graphify query "saveTaskBoard task status position" --budget 1500
graphify explain "confirmBackupVenueSwitch()"
```

Adapt names to the actual graph vocabulary. For a specific relationship, use
`graphify path "<source node>" "<target node>"` with verified node names.
Treat graph edges as navigation evidence, not proof of compatibility; graphs may
be stale, inferred, incomplete, or missing a teammate's incoming changes.

After authorized code changes, run `graphify update .` when the tool is available.
It updates structural code relationships locally; it does not semantically
refresh changed Markdown/PDF content. Read current prose directly and request a
semantic refresh separately when useful. Keep generated graphs ignored.

If no usable graph exists, complete the Graphify bootstrap above. When a concrete
tool/host restriction blocks initialization, report it and use scoped file/symbol
searches and source inspection. Graphify remains optional for building/testing the
application and does not decide or perform Git conflict resolution.

## 7. Integration workflow and shared contracts

### Prepare without changing branches

Run `git status --short`. Preserve existing/untracked work. Read both sides' handoffs
and identify the target/source branches, shared files, and owner decisions from
available local evidence. Report missing branch data; do not automatically fetch,
checkout, create branches, or start a merge just because this document mentions one.

Prepare a small contract map: changed interface, callers, owner, data shape,
success/failure behavior, and relevant tests. A conflict-free textual merge can
still break these contracts.

| Shared area | What the integrating agent must preserve or reconcile | Coordinate with |
| --- | --- | --- |
| `client/src/utils/api.js` | Existing RSVP exports plus Feature 4 async functions, caller-visible errors, ownership checks, additive data migration, and public/private DTO separation | Denzel, Gregory, Timothy |
| Tasks and workspace | Stable IDs, complete board ordering, status/position saves, per-event drafts, cancellation/retry, focus, and stale-request guards | Denzel |
| Announcements and public event details | Public pre-RSVP feed, paired venue/feed refresh, retained RSVP drafts, automatic-post history, and effective venue consistency | Denzel, Gregory, Aishani |
| Money and budget settings | Exact cents, decimal database mapping, optional positive overall limit, warning thresholds, and the smaller database amount range | Denzel, Timothy |
| Weather and venue switching | Single snapshot per read, forecast validity, coordinate/area handling, one-way eligibility, atomic venue/post change, and reconciliation after uncertain outcomes | Denzel, Timothy, Vivienne, Gregory |
| Router, shell, shared components, styles | Route contracts, navigation reuse, shared theme, keyboard/focus behavior, and mobile layouts | Huxley and affected page owners |
| Auth, Supabase adapter, initial SQL | Real session/RLS acceptance, agreed RPC/data contracts, and preservation of imported initial SQL | Timothy |
| Discovery, check-in, maps/floor plans | Owners' contracts and displays using the effective venue; no invented feature-completion claims | Aishani, Huxley, Vivienne |

### Integrate only when explicitly requested

Use the team's chosen integration strategy after authorization. Read conflicting
changes and their callers; preserve both owners' intended behavior rather than
selecting an entire file from one side by default. Surface incompatible contracts
or new business-policy decisions for owner agreement. Keep fixes narrow and add
regressions for actual behavior conflicts. Do not reset or clean other work.

Feature 4's live direction is browser Supabase SDK/RPC through the existing async
interface. Do not add parallel Express CRUD, privileged browser keys, or silent
demo fallbacks to make an integration appear successful. Agree access, public
reads, settings, money limits, board atomicity, and switch eligibility with Timothy.
Reuse the existing switch transaction and avoid duplicate automatic announcements
after committed writes or failed refreshes. Hosted mutations still need explicit
authorization and approved development records.

## 8. Verify the combined state

Run from the repository root with Node 22. Check current scripts before execution.
When dependency setup is needed, use the existing locked installation:

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
```

Run the relevant focused regressions, then the configured suites and build after
resolving the affected integration paths:

```sh
pnpm --dir client test:unit
pnpm --dir client test:e2e
pnpm --dir client build
git diff --check
```

If the browser is missing, the project's documented one-time setup is
`pnpm --dir client exec playwright install chromium`; treat downloads or sandbox
permissions according to the receiving environment's rules.

The existing Playwright configuration starts/reuses Vite at
`http://127.0.0.1:5173` and isolates storage. The optional Express server exposes
only `http://127.0.0.1:3000/health`; it is not the Feature 4 production backend.
There is no root runner, lint script, or server test script in this checkpoint.

Exercise affected cross-feature journeys, keyboard/focus flows, failure/retry,
changed event IDs, and responsive widths including 375px, the 575px course demo,
tablet, and Bootstrap XL. Reuse test isolation; do not reset a user's browser data.
Run the incoming owners' tests too, once their setup and scope are known.

Report actual outcomes. The recorded 17 October tests are a branch checkpoint,
not a guarantee for an incoming merge. Existing controlled demo/browser tests do
not establish hosted auth, RLS, transactions, live API availability, or production
concurrency. Record those acceptance checks separately.

For a Markdown-only update, check links, anchors, paths, whitespace, and sharing
rules; do not claim application tests were rerun when they were not.

## 9. Report readiness before final Git or hosted actions

Return a concise integration report containing:

1. Reviewed branches/revisions and the exact working-tree scope.
2. Shared contracts and conflicts found, resolutions made, and affected owners.
3. Skills/tools actually used; unavailable tools and equivalent fallbacks.
4. Commands actually run, outcomes, and browser artifacts where applicable.
5. Unresolved owner decisions and separate demo/hosted acceptance gaps.
6. Changed documentation/disclosure and any remaining action needing authorization.

Do not imply that a merge, commit, push, deployment, migration, or hosted write
occurred unless it was explicitly requested and actually completed. A passing
build alone does not mean integration is complete.

## 10. Starter prompt for another agent

> Follow this guide, assuming neither your agent nor this checkout has been
> configured. First inspect the actual host, repository, existing instructions,
> runtimes, and installed skills. Read the available project docs and handoffs;
> record missing documents rather than assuming they exist. Create or extend local
> agent guidance, install only the missing approved skills for this host, apply
> the Bookedz adaptations, configure automatic skill selection, and initialize
> Graphify if absent. Preserve compatible existing setup and verify discovery,
> tool paths, one graph query, and Git exclusions. This request includes that
> missing local agent/tool setup; use the host's normal permission controls and
> report concrete blockers or required UI/restart actions. Then perform a
> merge-readiness review using focused skills and source evidence. Preserve
> JavaScript, Vue templates, Bootstrap 5, Node 22, pnpm, ownership, and async
> contracts. Report setup changes, conflicts, owner decisions, and a verification
> plan. Do not edit application logic/dependencies, change branches, merge, commit,
> push, deploy, or mutate hosted services as part of this preparation task.

This starter authorizes missing local setup followed by review. Replace its scope
with a specific implementation request when the team is ready to integrate.
