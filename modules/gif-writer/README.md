# gif-writer

**Version 1.5.1 · API 1**

**Tested in:** Node 22 (gif-writer, filters, WebAssembly twin); Firefox 158, Chromium 155, WebKitGTK 2.52.6 (filters equal in all three)

Writes an animated GIF from pictures you draw on a canvas, in the browser or in Node. About 38 KB (15 KB gzipped, of which about 12 KB is the embedded WebAssembly), no dependencies. Cut from Netflow Map's GIF maker.

It first builds one palette (the set of colors) for the whole animation from a few of your pictures, by median cut and then k-means. Each picture you add is compared with the one before it: pixels that did not change are written as transparent, the picture is cropped to the box that did change, and the result is compressed with the GIF format's own LZW method at once. `finish()` returns the bytes of a plain GIF89a file with a loop block.

## Why it exists
A GIF of a game or a chart is mostly still: a background with something moving on it. Writing only the changed box in transparent pixels is the difference between a 23 KB file and a 160 KB one.

## Looks, timing and a worker (since 1.5.0; optional files)

**What.** Four extra files you add only when you want them, each loads on its own page next to `gif-writer.js` and gives a global of its own:
- `gif-writer-fx.js` (`GifWriterFx`): picture filters on RGBA bytes (color grade with brightness, contrast, saturation, warmth, hue and five tones; blur; sharpen; glow; vignette), nine presets, and the timing of an animation: five easing curves, `delaysCs()` (GIF delays are whole hundredths of a second; this rounds so the running total never drifts, and 25 FPS is exactly 4 each), `spinPlan()` (turns, seconds per turn, a pause between turns, reverse, partial swings, names fading in). No DOM: runs in a page, a worker and Node. A 3.8 KB WebAssembly build (SIMD) does blur, sharpen, glow and grade after `GifWriterFx.initWasm()`; the JavaScript stays the fallback and gives the same bytes (125 test cases).
- `gif-writer-worker.js` (`GifWriterWorker`): one message handler (`wasm`, `card`, `init`, `filter`, `palette`, `frame`, `finish`) that is the body of a Web Worker, or is called directly on the page where workers are missing. One worker writes the GIF, all workers can filter.
- `gif-writer-card.js` (`GifWriterCard`): the same filters on the graphics card (WebGL 2) with the same arithmetic. `create()` returns `null` where WebGL 2 is missing and the caller keeps WebAssembly.
- `tolerance` option of `createEncoder` (in `gif-writer.js` itself): `createEncoder(w, h, pal, { tolerance: 8 })` leaves a pixel transparent when it is already shown within that color distance. Smaller files, slightly lossy; uses the JavaScript path, not WebAssembly.

**Why.** Netflow Map makes GIFs of maps that turn around. Filters were the cost, not the GIF coding: in Netflow Map's own measurement (400 item 3D map, 960 pixels wide, one worker, full filter chain), the WebAssembly filters took WebKitGTK from 9.7 to 3.9 s, Firefox from 5.7 to 2.9 s and Chromium from 5.4 to 3.2 s.

```js
GifWriterFx.initWasm().then(function () {
  var f = { contrast: 0.12, saturation: 0.1, sharpen: 0.6 };      // see GifWriterFx.FILTER_PRESETS
  GifWriterFx.apply(rgba, w, h, f);                                // in place; WebAssembly when ready
});
var delays = GifWriterFx.delaysCs([40, 40, 40]);                   // [4, 4, 4]
```

**Test it:** `node modules/gif-writer/test/fx.js` and `node modules/gif-writer/test/fx-wasm.js` (Node), and `tests/gif-writer-fx-browser.js` in the three browsers. Rebuild the filter WebAssembly with `sh wasm/build-fx.sh` then `python3 wasm/embed-fx.py`.

## Try it and test it
**Test it:** `node modules/gif-writer/test/run.js` (an independent GIF decoder reads every file the writer makes and checks every pixel; about 0.2 s). **Try it:** `demo.html`.

