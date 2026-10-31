# image-decode developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.2.2 · API 1 · 2026-10-27

### Quick
Percent-coded data: addresses that hold binary pictures now load instead of being refused.

## 1.2.1 · API 1 · 2026-10-25

### Quick
Image decoding now frees its temporary address if the browser throws immediately.

## 1.2.0 · API 1 · 2026-10-22

### Quick
1.2.0: new ImageDecode.ahead() decodes the next stage's sheets in idle time, so a stage change draws in 1.6 to 7 ms instead of 260 to 450 ms.

### Deep
Add-on (minor, API unchanged). ImageDecode.ahead(items, opts) decodes pictures before they are needed, one at a time, each start waiting for an idle moment (requestIdleCallback with a 300 ms limit, else a 50 ms timer; idle:'now' starts at once). get(key) gives the kept picture, or starts it at once if it had not started; ready, drawable, release, cancel, onEach. A bad picture rejects only its own get(). Wait at the stage change for a 2048 px sheet, ms, lower is better, load when asked / decoded ahead (Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5): PNG 259/1.6, 370/2, 361/6, 385/7; WebP 286/1.6, 366/2, 452/64, 341/73. Longest frame gap of the playing stage while decoding: no stutter added (PNG 16.7/16.6, 17.2/17.1, 20/17, 21/17; WebP 16.7/16.7, 17.2/16.3, 77/16, 25/17; a frame is about 16.7). WebKit lossless WebP still pays 64 to 73 ms at its first draw (lazy decode). A first version waited up to 2 s for an idle moment on a page that never goes idle; the limit is now 300 ms. Size: image-decode.js 16,890 to 21,051 bytes. 30 Node checks (3 new); real-browser run tests/image-decode-ahead-browser.js in all four.

## 1.1.0 · API 1 · 2026-10-22

### Quick
A page that refuses blob: pictures (no img-src blob:) now loads through a background worker or a data: address instead of freezing; new option address: 'auto', 'blob', 'data' or 'worker'.

### Deep
New: image-decode works under the strict Content-Security-Policy our games ship (img-src data: only, optionally worker-src blob:). Before, Firefox and WebKit decoded through a blob: address; a page without img-src blob: refused it and the load fell back to createImageBitmap, which freezes those browsers (2048 PNG: 106 ms WebKitGTK, 104 ms GNOME Web, 45 ms Firefox, lower is better). Now, when the page refuses blob: pictures, the module remembers that and uses a background worker (WebKit family, needs worker-src blob:) and then a data: address made by FileReader. Option address: 'auto' (default), 'blob', 'data' or 'worker' on load(). Longest page freeze for a 2048 x 2048 sheet under img-src data: only (ms, lower is better, plain new Image() / ImageDecode.load, Firefox median of 3 runs): PNG Chromium 111 / 3.4, Firefox 70 / 68 (no gain: a 3.7 MB data: address costs the page as much as plain decoding), WebKitGTK 82 / 39, GNOME Web 81 / 39; WebP Chromium 104 / 2.6, Firefox 85 / 8, WebKitGTK 74 / 6, GNOME Web 70 / 7. With worker-src blob: added: PNG Chromium 115 / 3.4, Firefox 58 / 61 (no gain), WebKitGTK 77 / 11, GNOME Web 79 / 10; WebP Chromium 93 / 2.4, WebKitGTK 73 / 7, GNOME Web 67 / 9. Chromium keeps using createImageBitmap, which needs no address (numbers above). Bigger pictures take longer through a data: address, so under this policy ship WebP or AVIF sprites for Firefox. supports() works under the strict policy. Test: tests/image-decode-browser.js now opens a page with that policy in all four browsers (blob: really refused, pixels equal to the plain picture, supports true, timings), 27 Node checks (5 new).

## 1.0.0 · API 1 · 2026-10-22

### Quick
New module: loads PNG, JPEG, WebP and AVIF pictures without freezing the page at the first draw (a 2048 sheet froze it 44 to 94 ms, now 2 to 9 ms), using the right way for each browser.

### Deep
New module. Loads a picture (PNG, JPEG, WebP, AVIF, GIF) as something a canvas can draw without the page freezing at the first drawImage, loads a list in order a few at a time, and says whether the browser can read WebP or AVIF.

