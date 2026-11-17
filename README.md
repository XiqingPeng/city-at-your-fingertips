# A City at Your Fingertips · Pixel City Studio

An interactive 8-bit inspired city studio. Grow an imaginary city with hand gestures, or select a real neighborhood and build a model using OpenStreetMap data.

## Start

On Windows, double-click `启动城市Demo.cmd`, or run this command in the project directory:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open <http://localhost:8000> in Chrome or Edge. JavaScript libraries, fonts, the hand-tracking model, geocoding, map tiles, building footprints and elevation tiles require an internet connection.

## Shape your city

- Choose **HAND CONTROL** in the upper right, press **Start camera**, then grant browser permission. Camera frames are processed on your device and are not sent to the project server. Manual sliders remain available.
- Move both hands apart or together to zoom, or move them together to pan. In the imaginary city, raise an open hand to grow buildings, pinch and move down to lower them, wave an open hand to grow a forest, and hold a pinch to restore the city. Real neighborhoods support view gestures and height adjustment. Values remain steady when tracking is lost.
- Drag to orbit, scroll to zoom and right-drag to pan. Use the buttons to reset the view or look from above.
- Switch **Daytime / Nighttime** for a bright pixel sky or a starry sky with warmer windows. Pick one of three city palettes.

## Real neighborhoods

Search for a place and select a result. Drag the pin or click the map, or enter coordinates, then choose a square area from 0.5 to 4 km and click **Load selected area**. Larger selections request more features; public-service limits or network timeouts can prevent a request from completing. The model displays at most 1,800 buildings, sampled across the selection, and 5,000 road segments. Choose **Imaginary** to return to the procedural city.

The **Relative elevation** option loads AWS Terrain Tiles / Mapzen data and makes a closed terrain base. Buildings and road segments are placed at sampled ground heights; roads and building footprints are not conformed continuously to steep terrain. Named OSM buildings and landmarks can be highlighted. A few recognized towers have original stylized models; other landmark points are shown as simple markers. Their geometry is illustrative, not a survey or a replacement for precise landmark models.

Place search uses [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api). Map tiles, buildings and roads use [OpenStreetMap](https://www.openstreetmap.org/copyright) data, © OpenStreetMap contributors, fetched via public read-only Overpass services. Elevation uses [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/). Current map mode handles OSM building and road ways and named tower relations; full multipolygon buildings, water, automatic land-use and exact building heights are not implemented. Missing heights are estimated. Coverage and service availability vary by place.

## Save and print

**Save image** exports the scene as PNG. **Export STL** exports a single-color triangle mesh. **Export Color 3MF** exports 3MF Core with per-material colors and a default 160 mm base width. Its colors are model materials, not automatic assignments to physical filaments; assign those in a compatible slicer. The exporter welds duplicated vertices inside each mesh and scales the lowest point to the build plate. Meshes can still overlap, be disconnected or be too thin, and individual slicers may interpret colors differently. Inspect and repair the file in your slicer before printing; automated boolean union and printability guarantees are not provided.

Three.js renders original procedural geometry. MediaPipe Hand Landmarker extracts hand landmarks, trying GPU first and falling back to CPU; the browser and system select the device. Gesture mapping uses continuous rules and smoothing, not a Transformer. Gesture thresholds are experimental and depend on camera position and lighting.

Run the existing gesture checks with `node test-gestures.mjs`.