## Use
```js
var pics = [ctx.getImageData(0, 0, w, h).data, /* ... one per picture ... */];   // Uint8ClampedArray, RGBA
var pal = GifWriter.makePalette(pics, 255);                 // one palette for the whole animation; give it a few of your pictures, not all
var enc = GifWriter.createEncoder(w, h, pal, { loop: true });
pics.forEach(function (rgba) { enc.add(rgba, 60); });       // how long each picture stays, in milliseconds
var bytes = enc.finish();                                    // Uint8Array: save it as .gif
img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
```
Each picture is compressed the moment you add it, so memory holds the compressed pictures, not the raw ones.

## WebAssembly (since 1.2.0)

**What.** The palette search (`makePalette`: color histogram, median cut, k-means) and the picture encoder (`createEncoder`: palette lookup of every pixel, comparison with the last picture, LZW coder) also exist as WebAssembly (9,903 bytes, `wasm/gif.c`), embedded in `gif-writer.js` and used first. They give the same colors and the same GIF bytes as the JavaScript code: 21 encoder scenes and 116 palette sets identical in Node, and 18 of 18 GIFs in every one of 18 browser runs. `GifWriter.wasmAvailable()` says whether the browser allows it; `makePalette(pics, n, { wasm: false })` and `createEncoder(w, h, pal, { wasm: false })` force the JavaScript code.

**Why.** 30 pictures of 640 x 480, median of 3 passes of 5 rounds in rotating order, JavaScript to WebAssembly in ms (lower is better; times faster, higher is better). WebKit's clock moves in whole milliseconds, so quick jobs there are timed 3 to 4 in a row.

Palette search:

| Pictures | ungoogled-chromium 155.0.8059.39-1 | Firefox 158.0 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---|---|---|---|
| Photo | 552 to 338 (1.63x) | 580 to 391 (1.48x) | 439 to 351 (1.25x) | 565 to 365 (1.55x) |
| Flat game picture | 35.4 to 23.4 (1.51x) | 40.0 to 23.0 (1.74x) | 25.8 to 26.5 (0.97x) | 25.5 to 26.3 (0.97x) |
| Small moving block | 27.7 to 19.7 (1.41x) | 28.0 to 20.0 (1.40x) | 21.8 to 20.3 (1.07x) | 19.8 to 20.8 (0.95x) |
| Scrolling bands | 21.3 to 15.1 (1.41x) | 23.0 to 15.0 (1.53x) | 14.5 to 16.3 (0.89x) | 15.8 to 16.0 (0.99x) |

Encoding:

| Pictures | ungoogled-chromium 155.0.8059.39-1 | Firefox 158.0 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---|---|---|---|
| Photo | 868 to 402 (2.16x) | 901 to 399 (2.26x) | 628 to 390 (1.61x) | 734 to 394 (1.86x) |
| Flat game picture | 309 to 185 (1.67x) | 376 to 184 (2.04x) | 239 to 167 (1.43x) | 258 to 169 (1.53x) |
| Small moving block | 43.9 to 29.9 (1.47x) | 38.0 to 25.0 (1.52x) | 31.0 to 28.7 (1.08x) | 31.3 to 28.3 (1.11x) |
| Scrolling bands | 80.4 to 44.3 (1.81x) | 87.0 to 43.0 (2.02x) | 66.0 to 42.3 (1.56x) | 64.0 to 42.7 (1.50x) |

A first small GIF on a fresh page (160 x 120, 4 pictures, start-up included): 44 to 21 ms in Chromium, 34 to 19 in Firefox, 25 to 24 in WebKitGTK, 28 to 24 in GNOME Web.

**Rules.**
- Add `'wasm-unsafe-eval'` to `script-src` if your page has a Content Security Policy. Without it, or if anything goes wrong at the start, the JavaScript code runs and writes the same bytes. A picture area bigger than 4,194,304 pixels also uses the JavaScript code.
- Each encoder has its own WebAssembly memory (about 5 MB plus the pictures); it is freed with the encoder.
- Source `wasm/gif.c`, rebuild `wasm/build.sh`, embed `wasm/embed.py`; both have `--check` to prove the committed files match.

