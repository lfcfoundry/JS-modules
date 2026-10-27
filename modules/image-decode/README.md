# image-decode

**Version 1.2.2 · API 1**

**Tested in:** not recorded

The version is also in code as `ImageDecode.version`. Run the tests (offline, about a second): `node modules/image-decode/test/run.js`. The real-browser check is `tests/image-decode-browser.js`.

Turns a picture file (PNG, JPEG, WebP, AVIF or GIF) into something a canvas can draw, so the page does not freeze at the first `drawImage`. About 12 KB with its comments, no dependencies.

A picture is normally decoded (turned from file bytes into pixels) at the moment it is first drawn, on the page's main thread, and a 2048 x 2048 sheet freezes the page for 45 to 95 ms. Browsers can decode off the main thread, but each one does it through a different door: Chromium only through `createImageBitmap`, Firefox and WebKit only through `Image.decode()` (their `createImageBitmap` freezes the page for the whole decode, and Chromium's `Image.decode()` is decoded again at the first draw). `ImageDecode.load` picks the right door for the browser, hands back something `drawImage` accepts, and tries the other door once if the first fails. `loadAll` loads a list in order, a couple at a time. `supports` and `pick` tell you whether the browser can read WebP or AVIF, so a page can ship the smallest format it can read.

## Why it exists

A game should decode its built-in pictures off the main thread before they are first needed, and ship WebP or AVIF where that is smaller. Doing that by hand means knowing which of two browser features works in which browser (measured below: the answer is opposite in Chromium and in Firefox/WebKit), keeping a one-pixel probe per format, and not starting twenty decodes at once. The sprite sheets in the games are the case this was made for: a 2048 sheet drawn the plain way froze the page for 44 ms in Chromium, 45 in Firefox and 87 to 94 in WebKit, well over the 8 ms a page task should stay under. No library for this was found that stays under a few lines of the browser's own calls; this module is those lines, chosen per browser and tested.

## Use

Copy `image-decode.js` (browser global `ImageDecode`, or `require` in Node). `demo.html` is a one-button comparison on your own browser.

```js
// One picture. source: a Blob, bytes (ArrayBuffer or typed array), a data: address, or a url.
ImageDecode.load('sprites.png').then(function (sheet) {
  ctx.drawImage(sheet, 0, 0);            // sheet is an ImageBitmap or an Image; drawImage takes both
});

// A list, in order, two at a time. A picture that fails gives null (the reasons are in list.errors).
ImageDecode.loadAll(['hero.webp', 'tiles.webp', 'ui.webp'], {
  concurrency: 2,
  onEach: function (picture, index) { if (index === 0) startMenu(picture); }   // the first one is ready first
}).then(function (list) { /* list[0], list[1], list[2] */ });

// Decode the next stage's sheets in idle time while this stage plays, then draw them at once at the stage change (since 1.2.0):
var next = ImageDecode.ahead({ forest: 'forest.webp', cave: 'cave.webp' });   // starts by itself, one picture at a time, when the page is idle
// ... at the stage change:
next.get('cave').then(function (sheet) { ctx.drawImage(sheet, 0, 0); });      // already there (next.ready('cave') is true), or starts it now if it is not
next.release('forest'); next.cancel();   // free a picture you are done with; stop what has not started

// Ship the smallest format the browser can read:
ImageDecode.pick({ avif: 'sheet.avif', webp: 'sheet.webp', png: 'sheet.png' }).then(function (url) { return ImageDecode.load(url); });

ImageDecode.supports('avif').then(function (yes) { /* true or false, asked once and remembered */ });
ImageDecode.close(sheet);                // frees an ImageBitmap's memory when you are done (an Image needs nothing)
ImageDecode.strategy;                    // 'bitmap' or 'decode': the door 'auto' uses in this browser
```

Options of `load`: `strategy` (`'auto'` by default, or `'bitmap'` or `'decode'` to force a door; a forced door is not retried on the other). Options of `loadAll`: `concurrency` (default 2), `onEach(picture, index)`, and the options of `load`.

