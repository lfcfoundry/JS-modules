<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Graph and map modules

These modules share consumers but not contracts. Keep layout, scene creation, drawing, and serialization as separate timing stages. Use an independent small-graph oracle and compare exact typed-list or SVG output where the README promises equality. Preserve deterministic order and do not fold one module’s optimization into another module’s source.

## graph-walk

**Base:** `graph-walk` 0.12.0. Start with `modules/graph-walk/test/run.js` and `test/run-wasm.js`.

Cover empty/one-node graphs, a chain, star, disconnected graph, self-loop, parallel edges, simple cycle, nested cycles, dense graph, and shuffled edge order. Exercise distances, loop-closing edge marks, components, topological order, and shortest paths against simple object-based reference algorithms. Vary directed/undirected mode and node/edge counts around typed-array index boundaries.

Check determinism for a fixed input ordering and explicitly record any API that permits order changes after edge permutation. Compare JavaScript and WebAssembly results field-for-field. Benchmark conversion to compact link lists separately from each walk; report allocations by typed-array type and length at 1k, 100k, and largest stable graphs.

## netflow-chord

**Base:** `netflow-chord` 1.0.0. Start with `modules/netflow-chord/test/run.js`; the README already records same-result comparisons with `netflow-circular` and d3-chord.

Vary item count, edge count, zero/positive/missing weights, repeated directed and undirected pairs, self-links if accepted, isolated items, and group aggregation thresholds. Permute input rows while preserving the documented item order. Test equal weights and equal sort keys to expose unstable band ordering. Include empty data, one item, two items, and a high-degree hub.

Compare arcs and bands with the d3-chord adapter and with `netflow-circular` field-for-field, including typed-array lengths, angular bounds, ring geometry, and stable tie order. Measure input preparation, layout, and downstream scene separately at 1k, 10k, 50k items. Do not claim an advantage from comparing a list input with an already-built square matrix.

## netflow-circular

**Base:** `netflow-circular` 1.5.2 with `netflow-hierarchy` 1.8.2 and `netflow-scene` 1.14.2. Start with `modules/netflow-circular/test/run.js` and the shared fixture.

Test both Chord and Bundles on balanced, star, disconnected, dense, long-chain and repeated-edge graphs. Vary grouping threshold, link weights, hierarchy depth, duplicate labels, hidden/isolated items, and shuffled input rows. Include empty/one-node output and the threshold immediately below/at/above grouped arcs. Measure layout, ordering search, scene, and SVG separately.

Check same arcs/bands or bundle routes as the small oracle and the expected `netflow-chord` output; compare SVG text when promised. Verify that repeated calls do not mutate the graph or retain an old grouping. Include current WebAssembly and fallback paths only where the current module exposes them. Treat scene optimizations in `netflow-scene` as a separate variable.

## netflow-engine

**Base:** `netflow-engine` 2.5.0. Start with `modules/netflow-engine/test/run.js`, `test/demo-browsers.js`, and `bench/compare` scripts. Re-read `AGENTS.md`: engine source is derived from Netflow Map and significant updates require the owner’s source brief; never hand-edit generated engine code.

Cover each documented layout family and add-on handoff with small oracle graphs, then ramp 1k/10k/50k/largest safe nodes. Vary depth, degree, cycles, missing values, saved-layout hit/miss, save-key invalidation, and repeated rebuild after a node move. Compare worker/Node/page only where available. Exercise WebAssembly ready/not-ready and JavaScript fallback. For saved layouts test exact same graph, changed label, changed topology, changed options, and hash collision sentinels.

Assert same positions, node/link fields, ordering, and saved-layout behavior as the app engine on shared fixtures. For `quickNetwork({ nodes, edges })`, add empty and one-node input, partial node batches, links with either endpoint not yet present, duplicate IDs, parallel/self-links, isolated nodes, and disconnected components. Assert `n`, `rough`, `cx`/`cy`/`size` typed-array lengths and values, scalar `width`/`height`, determinism, and no input mutation; verify unresolved endpoints and self-links follow the current skip behavior without running a full layout. Measure the quick estimate separately from the later exact layout at 10k and 50k items; the 2.5.0 release reports 5.9/4.6/6 ms and 23.5/39.5/60 ms for the quick path in Chromium/Firefox/WebKitGTK, versus 291/920 ms in Chromium for `previewOnly()` at those sizes. Reproduce only after checking device and harness differences. Separate preparation, algorithm, save lookup, and post-layout conversion. If the app and module disagree, stop and identify the version/fixture source; do not patch the generated module until a source brief is approved.

## netflow-plot

