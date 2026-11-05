# Asset register

| Asset | Source / licence | Use |
| --- | --- | --- |
| `client/src/assets/illustrations/singapore-anchored-boats-plate.webp` | Built-in image editing edit, exact prompt below | Latest island background, 1448×1086, 569,838 bytes; detailed fixed boats. Only `IslandArtwork.vue` imports it (see the 6 November status below) |
| `client/src/assets/illustrations/singapore-living-water-plate.webp` | Built-in image editing cleanup of the selected expanded island; exact prompt below | Earlier island background, 1448×1086, 532,074 bytes; sailing cargo ship removed for animation. No file imports it |
| `IslandWater.vue`, `IslandBoats.vue` | Team-authored Vue/SVG/CSS | Wakes, local currents/glints and shoreline motion. Only `IslandArtwork.vue` imports them |
| `client/src/assets/brand/bookedz-mark.svg` | Original vector | Earlier brand mark. No file imports it now; the logo uses `dino-mark.png` and `dino-donut-o.png`, and the favicon is `dino-favicon.png` (see the README's image credit) |
| `client/src/assets/map/singapore.json` | Natural Earth, public domain | Previous terrain reference; no file imports it now |
| `client/src/assets/fonts/bricolage-grotesque.ttf` | Google Fonts / Mathieu Triay, SIL OFL; adjacent OFL.txt | Self-hosted variable heading font |
| `client/src/assets/fonts/dm-sans.ttf` | Google Fonts, SIL OFL; adjacent DM-Sans-OFL.txt | Body/navigation/forms |
| `client/src/assets/illustrations/singapore-animated-plate.webp` | User-supplied replacement; an image generation tool edit, prompt below | Previous island background, 298,354 bytes. No file imports it |
| `client/src/assets/illustrations/singapore-expanded-plate.webp` | Built-in image editing expansion and cleanup of the user's selected illustration, prompts below | Earlier animated island and neighbourhood thumbnails, 1448×1086, 649,926 bytes. No file imports it |
| `NeighbourhoodLabels.vue` | Team-authored Vue/SVG/HTML | Compact 10px labels with 44px targets, click/keyboard zoom and collision suppression. No file imports it now |
| `IslandArtwork.vue` | Team-authored SVG/CSS | Independent wheel, boats, birds and occasional plane. No file imports it now |
| `SingaporeMap.vue` interactive layer | Vue/SVG implementation | Removed from the repository. Discover now uses `DiscoveryStreetMap.vue` (Leaflet with OneMap tiles) |
| `component-gallery.html` | Original HTML/CSS | Standalone design-system review artifact |
| `previews/` | Browser captures of isolated demo fixtures | Desktop/mobile implementation evidence, not real current events |

**Status on 6 November 2026.** No page shows the island illustrations now. The landing page and
Discover do not use them. `IslandArtwork.vue` is the only file that imports
`singapore-anchored-boats-plate.webp`, `IslandWater.vue` and `IslandBoats.vue`, and no file imports
`IslandArtwork.vue`. The files stay in the repository as a record. The 6 November code cleanup
deleted `DiscoveryHero.vue`, `EventMap.vue` and `MapPreview.vue`; `SingaporeMap.vue` and
`projectIllustratedVenue()` were already gone. The sections below describe the artwork as it was
when it was made, not what the app shows today. The sources and prompts stay valid.

Natural Earth source:
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson
Singapore's feature was extracted without altering the supplied private resources.
The outline is generalised and not a navigation or territorial-boundary reference.
Marker bounds are a Singapore-area envelope, not legal/geocoding validation;
small islands may be absent from the generalised silhouette. The scene's roads,
parks and buildings are illustrative. Colliding markers are displaced with connector
lines to their coordinate-derived anchors. Both current discovery views use the
replacement raster plate and independent animated SVG details described below;
the map adds live event markers on top.

## Stable illustrated boats, latest 3 November refinement

`singapore-anchored-boats-plate.webp` is now the shared map, landing and thumbnail
asset. It restores the detailed cargo ship and adds three matching miniature
ferry/motor boats to the expanded background. Boat hulls are fixed pixels in
the illustration; they do not translate, bob, disappear or restart on a loop.
`IslandBoats.vue` now draws only four anchored wake effects, consisting of
flowing strokes and expanding stern ripples behind those painted hulls. Existing
`IslandWater.vue` currents, glints and shoreline flow remain, with two patches
adjusted to the new boats. All water/wake movement shares pause/tab/offscreen
state and reduced-motion CSS. The prior route-based approach below is historical.
WebP encoding uses Pillow quality 90/method 6 without an application dependency.

Final an image generation tool edit prompt (verbatim):

> Precise local edit to this exact 1448x1086 isometric illustrated Singapore map for a web app. Keep the entire background framing, terrain, coastline, landmarks, fixed Flyer support without wheel, all buildings, vegetation, both richly illustrated cargo ships at left, lighting, palette, and lack of labels EXACTLY unchanged. ADD only THREE finely rendered miniature boats in the same detailed 3D/isometric painterly style as the existing cargo ships, not flat SVG icons. (1) A small red-white-blue passenger ferry centered at pixel (78,165), about 44x25 pixels, in open water northwest of the island, bow pointing northeast/up-right. (2) An elegant little white/navy/red cabin speedboat centered at pixel (1207,917), about 52x27 pixels, in open turquoise water east of Sentosa, bow pointing northeast/up-right. (3) A small white/navy motor launch centered at pixel (983,785), about 32x16 pixels, on open Marina Bay water, bow pointing east/right. Give the boats modeled hulls, glass cabins, subtle water-contact shadows and believable scale/perspective. NO long wakes or lines, just very faint contact ripples immediately at hulls; wakes will be animated in code. Preserve the existing cargo vessel at pixel(118,727) and its detailed containers. Do not add UI, text, pins or a Flyer wheel. Do not move or simplify any other object. Same 4:3 composition and canvas size.

## Living water and boats, 3 November 2026 follow-up

Built-in image editing cleanup prompt (verbatim):

> Precise cleanup of this exact 1448x1086 illustrated Singapore animation background. Remove ONLY the lower, free-sailing cargo ship and its wake in the open sea along the left edge, centered approximately pixel (118,727), roughly bounds x35..190,y675..785. Fill its former area seamlessly with the same turquoise water and soft existing ocean ripples. KEEP the upper cargo ship moored immediately beside the red harbour cranes, roughly pixel(100,620), completely unchanged. Keep absolutely everything else unchanged: exact landmass outline and camera framing, every building, plant, attraction, fixed Flyer supports, road, cable car, parked aircraft, turquoise water colors, cream edge fade. No labels, UI, new ships, new wheel or layout changes. The removed sailing ship will be replaced with an independently animated layer.

`singapore-living-water-plate.webp` supersedes `singapore-expanded-plate.webp`
for current rendering. It removes the lower sailing cargo vessel and its wake;
the ship moored beside the port cranes remains in the illustration. The shared
background framing and geographic registration are unchanged. WebP encoding
uses Pillow quality 90/method 6, with no application dependency added.

`IslandBoats.vue` adds cargo, ferry, coastal speedboat and smaller bay speedboat
routes. The original hand-authored boat design is expanded into detailed SVG
vessels with bobbing and dashed flowing wakes. Routes loop with endpoint fades
and negative delays, so they are visible immediately. `IslandWater.vue` adds ten
local ripple/glint patches over authored open-water areas and shoreline strokes.
The terrain bitmap is never warped. An inherited `--island-play-state` connects
both components to the existing pause, offscreen and hidden-tab state. Each
component also disables its animations under reduced motion. The Flyer now
rotates in 48 seconds; plane/bird accents and marker/preview motion remain.

## Expanded island, 3 November 2026

Final an image generation tool cleanup prompt (verbatim):

> Edit this exact map into a clean production background plate for animated SVG overlays. Preserve image dimensions 4:3, exact island outline, all landmark locations and scale, lighting, toy miniature isometric illustration style, vivid colors, buildings, vegetation, roads, cream edge fade. Change ONLY: (1) remove every printed place-name label and its cream pill, repairing underlying terrain naturally, no text anywhere; (2) remove the Singapore Flyer's entire circular wheel, spokes, hub and capsules at right lower middle, centered approximately (1218,633) in the 1448x1086 reference, retaining the fixed white supporting legs and low terminal building, fill the removed wheel area with matching continuation of existing trees/buildings/sky/terrain behind it. The wheel will be animated separately; do not add another wheel anywhere. (3) Remove the small motor boats on open water at upper left and lower edge and in Marina Bay, repair water smoothly; preserve cargo ships at left harbour and planes parked at Changi, preserve cable cars. Do not move or redraw any other attractions. No pins, checkmarks, labels or UI. This is a precise cleanup, not a new composition.

The current background is `singapore-expanded-plate.webp`; the older assets and
registration tables below are historical. The new composition has more terrain,
housing, Mandai greenery, gardens, shophouses and city attractions. Fixed buildings,
trees, cable cars, cargo ships and parked planes remain static illustration.
The independent Flyer, sailing boat, ferry, plane and birds remain animated SVG
overlays with the existing pause, tab/offscreen and reduced-motion handling.

The an image generation tool expansion used the supplied screenshot's island crop as its
edit target: preserve the miniature isometric style, turquoise water, lime terrain,
sandy shoreline and cream edge fade; expand the main terrain to roughly 88% of
image width; add northern zoo greenery, central gardens/housing, northeast
waterfront housing, eastern precincts, Sports Hub, Chinatown, Kampong Glam and
Orchard buildings; place Supertrees beside Marina Bay; remove event pins and UI;
make the place labels much smaller. The selected concept and cleanup master remain
in the local outputs directories; normal clones need
only the source-controlled WebP asset, not those local masters.

Final cleanup used an image generation tool, with the selected concept as edit target:
preserve exact framing, landmass, landmark positions, lighting and palette; remove
every place-name label/pill and reconstruct the terrain; remove the Flyer's rotating
wheel, hub, spokes and capsules while retaining its fixed supports and terminal;
remove small motor boats from open water, retaining cargo ships, parked aircraft
and cable cars; no pins, words or UI. Encoding uses Pillow WebP quality 90, method 6,
without adding an application dependency. This is illustrative artwork, not a
surveyed geographic map.

Current event registration points in the normalised 1200×900 frame:

| Region | x | y |
| --- | --- | --- |
| Jurong | 180 | 440 |
| Woodlands | 440 | 100 |
| Central / Orchard | 650 | 390 |
| Bishan | 600 | 270 |
| Tampines | 1005 | 255 |
| Changi | 1095 | 430 |
| Marina Bay | 810 | 610 |
| Sentosa | 585 | 780 |

Source geographic coordinates remain unchanged in `discoveryMap.js`. Event
projection uses the same continuous regional warp and clustering, not manual
event slots. Labels have separate authored visual positions. Thirteen overview
labels and eight closer-view labels are candidates; viewport bounds, compact
screens and collisions reduce the visible subset. Native buttons keep 44px hit
areas and 10px text as zoom changes. Clicking a label only zooms the illustration;
it does not invent events or apply a geographic filter. Neighbourhood thumbnails
use the same new plate and adjusted crop positions.

Font source:
https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque
No third-party font or map-tile request is needed to render discovery.


## Historical first 24 October illustration and imagery

- Supplied master: `docs/resources/artefacts/Whimsical Singapore Isometric City Map.png`,
  unchanged. Its baked UI was never wired to live data.
- Previous app asset (superseded): `client/src/assets/illustrations/singapore-clean.webp`,
  407,316 bytes, derived using an image editing tool. The generated PNG
  master remains in the local outputs folder; only the optimised
  WebP is required by the application. Encoding used the existing Chromium canvas
  encoder at quality 0.88; no image-processing dependency was added.
- Additional font: `client/src/assets/fonts/dm-sans.ttf`, from Google Fonts;
  SIL OFL notice in `DM-Sans-OFL.txt` beside it. Source:
  https://github.com/google/fonts/tree/main/ofl/dmsans
- `EventArtwork.vue` contains original category-specific SVG scenes for music,
  sport, food, arts, city/career, nature/community and a general festival fallback.
- The earlier `DiscoveryHero.vue` (deleted on 6 November) added independent SVG cloud and
  boat accents, since replaced by the shared `IslandArtwork.vue` layers. These
  are decorative, not event or transport data. Static baked MRT/trees were not
  misrepresented as separately moving layers.
- Current screenshots: `previews/immersive-desktop.png` and
  `previews/immersive-mobile.png`. Earlier preview files document the prior pass.

Image editing edit prompt (built-in tool, one supplied reference image):

> Edit this supplied whimsical Singapore isometric island illustration into a clean illustration plate for a website hero. Preserve the original composition, recognisable Singapore landmarks, buildings, turquoise water, boats, trees, MRT trains, lighting, warm cream outer background and rich cheerful illustrated detail. Remove ALL floating map pins, all colored event/category markers including icons inside them, all numerical cluster-count badges, and ALL floating place-name labels (Woodlands, Jurong, Tampines, Changi, Marina Bay, Sentosa). Seamlessly reconstruct the underlying buildings, foliage, roads or water where these overlays were. No event markers, no floating labels, no words, no numbers, no UI. Keep illustration style, camera viewpoint and geography exactly as close to source as possible. Output a high-quality landscape illustration, approximately 4:3 aspect ratio; no redesign of the scene and no extra UI. This is a clean decorative artwork, not an authoritative geographic map.


## Interactive illustration registration (later 24 October correction)

The user explicitly requests using the supplied artwork in the interactive map,
superseding the previous decorative-only split. `SingaporeMap.vue` now draws
`singapore-animated-plate.webp` through the shared `IslandArtwork.vue` SVG layer; the older terrain paths,
building symbols and Natural Earth outline are no longer rendered. The original
artwork remains untouched. `projectIllustratedVenue()` derives every marker from
its real coordinates, with an inverse-distance-weighted regional displacement
calibration. All geometry and event markers share the same pan/zoom transform.

The control points below are authored approximate regional registrations, not
surveyed locations. Coordinates are regional centres used by the existing UI;
image points are in the normalised 1200×900 artwork frame. The stylised source
cannot support a claim of precise street-level registration. Individual events
are never assigned arbitrary display slots; optional collision offsets have
connector lines to their coordinate-derived anchors. Unknown or outside-canvas
locations remain in the list.

| Region | Latitude | Longitude | Artwork x | Artwork y |
| --- | --- | --- | --- | --- |
| Jurong | 1.34 | 103.7 | 215 | 390 |
| Woodlands | 1.435 | 103.79 | 550 | 155 |
| Central / Orchard | 1.3048 | 103.8318 | 510 | 420 |
| Bishan | 1.35 | 103.85 | 520 | 300 |
| Tampines | 1.355 | 103.945 | 810 | 305 |
| Changi | 1.365 | 104.0 | 1055 | 385 |
| Marina Bay | 1.282 | 103.855 | 715 | 525 |
| Sentosa | 1.25 | 103.83 | 605 | 740 |

The focused projection test checks exact control-point registration, invalid
coordinates, deterministic output and frame bounds. Current screenshots:
`previews/interactive-illustration-desktop.png` and
`previews/interactive-illustration-mobile.png`. Future replacement/cropping of the
artwork requires recalibrating these control points rather than reusing them blindly.


## Replacement island and independent animation layers, 24 October

The user's later **Singapore Island Illustrated Map.png** supersedes the richer
previous illustration. The unmodified source is preserved locally under
`docs/resources/artefacts/Singapore Island Illustrated Map.png`. The deployable
background is `client/src/assets/illustrations/singapore-animated-plate.webp`
(298,354 bytes, 1448×1086). Both discovery views and neighbourhood thumbnails use
this asset; a normal clone does not need the local source attachment.

We used an image editor, then encoded its result as WebP without
changing the composition. Final edit prompt:

> Use case: precise-object-edit. Edit target: supplied Singapore island illustration, 1448x1086, preserve exact framing, geometry and ALL labels Woodlands/Jurong/Tampines/Changi/Marina Bay/Sentosa. Create a clean background plate for animation: remove ONLY the Singapore Flyer rotating circular wheel and its spokes/cabins (around pixel1040,622, radius60), keeping its fixed triangular supports/base, replacing removed pixels with plausible continuation of buildings/park behind. Remove ONLY the moving red-white speedboat near pixel1080,975 and its white wake, replacing with matching turquoise sea. Everything else unchanged including all other boats, plane, structures, coastline, colors, typography and composition. No new elements. Keep 4:3 aspect ratio and exact landmark registration.

`IslandArtwork.vue` adds separately authored SVG wheel/spokes/cabins, a sailing
speedboat with a gentle bob and wake, a second small ferry, drifting seabirds and a sparse plain plane. The support stays
fixed; cabins counterrotate to stay upright. All layers share the image's 1200×900
coordinate system and the map's pan/zoom. CSS motion pauses offscreen, in a hidden
tab, through each view's pause button, and with reduced motion. Port ships, the
plane, trees and MRT in the background remain static. No dependency was added.

Marker hover/focus/selection lifts its inner graphic without moving its venue
anchor. Motion for Vue springs event previews into view, with instant reduced
motion states. The registration table above is recalibrated for this new plate.


## Current presentation and capture inventory

Light/dark themes change UI tokens and canvas blending, not the source bitmap.
Shared CSS masks feather the raster alone; vector markers retain full opacity and
hit areas. Ships now sail one way with soft endpoint fades and a restrained wake;
plane/bird motion stays sparse. All moving layers share pause, visibility and
reduced-motion handling. They are decorative transport, not live positions.

| Preview | Current evidence |
| --- | --- |
| `previews/immersive-desktop.png`, `previews/immersive-mobile.png` | Current hero/search disclosure and island |
| `previews/discovery-dark.png` | System-dark discovery |
| `previews/interactive-illustration-desktop.png`, `previews/interactive-illustration-mobile.png` | Shared artwork plus real demo markers |
| `previews/create-studio-dark.png`, `previews/create-studio-mobile.png` | Draft preview and progressive creation |
| `previews/public-event-desktop.png`, `previews/public-event-mobile.png` | Detail-first public layout and compact RSVP actions |
| `previews/my-rsvps-desktop.png`, `previews/my-rsvps-mobile.png` | Status totals, date cards and status icons |
| `previews/event-tools-desktop.png`, `previews/event-tools-mobile.png` | Organiser hierarchy and quick actions |
| `previews/manage-rsvps-desktop.png`, `previews/manage-rsvps-mobile.png` | Actual-data capacity/status visual and responsive rows |

Other preview filenames preserve earlier checkpoints. All captures use isolated
demo data; they do not establish current live attendance or full browser coverage.

The captures `immersive-*`, `interactive-illustration-*` and `discovery-dark.png` show the earlier
island Discover and landing pages, as the table above says. The app no longer shows those pages,
so these files are history.
