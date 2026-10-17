# walker-sim changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New module, cut from Net Flow Map's simulator. It sends random walkers through a network and reports where they end, how many steps and what it cost, with a 95% range on every result and the exact odds beside them for checking. Runs are repeatable from a seed, however they are cut into batches. Measured in Node on a network of 199 items and 561 links: 100,000 walkers in 57 ms (about 1.75 million a second), and the worst gap to the exact odds fell from 1.74 percentage points at 1,000 walkers to 0.12 at 100,000. New compared with the Net Flow Map original, which was built into the app: `graph` turns a plain list of `{ from, to, weight }` links into the network (an unknown start item is a plain-words error), and the exact solver and what-if sweep run without the app around them. 16 kinds of random number are included.

Tested in: Node checks; the demo page in Firefox 158 and ungoogled Chromium 155, one at a time (`tests/flow-demos.js`, 2026-10-17). Not run: WebKitGTK, a phone.
