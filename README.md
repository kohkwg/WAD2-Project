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

Denzel, Aishani, Gregory, Huxley, Denzel, Timothy, Vivienne

## Tech stack

- **Frontend** (`client/`): Vue 3 (Composition API, JavaScript), Vue Router, Bootstrap 5, Vite.
- **Data store and authentication:** Supabase (PostgreSQL with row-level security, Auth, Realtime,
  an Edge Function), used directly from the browser with the signed-in user's permissions. Event
  images are stored in Cloudflare R2. Demo mode stores sample data in the browser's local storage.
- **API** (`server/`): Express 5 (CommonJS) for recommendations, plan suggestions, signed image
  uploads, account deletion, the OneMap routing proxy and food near events.
- **Tests:** Node's test runner and Playwright.

### External APIs

| API | Used for | How it is integrated | Key needed |
| --- | --- | --- | --- |
| [OneMap](https://www.onemap.gov.sg/) | Map tiles, address search, travel routes | Search runs from the browser; routes go through the Express proxy | Routes only (`ONEMAP_EMAIL`, `ONEMAP_PASSWORD`) |
| [NEA weather on data.gov.sg](https://data.gov.sg/) | Two-hour forecast and rain venue switch | Read from the browser; the `venue-switch` Edge Function checks it again before a switch | No |
| [Geoapify Places](https://www.geoapify.com/) | Food places near an event | Called by Express, with a cache and a daily cap (`GEOAPIFY_DAILY_LIMIT`) | Yes (`GEOAPIFY_API_KEY`) |

Without the optional keys, those features show labelled estimates or let you search and type
places.



## How to test

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
| Go together and friends | `go-together`, `community-friends`, `community-public` |
| Profile, notifications and navigation | `f1-profile-design`, `notifications`, `user-notifications`, `navbar-account`, `sidebar-collapse` |
| Layout at 375, 575, 768 and 1280px | `design-polish` |

**Unit and route tests** run with Node and need no browser or keys:

```bash
(cd client && NODE_ENV=test node --test src/utils/__tests__/*.test.js src/utils/__tests__/waitlistScore.spec.js)
node --test client/tests/*.test.mjs
node --test server/tests/*.test.js
npm --prefix server run check
```

On Windows, use the first command above instead of `pnpm --dir client test:unit`: that script sets
`NODE_ENV` in a way the Windows command prompt does not accept.

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

**Fonts:** [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque),
[DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans) and
[Nunito](https://github.com/googlefonts/nunito), self-hosted under the SIL Open Font License
(licence files beside the fonts in `client/src/assets/fonts/`).

**Maps and data:** map tiles, address search and routes from [OneMap](https://www.onemap.gov.sg/)
© OneMap contributors | Singapore Land Authority, attributed on every map; weather forecasts from
the National Environment Agency via [data.gov.sg](https://data.gov.sg/); nearby places from
[Geoapify](https://www.geoapify.com/).

## AI use

The team used an AI coding assistant for these parts:

- **Feature 4:** the first version of tasks, announcements, budget and weather, and the live
  preparation of Feature 4 and the rain venue switch.
- **Integration:** combining teammates' branches, including the shared API boundary.
- **Frontend redesign:** the shared visual system, navigation and page redesigns (23 October), with
  later changes across pages at team members' requests.
- **Feature 3:** the remaining check-in work, at Huxley's request (23 October).
- **Go together:** the live-mode database migrations (4 November).
- **Later features at team members' requests:** among others, Discover search suggestions, online
  events, hidden venues and notifications (5 November).
- **Tests and documents:** test cases, spec updates, code comments, the code cleanup and much of the
  documentation, including this README.

Each teammate keeps the authorship of their own code.
