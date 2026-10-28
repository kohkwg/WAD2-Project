# Ideation & Implementation Plan — OpenJio

> Living document. Update the changelog whenever a decision changes.
> ✅ = decided with the team · ❓ = open question (see §12). Nothing here is assumed beyond what is marked.

## 0. Changelog

| Date | Change | Who |
|---|---|---|
| 26 Oct 2026 | Initial ideation doc on branch `revamp/ideate` | Huxley |
| 28 Oct 2026 | Product name set to **OpenJio** ✅; build order added (§11) | Huxley |
| 28 Oct 2026 | Step 1 foundation on `revamp/foundation`: dev app ported, floor plan removed, planning schema + demo seed, placeholder hangout pages, algorithm stubs (A1–A5) | Huxley |

---

## 1. Problem statement

**One-liner (course format):**
> Our app helps **Singapore friend groups and solo explorers** to **plan an outing end-to-end in one place** — when everyone is free, what to do, where to eat with live deals, and where to meet — because it **merges calendars, scraped events/deals and maps into one auto-generated itinerary**.

### Pain points

**People looking for something to do**
- Information is scattered across many sources (sites, Telegram channels, Instagram).
- Constant switching between calendar (free slots), maps (convenient location) and deal channels.
- Deals rarely make clear *which outlet* has the deal and *what days/times* it's valid.
- Searching manually by own interests.
- Indecision: "we're free to hang out but don't know where to go."
- Aligning everyone's calendars is painful.

**People hosting**
1. **Structured events** — workshop-style, one venue, created days ahead. Already covered by our `origin/dev` app (Bookedz) and carried over with modifications.
2. **Community / friends itineraries** — one person plans a hangout for a group. No tool combines availability sync + interest-based planning + location + "I'll join later".

### Competitive gap

| Product | Does | Missing |
|---|---|---|
| When2meet / Rallly / Doodle | Common time slots | What to do, where, deals |
| Howbout | Calendar sync + voting into a plan | SG deals/events, routing |
| Wanderlog | Collaborative itineraries + map | Availability, deals, local events |
| Where2Meet | Fair meeting spot | Everything else |
| Burpple Beyond / Chope / Eatigo | Dining deals | Separate apps, no public API, not tied to plans |
| SG Telegram channels (@sgfooddeals, @sgweekend, @goodlobangsg…) | Great curation | Unstructured; no map/time filtering |

---

## 2. Personas & modes

- **Solo explorer** ✅ — builds an itinerary for themself, no group needed. Same generator, own interests/calendar.
- **Group host** — creates a *Hangout*, invites friends, picks the slot, builds the itinerary.
- **Group member / late joiner** — joins, shares availability, votes on blocks, sets arrival time.
- **Structured-event organiser** — creates workshop-style events (from dev).
- **Admin** — reviews low-confidence scraped deals/events.

---

## 3. Features

Course rule: a *feature* is one end-to-end task ("this app lets me ___"), not a screen. Tiers per *Project Q&A* (T1 show data · T2 merge/massage · T3 algorithm).

| # | Feature | Tier | Origin |
|---|---|---|---|
| F1 | **Discover** — one feed + map of hosted events, scraped events and live deals; filter by interests/time/area; "Picked for you" | 2 | adapt dev F1 |
| F2 | **Structured events** — 4-step create wizard (OneMap venue), RSVP with questions, scored waitlist + offers ✅ | 2 | reuse dev F2 |
| F3 | **Check-in** — QR/barcode tickets, staff scanner, self check-in, attendance dashboard, fraud flags ✅ | 2 | reuse dev F3 |
| F4 | **Organiser ops** — tasks, announcements, budget, NEA weather + backup-venue switch ✅ | 2 | reuse dev F4 |
| F5 | **Group availability finder** — on joining, each member chooses **Google Calendar sync or manual grid** ✅; app ranks common slots | 3 | new |
| F6 | **Itinerary builder** — two modes ✅: (a) auto-generate then edit, (b) host builds from group preferences; members **vote per block** (individual meals/activities) ✅; **solo mode** ✅; map + timeline | 3 | new |
| F7 | **Late joiner "where's the group?"** — enter arrival time → stop the group is at + OneMap transit route/ETA. No live tracking ✅ | 2 | new |
| F8 | **Deals & events ingestion** — Telethon worker reads SG Telegram channels ✅ + linked articles/sites ✅; regex + LLM extraction ✅ into outlet / dates / times / conditions; geocoded; manual review is a rare fallback ✅ | 3 | new |

