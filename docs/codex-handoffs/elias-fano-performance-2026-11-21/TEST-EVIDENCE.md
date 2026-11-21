# Qualification and evidence

## Current repository code

Environment: Android Linux, `aarch64`, Node 26.13.1, V8 14.6.202.34-node.40. The Elias–Fano directory has no diff from current `main` (`d4a8e5b0ba801e2737bf1307db25626b3f7e45cb`).

Passed:

- `node tests/kits.js --only 'elias-fano' --serial`: all five registered steps passed in 95.9 s: main Elias–Fano, randomized lists, partitioned, blocks, and intersections.
- Standalone `test/compact.js`, `test/lists-many.js`, `test/out.js`, `test/spare.js`, and `test/trim.js`: all passed.
- `python3 modules/elias-fano/wasm/embed.py --check`: the JS file carries the committed Wasm files.
- Temporary profile scripts: adaptive fallback boundary probes and 38,400 JS-prototype generated checks passed; the adaptive C prototype agreed with the current code on 20,000 random scalar and 20,000 random batch outputs. Shift 5/7 outputs agreed value by value.

## Rebuilt C and embedded Wasm

`sh modules/elias-fano/wasm/build.sh --check` **fails byte-for-byte** with the installed Clang 21.1.8. The committed Wasm files are 18,564 and 20,327 bytes; Clang 21 produced 18,228 and 20,021 bytes. The module’s current `.js` embedding matches the committed `.wasm` files. The repository changelog records the shipped Wasm as built with Clang 18.1.3. No Clang 18 binary is installed here, so this run cannot decide whether the source and artifacts reproduce exactly with that toolchain.

To check semantics despite the toolchain difference, a scratch copy was rebuilt and embedded with Clang 21; **all ten module test files passed** against those rebuilt artifacts:

- `test/run.js`: 72 lists, 131,680 single queries, all batches and JS/Wasm byte identity passed.
- `test/fuzz.js`: 400 seeds passed in JS and Wasm.
- `test/blocks.js`: 25 lists, 64,100 queries, 3,000 damaged-blob cases.
- `test/compact.js`, `test/intersect.js` (1,932 cases), `test/lists-many.js` (including 5,000 IDs), `test/out.js`, `test/partitioned.js` (74 lists × 4 chunk sizes, 530,336 single queries and 96,000 list queries), `test/spare.js`, and `test/trim.js`: all passed.

The scratch rebuild is under `/data/data/com.termux/files/usr/tmp/elias-fano-perf-20261121/clang21-copy` on the preparation host only.

## Browser qualification not run

The current private browser branch requires Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64, one at a time. None is installed in this ARM64 Android environment. Its installed Chromium 157.0.8103.78 is not on the approved list and was not used. Therefore none of the performance leads is browser-qualified, and no real-phone result is reported.

Before reporting a production recommendation, run the current module browser suites with all three approved browsers. Re-read the knowledge-base `browsers` branch README before each run, print the actual browser version in the result, and label every timing with its browser and version.