A data: address is turned into bytes in place (`atob`), with no network request. A kind of picture is read from its first bytes, so a wrong type in a data: address does no harm.

## How it works

`auto` uses `createImageBitmap` where the browser is in the Chromium family (client hints saying "Chromium", or a user agent with `Chrome/` and none of Firefox, Epiphany or WebKitGTK) and `Image.decode()` everywhere else. A page worker, which has no `Image`, uses `createImageBitmap`. The `Image.decode()` door makes one object address for the Blob, waits for `decode()`, and frees the address; for it the page's Content-Security-Policy needs `img-src blob:`, and if that is missing the load falls back to `createImageBitmap`, which needs nothing. `supports` loads a one-pixel picture of the format (made by an encoder and checked against the format's first bytes in the tests) and remembers the answer.

`loadAll` starts the first `concurrency` pictures at once and the next one each time one finishes, so the browser is never handed the whole list, and the pictures come back in list order. It never rejects: a picture that cannot be read gives `null`.

No wasm: the browser's decoder is already native code, so there is nothing for wasm to speed up here.

## Decode ahead (`ahead()`, since 1.2.0)
`ImageDecode.ahead(items[, opts])` decodes pictures before they are needed, one at a time (`concurrency`, default 1), each start waiting for an idle moment (`requestIdleCallback`, at most `timeout` ms, default 300, on a page that never goes idle; without it a short timer). `idle: 'now'` starts at once. `items` is an array or an object of sources. It returns `get(key)` (a promise of the drawable, started at once ahead of the queue if it had not started), `ready(key)`, `drawable(key)`, `release(key)`, `cancel()` and `count`; `onEach(drawable, key)` is called as each one finishes, and one bad picture rejects only its own `get()`.

**Wait at the stage change, ms, lower is better** (a 2048 px sheet; request until it is drawn, first draw included; a stage playing at about 4 ms of work per frame; median of 5; Firefox, WebKit timers read whole ms). Load when asked / decoded ahead:

| Sheet | Chromium 155.0.8059.39-1 | Firefox 158.0 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---|---|---|---|
| PNG | 259 / 1.6 | 370 / 2 | 361 / 6 | 385 / 7 |
| WebP | 286 / 1.6 | 366 / 2 | 452 / 64 | 341 / 73 |

**Longest gap between frames of the playing stage while it decodes, ms, lower is better** (one frame is about 16.7): PNG 16.7 / 16.6, 17.2 / 17.1, 20 / 17, 21 / 17; WebP 16.7 / 16.7, 17.2 / 16.3, 77 / 16, 25 / 17. Decoding ahead did not add a stutter in any browser; WebKit's lossless WebP still pays 64 to 73 ms at the first draw after the wait (the browser decodes it lazily), so ship PNG there or draw it once off screen. Not measured: a phone.

## Which format is better for my sprites? (`format-check.html`)

Open `format-check.html` on a phone or laptop, tap **Run the check**, and it measures the same sprite sheet as PNG, WebP and AVIF in that browser: file size, longest freeze and time until ready (medians of 7 tries), then says in plain words which format to use there, with a Markdown copy button for the results. With nothing picked it draws a 1024 x 1024 sample sheet and saves it in each format the browser can make (Chromium and Firefox make WebP, WebKit makes neither WebP nor AVIF); pick your own PNG, or the same sheet as PNG, WebP and AVIF, to test your art.

What it showed on two sheets of sample art in the four test browsers: WebP and AVIF files are 75% to 91% smaller than PNG, but in Chromium 155 and Firefox 158 they take longer to open than the PNG (for the 1024 sheets, PNG 16 and 18 ms against WebP 29 and 31 ms and AVIF 21 and 26 ms, Chromium / Firefox), with the same 1 to 2 ms freeze. In WebKit the 2048 WebP sheet opened as fast as the PNG or a little faster (80 against 86 ms in WebKitGTK, 82 against 91 in GNOME Web). So the smaller formats win on download size everywhere, and win on opening time only in WebKit.

## Under a strict Content-Security-Policy (`img-src data:` only)