Dropped from dev: **floor-plan editor** (not selected). Ownership: ❓ (§11).

---

## 4. Core user journeys

1. **Group hangout**
   Host → *New Hangout* (name, date range, rough area, vibe) → share invite link → member joins → prompt **"Sync Google Calendar" / "Fill in grid manually"** → ranked slots (heatmap + "5/5 free Sat 2–8pm") → host locks slot → **Auto-generate** or **Build myself** → blocks (activity, meal with deal, transit legs) → members 👍/👎 or swap to an alternative → host finalises → member sets "I'll arrive at 15:00" → app shows the stop + route.
2. **Solo** — "I'm free Sat afternoon near Bugis" → itinerary from own interests + deals + events → edit/save.
3. **"Just free, surprise me"** — pick slot/area only → generator favours diversity + best deals.
4. **Structured event** — as dev: create → RSVP/waitlist → check-in → ops.
5. **Discover → plan** — every event/deal card has *Add to itinerary / Hangout*.

---

## 5. Algorithms (Tier-3 signature)

- **A1 Slot finder** — normalise every member's busy intervals (GCal freeBusy or grid) to 30-min buckets in `Asia/Singapore`; sweep-line merge; score windows ≥ min duration by number available (host + "required" members are hard constraints), duration, time-of-day preference, weekend bonus. Return top-N with who's missing.
- **A2 Itinerary generator**
  - *Inputs:* locked slot; start area = fair meeting point (minimise the **max** member travel time — haversine pre-filter, then OneMap routes for top candidates); group interest vector (mean of member weights + minimum-satisfaction guard); candidate pool (hosted + scraped events open in the window, deals valid on that weekday/time, OSM places with `opening_hours`).
  - *Search:* beam search over stop sequences. Score = Σ interest match + deal value + novelty − travel-time penalty − idle gaps.
  - *Hard constraints:* opening/deal windows, a meal block at lunch/dinner times, total fits slot, optional budget cap ❓.
  - *Output:* 2–3 alternatives per block, used for voting.
- **A3 Vote resolution** — per-block approval voting; net-negative block swapped for the best alternative; re-sequence and re-route to re-check timing.
- **A4 Late-joiner lookup** — binary search stops by time → current stop or "in transit to X"; OneMap public-transport route from the user's location; arrival after end → last stop.
- **A5 Deal validity & matching** — recurrence (date range, days of week, time windows) → `isValidAt(datetime)`; radius match to itinerary location.
- **A6 Discover ranking** — reuse dev `server/services/recommendation.js` (interest .4, distance .2, recency .15, popularity .15, spots .1, diversity pass), extended to deals and scraped events.

---

## 6. Data ingestion pipeline (F8)

### Sources (checked 26 Oct 2026)

| Source | Public web preview (`t.me/s/…`) | Notes |
|---|---|---|
| @confirmgood | ✅ | Teasers + bit.ly → full article on confirmgood.com |
| @sgfooddeals | ✅ | Semi-structured: 📅 dates, ⏰ times; outlet often only in linked page (tco.sg) |
| @sgweekend | ✅ | 📅 📍 ⏰ fields; events/workshops |
| @sgconcerts | ✅ | 📅 💸 📍 fields; concerts |
| @dateideas, @sgstudentpromos, @sethlui | ✅ | Deals + ideas |
| @sgwhereto | ✅ (few posts) | Events |
| @goodlobangsg, @thesmartlocal | ❌ disabled | Need Telethon (logged-in account) ✅ chosen |
| @TimeOutSG | ✅ | Last post Jun 2026 — stale |
| confirmgood.com | — | WordPress; `robots.txt` allows all; JSON at `/wp-json/wp/v2/posts`; categories incl. Deals, Food & Drinks, Exhibitions, Music, Fringe Events, Date Ideas |
| Ticketmaster Discovery API | — | SG coverage **unverified** → optional spike (`countryCode=SG`) ❓ |
| Eventbrite | — | Public search API shut down in 2020 → not usable |

### Flow