1. **`ImageDecode.load(source)`.** Source may be a Blob, bytes, a data: address or a url. Browsers decode off the main thread through different doors: Chromium only through createImageBitmap (its Image.decode() is decoded again at the first draw), Firefox and WebKit only through Image.decode() (their createImageBitmap freezes the page for the whole decode). `auto` uses createImageBitmap in the Chromium family and Image.decode() elsewhere, and tries the other door once if the first fails (for example the page has no `img-src blob:`).
   Longest freeze loading and drawing one 2048 x 2048 sheet, ms, lower is better, plain (Image, onload, drawImage) / image-decode: PNG 44.2 / 3.1, 45.0 / 2.0, 87 / 9, 94 / 9; WebP 92.2 / 3.2, 90.0 / 2.0, 80 / 4, 87 / 4; AVIF 59.2 / 2.6, 77.0 / 2.5, not readable, not readable. 1024 PNG: 14.6 / 1.4, 16.0 / 2.0, 32 / 4, 33 / 4. (Chromium and Firefox: median of 4 runs of 7 tries; WebKitGTK and GNOME Web: 1 run of 7.)
   Ready after (start to drawn), ms, lower is better, plain / image-decode, 2048 PNG: 51.6 / 45.5, 59.5 / 59.0, 88 / 86, 95 / 91; 2048 WebP: 94.8 / 87.7, 92.0 / 94.5, 80 / 80, 87 / 82. Level within about 5% except **2048 AVIF in Firefox: 79.0 / 98.5 (25% later; the freeze still drops from 77 to 2.5 ms)**.
   Not as good as hoped: WebKit's 2048 PNG freeze is 9 ms, just over the 8 ms a page task should stay under.
2. **`ImageDecode.loadAll(list, { concurrency })`.** Starts the first few at once and the next as each finishes, in list order; a bad picture gives null and the reasons are in `list.errors`. A list of 8 sheets (1024 PNG), plain one after another / loadAll two at a time: ready after 214.5 / 133.7, 518 / 365.5, 341 / 224, 397 / 237 ms (lower is better); longest freeze 113.2 / 8.7, 245.5 / 6.0, 216 / 19, 249 / 20 ms. The first picture is ready later (12.9 / 26.1, 34 / 82.5, 17 / 56, 22 / 61 ms) because two decodes share the processor; `concurrency: 1` gets it first.
3. **`ImageDecode.supports(type)` and `pick({ avif, webp, png })`.** A one-pixel picture per format, asked once. WebKitGTK 2.52.6 and GNOME Web 46.5 cannot read AVIF: supports is false and load rejects (it does not hang), so a WebP is shipped beside it.
4. **Tried and not used:** createImageBitmap inside a worker (freeze 2048 PNG, one run: 2.5 / 53 / 9 / 10 ms): good in Chromium and WebKit, no help in Firefox, and needs `worker-src blob:`.

5. **`format-check.html`.** A one-button page that measures the same sheet as PNG, WebP and AVIF in the browser it is opened in and says which to use, with a Markdown copy button. On two sheets of sample art: WebP and AVIF are 75% to 91% smaller than PNG but open slower in Chromium 155.0.8059.39-1 and Firefox 158.0 (1024 sheets, ready after, ms, lower is better, PNG / WebP / AVIF: Chromium 15.6 / 28.6 / 20.8, Firefox 18 / 31 / 26) with the same 1 to 2 ms freeze; in WebKitGTK 2.52.6 and GNOME Web 46.5 the 2048 WebP sheet opens as fast as the PNG or a little faster (80 / 86, 82 / 91 ms). WebKit cannot make WebP or AVIF from a canvas, so there the page needs files you pick.

File: `image-decode.js` 12,559 bytes with its comments, no dependencies, no wasm (the browser's decoder is already native code). 22 Node checks (fake browser objects) and 16 real-browser checks per browser (13 where AVIF cannot be read): PNG, lossless WebP and AVIF draw identical pixels by every door, and equal a plainly drawn PNG. Not measured: a phone GPU, memory of an ImageBitmap against an Image, animated GIFs.