Our games ship `img-src data:` and no `img-src blob:`. Firefox and WebKit then cannot read a picture through a blob: address, which was this module's route for them, and 1.0.0 fell back to `createImageBitmap`, which freezes those browsers for the whole decode. Since 1.1.0 the module notices the refusal once, remembers it, and goes through a **background worker** (WebKit family; needs `worker-src blob:` in the policy) and then a **data: address** (made by `FileReader`; needs `img-src data:`). Chromium is not affected: `createImageBitmap` needs no address. `load(x, { strategy: 'decode', address: 'blob' | 'data' | 'worker' })` forces one of the routes; the default `'auto'` is the order above.

Longest page freeze for one 2048 x 2048 sheet under that policy, ms, lower is better, plain `new Image()` / `ImageDecode.load` (median of 5 tries; Firefox is the median of 3 runs because it swings from run to run; tests/image-decode-browser.js opens a page with the same policy in each browser; Firefox and WebKit timers read whole milliseconds):

| Sheet and policy | Chromium 155.0.8059.39-1 | Firefox 158.0 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---|---|---|---|
| PNG, `img-src data:` | 111 / 3.4 | 70 / 68 | 82 / 39 | 81 / 39 |
| PNG, plus `worker-src blob:` | 115 / 3.4 | 58 / 61 | 77 / 11 | 79 / 10 |
| WebP, `img-src data:` | 104 / 2.6 | 85 / 8 | 74 / 6 | 70 / 7 |
| WebP, plus `worker-src blob:` | 93 / 2.4 | 85 / 9 | 73 / 7 | 67 / 9 |

