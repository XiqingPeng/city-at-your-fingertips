# Featured map extracts

The bundled JSON files contain cropped excerpts of OpenStreetMap data served by OpenFreeMap in the OpenMapTiles schema. The data is © OpenStreetMap contributors and is available under the Open Database License (ODbL 1.0). The bundled excerpts carry the same license. Each JSON file records its exact center and width, release date, retrieval time, original vector tile URLs and tile feature references. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [OpenFreeMap](https://openfreemap.org/) · [OpenMapTiles](https://openmaptiles.org/)

| Featured stop | Center (latitude, longitude) | Width |
| --- | --- | --- |
| Tokyo · Shiba Park | 35.6586, 139.7454 | 2 km |
| Shanghai · Lujiazui | 31.238, 121.5006 | 2 km |
| Singapore · Marina Bay | 1.2833, 103.855 | 2 km |
| Paris · Eiffel Tower | 48.85837, 2.29448 | 2 km |
| New York · Flatiron District | 40.74104, -73.9897 | 2 km |
| Venice · Rialto Bridge | 45.43793, 12.33599 | 2 km |
| Shanghai · Huangpu River | 31.238, 121.5006 | 8 km |

Each extract uses release `20261122_124456_pt` at zoom 14. The preprocessor clips features to the tile boundaries and the selected square, samples building footprints across the square and retains tall buildings. It transfers OpenMapTiles' estimates where supplied and retains the road centerlines, water polygons and selected landmarks. Building outlines may include separate pieces at tile or building-part boundaries. Scene coordinates use a 40-unit square with north facing the back of the model.

Both Shanghai extracts anchor the Oriental Pearl Tower to the center of its 468 m antenna footprint, `14/13721/6693/building/5242706412`. [OpenStreetMap antenna way](https://www.openstreetmap.org/way/524270641)

The Paris extract locates the Eiffel Tower using the monument point `14/8296/5636/poi/50133642`, about 12 m from the square center. The New York extract locates Flatiron Building using `14/4824/6158/poi/2647688962`, about 5 m from the center. The Venice extract includes the Rialto Bridge footway in the centerlines grouped under `14/8753/5865/transportation/1623593400`. The bridge segment matches the named feature in that tile's `transportation_name` layer and its midpoint falls about 14 m from the center.

## Refresh the extracts

Run `node map-data/update-presets.mjs` from the project directory to refresh all cities from the current dated OpenFreeMap release. Pass city names to refresh just those extracts. Pass `'Shanghai overview'` to refresh only the 8 km square. An optional versioned tile URL template selects a specific release while it is available. For example, this command rebuilds the Paris, New York and Venice extracts from their original release.

```sh
node map-data/update-presets.mjs 'https://tiles.openfreemap.org/planet/20261122_124456_pt/{z}/{x}/{y}.pbf' Paris 'New York' Venice
```

The script fetches one city at a time with at most four concurrent tile requests and records the source in each JSON. Run `node --test test-map-data.mjs` after rebuilding.
