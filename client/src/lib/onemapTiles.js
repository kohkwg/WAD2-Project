import L from 'leaflet'

// OneMap basemap tiles (Singapore Land Authority). No key is needed for tiles;
// the attribution is required by OneMap's terms. Night tiles follow the dark theme.
const tileUrl = style => `https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`
export const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:16px;width:16px;vertical-align:-3px" alt=""> ' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> © contributors | ' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>'
export const SINGAPORE_MAX_BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.131])

const currentStyle = () => document.documentElement.dataset.theme === 'dark' ? 'Night' : 'Default'

// Adds the tile layer and keeps it in step with the app theme. Returns a cleanup function;
// the layer itself is on its `layer` property for callers that watch tile errors.
export function addOneMapTiles(map) {
  let style = currentStyle()
  // OneMap only has tiles around Singapore, so skip requests well outside it.
  const layer = L.tileLayer(tileUrl(style), { minZoom: 10, maxZoom: 19, detectRetina: true, bounds: SINGAPORE_MAX_BOUNDS, attribution: ONEMAP_ATTRIBUTION }).addTo(map)
  const observer = new MutationObserver(() => {
    const next = currentStyle()
    if (next !== style) { style = next; layer.setUrl(tileUrl(style)) }
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const stop = () => observer.disconnect()
  stop.layer = layer
  return stop
}