Plainly: WebKit and GNOME Web are fine in both cases (PNG 10 to 39 ms against about 80, WebP 6 to 9 ms against about 70). Firefox is fine for WebP and AVIF (about 9 ms against 84) but **a large PNG gets no help under this policy** (68 ms against 70): a 3.7 MB data: address costs the page about as much as plain decoding. If your policy has `img-src data:` only, ship WebP or AVIF sprites for Firefox. (The Firefox plain WebP time in the plus-worker row is taken from the first row, because a repeated plain data: address is answered from the browser's picture cache.) Not measured: a phone, and policies that also drop `data:`.

## Measured (the four test browsers, one at a time)

Sprite sheets of 1024 and 2048 pixels square, the same artwork saved as PNG, WebP and AVIF (made by `test/make-sheets.py` with Pillow; 1.4 and 3.7 MB as PNG). Each number is the median of 7 tries in a run; Chromium and Firefox are the median over 4 runs, WebKitGTK and GNOME Web over 1 run. **Longest freeze** is the longest gap in a message loop running on the page while the picture was loaded and drawn once; it is what a player sees as a stutter. **Ready after** is start to drawn. Timers read whole milliseconds in Firefox and WebKit, so small values are rough. "Plain" is `new Image()`, wait for `onload`, `drawImage`.

**Longest freeze, ms, lower is better: plain / ImageDecode.load**

| Picture | Chromium 155.0.8059.39-1 | Firefox 158.0 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---|---|---|---|
| 1024 PNG | 14.6 / 1.4 | 16.0 / 2.0 | 32 / 4 | 33 / 4 |
| 2048 PNG | 44.2 / 3.1 | 45.0 / 2.0 | 87 / 9 | 94 / 9 |
| 2048 WebP | 92.2 / 3.2 | 90.0 / 2.0 | 80 / 4 | 87 / 4 |
| 2048 AVIF | 59.2 / 2.6 | 77.0 / 2.5 | cannot read AVIF | cannot read AVIF |

**Ready after, ms, lower is better: plain / ImageDecode.load**

| Picture | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---|---|---|---|
| 1024 PNG | 19.2 / 15.4 | 21.0 / 22.5 | 33 / 33 | 33 / 30 |
| 2048 PNG | 51.6 / 45.5 | 59.5 / 59.0 | 88 / 86 | 95 / 91 |
| 2048 WebP | 94.8 / 87.7 | 92.0 / 94.5 | 80 / 80 | 87 / 82 |
| 2048 AVIF | 61.3 / 57.5 | 79.0 / 98.5 | not readable | not readable |

Where little changed, or where it is worse: the time until a picture is ready is level (within about 5%, mostly noise) except **AVIF in Firefox at 2048, which is ready 25% later** (79 to 98.5 ms; the freeze still drops from 77 to 2.5 ms). WebKit's freeze at 2048 PNG is 9 ms, just over the 8 ms a page task should stay under, because WebKit still spends a few milliseconds on the main thread before `decode()` returns. WebKitGTK 2.52.6 and GNOME Web 46.5 cannot read AVIF at all (`supports('avif')` is false; `load` rejects, it does not hang), so ship a WebP next to an AVIF.

The other doors, for the same sheets (longest freeze, ms, lower is better; 2048 PNG):

| Door | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---|---|---|---|
| plain (`onload`, draw) | 44.2 | 45.0 | 87 | 94 |
| `Image.decode()` then draw | 43.4 | 2.5 | 8 | 9 |
| `createImageBitmap` | 2.5 | 48 | 108 | 105 |
| `createImageBitmap` inside a worker (first measurement only, 1 run) | 2.5 | 53 | 9 | 10 |

A worker is not used: it helps WebKit about as much as `Image.decode()`, does nothing for Firefox, and would need `worker-src blob:` in the page's policy.

**A list of 8 sheets (1024 PNG each), plain one after another vs `loadAll` two at a time** (ms, lower is better; first = first picture ready; freeze = longest freeze while loading and drawing all eight):

| Browser | Plain: total / first / freeze | loadAll: total / first / freeze |
|---|---|---|
| Chromium 155.0.8059.39-1 | 214.5 / 12.9 / 113.2 | 133.7 / 26.1 / 8.7 |
| Firefox 158.0 | 518 / 34 / 245.5 | 365.5 / 82.5 / 6.0 |
| WebKitGTK 2.52.6 | 341 / 17 / 216 | 224 / 56 / 19 |
| GNOME Web 46.5 | 397 / 22 / 249 | 237 / 61 / 20 |

The whole list is ready 30 to 40% sooner and the longest freeze falls from 113 to 249 ms down to 6 to 20 ms, but the **first** picture is ready later (13 to 34 ms before, 26 to 83 ms now) because two decodes share the processor; use `concurrency: 1` to get the first picture as soon as possible.

Not measured: a phone GPU (the test machine draws canvases in software, so the draw step may differ on a Pixel), memory use of an ImageBitmap against an Image, and animated GIFs (a GIF is drawn as its first frame by `createImageBitmap` and animated by an Image; use a url and your own `Image` if you need the animation).

## How it compares

| Alternative | Size (smaller is better) | Speed (lower freeze is better) | Features | Where it wins / loses |
| --- | --- | --- | --- | --- |
| **image-decode 1.2.0** (this module, MIT) | 21.1 KB with comments | Freeze 2 to 9 ms; a stage change that decoded ahead waits 1.6 to 7 ms (tables above) | Right door per browser, list loading, decode ahead in idle time, format checks, bytes/data:/url/Blob input | Needs the page to allow `blob:` pictures for the Firefox/WebKit door (falls back otherwise) |
| Plain `new Image()` + `onload` | 0 | Freeze 44 to 94 ms at 2048 | None | The simplest; freezes the page at the first draw |
| Plain `createImageBitmap` | 0 | Good in Chromium (2.5 ms), freezes Firefox (48) and WebKit (105) | Blob input only | Right in one browser family and wrong in the other |
| Plain `Image.decode()` | 0 | Good in Firefox and WebKit (2.5, 8), no help in Chromium (43) | None | Opposite of the line above |
| An image-loading library | Not measured | Not measured | Not checked | No library was compared; this was written because the work is a few lines per browser |

## Prior art and credits

`createImageBitmap` and `HTMLImageElement.decode()` are web platform features; this module only chooses between them and adds the list loader and format probes. The one-pixel probe pictures were made with Pillow.
