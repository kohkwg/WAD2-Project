# Bookedz

Bookedz (shown in the app as **Dino**) is a web app for finding things to do in Singapore, going
with friends, and running small events. Participants discover events, RSVP, join waitlists and
check in with a ticket; organisers create events, manage RSVPs and run the day from one
workspace.

SMU IS216 Web Application Development II, group project (G2).

## Features

**For participants**

- **Discover:** search, category shortcuts and filters beside a OneMap street map of real event
  venues, with personalised "picked for you" reasons and saved events. Public: no account needed
  to browse.
- **RSVP:** answer an event's questions, wait for approval where required, join the waitlist and
  accept or decline an offered place before it expires. My RSVPs lists upcoming, saved, past and
  cancelled events.
- **Tickets and check-in:** a QR code and barcode ticket, staff scanning or name search, and
  venue QR self check-in with live updates.
- **Go together:** start a public or friends-only group for an event, invite friends by link,
  chat, and plan food before and after the event from nearby deals and places.
- **Profile and friends:** interests (which shape recommendations) and a dino avatar in
  Profile; friends are found by username in Community.

**For organisers**

- **Create and edit events:** a step-by-step form with OneMap venue search, RSVP questions,
  approval, capacity (shown or hidden), online events and a live preview; edits can be announced.
- **Manage RSVPs:** approve or reject in bulk with undo, manage the waitlist, and see attendance.
- **Run the event:** a task board with drag and drop, public announcements, a budget in exact
  cents with receipt scanning and a 90% warning, NEA weather with a one-way switch to the backup
  venue, a co-organiser team, a floor-plan editor and the programme.

**Everywhere:** light, dark and system themes; layouts from phone to desktop; keyboard access;
and reduced-motion support.

## Team

| Member | Feature |
| --- | --- |
| Aishani | F1 Discover, profile and recommendations |
| Gregory | F2 event creation, RSVP and waitlist |
| Huxley | F3 attendance and check-in; shared UI; Go together |
| Denzel | F4 organiser operations: tasks, announcements, budget and weather |
| Timothy | F5 backend, authentication, database and infrastructure |
| Vivienne | F6 venues, floor plans and programme |

## Tech stack

- **Frontend** (`client/`): Vue 3 (Composition API, JavaScript), Vue Router, Bootstrap 5, Vite.
- **Data and auth:** Supabase (PostgreSQL with row-level security, Auth, Realtime, an Edge
  Function), used directly from the browser with the signed-in user's permissions.
- **API** (`server/`): Express 5 for recommendations, signed image uploads to Cloudflare R2, the
  OneMap routing proxy and food near events.
- **Food deals pipeline** (`pipeline/`): Python; optional, feeds Go together's planner.
- **Tests:** Node's test runner and Playwright.

## Getting started

