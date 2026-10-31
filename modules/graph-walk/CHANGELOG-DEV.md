# graph-walk developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 0.11.0 · API 0 · 2026-10-31

### Quick
into option (components(g, r), kcore(g, r), shortest(g, s, w, undefined, r), pagerank(g, {into: r})): WebAssembly only, early-stop A/B 4-12 rounds, ratios 0.63-1.04 across browsers, never flagged slower; offered for the four biggest-result…

### Deep
into option (components(g, r), kcore(g, r), shortest(g, s, w, undefined, r), pagerank(g, {into: r})): WebAssembly only, early-stop A/B 4-12 rounds, ratios 0.63-1.04 across browsers, never flagged slower; offered for the four biggest-result calls only. Concurrency: closePool now fails running jobs so they finish on the calling thread, the idle timer only starts when no job is running, and a job started while the kept helpers are busy gets its own helpers; tests/graph-walk-concurrent-browser.js hangs on 0.10.0 and passes in all 3 browsers.

## 0.10.0 · API 0 · 2026-10-31

### Quick
trim(): ends helpers, swaps in a fresh instance from the kept compiled module; graphs hold a generation number instead of the memory object so the old memory can be collected.

### Deep
trim(): ends helpers, swaps in a fresh instance from the kept compiled module; graphs hold a generation number instead of the memory object so the old memory can be collected. Node 200k items/1M links after communities: arrayBuffers 50 MB -> 21 MB after trim, same answer on the next call. Opt-in only, no default behavior change; speed cost is the re-copy of the graph on its next call (not yet timed in the 3 browsers).

## 0.9.0 · API 0 · 2026-10-31

### Quick
closenessAsync: independent shares per helper, partial arrays summed, same helpers and graph copy as betweennessAsync.

### Deep
closenessAsync: independent shares per helper, partial arrays summed, same helpers and graph copy as betweennessAsync. Early-stop A/B (ab.js, 4 rounds each) helpers/calling thread = 0.26-0.43 across 1500/6000, 3000/12000, 8000/32000 in Chromium, Firefox, WebKitGTK, JS and wasm; answers identical.

## 0.8.0 · API 0 · 2026-10-31

### Quick
Max-flow (Dinic), closeness, triangles, Louvain communities, critical path, landmark (ALT) paths, JS and wasm, rebased on 0.7.2.

### Deep
Max-flow (Dinic), closeness, triangles, Louvain communities, critical path, landmark (ALT) paths, JS and wasm, rebased on 0.7.2. Closeness keeps a per-graph array of link sources (one lookup less per link): WebKitGTK wasm went from 325 to 254 ms. Results: /mnt/project-files/js-modules-research/graph-walk/RESULTS-NEWJOBS-2026.10.31.md

## 0.7.2 · API 0 · 2026-10-31

### Quick
betweennessAsync's helpers start and share work faster; same answers, no new options. First call / new graph: Chromium up to 1.14x, Firefox 1.45 to 1.9x, WebKitGTK 1.2 to 1.4x.

### Details
Three pool changes, each tested alone and together (tests/graph-walk-pool-browser.js, 4 cores; random and hub-heavy graphs, 3,000 to 200,000 items). (1) The compiled WebAssembly.Module goes to the helpers instead of the bytes, and each helper keeps its instance across graphs: Firefox 1.36 to 1.66x on first calls, WebKitGTK 1.07 to 1.4x, Chromium flat. (2) Start items go out in pieces (8 per helper, two queued) as each helper finishes, and the helper keeps its running sum until the last piece: Firefox 1.26 to 1.68x on first calls, others flat. (3) Each helper's result array goes back to it on the next call: within noise alone. All three: Chromium 0.98 to 1.14x first call, 0.96 to 1.07x repeat, 1.04 to 1.09x new graph (15 rounds); Firefox 1.39 to 1.66x first, 1.40 to 1.82x new graph; WebKitGTK 1.0 to 1.2x first, 1.2 to 1.37x new graph.

### Deep
Pool work from the owner's 'creatively optimize pools' ask. Known and older than this change: in WebKitGTK 2.52.6, after about 40 pool restarts (closePool then a new call) a call can stop answering; 0.7.1 stalled at restart 40 and 44 in a stress test, 0.7.2 held for 60 in 2 runs but the mixed test still hit it once. Kept pools (the default) do not restart.

## 0.7.1 · API 0 · 2026-10-30

### Quick
betweennessAsync: a pool: false call now uses its own helpers instead of borrowing and closing the kept pool, so the kept helpers stay warm. Kept helpers now take 0.61 to 0.79x the time of pool: false (container, 100,000 items, 64 sources).

