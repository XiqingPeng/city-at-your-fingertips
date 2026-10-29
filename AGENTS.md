# Project instructions

- This is a browser prototype. Keep camera frames local and avoid committing recordings, credentials, caches, or downloaded model weights.
- Run locally with `python -m http.server 8000 --bind 127.0.0.1` from this directory; Chrome or Edge on localhost is required for camera permissions.
- The prototype loads pinned Three.js and MediaPipe versions and a model from remote URLs; online access is required. Check asset licenses and attribution before adding third-party 3D assets.
- Preserve continuous interaction and the manual controls when refining gesture mappings. Do not claim Transformer inference or GPU execution without verifying it.