You need **Node 22** and **pnpm**. Python 3.13 is only needed for the optional food pipeline.

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir server install --frozen-lockfile --ignore-scripts
pnpm --dir client dev
```

Open <http://localhost:5173/>. The Express API is only needed for recommendations, image
uploads and food near events; start it in a second terminal:

```sh
pnpm --dir server dev
```

### Demo mode and live mode

- **Demo mode** needs no keys. Without Supabase settings (or with `VITE_USE_MOCK=true`), the app
  runs on sample data stored in your browser, signed in as a sample account. Use *Reset demo
  data* in the top bar to start over.
- **Live mode** uses the team's Supabase project. Copy `client/.env.example` to `client/.env`
  and `server/.env.example` to `server/.env`, and fill them in with the values the team shares
  privately. Only the publishable Supabase key belongs in the client; secret keys stay in
  `server/.env`.

Optional server keys: OneMap (live travel routes), Geoapify (places near events) and Gemini or
Telegram (the deals pipeline, see [pipeline/README.md](pipeline/README.md)). Without them those
features fall back to labelled estimates or typed places.

## Testing

```sh
cd client && NODE_ENV=test node --test src/utils/__tests__/*.test.js
VITE_USE_MOCK=true pnpm exec playwright test e2e/landing-page.spec.js
```

The commands use a POSIX shell (macOS, Linux or Git Bash on Windows).

Browser tests should run against a demo server you own. [docs/testing.md](docs/testing.md) has
every command, the live-mode tests, database checks and known limits; [docs/status.md](docs/status.md)
records what has been verified and when.

## Project structure

```text
client/      Vue app: src/views (pages), src/components, src/utils (demo and live data adapters),
             e2e (Playwright), e2e-live (tests against the hosted project)
server/      Express API: routes, services, tests and isolated database checks
supabase/    SQL migrations, the venue-switch Edge Function and SQL tests
pipeline/    Python food-deals pipeline used by Go together
docs/        Project documentation (below)
AGENTS.md    Rules for AI coding agents working in this repository
```

## Documentation

| Document | What it covers |
| --- | --- |
| [Design](docs/design/DESIGN.md) | How the app looks, reads and behaves: tokens, components, pages, motion, accessibility |
| [Status](docs/status.md) | What has been delivered and how it was checked, newest first |
| [Decisions](docs/decisions.md) | Who decided what, and the technical contracts |
| [Testing](docs/testing.md) | Commands, environments, live tests and known limits |
| [Change history](docs/changelog.md) | What changed, who requested it and who wrote it |
| [Contributing](docs/contributing.md) | Owners, branches, pull requests and design rules |
| [Recommendation design](docs/recommendation-design.md) | How recommendations are scored |
| [Asset register](docs/design/assets.md) | Where images, fonts and map data came from |

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
| [Motion for Vue](https://motion.dev/docs/vue) (`motion-v`) | Springs, map previews, landing card | MIT |
| [Lenis](https://github.com/darkroomengineering/lenis) | Smooth scrolling on desktop | MIT |
| [SortableJS](https://github.com/SortableJS/Sortable) | Task board drag and drop | MIT |
| [Konva](https://konvajs.org/) and [vue-konva](https://github.com/konvajs/vue-konva) | Floor-plan editor | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) | Ticket and venue QR codes | MIT |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | Camera check-in scanning | Apache-2.0 |
| [JsBarcode](https://github.com/lindell/JsBarcode) | Ticket barcodes | MIT |
| [Papa Parse](https://github.com/mholt/PapaParse) | Attendance CSV import and export | MIT |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Receipt scanning in the budget | Apache-2.0 |
| [Express](https://expressjs.com/) and [cors](https://github.com/expressjs/cors) | API server | MIT |
| [AWS SDK for JavaScript](https://github.com/aws/aws-sdk-js-v3) | Signed uploads to Cloudflare R2 | Apache-2.0 |
| [Playwright](https://github.com/microsoft/playwright) | Browser tests | Apache-2.0 |

**Fonts:** [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque),
[DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans) and
[Nunito](https://github.com/googlefonts/nunito), self-hosted under the SIL Open Font License
(licence files beside the fonts in `client/src/assets/fonts/`).

**Maps and data:** map tiles, address search and routes from [OneMap](https://www.onemap.gov.sg/)
© OneMap contributors | Singapore Land Authority, attributed on every map; weather forecasts from
the National Environment Agency via [data.gov.sg](https://data.gov.sg/); nearby places from
[Geoapify](https://www.geoapify.com/); coastline data from
[Natural Earth](https://www.naturalearthdata.com/) (public domain).

**Images:** the Singapore illustrations, brand marks and their edits are recorded with their
sources and prompts in the [asset register](docs/design/assets.md). The dino character art in
`client/src/assets/dinos/` and `client/src/assets/brand/` was added by Vivienne; its source is
not yet recorded in the asset register.

**AI assistance:** parts of this project were written with an AI coding assistant at team
members' requests. The [change history](docs/changelog.md) records which work that was, who
asked for it and who reviewed it; each teammate keeps the authorship of their own code.
