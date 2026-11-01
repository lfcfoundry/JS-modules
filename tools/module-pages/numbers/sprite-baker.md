**Measured on a real laptop.** Laptop (Windows, 16 cores, screen scale 1.25), single runs with apps open, 2026.10.31 11:10 PM ET. 48 pictures of 140 x 140, median of 3 full runs, in ms (lower is better). The bench was rebuilt from test/fancy-scenes.js, with the same four meshes, so the rows match the README's in kind, not byte for byte.

| Browser | Picture | Plain JS | Wasm | Times as fast | With release() |
|---|---|---:|---:|---:|---:|
| Laptop Firefox 160 | Fancy's face | 144 | 107 | 1.35x | 1.40x |
| | gold coin | 127 | 89 | 1.43x | 1.46x |
| | plain rod | 21 | 17 | 1.24x | 1.40x |
| | glove | 58 | 40 | 1.45x | 1.49x |
| Laptop Chromium 156 | Fancy's face | 118.8 | 97.1 | 1.22x | 1.30x |
| | gold coin | 99.8 | 83.0 | 1.20x | 1.27x |
| | plain rod | 17.7 | 18.0 | 0.98x | 1.20x |
| | glove | 42.5 | 40.8 | 1.04x | 1.19x |

Picture path compared with Fancy Banana's own filler, on the same textured sphere, 48 pictures, median of 5: Firefox 160 145 ms against 145 (even), Chromium 156 117.4 ms against 132.3.
