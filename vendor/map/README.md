# Vector tile decoder

Pixel City loads [decoder.mjs](decoder.mjs) from its own site when it needs to decode Mapbox Vector Tile bytes. The module exports [VectorTile](https://github.com/mapbox/vector-tile-js) and [Pbf](https://github.com/mapbox/pbf) as named exports.

```js
import { VectorTile, Pbf } from './vendor/map/decoder.mjs';

const tile = new VectorTile(new Pbf(bytes));
```

| Package in the bundle | Npm source | License |
| --- | --- | --- |
| @mapbox/vector-tile 2.0.4 | [Registry archive](https://registry.npmjs.org/@mapbox/vector-tile/-/vector-tile-2.0.4.tgz) | [BSD-3-Clause](licenses/vector-tile.txt) |
| pbf 4.0.1 | [Registry archive](https://registry.npmjs.org/pbf/-/pbf-4.0.1.tgz) | [BSD-3-Clause](licenses/pbf.txt) |
| @mapbox/point-geometry 1.1.0 | [Registry archive](https://registry.npmjs.org/@mapbox/point-geometry/-/point-geometry-1.1.0.tgz) | [ISC](licenses/point-geometry.txt) |

The license files come from the pinned archives. [package-lock.json](package-lock.json) records their integrity hashes and the versions of the packages declared for installation.

## Rebuild

Run from the repository root. Install the pinned packages in a temporary directory and bundle the two exports with [esbuild 0.25.12](https://github.com/evanw/esbuild/releases/tag/v0.25.12).

```sh
decoder_source="$PWD/vendor/map"
decoder_build="$(mktemp -d)"
cp "$decoder_source/package.json" "$decoder_source/package-lock.json" "$decoder_build/"
cd "$decoder_build"
npm ci --ignore-scripts
printf '%s\n' \
  "export { VectorTile } from '@mapbox/vector-tile';" \
  "export { default as Pbf } from 'pbf';" > decoder-entry.mjs
npm exec --yes --package esbuild@0.25.12 -- esbuild decoder-entry.mjs \
  --bundle --platform=browser --format=esm --target=es2022 --legal-comments=inline \
  --banner:js='// Generated from pinned npm packages. See README.md and licenses/.' \
  --outfile=decoder.mjs --metafile=decoder-build.json
cp decoder.mjs "$decoder_source/decoder.mjs"
```
