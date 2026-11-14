**New in 1.4.1: the worker curtain is ready sooner, same pixels.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). With `worker: true`, the worker's pixels go on the canvas as soon as they arrive, so the curtain is ready 1.7 to 2.5x sooner in Chromium, 2.8 to 4.4x sooner in Firefox and 1.5 to 2.0x sooner in WebKitGTK.

**Ready ahead on a busy page, real laptop, 2026.11.14, 9:26 AM Eastern, 16 cores.** A page busy 18 ms of every frame, fresh page each time, median of 5, ms until the curtain is ready; lower is faster. One run per browser on one machine.

| way | Firefox 161 | Chrome 157 |
|---|---:|---:|
| page painting (worker off) | 160 | 1981 |
| `worker: true` | 30 | 59 |
| worker started early (`startWorker()`) | 24 | 37 |

With `worker: true` the curtain is ready 5.3 times sooner than page painting in Firefox and 34 times sooner in Chrome on a page that never goes quiet. Chrome page-painting runs swung from 0.9 to 4.0 s.