**Palette sampling (1.4.0).** Above 100,000 pixels in all, `makePalette` counts about every 3rd pixel (every 5th above 1,000,000), at a step with no common factor with the picture's pixel count (so never one that divides its width), and counts every pixel after all when the sample shows fewer than 4,096 distinct colors. WebAssembly and plain JavaScript count the same pixels and give the same palette. A GIF from big photo-like inputs is therefore not byte-identical to one from 1.3.0 (mean picture error within 0.3% on photo-like, gradient and one-pixel-line pictures in the tests); flat, pixel-art and most screenshot pictures give the same bytes as before.

**Honest limits.** The palette search is slower than the JavaScript code in the two WebKit browsers on flat pictures: scrolling bands 0.89x in WebKitGTK (14.5 to 16.3 ms), the small moving block 0.95x in GNOME Web (19.8 to 20.8 ms) and the flat game picture 0.97x in both (1 ms or less, inside the clock's step). The cost is copying every picture into WebAssembly memory (it now goes in pieces of 16,384 pixels so the copy stays in the processor cache, which moved WebKitGTK from 0.87x to the numbers above); the JavaScript code counts such pictures in runs at about the same speed. Everything else is 1.07x or faster, and encoding is 1.08x or faster everywhere. The `lzw()` function you can call directly is unchanged JavaScript. Costs bytes: +20,124 as written (20,789 to 40,913), +16,195 minified (9,115 to 25,310) and +7,929 gzipped (4,349 to 12,278) with terser 5.51.2 (smaller is better). Not run: a phone, Safari.

## Compile early (since 1.3.0)

The WebAssembly program starts compiling in the background when the file loads, so the first palette or encoder only starts it. `GifWriter.wasmReady()` gives a promise of `true` or `false` and `GifWriter.wasmModule()` the compiled module (or `null`). Asked for before the compile is done, it compiles on the spot, as before; without WebAssembly nothing changes. The colors and bytes do not change.

Honest numbers: load plus first use, ms, old / new (median of nine fresh pages, right after load; lower is better): Chromium 155 8.3 / 8.7, Firefox 158.0 20 / 20, WebKitGTK 2.52.6 3 / 3, GNOME Web 46.5 6 / 6. Level within about 1 ms.

## How it compares
Much smaller files than gifenc when most of the picture stays still, about the same size when everything changes, and bigger as code. Speed against gifenc in browsers: not measured (the only timings against gifenc are an older Node run, left in the Numbers table below).

| Alternative | Size of the code (smaller is better) | Speed (faster is better) | Features | Where it wins or loses |
|---|---|---|---|---|
| gif-writer 1.2.0 (MIT, this module) | 25,310 bytes minified, 12,278 gzipped (40,913 as written; terser 5.51.2; 1.1.0 was 9,115 and 4,349) | Encoding 1.1 to 2.3 times faster and the palette search 0.9 to 1.7 times (the two tables above); before that, the palette for a busy animation, 1.1.0 against 1.0.0 (faster is better): 1.3 times in Chromium 155, 1.7 in Firefox 158, 3.0 in WebKitGTK 2.52.6, 2.95 in GNOME Web 46.5. Against gifenc in browsers: not measured | One palette for the whole animation, only changed pixels stored, GIF89a with loop | Wins on file size for still backgrounds; loses on code size |
| [gifenc](https://github.com/mattdesl/gifenc) (MIT, 1.0.3) | About 5.7 KB gzipped | In browsers: not measured | Palette quantizing, global or per-picture palettes, writes every pixel of every picture | Wins on code size; loses on file size for mostly still animations |
| [gif.js](https://github.com/jnordberg/gif.js) 0.2.0 (MIT) | 10,430 bytes minified, 3,572 gzipped, plus its worker file, 10,874 bytes minified, 4,057 gzipped (terser 5.51.2 `-c passes=2 -m`) | In browsers: not measured | NeuQuant color search, optional dithering, encodes in Web Workers; writes every picture in full | Wins on code size and on dithering. Loses on file size for mostly still animations, and needs its worker file served next to the page |
| [omggif](https://github.com/deanm/omggif) 1.0.10 (MIT) | 6,582 bytes minified, 2,554 gzipped | In browsers: not measured | Reads and writes GIFs; you supply the palette and the indexed pixels, no color search | Wins on code size. Loses: no palette search, cropping or transparency handling for you |
| Your own encoder | A few hundred lines | Not measured | Whatever you write | You must test it yourself; the tests here include an independent decoder |

File size, measured (smaller is better): a mostly still animation (30 pictures of 640 x 400, a small ball over a still background) is 23.3 KB here and 159 KB with gifenc (global palette); a worst case with every pixel changing is 1.09 MB here and 1.14 MB with gifenc.

What is different:
- **One palette for the whole animation**, found by median cut and then refined by k-means over the exact colors of the pictures you pass. No flicker from palettes that change between pictures.
- **Only what moved is stored.** A pixel that did not change since the previous picture is written as transparent, and the picture is cropped to the box that did change. A still background costs almost nothing.
- **Plain GIF89a** with a loop block; every viewer reads it.

Where it loses:
- When every pixel changes, the file is only about 5% smaller than gifenc's (smaller is better). Speed against gifenc in browsers: not measured (the Numbers table below is from Node).
- Bigger code than gifenc.
- No dithering and at most 255 colors plus one transparent entry (see Limits).

## Numbers (Node 22, measured 2026-10-17, against gifenc 1.0.3)

> **Node numbers.** The speeds in this section were measured in Node, not in the four test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Sizes and counts are exact; only the times depend on the browser. Re-measuring in the four browsers is not done (open item on `TASKS.md`).

| Test | gif-writer | gifenc 1.0.3 |
|---|---|---|
| 30 pictures of 640 x 400, a small ball moving over a still background | 23.3 KB in 101 ms | 159 KB in 152 ms (global palette), 165 KB in 224 ms (palette per picture) |
| Worst case: 20 pictures of 640 x 400 where every pixel changes every time | 1.09 MB in 562 ms | 1.14 MB in 294 ms |

So on a mostly still animation the file is about 6.8 times smaller; when everything changes the file is about 5% smaller but it takes about 1.9 times longer. Your own pictures will land between the two.

## Limits
- At most 255 colors plus one transparent entry (the GIF format allows 256). Photos will look posterized and dithering is not done.
- Making the palette takes time in proportion to the number of different colors in the pictures you pass, not to how many pictures follow: 30 pictures of 640 x 480 with 7 colors take about 30 ms; 30 smooth photo-like pictures with about 513,000 colors take about 0.4 s in Node (smaller is better). Pass a few pictures, not all, to keep it quick.
- The palette is fixed once you create the encoder. If later pictures bring colors the palette never saw, they are matched to the nearest palette color.
- Frame delays are rounded to hundredths of a second and capped at 655,350 ms (the GIF field limit), and browsers commonly show very short delays (10 ms or less) slower than asked.
- All compressed pictures stay in memory until `finish()`.

## Prior art and credits
No code from others; the ideas below are theirs. The code is written for this repository (LFC Foundry, MIT).
- [gifenc](https://github.com/mattdesl/gifenc) (MIT, 1.0.3): compared against, not copied. It is small, fast and well made, with palette quantizing and per-picture or global palettes. It writes every pixel of every picture; this module's saving comes from the transparent-unchanged-pixels step, which is why the first row of the Numbers table differs so much. Its code is smaller gzipped (5.7 KB, against 5.9 KB for 1.0.0 and 7.5 KB for 1.1.0). Use gifenc if you need its API or the speed in the worst case.
- The GIF89a file format and its LZW compression (the format's own method): the published format, implemented from scratch.
- Median cut (the idea of splitting the colors into boxes) and k-means (moving each palette color to the average of the colors nearest to it): textbook methods, idea only, no code taken.
- Writing your own GIF encoder is a few hundred lines; the tests here include an independent decoder so the bytes can be trusted.

## For AI agents
Collect `getImageData(...).data` for each picture, build one palette from every few pictures, add each picture with its delay, call `finish()` once and save the bytes. Keep the canvas size the same for all pictures. Do not pass all pictures of a long animation to `makePalette`; pass about six evenly spaced ones.
