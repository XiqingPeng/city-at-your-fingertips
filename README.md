# A City at Your Fingertips · Pixel City

Pixel City is a walk-up exhibit. Open the page and the city changes every 30 seconds. Each stop has a name and a short description beneath the scene. Watching requires no input or camera permission.

## Start

On Windows, double-click `启动城市Demo.cmd`. To serve the project yourself, run this in the repository and open <http://localhost:8000> in Chrome or Edge.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

## The tour

The tour alternates original pixel neighborhoods with saved 2 × 2 km map extracts.

| Imagined neighborhood | Next real neighborhood |
| --- | --- |
| Canal Quarter — gabled rowhouses, footbridges and boats on a stepped canal | Tokyo · Shiba Park |
| Lantern Heights — illuminated spires on a terraced hill | Shanghai · Lujiazui |
| Orchard Commons — blossom trees, an octagonal walk and a glasshouse | Singapore · Marina Bay |

The next scene dissolves in over 2.2 seconds. Reduced-motion mode switches directly. **Pause tour** holds the current stop. The timer waits while someone uses the tools, moves the camera, shows hands to the tracker, or has the tab in the background. After two idle minutes, an open panel closes and automatic playback resumes unless the visitor explicitly paused it.

The renderer, English pixel fonts and featured maps are served with the site. The tour can complete a full circuit when external services are unavailable.

## Explore a real place

Open **Explore map** and select Tokyo, Shanghai or Singapore to display its saved extract immediately. For another neighborhood, search for a place or enter coordinates, choose a square from 0.5 to 4 km and select **Load selected area**. You can also move the pin on the selection map. A completed selection gets a full viewing interval. To keep it on screen, select **Pause tour**. **Back to tour** returns directly to an imagined neighborhood.

Custom areas first request building footprints, roads and water from OpenFreeMap vector tiles. Read-only Overpass servers provide a fallback. The loader clips features to the selected bounds and samples dense areas. Live maps display up to 1,800 buildings and 5,000 road segments, subject to geometry budgets. Public service availability and coverage vary. A failed or cancelled request leaves the current scene visible.

Map extracts include source URLs, their release date, attribution and license in `map-data/`. They use data from OpenStreetMap contributors under the ODbL, and the OpenMapTiles schema as served by OpenFreeMap. Place search uses Open-Meteo. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [OpenMapTiles](https://openmaptiles.org/) · [OpenFreeMap](https://openfreemap.org/) · [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api)

**Relative elevation** loads a terrain base and positions buildings and road segments at sampled ground heights. Missing building heights are estimated. Recognized towers use original stylized models. Other named landmarks can be highlighted. [AWS Terrain Tiles / Mapzen](https://registry.opendata.aws/terrain-tiles/)

## Interact

- Open **Hand controls**, select **Start camera** and allow access. MediaPipe processes video frames on the device. Starting the tracker downloads its runtime and model, trying GPU and falling back to CPU if needed.
- Move both hands apart or together to zoom, or move them together to pan. Raise an open hand to grow buildings. Pinch and move down to lower them. In an imagined neighborhood, wave to grow trees or hold a pinch to restore buildings.
- The same height, density and forest controls are available as sliders. Drag to orbit, scroll to zoom and right-drag to pan. Open **Explore map** for the sliders, camera views, palettes, daytime and nighttime.
- **Save image** exports a PNG. **Export STL** produces a single-color mesh. **Export color 3MF** preserves material colors at a default base width of 160 mm. Each export captures the visible model when clicked. Inspect overlapping solids and thin details in your slicer and assign the 3MF colors to physical filaments.

Three.js 0.170.0 and OrbitControls use the MIT license. The Latin subsets of Press Start 2P and DotGothic16 use the SIL Open Font License. Distribution notices accompany the files under `vendor/`.

Run `node test-gestures.mjs`, `node test-tour.mjs` and `node --test test-map-data.mjs` to check continuous gestures, tour scheduling and map loading.
