# gif-writer

**Version 1.0.0 · API 1**

**Tested in:** Node checks; the demo page in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time (`tests/flow-demos.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`). Not run: GNOME Web (Epiphany) 46.5, a phone.

Writes an animated GIF from pictures you draw on a canvas, in the browser or in Node. About 16 KB (5.9 KB gzipped), no dependencies. Cut from Net Flow Map's GIF maker.

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

## What it does that is different
- **One palette for the whole animation**, found by median cut and then refined by k-means over the exact colors of the pictures you pass. No flicker from palettes that change between pictures.
- **Only what moved is stored.** A pixel that did not change since the previous picture is written as transparent, and the picture is cropped to the box that did change. A still background costs almost nothing.
- **Plain GIF89a** with a loop block; every viewer reads it.

## Numbers (Node 22, measured 2026-10-17, against gifenc 1.0.3)
| Test | gif-writer | gifenc 1.0.3 |
|---|---|---|
| 30 pictures of 640 x 400, a small ball moving over a still background | 23.3 KB in 101 ms | 159 KB in 152 ms (global palette), 165 KB in 224 ms (palette per picture) |
| Worst case: 20 pictures of 640 x 400 where every pixel changes every time | 1.09 MB in 562 ms | 1.14 MB in 294 ms |

So on a mostly still animation the file is about 6.8 times smaller; when everything changes the file is about 5% smaller but it takes about 1.9 times longer. Your own pictures will land between the two.

## Why
A GIF of a game or a chart is mostly still: a background with something moving on it. Writing only the changed box in transparent pixels is the difference between a 23 KB file and a 160 KB one.

## Limits
- At most 255 colors plus one transparent entry (the GIF format allows 256). Photos will look posterized and dithering is not done.
- The palette is fixed once you create the encoder. If later pictures bring colors the palette never saw, they are matched to the nearest palette color.
- Frame delays are rounded to hundredths of a second, and browsers commonly show very short delays (10 ms or less) slower than asked.
- All compressed pictures stay in memory until `finish()`.

## Prior art
- [gifenc](https://github.com/mattdesl/gifenc) (MIT, 1.0.3): small, fast and well made, with palette quantizing and per-picture or global palettes. It writes every pixel of every picture; this module's saving comes from the transparent-unchanged-pixels step, which is why the first row of the table differs so much. Its file is about the same size gzipped (5.7 KB against 5.9 KB). Use gifenc if you need its API or the speed in the worst case.
- Writing your own GIF encoder is a few hundred lines; the tests here include an independent decoder so the bytes can be trusted.

## For AI agents
Collect `getImageData(...).data` for each picture, build one palette from every few pictures, add each picture with its delay, call `finish()` once and save the bytes. Keep the canvas size the same for all pictures. Do not pass all pictures of a long animation to `makePalette`; pass about six evenly spaced ones.
