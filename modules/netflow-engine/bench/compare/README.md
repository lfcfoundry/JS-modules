# Layout comparison bench

Runs the Netflow engine's layouts against general graph-layout libraries in a real browser, one case per fresh page, and prints plain markdown tables. Nothing here ships with the module; the competitor libraries are installed only to run it.

## What it compares

| Task | Engine against | Quality number (lower is better) |
|---|---|---|
| Force (springs), network | d3-force 7.9.0 (ISC), Cytoscape cose 3.34.4 (MIT) | stress |
| Distances (stress), network | ELK stress 0.12.0 (EPL-2.0 or GPL-3.0-or-later) | stress |
| Layered, top to bottom | dagre 0.8.5 (MIT), ELK layered 0.12.0 | crossing link pairs |

Sizes 300, 1,000 and 3,000 items. Each case runs in a fresh page under the content policy `script-src 'self' 'wasm-unsafe-eval'`. "Cold" is the first layout in that page; "warm" is the second. Three repeats (a case over 20 s runs once), 60 s limit per case, libraries take turns in a rotating order so no one always goes first or last. A case that went over the limit in an earlier result file (`SKIP`) is not run again and is reported as "over 60 s".

## Run it

```
cd modules/netflow-engine/bench/compare
npm install                      # the four competitor libraries, nothing else
export NODE_PATH=<folder with puppeteer-core>
node run.js chromium  out/chromium.json
node run.js firefox   out/firefox.json
xvfb-run -a node run.js webkit    out/webkit.json
xvfb-run -a node run.js epiphany  out/epiphany.json
node report.js out               # markdown tables, one column per browser
```

Use only the four approved test browsers (see the `browsers` branch of the private knowledge base), one at a time. Line 1 of every run prints the real browser version. Settings: `REPS`, `SIZES`, `LIMIT`, `SKIP` (an earlier result file; its over-the-limit cases are not run again), `ONLY` (regex on `lib|task|n`), `LIBS` (folder with the libraries), `CHROMIUM`, `FIREFOX`.

Node is not used for speed numbers; only browsers are.
