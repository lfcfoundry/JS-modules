# gif-writer

**Version 1.1.0 · API 1**

**Tested in:** Node 22.22.0 module test (all passed) and tests/gif-writer-browser.js, one browser at a time: ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, each writing the same bytes as 1.0.0 for 30 fixed fingerprints. Not run: a phone.

Writes an animated GIF from pictures you draw on a canvas, in the browser or in Node. About 16 KB (5.9 KB gzipped), no dependencies. Cut from Netflow Map's GIF maker.

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

## How it compares
Much smaller files than gifenc when most of the picture stays still, about the same size when everything changes, and bigger as code. Speed against gifenc in browsers: not measured (the only timings against gifenc are an older Node run, left in the Numbers table below).

| Alternative | Size of the code (smaller is better) | Speed (faster is better) | Features | Where it wins or loses |
|---|---|---|---|---|
| gif-writer 1.1.0 (MIT, this module) | 20.8 KB, 7.5 KB gzipped (the current file) | Palette for a busy animation, 1.1.0 against 1.0.0 (faster is better): 1.3 times in Chromium 155, 1.7 in Firefox 158, 3.0 in WebKitGTK 2.52.6, 2.95 in GNOME Web 46.5. Against gifenc in browsers: not measured | One palette for the whole animation, only changed pixels stored, GIF89a with loop | Wins on file size for still backgrounds; loses on code size |
| [gifenc](https://github.com/mattdesl/gifenc) (MIT, 1.0.3) | About 5.7 KB gzipped | In browsers: not measured | Palette quantizing, global or per-picture palettes, writes every pixel of every picture | Wins on code size; loses on file size for mostly still animations |
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

## Why
A GIF of a game or a chart is mostly still: a background with something moving on it. Writing only the changed box in transparent pixels is the difference between a 23 KB file and a 160 KB one.

## Limits
- At most 255 colors plus one transparent entry (the GIF format allows 256). Photos will look posterized and dithering is not done.
- Making the palette takes time in proportion to the number of different colors in the pictures you pass, not to how many pictures follow: 30 pictures of 640 x 480 with 7 colors take about 30 ms; 30 smooth photo-like pictures with about 513,000 colors take about 0.4 s in Node (smaller is better). Pass a few pictures, not all, to keep it quick.
- The palette is fixed once you create the encoder. If later pictures bring colors the palette never saw, they are matched to the nearest palette color.
- Frame delays are rounded to hundredths of a second, and browsers commonly show very short delays (10 ms or less) slower than asked.
- All compressed pictures stay in memory until `finish()`.

## Prior art and credits
No code from others; the ideas below are theirs. The code is written for this repository (LFC Foundry, MIT).
- [gifenc](https://github.com/mattdesl/gifenc) (MIT, 1.0.3): compared against, not copied. It is small, fast and well made, with palette quantizing and per-picture or global palettes. It writes every pixel of every picture; this module's saving comes from the transparent-unchanged-pixels step, which is why the first row of the Numbers table differs so much. Its code is smaller gzipped (5.7 KB, against 5.9 KB for 1.0.0 and 7.5 KB for 1.1.0). Use gifenc if you need its API or the speed in the worst case.
- The GIF89a file format and its LZW compression (the format's own method): the published format, implemented from scratch.
- Median cut (the idea of splitting the colors into boxes) and k-means (moving each palette color to the average of the colors nearest to it): textbook methods, idea only, no code taken.
- Writing your own GIF encoder is a few hundred lines; the tests here include an independent decoder so the bytes can be trusted.

## For AI agents
Collect `getImageData(...).data` for each picture, build one palette from every few pictures, add each picture with its delay, call `finish()` once and save the bytes. Keep the canvas size the same for all pictures. Do not pass all pictures of a long animation to `makePalette`; pass about six evenly spaced ones.
