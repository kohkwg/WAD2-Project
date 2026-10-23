# Asset register

| Asset | Source / licence | Use |
| --- | --- | --- |
| `client/src/assets/brand/bookedz-mark.svg` | Original Codex-authored vector | Brand mark / favicon |
| `client/src/assets/map/singapore.json` | Natural Earth, public domain | Previous terrain reference; no longer rendered in discovery |
| `client/src/assets/fonts/bricolage-grotesque.ttf` | Google Fonts / Mathieu Triay, SIL OFL; adjacent OFL.txt | Self-hosted variable heading font |
| `client/src/assets/fonts/dm-sans.ttf` | Google Fonts, SIL OFL; adjacent DM-Sans-OFL.txt | Body/navigation/forms |
| `client/src/assets/illustrations/singapore-animated-plate.webp` | User-supplied replacement; built-in imagegen edit, prompt below | Current shared island background, 298,354 bytes |
| `IslandArtwork.vue` | Codex-authored SVG/CSS | Independent wheel, boats, birds and occasional plane |
| `SingaporeMap.vue` interactive layer | Vue/SVG implementation | Dynamic markers, clusters, pan/zoom and previews over the cleaned illustration |
| `component-gallery.html` | Original HTML/CSS | Standalone design-system review artifact |
| `previews/` | Browser captures of isolated demo fixtures | Desktop/mobile implementation evidence, not real current events |

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

Font source:
https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque
No third-party font or map-tile request is needed to render discovery.


## Historical first 24 October illustration and imagery

- Supplied master: `docs/resources/artefacts/Whimsical Singapore Isometric City Map.png`,
  unchanged. Its baked UI was never wired to live data.
- Previous app asset (superseded): `client/src/assets/illustrations/singapore-clean.webp`,
  407,316 bytes, derived using the built-in imagegen edit tool. The generated PNG
  master remains in the local Codex generated-images folder; only the optimised
  WebP is required by the application. Encoding used the existing Chromium canvas
  encoder at quality 0.88; no image-processing dependency was added.
- Additional font: `client/src/assets/fonts/dm-sans.ttf`, from Google Fonts;
  SIL OFL notice in `DM-Sans-OFL.txt` beside it. Source:
  https://github.com/google/fonts/tree/main/ofl/dmsans
- `EventArtwork.vue` contains original category-specific SVG scenes for music,
  sport, food, arts, city/career, nature/community and a general festival fallback.
- The earlier `DiscoveryHero.vue` added independent SVG cloud and boat accents,
  since replaced by the shared `IslandArtwork.vue` layers. These
  are decorative, not event or transport data. Static baked MRT/trees were not
  misrepresented as separately moving layers.
- Current screenshots: `previews/immersive-desktop.png` and
  `previews/immersive-mobile.png`. Earlier preview files document the prior pass.

Imagegen edit prompt (built-in tool, one supplied reference image):

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

Codex used the built-in imagegen editor, then encoded its result as WebP without
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
