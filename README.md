# Dino

SMU IS216 Web Application Development II, group project (G2T5).

Small events in Singapore are hard to find and hard to run. Details sit in chat groups, people
have no one to go with, and organisers juggle separate tools for RSVPs, tasks, budgets and the
weather. Dino puts this in one web app: participants discover events, RSVP, join waitlists,
find people to go with and check in with a ticket; organisers create events, manage RSVPs and run
the day from one workspace.

## Submission details

| Item | Details |
| --- | --- |
| Git repository | <https://github.com/kohkwg/WAD2-Project> (public), branch `main` |
| First page when running | <http://127.0.0.1:5173/> |
| Tests | [How to test](#how-to-test) |
| Use of AI | [AI use](#ai-use) |

Please view the app in Google Chrome. The layouts are built for widths from 375px (phone) to
desktop.

## How the project meets the requirements

| Requirement | How Dino meets it |
| --- | --- |
| Identify and solve a problem | Finding, joining and running small events ([features](#features)) |
| HTML, CSS and JavaScript, with a framework | Vue 3 Composition API, Vue Router and Bootstrap 5 |
| Responsive design | Layouts from phone to desktop, with bottom tabs on phones when signed in |
| Backend data store | Supabase PostgreSQL with row-level security, in live mode |
| User authentication | Supabase Auth, in live mode, with protected routes |
| External public API, called asynchronously | OneMap, NEA weather through data.gov.sg, and Geoapify ([APIs](#external-apis)) |
| End-to-end testing | Playwright specs for the main user journeys ([tests](#how-to-test)) |

## Set up and run

### 1. Install

You need **Node 22** and **pnpm**. From a terminal:

```bash
git clone --branch main https://github.com/kohkwg/WAD2-Project.git
cd WAD2-Project
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir server install --frozen-lockfile --ignore-scripts
```

If you received the submitted zip, skip the clone and run the two install commands in the
unzipped folder.

### 2. Choose a mode

- **Demo mode** needs no keys and no account. Without Supabase settings (or with
  `VITE_USE_MOCK=true`), the app runs on sample data in your browser, signed in as a sample
  account. Use *Reset demo data* in the top bar to start over. Profile editing, check-in, event
  teams and the floor plan need live mode.
- **Live mode** uses the team's hosted Supabase project and shows the backend and sign-in. Copy
  `client/.env.example` to `client/.env` and `server/.env.example` to `server/.env`, then fill them
  in. Only the publishable Supabase key belongs in the client; secret keys stay in `server/.env`.

| File | Variable names |
| --- | --- |
| `client/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_R2_PUBLIC_URL`; optional `VITE_API_URL`, `VITE_USE_MOCK` |
| `server/.env` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`; optional `PORT`, `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`, `GEOAPIFY_API_KEY`, `GEOAPIFY_DAILY_LIMIT` |

### 3. Run

Start the app, then open <http://127.0.0.1:5173/>:

```bash
pnpm --dir client dev
```

The Express API runs on port 3000. Live mode needs it for recommendations, image uploads and food
near events. It reads `server/.env`, so create that file first, then start the API in a second
terminal:

```bash
pnpm --dir server dev
```
### Accounts and passwords

| email | password |
| -- | -- |
| test1@example.com | p@ssw0rd |
| test2@example.com | p@ssw0rd |
| yo@yo.yo | yoyoyoyo |
| mo@mo.mo | momomomo |
| aishani29@gmail.com | aishani29 |


## Features

**For participants**

- **Home:** a landing page with sign-in for visitors. After sign-in it shows an account summary
  with your next event, waitlist offers and saved events.
- **Discover:** search, category shortcuts and filters beside a OneMap street map of real event
  venues, with personalised "picked for you" reasons and saved events. Public: no account needed
  to browse.
- **RSVP:** answer an event's questions, wait for approval where required, join the waitlist and
  accept or decline an offered place before it expires. My RSVPs lists upcoming, saved, past and
  cancelled events.
- **Tickets and check-in:** a QR code and barcode ticket, staff scanning or name search, and
  venue QR self check-in with live updates.
- **Go together:** start a public or friends-only group for an event, invite friends by link,
  chat, and plan food before and after the event from nearby places that are open then.
- **Profile and friends:** interests (which shape recommendations), a dino avatar and the theme
  choice in Profile; friends are found by username in Community.

**For organisers**

- **Create and edit events:** a step-by-step form with OneMap venue search, RSVP questions,
  approval, capacity (shown or hidden), online events and a live preview; edits can be announced.
- **Manage RSVPs:** approve or reject in bulk with undo, manage the waitlist, and see attendance.
- **Run the event:** a task board with drag and drop, public announcements, a budget in exact
  cents with receipt scanning and a 90% warning, NEA weather with a one-way switch to the backup
  venue, a co-organiser team, a floor-plan editor and the programme.

**Everywhere:** light and dark themes (the theme follows the device until you choose one on the
Profile page); layouts from phone to desktop, with bottom tabs on phones when signed in; keyboard
access; and reduced-motion support.

## Team

Denzel, Aishani, Gregory, Huxley, Timothy, Vivienne

## Tech stack

- **Frontend** (`client/`): Vue 3 (Composition API, JavaScript), Vue Router, Bootstrap 5, Vite.
- **Data store and authentication:** Supabase (PostgreSQL with row-level security, Auth, Realtime,
  an Edge Function), used directly from the browser with the signed-in user's permissions. Event
  images are stored in Cloudflare R2. Demo mode stores sample data in the browser's local storage.
- **API** (`server/`): Express 5 (CommonJS) for recommendations, plan suggestions, signed image
  uploads, account deletion, the OneMap routing proxy and food near events.
- **Tests:** Vitest (unit and route tests) and Playwright (end-to-end).

### External APIs

| API | Used for | How it is integrated | Key needed |
| --- | --- | --- | --- |
| [OneMap](https://www.onemap.gov.sg/) | Map tiles, address search, travel routes | Search runs from the browser; routes go through the Express proxy | Routes only (`ONEMAP_EMAIL`, `ONEMAP_PASSWORD`) |
| [NEA weather on data.gov.sg](https://data.gov.sg/) | Two-hour forecast and rain venue switch | Read from the browser; the `venue-switch` Edge Function checks it again before a switch | No |
| [Geoapify Places](https://www.geoapify.com/) | Food places near an event | Called by Express, with a cache and a daily cap (`GEOAPIFY_DAILY_LIMIT`) | Yes (`GEOAPIFY_API_KEY`) |

Without the optional keys, those features show labelled estimates or let you search and type
places.



## How to test

- **End-to-end:** 99 Playwright tests in Chromium on demo data, covering the main user journeys
  from 375px to 1280px.
- **Unit and route:** 419 Vitest tests (265 client, 154 server) for the business rules, data
  adapters and API routes.
- All pass and need no API keys. The commands are below.

Use a POSIX shell such as Git Bash on Windows, from the repository root.

**End-to-end tests** run in Chromium against demo data. They start their own server on port 5173,
so stop any server on that port first: an existing server is reused, and a live-mode one makes the
tests fail.

```bash
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
pnpm --dir client test:e2e e2e/current-app.spec.js
```

The second command runs every spec. The third runs one file. `client/playwright-report/` holds the
HTML report.

| Journey | Specs in `client/e2e/` |
| --- | --- |
| Main journeys, one pass | `current-app` |
| Sign-in and landing page | `signed-out-sign-in`, `landing-page` |
| Discover and search | `immersive-discovery`, `search-suggestions` |
| RSVP, Plans and saved events | `my-rsvps`, `saved-events`, `legacy-review-fixes` |
| Create and organise events | `motion-theme`, `organiser-events`, `manage-event-edit`, `manage-event-navigation`, `event-team`, `event-coorganisers` |
| Tasks, announcements, budget, weather | `feature4`, `feature4-consistency`, `feature4-interactions`, `feature4-public-weather`, `feature4-ux` |
| Floor plan and programme | `feature6` |
| Community | `go-together`, `community-friends`, `community-public` |
| Profile, notifications and navigation | `f1-profile-design`, `notifications`, `user-notifications`, `navbar-account`, `sidebar-collapse` |
| Layout at 375, 575, 768 and 1280px | `design-polish` |

**Unit and route tests** run with [Vitest](https://vitest.dev/) and need no browser or keys. The
client tests always run on demo data, so they never reach the hosted project:

```bash
pnpm --dir client test:unit
pnpm --dir server test
npm --prefix server run check
```

| Command | Covers |
| --- | --- |
| `pnpm --dir client test:unit` | `client/src/utils/__tests__/` and `client/tests/`: data adapters (demo and live), RSVP and waitlist rules, Go together groups, Discover filters and rows, recommendations, saved events, notifications, Feature 4 tools and weather |
| `pnpm --dir server test` | `server/tests/`: recommendations, plan suggestions, food places and opening hours, OneMap routes, uploads and account routes |
| `npm --prefix server run check` | Interest and tag-diversity checks for recommendations |

Add a file path to run one file, for example `pnpm --dir client test:unit tests/event-filters.test.mjs`.

### Database checks

The checks in `server/checks/` apply the SQL migrations to a temporary in-memory PostgreSQL
([PGlite](https://github.com/electric-sql/pglite)) and test the row-level security and database
functions. They never connect to the hosted project. Install PGlite once in a folder outside the
repository, then pass its path:

```bash
mkdir -p /tmp/pglite && npm --prefix /tmp/pglite install @electric-sql/pglite
node server/checks/groups-db.check.mjs /tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js
```

Replace `groups-db` with any other `*.check.mjs` file in `server/checks/`.

### Latest results and known limits

- **End-to-end (6 November 2026):** 99 passed, 0 failed, 0 skipped on a demo server.
- **Unit and route (6 November 2026):** client 265 passed (39 files), server 154 passed (18 files),
  0 failed.
- **Storage:** the R2 bucket is public, so uploaded images are public objects.

## Project structure

```text
client/      Vue app: src/views (pages), src/components, src/router, src/utils (demo and live
             data adapters), src/lib, e2e (Playwright), tests (Node tests)
server/      Express API: routes, services, lib, tests, checks (isolated database checks)
             and scripts
supabase/    SQL migrations, sample-event seed, the venue-switch Edge Function and SQL tests
docs/sql/    SQL for tables the hosted project added outside the migrations (used by the
             database checks)
```

### Pages

| Route | Page | Sign-in needed in live mode |
| --- | --- | --- |
| `/` | Home: sign-in, or the account summary | No |
| `/discover` | Discover (`/events` redirects here) | No |
| `/events/:id/rsvp` | Event details and RSVP | No |
| `/community`, `/groups/:id` | Go together: groups and friends | No |
| `/g/:token` | Group invite link (`/j/:token` redirects here) | Yes |
| `/reset-password` | Password reset from the email link | No |
| `/profile` | Profile: interests, dino, theme | Yes |
| `/my-rsvps` | Plans: your RSVPs, saved and past events | Yes |
| `/organiser/events`, `/organiser/events/new` | Organise: your events, create an event | Yes |
| `/organiser/events/:id/manage` | Manage event: RSVPs, edit, team, announcements, tasks, budget, floor plan, programme, weather, check-in | Yes |
| `/organiser/events/:eventId/floor-plan` | Floor-plan editor (live mode only) | Yes |
| `/events/:eventId/ticket`, `/events/:eventId/check-in` | Your ticket; venue self check-in | Yes |
| `/organiser/events/:eventId/check-in`, `/venue-qr`, `/attendance` | Staff check-in station, venue QR, attendance | Yes |

## Credits and licences

**Libraries**

| Library | Used for | Licence |
| --- | --- | --- |
| [Vue](https://vuejs.org/) and [Vue Router](https://router.vuejs.org/) | App framework and routing | MIT |
| [Bootstrap](https://getbootstrap.com/) | Layout and components | MIT |
| [Supabase JavaScript](https://github.com/supabase/supabase-js) | Database, auth and Realtime client | MIT |
| [axios](https://github.com/axios/axios) | Calls to the Express API | MIT |
| [Leaflet](https://github.com/Leaflet/Leaflet) | Maps | BSD-2-Clause |
| [GSAP](https://gsap.com/) with ScrollTrigger, SplitText and DrawSVG | Entrances, scroll reveals, landing headline | [GSAP Standard License](https://gsap.com/standard-license/) |
| [Motion for Vue](https://motion.dev/docs/vue) (`motion-v`) | Springs on the landing page and its event card | MIT |
| [Lenis](https://github.com/darkroomengineering/lenis) | Smooth scrolling on desktop | MIT |
| [SortableJS](https://github.com/SortableJS/Sortable) | Task board drag and drop | MIT |
| [Konva](https://konvajs.org/) and [vue-konva](https://github.com/konvajs/vue-konva) | Floor-plan editor | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) | Ticket and venue QR codes | MIT |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | Camera check-in scanning | Apache-2.0 |
| [JsBarcode](https://github.com/lindell/JsBarcode) | Ticket barcodes | MIT |
| [Papa Parse](https://github.com/mholt/PapaParse) | Attendance CSV import and export | MIT |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Receipt scanning in the budget | Apache-2.0 |
| [Vite](https://vite.dev/), [@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue) and [vite-plugin-vue-devtools](https://github.com/vuejs/devtools) | Dev server and build | MIT |
| [Express](https://expressjs.com/) and [cors](https://github.com/expressjs/cors) | API server | MIT |
| [nodemon](https://github.com/remy/nodemon) | API restart on change in development | MIT |
| [AWS SDK for JavaScript](https://github.com/aws/aws-sdk-js-v3) | Signed uploads to Cloudflare R2 | Apache-2.0 |
| [Playwright](https://github.com/microsoft/playwright) | Browser tests | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | Unit and route tests | MIT |

**Fonts:** [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque),
[DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans) and
[Nunito](https://github.com/googlefonts/nunito), self-hosted under the SIL Open Font License
(licence files beside the fonts in `client/src/assets/fonts/`).

**Maps and data:** map tiles, address search and routes from [OneMap](https://www.onemap.gov.sg/)
© OneMap contributors | Singapore Land Authority, attributed on every map; weather forecasts from
the National Environment Agency via [data.gov.sg](https://data.gov.sg/); nearby places from
[Geoapify](https://www.geoapify.com/).

## AI use

### Scope of AI assistance

Our team used AI/LLM assistants for supporting tasks during the development
of Dino. The project’s problem definition, solution concept, feature
requirements, application architecture, technology choices, algorithms,
business rules and core implementation were developed by the team.

Our use of AI was limited to the following supporting activities:

- **Information search and learning:** assistance with finding technical
  information and understanding documentation, terminology and error
  messages. The team evaluated this information and decided how to apply
  it to the project.
- **UI/UX inspiration:** exploration of visual references, layouts, themes,
  colour choices and responsive presentation. The team determined the
  final designs, user journeys and interaction behaviour.
- **Boilerplate and illustrative snippets:** assistance with generic
  starter code and small examples that did not implement the application’s
  main business logic, backend endpoints or critical frontend interactions.
- **Debugging explanations:** explanations of coding errors and suggestions
  for areas to investigate. The team diagnosed the underlying problems,
  selected solutions and implemented fixes for major implementation issues.
- **Testing support:** assistance with drafting test cases, sample inputs,
  mock data and edge-case suggestions. The team determined the expected
  behaviour, reviewed the assertions, ran the tests and investigated failures.
- **Documentation:** assistance with drafting, organising and proofreading
  setup instructions, feature descriptions, code comments and this README,
  including this AI declaration. The team checked the final wording against
  the application and its actual use of AI.

### Team-developed features and implementation

The team designed and implemented Dino’s core functionality, including:

| Area | Team contribution |
| --- | --- |
| Event discovery and recommendations | Event search and filtering, map-based discovery, saved events, recommendation scoring, ranking, diversity and explanations. |
| Event creation and management | Event creation and editing workflows, venue selection, online events, RSVP questions, approval settings, capacity and visibility rules. |
| RSVPs and waitlists | RSVP processing, approval and rejection, capacity handling, waitlist priority scoring, place offers and offer expiry. |
| Tickets and attendance | QR and barcode ticket workflows, staff scanning, attendee lookup, venue self check-in and attendance tracking. |
| Go together and community | Public and friends-only groups, invitations, friendships, group chat, and planning food and activities around events. |
| Event operations | Task management, announcements, budget calculations and warnings, receipt-processing workflows, weather checks and backup-venue switching. |
| Floor plans and programme | Floor-plan editing behaviour, object placement and manipulation, and event programme management. |
| Accounts and data integration | Authentication flows, profiles, access control, database structures and policies, backend endpoints, external API integration and image-upload workflows. |
| Shared application behaviour | Navigation, application state, responsive interactions, accessibility behaviour, themes and notifications. |

For these features, the team independently determined the requirements,
designed the logic and algorithms, wrote the core implementation, and
resolved the substantive implementation problems.

Third-party frameworks, libraries and services are credited separately in
the “Tech stack”, “External APIs” and “Credits and licences” sections. Our
claim of authorship concerns our application-specific design and code;
we do not claim authorship of those third-party technologies.

### Parts relying solely on AI/LLM

No core application feature, algorithm, business rule, backend endpoint or
critical frontend interaction was implemented solely by AI/LLM. No final
submitted component was accepted solely on the basis of an AI response
without team review and verification.

AI-generated supporting material, including draft documentation, generic
boilerplate, test suggestions and sample data, was reviewed and, where
necessary, revised by the team before inclusion.
