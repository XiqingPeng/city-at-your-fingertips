# Featured map extracts

The three JSON files are cropped excerpts of OpenStreetMap data served by OpenFreeMap in the OpenMapTiles schema. The data is © OpenStreetMap contributors and is available under the Open Database License (ODbL 1.0). The bundled excerpts carry the same license. Each JSON file records its exact center and width, release date, retrieval time, original vector tile URLs and tile feature references. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [OpenFreeMap](https://openfreemap.org/) · [OpenMapTiles](https://openmaptiles.org/)

| Featured stop | Center (latitude, longitude) | Width |
| --- | --- | --- |
| Tokyo · Shiba Park | 35.6586, 139.7454 | 2 km |
| Shanghai · Lujiazui | 31.238, 121.5006 | 2 km |
| Singapore · Marina Bay | 1.2833, 103.855 | 2 km |

Each extract uses release `20261122_124456_pt` at zoom 14. The preprocessor clips features to the tile boundaries and the selected square, samples building footprints across the square and retains tall buildings. It transfers OpenMapTiles' estimates where supplied and retains the road centerlines, water polygons and selected named points. Building outlines may include separate pieces at tile or building-part boundaries. Scene coordinates use a 40-unit square with north facing the back of the model.

To refresh the extracts with the current dated OpenFreeMap release, run `node map-data/update-presets.mjs` from the project directory. Pass a versioned OpenFreeMap tile URL template as the first argument to select a specific source release if it is still served. The script fetches one city at a time, uses at most four concurrent tile requests, and attributes the source in each JSON. Run `node --test test-map-data.mjs` after rebuilding.
