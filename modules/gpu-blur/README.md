# gpu-blur

**Version 1.3.0 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

## What it is and how it works

Blurs a picture the same way on every device: a canvas, ImageBitmap, ImageData or RGBA bytes in, a drawable canvas, a WebGL texture or bytes out.

- Three ways behind one call: WebGL 2, WebAssembly (SIMD, optionally on several cores) and plain JavaScript.
- It measures the device once and picks the best way.
- All ways give the same picture byte for byte, using three box passes per axis (a close Gaussian).

## Why it exists

WebKit has no canvas `ctx.filter`, a plain JavaScript blur freezes the page for a third of a second at 1080p, and a graphics-card path can be slow, lost mid-game or costly to read back. This keeps all three behind one call and makes them agree.

**Where it helps**

- Glows, soft shadows and frosted panels in games.
- Depth-of-field backdrops.
- Effects that must look identical in every browser.

**Not for:** the fastest possible blur where the browser's own filter exists and exact output does not matter.

## Use

The version is also in code as `GpuBlur.version`. Run the tests (offline, about a second): `node modules/gpu-blur/test/run.js`; the same tests against seven deliberately broken copies: `node modules/gpu-blur/test/mutants.js`. The real-browser check is `tests/gpu-blur-browser.js`.

Copy `gpu-blur.js` (browser global `GpuBlur`, or `require` in Node, where only the WebAssembly and JavaScript ways exist). `demo.html` is a page with a radius slider, a route picker and a speed check for your own device.

```js
// Draw a blurred copy of a canvas (a glow, a shadow, a backdrop). The result is a canvas; the picture stays on the card when the card way is picked.
GpuBlur.blur(spriteCanvas, spriteCanvas.width, spriteCanvas.height, 12).then(function (r) {
  ctx.drawImage(r.canvas, x, y);        // r.route says which way ran: 'webgl2', 'wasm' or 'js'
});

// Bytes in, bytes out (always WebAssembly, or JavaScript where there is no WebAssembly)
GpuBlur.blur(rgbaBytes, w, h, 8, { out: 'pixels' }).then(function (r) { use(r.pixels); });   // a Uint8ClampedArray

// Keep the blurred picture on the card, as a texture in your own WebGL 2 context
GpuBlur.blur(canvas, w, h, 12, { out: 'texture', gl: myGl }).then(function (r) { gl.bindTexture(gl.TEXTURE_2D, r.texture); });

// Start early so the first blur does not pay for the one-time look at the device
GpuBlur.ready().then(function (info) { /* info.canvasRoute: the way a drawn picture will take */ });
```

## API

- `GpuBlur.blur(source, width, height, radius[, opts])` returns a Promise of `{ canvas | pixels | texture, width, height, route }`. `source` is a canvas, OffscreenCanvas, ImageBitmap, loaded Image, ImageData, or RGBA bytes (`Uint8Array` or `Uint8ClampedArray`, `width * height * 4`). `width` and `height` may be left out (`null`) for everything except bytes. The call rejects with an `Error` for a bad argument (wrong size, empty source, more than 33,554,432 pixels), never with a wrong picture.
- `radius` is 0 to 100 (larger values stop at 100); 0 returns the picture unchanged. Radius 12 looks like CSS `blur(6px)`: the Gaussian it stands for has a sigma of half the radius. Edges repeat the border pixel.
- `opts.out`: `'canvas'` (default), `'pixels'` or `'texture'` (needs `opts.gl`).
- `opts.route`: `'auto'` (default), `'webgl2'`, `'wasm'` or `'js'`. A way that cannot run gives way to the next one (webgl2, wasm, js); `result.route` always says which one ran. A texture request has no fallback and rejects if the context is missing or lost.
- `opts.into`: a canvas to draw into (out `'canvas'`), so a game can reuse one canvas every frame; or, since 1.3.0, RGBA bytes of width x height x 4 (a `Uint8ClampedArray` or `Uint8Array`) to write into (out `'pixels'`): `result.pixels` is that same array, so blurring every frame makes no new megabyte arrays. An array of another length is left untouched and a new one is made. Every way (WebGL 2, WebAssembly, JavaScript, helpers, threads; `blur()` and `blurSync()`) gives the same bytes into it (`tests/gpu-blur-into-browser.js`, 332 to 420 cases per browser). Bytes in, radius 12, 960 x 540 to 3840 x 2160, against a fresh array: one-thread WebAssembly 0.91 to 1.49x faster, helpers 0.98 to 1.21x, threads 1.06 to 1.43x; the helpers route with kept bands plus `into` against 1.2.2: Chromium 1.19 to 1.43x, Firefox 1.47 to 1.74x, WebKitGTK 1.09 to 1.32x. `opts.gl`: your WebGL 2 context (out `'texture'`); the module saves and restores the bindings and switches it touches. `opts.budget`: milliseconds of work per slice for the WebAssembly and JavaScript ways (default 3).
- `GpuBlur.blurSync(...)`: the same, but the answer comes back at once and the page waits for the whole job (about 45 ms for 1920 x 1080 in WebAssembly in the test browsers, see "Measured"). Use it in a loader, a worker or a test.
- `GpuBlur.ready()` resolves to `GpuBlur.info()` once the WebAssembly is compiled and the card has been tried. `info()` returns `{ wasm, webgl2, webgl2Worth, glMs, wasmMs, canvasRoute, pixelsRoute, why }`.
- `GpuBlur.reference(rgba, w, h, radius)`: the plain JavaScript result as a `Uint8ClampedArray`, for your own checks.
- `GpuBlur.release()` drops the WebAssembly memory and the card objects the module made; the next call starts again by itself.