```
Telethon worker (Python, team-owned TG account)
  → raw_posts (channel, msg_id UNIQUE, text, links, posted_at)
  → resolve short links (tco.sg / bit.ly / tinyurl) → fetch article if robots allow
  → regex pre-parse emoji fields (📅 date, ⏰ time, 📍 place, 💸 price)
  → LLM extraction (Gemini Flash-Lite, strict JSON schema; Groq fallback on 429)
  → validate (pydantic)
  → geocode outlets via OneMap search
  → upsert deals / deal_outlets  or  external_events
  → low confidence or no geocode → review_queue  (target < 10% of posts)
```

**Extraction schema**

```json
{
  "kind": "deal | event | other",
  "title": "", "merchant": "",
  "outlets": [{ "name": "", "address": "" }],
  "date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD",
  "days_of_week": ["SUN"],
  "time_windows": [{ "start": "12:00", "end": "15:00" }],
  "conditions": ["min 2 pax", "dine-in only"],
  "price_text": "", "price_min": 0,
  "category": "", "source_url": "", "confidence": 0.0
}
```

### LLM (free tiers) ✅
- **Primary:** Google Gemini Flash / Flash-Lite — free tier, native JSON-schema output, OpenAI-compatible endpoint. Free-tier inputs may be used by Google to improve products (acceptable: posts are public).
- **Fallback:** Groq free plan (~30 RPM, ~1,000 req/day, ~200k tokens/day per model — third-party figures, confirm on Groq's page).
- Client is OpenAI-compatible with base URL from env, so it can also point at a local [freellmapi](https://github.com/tashfeenahmed/freellmapi) instance (MIT, but marked "personal experimentation only").
- Volume is tiny (tens of posts/day) — comfortably inside free limits.

### Hosting the worker
- **Recommended:** GitHub Actions scheduled workflow (every 30–60 min) runs the Python worker; Telethon `StringSession`, Gemini/Groq keys and Supabase service key as repo secrets; writes straight to Supabase.
- *Alternatives:* small always-on Fly.io / Render machine (Telethon event handler, near real time); a team laptop for demos. Preview-only channels could also run as a Supabase Edge Function + `pg_cron` (no login).

### Risks
- A team member must create/own the Telegram account and generate the session ❓.
- Automated user accounts can be rate-limited or banned → dedicated account, read-only, low frequency.
- Credit all sources in UI + README (FAQ #16). Scraped data does **not** count as the public-API requirement (met by OneMap / NEA / Google Calendar).

---

## 7. External APIs

| API | Used for | Notes |
|---|---|---|
| Google Calendar API `freeBusy` | F5 sync | Narrowest scope `calendar.freebusy`. Google Identity Services token client in the browser; query only the hangout window; store busy intervals only (no event details, no refresh tokens). OAuth app in Testing mode → ≤100 test users. |
| OneMap (SLA) | Search/geocode (no token), **routing** (token, free registration), map tiles | Already used in dev: `AddressSearch.vue`, `lib/onemap.js`, `VenueMap.vue` |
| NEA 2-hr forecast (data.gov.sg) | Weather on itinerary + ops | Reuse dev `utils/feature4Weather.js` |
| OSM Overpass ✅ | Non-deal food/activity places + `opening_hours` | Cache in `places`; patchier SG data accepted |
| Gemini / Groq | Extraction | See §6 |
| Telegram (Telethon + `t.me/s` preview) | Deals/events | See §6 |

---

## 8. Tech stack ✅ (same team, same stack as dev)

- **Frontend:** Vue 3 + vue-router + Vite (JS), Bootstrap 5 + `main.css` tokens, Leaflet with OneMap tiles.
- **Backend:** Supabase (Postgres + RLS + Auth + Realtime + `pg_cron` + Edge Functions); small Express 5 server (recommendations, uploads, slot-finder and itinerary-generator endpoints).
- **New:** Python Telethon ingestion worker.
- **Tests:** Playwright e2e + node unit tests.
- **Port from `origin/dev`:** `client/src/utils/api.js` (mock/live boundary), `server/services/recommendation.js`, `client/src/utils/helpers.js` (`eventsOverlap`), OneMap/Leaflet components, F2–F4 views + migrations.

---

## 9. Data model additions (Supabase)

| Table | Key columns |
|---|---|
| `hangouts` | host_id, title, mode (`group`/`solo`), date_from, date_to, area_lat, area_lng, status, locked_slot_start, locked_slot_end |
| `hangout_members` | hangout_id, user_id, role, availability_source (`gcal`/`grid`), arrival_at, required |
| `availability_blocks` | hangout_id, user_id, start_at, end_at, kind (`busy`/`free`) |
| `itineraries` | hangout_id, version, generated_by (`auto`/`manual`), status |
| `itinerary_stops` | itinerary_id, seq, kind (`activity`/`meal`/`transit`), ref_type (`event`/`external_event`/`deal`/`place`), ref_id, start_at, end_at, lat, lng, travel_mins_from_prev |
| `stop_alternatives` | stop_id, ref_type, ref_id, score |
| `stop_votes` | stop_id, user_id, value |
| `deals`, `deal_outlets` | merchant, title, conditions, validity recurrence · outlet name, address, lat, lng |
| `external_events` | title, starts_at, ends_at, venue, lat, lng, price, category, source_url |
| `places` | OSM id, name, kind, lat, lng, opening_hours (cache) |
| `raw_posts`, `ingest_runs`, `review_queue` | ingestion bookkeeping |

Carried over from dev: profiles, interests, events, venues, registrations, check_ins, tasks, budget_items, announcements, etc. Floor-plan tables dropped. RLS: hangout data visible to its members only.

---

## 10. Course-requirement mapping

| Requirement | How we meet it |
|---|---|
| HTML/CSS/JS, Vue, Bootstrap | ✓ stack (§8) |
| Responsive | Test iPhone 6 → Bootstrap XL; demo at 575px with console open |
| Backend data store | Supabase |
| ≥1 public API via async HTTP | OneMap, NEA, Google Calendar |
| E2E testing | Playwright journeys: hangout → slot → itinerary → vote → late join; solo plan; deal validity |
| X-factor algorithm | A1–A5 (§5) |
| Login ≠ feature | Treated as plumbing; not demoed |
| README disclosures | AI/LLM-assisted parts (FAQ #20); scraped sources (FAQ #16) |

---

## 11. Team & task tracking

Team: Aishani, Gregory, Huxley, Denzel, Timothy, Vivienne. **Scope/ownership unconfirmed** — Huxley + Denzel are ideating.

| Item | Owner | Branch | Status | Notes |
|---|---|---|---|---|
| F1 Discover | ❓ | | Not started | |
| F2 Structured events | ❓ | | Not started | port from dev |
| F3 Check-in | ❓ | | Not started | port from dev |
| F4 Organiser ops | ❓ | | Not started | port from dev |
| F5 Availability finder | ❓ | | Not started | |
| F6 Itinerary builder | ❓ | | Not started | |
| F7 Late joiner | ❓ | | Not started | |
| F8 Ingestion pipeline | ❓ | | Not started | |
| Infra (DB / auth / deploy) | ❓ | | Not started | |
| UI system / consistency | ❓ | | Not started | |

### Build order (recommended 28 Oct)

Order is set by risk and dependencies: build first what is new, what other features need, and what could fail. F2–F4 already work on `origin/dev`, so they are a port, not a build.

| Step | What | Why this early |
|---|---|---|
| 1 | **Foundation:** copy the `origin/dev` client/server scaffold onto `revamp/ideate`, rename to OpenJio, add the §9 tables (`hangouts`, `hangout_members`, `availability_blocks`, `itineraries`, `itinerary_stops`, `deals`, `deal_outlets`, `external_events`, `places`) + seed data | Every other step writes to these tables; seed data lets steps 3–4 start before ingestion works |
| 2 | **F8 ingestion spike:** Telethon login with the team account, pull ~200 posts from 4–5 channels, run regex + Gemini extraction, measure how many come out usable | Highest unknown (account, rate limits, extraction quality). If it fails we need to know now and fall back to curated seed deals |
| 3 | **F5 slot finder with the manual grid** (A1 as a pure, unit-tested function), then add Google Calendar freeBusy | Algorithm is self-contained and easy to demo; GCal OAuth setup (test users) can run in parallel |
| 4 | **F6 itinerary generator on seed data** (A2 + A5), timeline + map UI, then manual mode and block voting (A3) | The signature feature; depends on 1 and is fed by 2 and 3 |
| 5 | **F7 late join** (A4 + OneMap routing) | Small once itineraries exist |
| 6 | **F1 Discover merge:** hosted + scraped events + deals in one feed, ranking (A6) | Needs real ingested data from 2 |
| 7 | **Port F2–F4** from dev, re-test with live e2e | Already built; lowest risk, can be done by its original owners in parallel from step 1 |
| 8 | Tests for each journey, responsive polish, README (AI + source disclosures), video | Course deliverables |

Steps 2, 3 and 7 have no shared files and can run in parallel once step 1 lands.

---

## 12. Open questions ❓

1. Feature ownership per member — does each of the 6 own ≥1 meaningful feature?
2. ~~Product name (§13).~~ Decided: **OpenJio** ✅ (28 Oct).
3. Exact dates: progress pitch and Week 12 Friday 9am deadline.
4. Who owns the Telegram account (Telethon) and the Google Cloud OAuth project?
5. Can non-app friends join a hangout via link as guests, or must they sign up?
6. Budget / price filter in the generator — needed?
7. Scraped events: RSVP-able in-app, or just "add to plan" + external link?
8. Group size cap (affects slot-finder UX)?
9. Ticketmaster SG — worth a 30-min spike?
10. Keep dev's waitlist scoring / fraud flags as-is, or simplify?

---

## 13. Name ideas

**Chosen: OpenJio** ✅ ("jio" is Singlish for inviting someone out; an "open jio" is an invite anyone can join). The list below is kept for reference.

**From the product's traits:** OneTab · Tabless · Freeslot · Outplan · Linkup · Synced · Roundup · Plotline · Meetwhere · Gather

**Friends / hangout words in other languages (SG-flavoured first):**

| Name | Language | Meaning |
|---|---|---|
| Lepak | Malay / Singlish | hang out, chill |
| Jio | Hokkien / Singlish | invite someone out |
| Kaki | Malay / Singlish | buddy ("makan kaki" = food buddy) |
| Kumpul | Malay | gather |
| Sama-sama / Bersama | Malay | together |
| Jalan-jalan | Malay | go out, stroll |
| Yuē 约 | Mandarin | make plans to meet |
| Jù 聚 | Mandarin | get together |
| Kootam கூட்டம் | Tamil | gathering |
| Barkada | Tagalog | friend group |
| Tomo 友 | Japanese | friend |
| Chingu 친구 | Korean | friend |
| Gezellig | Dutch | cosy togetherness |

Trademark / domain availability **not checked**.

---

## 14. References

- [IS216 Group Project Briefing](./IS216%20-%20Group%20Project%20Briefing.pdf) · [Project Q&A](./Project%20Q%20and%20A.pdf)
- OneMap: [developer.tech.gov.sg overview](https://www.developer.tech.gov.sg/products/categories/data-and-apis/onemap-apis/overview) · [SLA OneMap](https://sla.gov.sg/geoworks/sla-products/onemap) · [Exploring OneMap API](https://sheshbabu.com/posts/exploring-singapore-onemap-api)
- Scheduling tools: [When2meet alternatives (Cal.com)](https://cal.com/blog/when2meet-alternatives)
- Group planning apps: [PopSci roundup](https://www.popsci.com/diy/group-trip-planning-apps/) · [Wanderlog group planning](https://www.whistleout.com/CellPhones/Guides/wanderlog-group-trip-planning-app)
- Deals apps: [SingSaver: Burpple vs Entertainer vs Chope](https://www.singsaver.com.sg/page/blog/burpple-chope-entertainer-compare) · [MoneySmart comparison](https://blog.moneysmart.sg/dining/burpple-entertainer-chope-fave-eatigo)
- Events APIs: [Eventbrite search API shutdown](https://github.com/Automattic/eventbrite-api/issues/83) · [Ticketmaster getting started](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/)
- Telegram scraping: [Reading public channels without the API (dev.to)](https://dev.to/sami_8858131362756585e4f4/you-dont-need-telegrams-api-to-read-a-public-channel-100-messages-no-credentials-16ld)
- SG Telegram channels: [MustShareNews list](https://mustsharenews.com/singapore-telegram-channels/) · [TheSmartLocal list](https://thesmartlocal.com/read/telegram-channels-bots/)
- Free LLM APIs: [OpenRouter comparison](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/) · [Continuum guide](https://continuumcode.ai/guides/free-llm-api/) · [freellmapi](https://github.com/tashfeenahmed/freellmapi)
- Google Places pricing (rejected option): [openplacesapi.com](https://openplacesapi.com/blog/google-places-api-pricing)