**Base:** `netflow-plot` 2.22.0. Start with `modules/netflow-plot/test/run.js`, `rest-and-wedges.js`, `line-uses.js`, `make-line.js`, and current speed-race tools. Recent line, wedge, and summary-input changes make regression controls especially important.

Across all 22 chart types, test rows and named columns (plain and typed), empty input, one row, null/undefined/NaN/infinity, negative/zero values, duplicate labels, long labels, and unsorted categories. For line/scatter, use 1k/10k/100k points, repeated x, monotone x, shuffled x, gaps, and infinite values. For bars/wedges, include all-zero, tiny slices, real “Other,” high category count, and exact aggregate ties. Check `markAt` at boundaries and overlapping shapes.

For summary-only line input, vary source points (1k/100k/1m), bin counts, monotone and shuffled x values, gaps, isolated spikes, alternating high/low extrema, and repeated first/last values. Compare with the full-column line: preserve each bin's min/max/first/last and point count, measure pixel similarity by browser, and include malformed summaries plus the documented error for a non-line chart. Exercise both `make()` and `toSvg()`. Keep summary preparation outside the timed draw call; report full-column, summary-input, and output-file size separately. Rebuild and check the lines-only artifact after source changes; its gzipped size has only 0.2 KB of headroom under the recorded 22.0 KB limit.

Current main also has `lfc-pack` 0.15.0 (PR [#859](https://github.com/lfcfoundry/JS-modules/pull/859)), whose chart-bin footer shape matches `netflow-plot` 2.22.0. If testing that producer/consumer path, compare packed bins with an independent direct computation over the same source columns, including null/NaN runs, dates, empty and partial bins, and varied requested bin counts. Cross `summary` and `pyramids` off/on and the no-summary control. Keep chart-bins generation, file growth, summary read, and draw costs separate. PR #859 reports 0.4–2.4% file growth, but encoding cost for eight numeric columns was +27% in Chromium, +50% in Firefox, and +44% in WebKitGTK, above its 5% gate; that work is awaiting the owner's decision. Do not present summary input as an automatic end-to-end win or enable it by default without a representative mixed-data result and owner approval.

Use independently calculated values/axes and compare scene lists and SVG output with the unchanged build. Time parsing/coercion, chart construction, hit testing, and SVG rendering separately. Report raw paired p50/p90 per browser; keep large-line optimization, aggregation, and renderer work separate. The release's 1,000,000-point report gives 13.6–14 ms from two full columns versus 2.2–2.5 ms from summaries in Chromium, 15–17 versus 3 ms in Firefox, and 17–19 versus 4–6 ms in WebKitGTK. It reports 99.26% pixel agreement in Chromium/Firefox and 99.76% in WebKitGTK; because two are below 99.5%, visually inspect the differences rather than treating the number as an automatic pass.

## netflow-sankey

**Base:** `netflow-sankey` 2.14.0. Start with `modules/netflow-sankey/test/run.js`; test both the WebAssembly order-search and JavaScript fallback.

Vary graph shape (chain, branching, crossing-heavy, wide, deep, disconnected, backward links), node/link counts, equal and extreme weights, zero links, duplicate links, and stable versus shuffled row order. Include no-cycle and multiple-cycle graphs; the documented loop behavior must remain valid. Exercise iteration/round limits and option boundaries without assuming a faster answer changes the default.

Assert exact node columns, link endpoints, layer assignment, order determinism, and SVG parity against current code. Compare WebAssembly and fallback outputs with and without early compilation. Measure compile/first layout/warm layout and small/medium/large charts separately; include WebKit where WASM is available. Report weighted crossing counts alongside time so a speed result cannot hide worse layout quality.

## netflow-scene

**Base:** `netflow-scene` 1.14.2, including recent lazy look-record and dot-fill fast paths. Start with `modules/netflow-scene/test/run.js`, `index.js`, `look.js`, and dependent hierarchy/circular/plot tests.

Use scenes with plain, decorated, hidden, duplicate-name, icon, start/choke/end, long-label and typed-rectangle nodes, plus sparse/dense links. Vary 1k/10k/50k items and no-links/links. Repeat build after changing only positions, only palette/look, only labels, and topology; verify caches are reused only when valid. Test Canvas 2D, WebGL2, WebGPU and SVG paths where supported, labeling unavailable backends as skips.

Compare `S.nodes`, dots, labels, icons, `dotFills`, bounds, hit results and SVG to the current version. Measure look construction, scene construction, renderer submission, and export separately. Include the same 50k treemap/icicle/sunburst controls from the recent PR so changes do not regress its measured path. Do not attribute a renderer or hierarchy win to scene construction.
