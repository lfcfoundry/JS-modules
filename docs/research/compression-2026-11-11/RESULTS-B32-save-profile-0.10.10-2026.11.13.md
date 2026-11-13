# Save profile on lfc-pack 0.10.10, plus three scatter checks (E36)

2026.11.13 5:46 to 5:50 PM Detroit. Base: JS-modules main d9e955c (lfc-pack 0.10.10: B28 + B30 + B31 shipped).

## Where a packRowsParallel taxi save goes (300k rows, later saves, median of 6, `php.html`)

| ms | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| Row scatter (main thread) | 164 | 171 | 178 |
| Main-thread encode (small columns, strings) | 26 | 20 | 28 |
| Gate + prep + footer | 16 | 18 | 13 |
| Waiting on helpers after the last block | 28 | 16 | **163** |
| Total | 234 | 225 | 382 |

- The scatter is about 70% of the main thread's time in every browser.
- WebKitGTK spends 163 ms waiting for the helpers after the last block. That's the biggest piece that isn't the scatter.

## Checks that found nothing

- **Text route:** `JSON.stringify` rows, then encode, then `packParallel` with 3 helpers. Totals were 389 to 584 ms in Chromium, 391 to 524 in Firefox, 366 to 768 in WebKitGTK. packRowsParallel took 230 to 307 / 211 to 238 / 217 to 283 ms. The text route is 1.5 to 2.5x slower. Dropped.
- **Leaner scatter (G):** flat per-column state arrays plus one presence bit per full row (the B27 idea), on 33k-row blocks (`sc2.html`). Chromium was even (126 to 142 ms against 129 to 135), Firefox even, and WebKitGTK 1.37x slower once warm (106 to 114 ms against 76 to 81). Dropped.
- With B29 (parked earlier), that makes three scatter rewrites that don't beat the B21a loop. The loop is close to the engines' floor for `for...in` plus keyed reads (about 29 ns per value).

## Leads

1. **Column input:** a call that takes columns (one array per key) skips the scatter entirely. It fits callers that already hold columns, such as the Netflow columnar model. It's a new API, so it goes on an owner card and then a name card.
2. **WebKitGTK helper tail (163 ms):** split the biggest number columns of the last block across helpers, or send the last block's columns first. Next: test this.

Catalog: save profile on 0.10.10 (E36): scatter about 70% of main-thread time; the text route and leaner scatter G were dropped; WebKitGTK helper tail 163 ms. RESULTS-B32-save-profile-0.10.10-2026.11.13.md.

## Correction (5:55 PM)

The WebKitGTK numbers above come from the instrumented build. Uninstrumented 0.10.10 takes 194 ms on a later WebKitGTK save (`rp33-webkit.json`), so most of the "163 ms helper wait" was the cost of the timing calls. See RESULTS-B33.
