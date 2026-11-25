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

The next scene dissolves in over 2.2 seconds. Reduced-motion mode switches directly. **Pause tour** holds the current stop. The timer waits while someone uses the tools, moves the camera, uses a hand to change the skyline, or has the tab in the background. After two idle minutes, an open panel closes and automatic playback resumes unless the visitor explicitly paused it.

The renderer, English pixel fonts and featured maps are served with the site. The tour can complete a full circuit when external services are unavailable.

## Explore a real place

Open **Explore map** and pick a neighborhood to see its saved 2 × 2 km model. The six choices are Tokyo’s Shiba Park, Shanghai’s Lujiazui, Singapore’s Marina Bay, the Eiffel Tower in Paris, New York’s Flatiron District and the Rialto Bridge in Venice. These maps ship with the exhibit.

For a different square, open **Adjust map area**, move the pin or enter coordinates, choose a width from 0.5 to 4 km and select **Load selected area**. A completed selection gets a full viewing interval. **Pause tour** holds it on screen. **Back to tour** returns to an imagined neighborhood.

Custom areas first request building footprints, roads and water from OpenFreeMap vector tiles. Read-only Overpass servers provide a fallback. The loader clips features to the selected bounds and samples dense areas. Live maps display up to 1,800 buildings and 5,000 road segments, subject to geometry budgets. Public service availability and coverage vary. A failed or cancelled request leaves the current scene visible.

Map extracts include source URLs, their release date, attribution and license in `map-data/`. They use data from OpenStreetMap contributors under the ODbL, and the OpenMapTiles schema as served by OpenFreeMap. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [OpenMapTiles](https://openmaptiles.org/) · [OpenFreeMap](https://openfreemap.org/)

**Relative elevation** loads a terrain base and positions buildings and road segments at sampled ground heights. Missing building heights are estimated. Recognized towers use original stylized models. Other named landmarks can be highlighted. [AWS Terrain Tiles / Mapzen](https://registry.opendata.aws/terrain-tiles/)

## Interact

- Open **Hand controls**, select **Start camera** and allow access. MediaPipe processes video frames on the device. Starting the tracker downloads its runtime and model, trying GPU and falling back to CPU if needed.
- Hold one open hand flat, as if carrying a tray. Lift it in small repeated strokes to grow the skyline. Bring your hand back between lifts. Hold still briefly to change direction, then press down in repeated strokes to lower the buildings. The return stroke keeps the current height. This works in imagined neighborhoods and real maps.
- **Hand controls** includes a replayable pixel demonstration before camera access. A prompt on the scene follows the direction of your movement. The height holds when you stand still, move your hand out of view or show two hands.
- **Explore map** also contains a building height slider, camera views, palettes, daytime and nighttime. Imagined neighborhoods have density and forest sliders too. Drag to orbit, scroll to zoom and right-drag to pan.
- **Save image** exports a PNG. **Export STL** produces a single-color mesh. **Export color 3MF** preserves material colors at a default base width of 160 mm. Each export captures the visible model when clicked. Inspect overlapping solids and thin details in your slicer and assign the 3MF colors to physical filaments.

Three.js 0.170.0 and OrbitControls use the MIT license. The Latin subsets of Press Start 2P and DotGothic16 use the SIL Open Font License. Distribution notices accompany the files under `vendor/`.

## Tests

Run `node --test test-gestures.mjs test-tour.mjs test-map-data.mjs` for the gesture, tour and map-data checks.

With the local site running, the browser suite checks all six saved maps, single-hand height changes, camera cancellation, keyboard navigation and graphics recovery. It uses a synthetic video stream. The default URL is `http://localhost:8000/`. Set `PIXEL_CITY_URL` to test another local port.

```sh
npm install --no-save --package-lock=false playwright-core@1.56.1
npx playwright-core install chromium
node --test browser-checks.cjs
```