## How it picks a way

1. **A drawn picture (`out: 'canvas'`).** On first use the module compiles the WebAssembly, then times a 480 x 270, radius 12 probe on both ways (the card way includes upload and a fence that says the card has finished). The card way is taken when its probe time is at most 2 x the WebAssembly time + 2 ms; otherwise the WebAssembly. The probe runs in short tasks, never one long one. A browser that refuses a "major performance caveat" context counts as no card.
2. **Bytes out (`out: 'pixels'`).** WebAssembly, then JavaScript. Reading the blurred picture back from the card costs about as much as blurring it in WebAssembly (lab test: 27 and 39 ms with read-back against 37.5 and 33 ms), so the card is not worth its fuss for bytes. `route: 'webgl2'` still does it, with a read-back that waits for the card without stalling the page.
3. **A texture (`out: 'texture'`).** The card, in your context.
4. **Fallbacks.** No WebGL 2, a lost context (`webglcontextlost`; the module also uses the way again after `webglcontextrestored`), a card way that throws, no WebAssembly, a page policy without `'wasm-unsafe-eval'`, or a WebAssembly file whose self-test differs from the JavaScript twin: the next way answers and the picture is the same. Each of those is a check in `tests/gpu-blur-browser.js`.

5. **Helpers (opt-in, `route: 'helpers'` or `workers: n`, `blur()` only).** The WebAssembly kernel runs on row bands in background workers; each band also takes the 3b rows above and below that three box passes reach, so the bytes are the ones the one-thread kernel gives. It is used above about 0.3 megapixel with 3 or more cores (default helpers: every core since 1.2.1; cores - 1 before), and gives way to one-thread WebAssembly when the page policy has no `worker-src blob:` or a helper fails. The helpers stay 5 seconds after the last job (`idleMs`); `release()` ends them now. Container with 4 cores, `out: 'pixels'`, helpers against one-thread WebAssembly: Chromium 155 0.51 to 0.85x the time, Firefox 158 0.50 to 0.85x, WebKitGTK 2.52.6 0.87 to 1.06x (no gain there), from 1280 x 720 to 3840 x 2160 at radius 4, 12 and 40. `tests/gpu-blur-helpers-browser.js` checks the same bytes in 90 cases (prime sizes, radius 0 to 100, bands thinner than the blur's reach, canvas in and out) and the fallback under a strict policy. Every core against cores - 1 (1.2.1; helpers already started, radius 12, 640 x 360 to 3840 x 2160): Chromium 0.86 to 1.06x the time, Firefox 0.69 to 0.96x, WebKitGTK 0.84 to 1.10x, most sizes about 0.9x. The threads route keeps cores - 1: with every core it was 1.02 to 1.22x the time in Firefox. Since 1.2.3 each helper keeps its band buffer between calls and writes its result back into the buffer it was sent, so neither side makes megabytes of new memory per call (the threads route keeps its canvas copy the same way): same bytes in 161 cases; bytes in, radius 12, 960 x 540 to 3840 x 2160, against 1.2.2: Chromium 1.22 to 1.31x faster, Firefox 1.10 to 1.34x, WebKitGTK 0.99 to 1.09x.
6. **Threads (opt-in, `route: 'threads'`, `blur()` only, cross-origin isolated pages only).** The same kernel built for WebAssembly threads (`wasm/blurmt.wasm`, embedded) runs on one shared memory: the page copies the picture in once, every helper blurs its share of the rows, then its share of the column strips, so there are no halo rows and no band copies. It needs a page sent with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (so a page opened from a file never has it, and the offline apps never use it). Where it cannot run it gives way to helpers, then one-thread WebAssembly; WebKitGTK 2.52.6 cannot hand shared memory to a worker, so there it runs as helpers. `info().threads` says whether this page can use it; `workers` and `idleMs` work as for helpers. Container with 4 cores, `out: 'pixels'`, 1280 x 720 to 3840 x 2160 at radius 4, 12 and 40: threads against helpers Chromium 155 0.78 to 1.12x the time, Firefox 158 0.74 to 1.14x (most sizes 0.8 to 0.9x); against one-thread WebAssembly 0.45 to 0.80x; against 1.0.0's one-thread WebAssembly 0.32 to 0.52x. `tests/gpu-blur-threads-browser.js` checks the same bytes in 91 cases (prime sizes, radius 0 to 100, 2, 3 and 7 threads, canvas in and out, two jobs at once) and the fallback on a page without isolation.

## Same picture every way

The definition is: three horizontal box passes (width `2b + 1`, with `b` from the radius), then three vertical ones; every pass rounds half up to a whole number; the edge pixel repeats. WebAssembly and JavaScript compute it with a running whole-number sum. The card way runs six passes with whole-number sums in the shader, because a first version that added floating-point colors was off by one level in 8 to 19% of the values in WebKit's graphics path. The checks compare every way to a slow brute-force version of the definition and to each other:

- Node: wasm and JavaScript equal the brute-force version byte for byte in 100 size and radius cases (sizes 1 x 1 to 64 x 48, radius 0 to 100), and sliced equals unsliced on 640 x 360 at three radii.
- Browser (all four test browsers): at 1920 x 1080, radius 12, WebGL 2, wasm and JavaScript are 100.0000% equal values to the reference (largest difference 0 of 255).
- For a picture with partly see-through pixels read back from a canvas result, the canvas holds premultiplied colors, so two ways can differ by a level or two there: Chromium and Firefox gave equal bytes through a canvas, WebKitGTK and GNOME Web agreed on 96.0% of the values, 96.4% within 1 level, largest difference 2 of 255, in the browser test. `out: 'pixels'` is byte-identical in every way.
- Against a true 25-tap Gaussian of the same width the box blur differs by 1.74 of 255 on average (largest 18) on the test picture (a gradient with sharp 32-pixel squares and noisy alpha).

## Page tasks

A page task over about 8 ms is felt as a stutter. The WebAssembly and JavaScript ways read the source in bands, blur rows and then 16-column strips, and write the result in bands, checking the clock after each piece and giving the browser a turn every 3 ms. Pieces adapt to the speed of the device. The card way has no long loop on the page. Measured longest page tasks are in "Measured".

## Under a strict Content-Security-Policy

Nothing here needs more than `'wasm-unsafe-eval'` in `script-src`: no `eval`, no `new Function`, no `blob:` address (no `img-src blob:`), no worker, no storage, no network. The one exception is the opt-in helpers and threads routes, which make their workers from a `blob:` address and so need `worker-src blob:`; without it the module quietly uses one-thread WebAssembly. Without `'wasm-unsafe-eval'` the module uses plain JavaScript. `tests/gpu-blur-browser.js` runs on a page with `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src data:`.

## Measured (the four test browsers, one at a time)

All numbers are milliseconds, **lower is better**, taken in Firefox 158.0, ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web 46.5, one browser at a time, two runs each (the median of the reps in each run, then the two runs together; 1920 x 1080, radius 12, bytes in, a drawn canvas out, "finished" means the canvas was drawn from and read once so the picture is really there). Node is used only to pass or fail the checks; no speed is taken in Node. The WebGL 2 route here ran on the graphics path these browsers had on the test machine, which was slow; **no hardware graphics card was timed in these four browsers**, so the first table says what the module does on that path and is not a card speed; see "Measured on real graphics hardware" below for a phone and a laptop that draw on the card.

| 1920 x 1080, radius 12, bytes in, drawn canvas out | Chromium 155 | Firefox 158 | WebKitGTK 2.52 | GNOME Web 46.5 |
| --- | ---: | ---: | ---: | ---: |
| `auto` (it chose wasm in all four) | 48.7 | 45.8 | 74.5 | 79.0 |
| route `wasm` | 50.9 | 49.2 | 89.5 | 89.5 |
| route `js` | 261 | 302 | 350 | 311 |
| route `webgl2` (forced) | 673 | 469 | 502 | 502 |
| longest page task, `auto` | 7.6 | 3.5 | 5.5 | 7.0 |
| longest page task, `wasm` | 7.2 | 3.8 | 9.0 | 8.5 |
| longest page task, `js` | 6.7 | 5.2 | 9.5 | 7.5 |

- **Which way wins.** On the test machine WebAssembly beat the WebGL 2 route at every size in all four browsers (tables below), by about 5.6 to 13 times at 1920 x 1080. Plain JavaScript was also faster than the WebGL 2 route at every size in all four browsers (for example 261 against 673 ms in Chromium), and slower than WebAssembly by about 3.5 to 6 times at 1920 x 1080. So the card way loses on this machine, and `auto` correctly stayed on WebAssembly.
- **Where the card way may still win.** The earlier lab test on a midrange phone (Android, Chrome) and a laptop with integrated graphics measured WebGL 2 about 3 to 5.5 times faster than the WebAssembly box blur at 1920 x 1080 (12.8 against 37.5 ms; 6 against 33 ms), with a different shader (25 taps, two passes). The shader shipped here reads about 1.56 times as many texels, and its speed on a real card has not been measured. `auto` takes the card way only when its own 480 x 270 probe on that device is no slower than 2 x the WebAssembly time + 2 ms.
- **Sizes where the card way is slower than WebAssembly (this machine).** All of them: 128 x 72 (4.8 to 7.0 against 0.6 to 1.0 ms), 480 x 270 (34 to 47 against 3.3 to 7.0), 1280 x 720 (210 to 310 against 19 to 41), 1920 x 1080, and 3840 x 2160 (1,820 to 2,730 against 225 to 490).
- **The probe's own numbers** (480 x 270, radius 12): WebGL 2 71, 48, 34 and 30 ms against 2 to 4 ms in WebAssembly (Chromium, Firefox, WebKitGTK, GNOME Web).
- **Bytes out** (`out: 'pixels'`) at 1920 x 1080: `auto` 53.2, 48.0, 65.0 and 73.0 ms (WebAssembly); one block (`blurSync`) 58.6, 43.1, 51.5 and 50.5 ms in WebAssembly and 251, 288, 259 and 254 ms in JavaScript.
- **Bigger pictures:** 3840 x 2160 by `auto` 222, 229, 490 and 504 ms; the longest page task stays under the cap because the work is cut into slices.
- **Radius:** WebAssembly time hardly moves with the radius (1920 x 1080: radius 4, 12 and 40 take 47 to 81, 49 to 90 and 49 to 79 ms); the WebGL 2 route grows with it (225 to 408, 469 to 673 and 1,267 to 1,815 ms).
- **First use on a fresh page** (median of 7 pages): `ready()` takes 374, 339, 250 and 253 ms with a longest task of 15, 28, 44 and 46 ms (compiling the WebAssembly and trying the card); the first blur then takes 56, 71, 108 and 122 ms.
- **Page tasks.** The longest task during a 1920 x 1080 blur by WebAssembly or JavaScript was 3.5 to 9.5 ms (median of reps; worst single rep 43.5 ms, in WebKitGTK JavaScript with a canvas source). The cap aimed at is about 8 ms; a few WebKit medians sit at 9 to 9.5 ms, slightly over it. The WebGL 2 route held one task of 480 to 710 ms on this machine, where the software path did its drawing inside a call; this is the number to expect only where the graphics path is slow.
- **Picture match.** At 1920 x 1080, radius 12, the WebGL 2 route and the WebAssembly route are **100.0000%** equal to the plain JavaScript reference in all four browsers (largest difference 0 of 255). For a see-through picture drawn into a canvas the browser's own premultiplied storage decides; see Limits.
- **Checks.** 31 offline checks, 7 of 7 deliberately broken copies caught, a fuzz round (24 seeds, 2,880 operations, no failures), and the browser test passes in all four browsers.


## How it compares

Same 1920 x 1080 picture, a blur that looks like a Gaussian of sigma 6, time until the picture is finished in milliseconds (**lower is better**), with the longest page task in brackets. "One block" means the page waits for the whole call.

| | Chromium 155 | Firefox 158 | WebKitGTK 2.52 | GNOME Web 46.5 |
| --- | ---: | ---: | ---: | ---: |
| gpu-blur `auto`, bytes in, drawn out | 48.7 (7.6) | 45.8 (3.5) | 74.5 (5.5) | 79.0 (7.0) |
| gpu-blur `auto`, canvas in, drawn out | 66.2 (8.1) | 116 (5.7) | 89.5 (6.5) | 107 (7.5) |
| stackblur-canvas 3.0.1, bytes in and out (one block) | 97.9 (98.5) | 115 (115) | 93.5 (93.5) | 93.5 (94.0) |
| stackblur-canvas 3.0.1, canvas in place (one block) | 115 (116) | 114 (115) | 110 (112) | 114 (114) |
| glfx 0.0.4 triangleBlur (WebGL 1, canvas in, drawn) | 1,196 (1,197) | 529 (529) | 516 (517) | 547 (549) |
| `ctx.filter = "blur(6px)"` with `drawImage` | 36.4 (36.7) | 62.1 (62.4) | not available | not available |
| CSS `filter: blur(6px)` on a canvas element (frame time) | 17.4 (2.1) | 144 (2.5) | 23.0 (2.0) | 23.5 (5.5) |

- `ctx.filter` was faster than gpu-blur in Chromium (36.4 against 48.7 ms from bytes, 66.2 ms from a canvas) and in Firefox from a canvas (62.1 against 116 ms); gpu-blur was faster in Firefox from bytes (45.8 against 62.1 ms). gpu-blur works where `ctx.filter` does not exist (WebKitGTK, GNOME Web) and keeps every page task near or under 8 ms, where stackblur-canvas holds the page for 94 to 116 ms.
- gpu-blur was faster than stackblur-canvas in all four browsers (about 1.2 to 2.5 times from bytes, 1.0 to 1.7 times from a canvas; Firefox from a canvas, 116 against 114 ms, is a tie), and faster than glfx by 6 to 25 times; glfx and the WebGL 2 route both ran on the slow graphics path, so neither of those two says anything about a real card.
- CSS `filter` lets the browser blur on its own thread; it is the cheapest way to blur something that is only shown, and it is not available when you need the blurred pixels or a texture.


## Test it on your own device (one button)

`tester/gpu-blur-device-test.html` is one file with `gpu-blur.js` inside it and no network. Copy it to a phone or laptop and open it in the browser you care about (Chrome on a phone, Firefox on a laptop), keep the tab open and in front, and tap **Run the test**. Add `#auto` to the address to run on load, `#quick` for a 5-round check.

It blurs 480 x 270, 1920 x 1080 and (if the device has the memory, 4 GB or more) 3840 x 2160 at radius 12 on all three ways, plus what `auto` picks. The ways take turns in a rotating order, two warm-up turns per way are thrown away, and each size gets 25 timed rounds (11 for 3840 x 2160, and it stops early after 110 s). It reports, for each way, the median time until the picture is really finished, the middle half (25% to 75%) and the longest page task (lower is better for all of them), then what `auto` found (the 480 x 270 probe on the card way and in WebAssembly), whether the ways draw the same picture, and a verdict in plain words: whether `auto` picked the fastest way, and how many times faster or slower the card way is than WebAssembly. A red line appears if nothing has reported after 15 seconds.

Tap **Copy results** (or **Save as file** / **Share**) and paste the text back. The text names the device by class (`phone` or `laptop`) and the browser's name and version only: no user agent, no model, no graphics name. The page shows the browser's graphics name on screen, for you only. A run takes about one to four minutes. `node tests/gpu-blur-tester.js` runs the page in a real browser and checks all of this, including that a phone user agent with a model name does not reach the copy text; `python3 modules/gpu-blur/tester/build.py` copies the current `gpu-blur.js` into the page (`--check` says whether it is current).

## Measured on real graphics hardware

One run each (2026.10.23) with the page above on a midrange phone (Android, Chrome 155) and a laptop with integrated graphics (Firefox 159), both drawing on the card. Time until the picture is finished, in milliseconds (**lower is better**); `auto` picked the card way and was the right pick at every size on both.

| Size | Phone: card / WebAssembly / JavaScript | Laptop: card / WebAssembly / JavaScript |
|---|---|---|
| 480 x 270 | 12.2 / 12.2 / 28.9 (tie) | 5.0 / 5.0 / 21.0 (tie) |
| 1920 x 1080 | 44.2 / 81.1 / 352 (1.8x faster) | 25.0 / 56.0 / 306 (2.2x faster) |
| 3840 x 2160 | 104 / 296 / 1544 (2.9x faster) | 96.0 / 240 / 1275 (2.5x faster) |

The picture matched the JavaScript reference at 100.0000% on both (through a canvas, 99.9922% on the phone). The longest page task (lower is better) is the catch on the laptop: the card way finishes sooner but holds the page longer, 25.0 against 11.0 ms for WebAssembly at 1920 x 1080 and 96.0 against 58.0 ms at 3840 x 2160, with a worst single task of 125 ms. On the phone the two were level (44.5 against 40.4 ms at 1920 x 1080). Use the card way for speed. Where the page must stay responsive during a big blur, pass `{ route: 'wasm' }` or blur in smaller pictures.

## Rebuild the WebAssembly

`wasm/blur.c` is the source (about 90 lines of C with SIMD). `sh modules/gpu-blur/wasm/build.sh` builds `wasm/blur.wasm` with clang 18 or newer and its wasm32 target (no other tool); `sh modules/gpu-blur/wasm/build.sh --check` says whether the shipped file is byte for byte what the source builds. `python3 modules/gpu-blur/wasm/embed.py` writes the file into `gpu-blur.js` between the `WASM:BEGIN` and `WASM:END` markers (`--check` compares). `node modules/gpu-blur/test/run.js` runs both checks when clang is present.

## Limits

- The blur is a close Gaussian, not an exact one; a true Gaussian of the same width differs by 1.7 of 255 on average on the test picture.
- The four channels are blurred separately, as stored (straight, not premultiplied). A picture with partly see-through pixels gets a slight dark or light fringe where color meets transparency; for such pictures premultiply first if that matters. A canvas keeps premultiplied colors, so reading a see-through canvas gives slightly different bytes than the ones that went in.
- At most 33,554,432 pixels (8192 x 4096) and radius 100. The WebAssembly way holds two copies of the picture in memory (about 8 bytes a pixel) until `release()` or the page ends; a card way picture is limited by the card's texture size and falls back to WebAssembly above it.
- The module times a small probe once, on first use. A device that changes speed later (for example a card that gets busy) keeps the first answer; pass `route` to override.
- Node has no WebGL 2 and no canvas: `blurSync` and `blur` with bytes work there (WebAssembly, then JavaScript).
- The real-card speed of the shipped shader was not measured; see "Measured".

## For AI agents

- One file, `gpu-blur.js`; copy it with its MIT header. Global `GpuBlur`. Call `GpuBlur.blur(src, w, h, radius, { out })`, read `result.route` if you want to know which way ran.
- To draw a blurred sprite or glow: `blur(canvas, w, h, r)` once, keep the returned canvas, `drawImage` it every frame. Do not call `blur` every frame for a picture that does not change.
- Do not look at the browser's name to choose a way; use `opts.route` only to force one for a test.
- The three ways must stay byte-identical: change `wasm/blur.c`, `boxLineJS` and the shader together, then run `node modules/gpu-blur/test/run.js` and `node modules/gpu-blur/test/mutants.js` (every mutant must be caught) and `tests/gpu-blur-browser.js` in each browser.
- Adopt it in a game or app only where a blur or glow is actually drawn, and after a real-device number from the demo's speed button.

## Prior art and credits

Box blur by running sums and the idea that three box blurs approximate a Gaussian are old and well known (the central limit theorem; the fast box-blur write-ups by Ivan Kutskir, 2013, and Wojciech Jarosz's "Fast Image Convolutions", 2001). Separable two-pass blur on the card is standard WebGL practice. The WebAssembly kernel, the shader and the JavaScript twin were written for this repository and start from the lab test files in this project's WebGPU study. Measured against, not copied from: stackblur-canvas 3.0.1 (MIT, Mario Klingemann's StackBlur algorithm, ported by flozz and others), glfx 0.0.4 (MIT, Evan Wallace), the canvas `filter` property and the CSS `filter` property.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