### Details
Before: getPool() returned the shared pool for pool: false calls and finish() closed it, so the next kept call paid worker start-up and the graph copy again. On the owner's laptop that made the default slower than pool: false (348 vs 284 ms in Firefox 160, 350 vs 284 in Chromium 156). Now getPool(count, own) builds a private pool for pool: false and endPool() ends only that one. Container (4 cores): Chromium kept 435 vs pool:false 550 ms; Firefox 158 kept 439 vs 719 ms. Same answers: 306-graph test passes.

### Deep
graph-walk 0.7.1: pool: false no longer closes the kept helper pool. Chromium 155 kept 435 ms vs pool:false 550 ms, Firefox 158 kept 439 vs 719 ms (100,000 items, 400,000 links, 64 sources, container 4 cores). Tests: 306 graphs pass.

## 0.7.0 · API 0 · 2026-10-30

### Quick
Changed: betweennessAsync now keeps its helper threads by default (closing itself after 5 s idle); pool: false restores one-call helpers.

### Deep
Default flipped to the kept pool on the owner's card (2026.10.30 4:24 PM Eastern). Evidence in RESULTS-POOL-2026.10.30.md.

## 0.6.0 · API 0 · 2026-10-30

### Quick
New: betweennessAsync can keep its helper threads (pool: true) so repeated jobs are up to 1.75x faster; small jobs now run on the calling thread.

### Deep
Kept pool (graph cached per helper, idle close, closePool), minWork guard (4e6). Tables: js-modules-research/graph-walk/RESULTS-POOL-2026.10.30.md.

## 0.5.0 · API 0 · 2026-10-30

### Quick
New: betweennessAsync splits betweenness across helper threads (3.4x to 4.6x faster on 4 cores).

### Deep
betweennessAsync: start items dealt out to blob workers (JS or wasm helpers), partial sums added, falls back to the calling thread. 5,000 items/20,000 links, 4 cores: sync JS 2068-2931 ms, workers JS 594-827, workers wasm 558-690. Tables: js-modules-research/graph-walk/RESULTS-WORKERS-2026.10.30.md.

## 0.4.0 · API 0 · 2026-10-30

### Quick
New: k-core numbers, minimum spanning forest, PageRank and betweenness (plain JavaScript and WebAssembly); the first two-ended path call allocates less.

### Deep
Adds kcore, mst (radix-sorted Kruskal), pagerank, betweenness (Brandes) in JS and in wasm (15 KB base64 now); path allocates working arrays per search kind. Tables: js-modules-research/graph-walk/RESULTS-MORE-2026.10.30.md.

## 0.3.0 · API 0 · 2026-10-30

### Quick
New: WebAssembly speeds up components, strongly connected groups, topological order and weighted paths to every item (1.2x to 2.2x in Firefox and Chromium, none in WebKitGTK); plain JavaScript stays as the fallback.

### Deep
Adds wasm/graph-walk.c (3,363 bytes of wasm, embedded as base64), backends auto/js/wasm, ready(), accelerated(), free(g). Identical answers (byte for byte) in the three test browsers; timings in js-modules-research/graph-walk/RESULTS-WASM-2026.10.30.md.

## 0.2.0 · API 0 · 2026-10-30

### Quick
New: connected components, strongly connected components, topological order, weighted shortest paths and a fast two-ended path between two items; building the link index is faster.

### Deep
Adds components (union-find), scc (Tarjan, no recursion), topo (Kahn), shortest (Dijkstra with a 4-ary indexed heap, or breadth-first), pathTo and path (searches from both ends, working arrays kept on the graph). csr now uses one allocation. Compared with graphology 0.26 in Firefox 158, Chromium 155 and WebKitGTK 2.52.6: see js-modules-research/graph-walk/RESULTS-2026.10.30.md.

## 0.1.0 · API 0 · 2026-10-26

### Quick
First version: breadth-first distances and depth-first loop marking over a links-of-every-item layout, same answers as Netflow Map's inline walks and no slower in three browsers.

### Deep
R2b helper under placeholder name graph-walk. 30,000 items / 93,211 links, container unguarded: bfs 1.3 to 1.6 ms, loops 2.1 to 3.3 ms, equal or faster than the inline copies.

## 0.1.0 · API 0 · 2026-10-27

### Quick
First version: breadth-first distances and depth-first loop marking over a links-of-every-item layout, same answers as Netflow Map's inline walks and no slower in three browsers.

### Deep
R2b helper under placeholder name graph-walk. 30,000 items / 93,211 links, container unguarded: bfs 1.3 to 1.6 ms, loops 2.1 to 3.3 ms, equal or faster than the inline copies.
