# memory-compression: benchmark and check tools

Copyright (c) 2026 LFC Foundry. MIT License.

These scripts made every number in the module README and in the research review. They need libraries that the module itself does not (the module has no dependencies), so they are kept apart in this folder. Nothing here is loaded by the module.

## Get the libraries (the versions measured)
```
mkdir /tmp/jso-deps && cd /tmp/jso-deps
npm i msgpackr@2.1.0 cbor-x@1.6.6 @msgpack/msgpack@3.1.3 notepack.io@3.0.1 avsc@5.7.9 bson@7.3.3 zipson@0.2.12 compress-json@3.4.0 lz-string@1.5.0 jsonpack@2.0.0 @uwdata/flechette@2.7.0 fflate@0.8.3 lz4js@0.2.0
npm i esbuild util        # only to build the avsc browser bundle (below)
```
Point the scripts at that folder with `JSO_DEPS=/tmp/jso-deps/node_modules/` (this is the default).

## Node
- `node --expose-gc modules/memory-compression/bench/node-run.js [data-set-regex] [library-regex] [runs]`: size, pack and unpack time for every library on 7 generated data sets, with an exact check of each result. `--expose-gc` makes it collect garbage before every run. Output is markdown tables. The libraries that are too slow for the big sets (zipson, compress-json, lz-string, jsonpack, bson, fflate level 6) run on the first 20,000 items and say so.
- `node modules/memory-compression/bench/features.js`: which values each library brings back exactly (the table in the README).
- `JSO_OLD=/path/to/older/memory-compression.js node --expose-gc modules/memory-compression/bench/graph-run.js [items=100000] [runs=3]`: a network whose links point at the node objects, packed with `refs: true` (shared identity is checked in every result). `JSO_OLD` adds an older build as a row.
- `node --expose-gc modules/memory-compression/bench/patterns-run.js` and `wasm-float-run.js`: what text patterns, the WebAssembly helper and the `float32` option change (size and time, each with the option on and off).
- `JSO_OLD=/path/to/older/file.js` also works with `node-run.js` and `build-page.js` (adds `jso-1.0.0-fast` and `jso-1.0.0-small` rows). When two builds go through one page, run them alternately many times before trusting a gap: the build that runs first or right after a heavy one looks slower by up to 30%.
- `node --expose-gc modules/memory-compression/bench/mem-run.js`: memory held as objects, as packed bytes and as a `view()`, and what `view()` reads cost.
- `python3 modules/memory-compression/bench/summarize.py out.md`: turns the output of the runners into one compact table.

## Browsers (one at a time; read the `browsers` branch README first)
```
node -e "require('esbuild').buildSync({entryPoints:['node_modules/avsc/etc/browser/avsc-types.js'],bundle:true,format:'iife',globalName:'AVSC',minify:true,define:{'process.env.NODE_ENV':'\"production\"',global:'globalThis'},outfile:'/tmp/avsc-bundle.js'})"
AVSC_BUNDLE=/tmp/avsc-bundle.js node modules/memory-compression/bench/build-page.js      # writes bench/jso-bench.html (not kept in git)
FIREFOX=... CHROMIUM=... node modules/memory-compression/bench/browser-run.js firefox|chromium|webkit warm        # WEBKIT_KIND=epiphany for GNOME Web
node modules/memory-compression/bench/demo-check.js firefox|chromium|webkit|epiphany      # the demo page
```
`browser-run.js` takes `quick | warm | full`, then an optional data-set regex and library regex. `warm` is 12 runs on the smaller sets. Firefox is started with `privacy.reduceTimerPrecision` off so that milliseconds are real. It needs puppeteer-core (`FP_DEPS=/path/to/node_modules/`) for Firefox and Chromium and `tools/webkit-driver` (here) for WebKitGTK; the first line printed is the real browser version.

## Things worth knowing when reading the numbers
- avsc needs a schema. Here it is inferred from the data with `Type.forValue` before timing starts (not counted), and its 32-bit `float` is changed to `double` because otherwise decimals lose digits. It hands back its own record class, so it is checked with prototypes ignored and marked §.
- Strings made by joining pieces (`'Item ' + i`) are slower for every library than strings read by `JSON.parse`; the data sets are built the first way, as an application builds them.
- The first run of a page is slower in some engines (WebKitGTK especially) until the engine has optimized the code; the browser tables are best of 12.
