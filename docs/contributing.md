# Contributing

How the team works on Bookedz: who owns what, how changes reach `dev`, and what to check before
asking for a merge. Coding agents also follow [AGENTS.md](../AGENTS.md).

## Owners and branches

Remote: `https://github.com/kohkwg/WAD2-Project.git`.

| Owner | Feature | Branch |
| --- | --- | --- |
| Aishani | F1 Discover, profile and recommendations | `aish` |
| Gregory | F2 event creation, RSVP and waitlist | `gregory` |
| Huxley | F3 attendance and check-in; shared UI | `huxley` |
| Denzel | F4 organiser operations (tasks, announcements, budget, weather) | `denzel` |
| Timothy | F5 backend, authentication, database and infrastructure | `tim` |
| Vivienne | F6 venues, floor plans and programme | `vivi` |

`dev` is the integration branch and `main` is not used for feature work. `dev2` and
`integrate/*` are not personal branches. Work only on your own branch, in your own clone: don't
share a live Git checkout between people or between a synchronised Windows/server pair.

The one-time "replace every feature branch with the 24 October design baseline" procedure is
finished. It is kept in Git history (`git show 4932b9e:design-branches.md`) rather than here.
Never reset a branch that holds unmerged work, and never force-push `dev`.

## Making a change

1. Update your branch from `dev` (`git fetch origin` then `git merge origin/dev`), and resolve
   conflicts on your branch.
2. Make the change in your feature's files. Before changing shared files (`App.vue`,
   `NavBar.vue`, `assets/main.css`, `lib/theme.js`, shared status and action components, the
   router, package files or lockfiles), check with Huxley and Denzel.
3. Run the checks for what you changed (see below), then commit only the files you reviewed.
4. Push your branch and send Denzel the branch name, commit, what changed, what you checked and
   any known limits. Denzel opens the pull request into `dev` and merges them one at a time.

## Design rules

[DESIGN.md](design/DESIGN.md) is the single source of truth for colours, fonts, words,
components, motion and accessibility. In short:

- Use the `--bookedz-*` tokens and check both light and dark themes. The theme has two choices, Light and Dark, and it follows the device until someone saves a choice on Profile.
  For the dark look use the soft tokens in `main.css` (`--db-dark-hero`, `--db-dark-edge`,
  `--db-dark-orange`, `--db-dark-teal`), not solid orange or 60% shadows.
- In a component's `<style scoped>`, write dark rules as `:root[data-theme="dark"] .card { … }`.
  Don't wrap only the prefix in `:global(…)`: Vue keeps just the part inside it, so
  `:global(:root[data-theme="dark"]) .card` styles the page root instead of the card. Don't end
  such a rule with `:is(…)` either (Vue then scopes `:root`); list the selectors instead. To make
  a rule truly global, wrap the whole selector: `:global(:root[data-theme="dark"] .card)`.
- For buttons that share a row at equal widths, use `grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr)`. `repeat(auto-fit, minmax(0, 1fr))` sizes the row as if
  each column were 0px wide, so every word of a label adds a line of height.
- Show the event, time, venue and what the person can do before decoration. Use real RSVP,
  capacity and budget values, never invented numbers.
- Motion uses the installed GSAP, Motion for Vue, Lenis and CSS. It responds to the person,
  never hides focused controls or blocks reading, and turns off with reduced motion. Loops stop
  by themselves or can be paused.
- Keep one `main` landmark, 44px touch targets, labels, visible focus, long-text wrapping, and
  drafts, retry and cancel states. Check 375, 575, 768 and 1280px.
- Stay on Vue 3 Composition API, JavaScript, Vue Router and Bootstrap 5: no TypeScript,
  Tailwind, Pinia, JSX, SSR or incidental dependency upgrades. Don't change ranking, waitlist
  scoring, exact cents, ownership/RLS, protected check-in or weather rules while restyling.
- Propose palette or font changes to the team instead of restyling everyone's pages.

## Checks and records

- Run only the checks your change needs; full suites and production builds wait for an
  explicit request. Commands and known limits are in [testing](testing.md).
- Report what you actually ran: widths, themes, reduced motion, screenshots and anything not
  verified. An older full-suite result does not verify a new change.
- Record a human decision in [decisions](decisions.md), dated evidence in [status](status.md),
  and authorship in the [change history](changelog.md). New libraries also go in the README's
  [credits](../README.md#credits-and-licences).
- No secrets or personal data in source, docs or logs. Test data is prefixed `[TEST]` and
  removed afterwards.
