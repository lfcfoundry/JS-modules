# gif-writer changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New module, cut from Net Flow Map's GIF maker. It turns pictures drawn on a canvas into an animated GIF, in the browser or in Node, with no libraries. It keeps one color palette for the whole animation (so nothing flickers) and writes only the part of each picture that changed. Measured in Node on 30 pictures of 640 x 400 with a small ball moving on a still background: 23.3 KB in 101 ms, where gifenc 1.0.3 made 159 KB in 152 ms (about 6.8 times larger). When every pixel changes in all 20 pictures: 1.09 MB in 562 ms against gifenc's 1.14 MB in 294 ms (about 5% smaller, about 1.9 times slower). Changes from the Net Flow Map original: a stale comment fixed and the test now lives in the module's own folder (an independent GIF decoder checks every pixel).

Tested in: Node checks; the demo page in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time (`tests/flow-demos.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`). Not run: GNOME Web (Epiphany) 46.5, a phone.
