# graph-walk

**Version 0.7.2 · API 0**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

The walks that map and flow tools keep rewriting, on the plain "links of every item" layout in typed arrays with no recursion: breadth-first distances, loop marking, connected components, strongly connected components, topological order and shortest paths (by links or by weight, from one item to all or between two items). On a 100,000 item network with 400,000 links the build takes 7 milliseconds and components 5, where graphology needs 2.2 seconds and 0.5 to 1.5 seconds.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## Why it exists
Netflow Map has four copies of the same breadth-first walk and two loop-dropping depth-first passes, each with its own queue and arrays. One tested copy means one place to fix and one place to speed up, and the loop marking (which link closes a loop) comes with it for free instead of being a side effect inside a bigger function.

## Use
```js
var g = GraphWalk.csr(n, fromArray, toArray);   // items 0..n-1; link i joins from[i] to to[i]
var depth = GraphWalk.bfs(g, root);             // Int32Array of link counts, -1 where not reached
GraphWalk.bfs(g, root, skip);                   // never enters item `skip`
GraphWalk.bfs(g, root, -1, reuseArray);         // fills your Int32Array(n) instead of allocating
var w = GraphWalk.loops(g, start);              // depth-first from start
w.closes[i];                                    // 1 when reached link i leads back to an item still being walked (a loop, a self-link included)
w.keep[i];                                      // 1 for every other reached link: the link set without its loops
w.post;                                         // reached items in finishing order (read it backwards for parents before children)
w.count;                                        // how many links close a loop

var c = GraphWalk.components(g);                // groups joined by links in either direction: c.id[v] (numbered by lowest item), c.count, c.sizes[id]
var s = GraphWalk.scc(g);                       // groups where every item reaches every other: s.id[v], s.count (sinks first: a link between groups goes from higher id to lower)
var t = GraphWalk.topo(g);                      // t.order: every link goes forward; t.complete is false when a loop blocks it (then order holds only the items before the loops)

var r = GraphWalk.shortest(g, src);             // fewest links from src to every item: r.dist (Float64Array, Infinity if not reached), r.via[v] = last link into v
var r2 = GraphWalk.shortest(g, src, weights);   // cheapest by weight (one non-negative number per link, input order; throws on a negative one)
GraphWalk.pathTo(g, r2, target);                // link numbers from src to target, or null
GraphWalk.path(g, src, target, weights);        // one pair, searched from both ends: { cost, links } or null (weights optional)

GraphWalk.kcore(g);                             // { core: Int32Array, max }: peel off items with fewer than k links (both directions, self-links ignored) again and again; core[v] is the biggest k v survives
GraphWalk.mst(g, weights);                      // cheapest links joining every group (directions ignored): { links (ascending weight), total }
GraphWalk.pagerank(g, { alpha: 0.85, tolerance: 1e-6, maxIterations: 100, weights });   // { rank (sums to 1), iterations, converged }
GraphWalk.betweenness(g, { normalized: true, sources });   // Float64Array: share of fewest-link paths between other pairs that run through each item; `sources` (array of items) gives a sampled estimate
```
`csr` also works if you already have the arrays: any object with `n`, `m`, `to`, `outStart` and `outEdge` (link numbers in input order) is accepted. Copy `graph-walk.js` next to your page (`<script src="graph-walk.js"></script>` sets `GraphWalk`) or `require` it in Node.

## WebAssembly
`components`, `scc`, `topo`, `shortest` with weights (to every item), `kcore`, `mst`, `pagerank` and `betweenness` run in WebAssembly (`wasm/graph-walk.c`, built with `wasm/build.sh`, embedded in the file as 15 KB of text) with identical answers, compiled the moment the file loads; until then, or on a page that forbids WebAssembly (it needs `'wasm-unsafe-eval'` in `script-src`), the plain JavaScript answers. `GraphWalk.ready()` resolves when it is on, `GraphWalk.accelerated()` says, `GraphWalk.setBackend('js' | 'wasm' | 'auto')` forces a side, and `GraphWalk.free(g)` gives back a graph's WebAssembly copy when it was the newest. Gain figures are in the comparison below and in the private tables (one container run, not noise-guarded). The first call on a graph copies its arrays into WebAssembly memory once. `path`, `bfs` and `loops` stay in JavaScript.

## How it compares
Against graphology 0.26 (with graphology-components 1.5, graphology-shortest-path 2.1 and graphology-dag 0.4), the same random network of 100,000 items and 400,000 links, milliseconds per job, median of 7 rounds taking turns, **graphology / graph-walk, lower is better**. Container, one browser at a time, not noise-guarded. Every answer was checked against graphology's before timing (same groups, same path costs).

| Job | Firefox 158 | Chromium 155 | WebKitGTK 2.52.6 |
|---|---|---|---|
| build the graph | 2207 / 7.5 | 2206 / 7.5 | 2073 / 6.7 |
| connected components | 1361 / 5.8 | 540 / 5.0 | 1375 / 3.7 |
| fewest links to every item | 517 / 12 | 425 / 13.8 | 1273 / 10 |
| cheapest path to every item | 1660 / 69 | 1161 / 61 | 1879 / 49 |
| one pair by links (`path`) | 0.132 / 0.010 | 0.258 / 0.012 | 0.485 / 0.007 |
| one pair by weight (`path`) | 7.0 / 0.18 | 4.6 / 0.09 | 10.5 / 0.06 |

Strongly connected components: graphology's version runs out of call stack on this network in all three browsers (and at 10,000 items in Chromium); at 10,000 items where it runs, graphology needs 30 ms (Firefox) and 36 ms (WebKitGTK) against 1.0 and 0.8 ms. On a sparse network (100,000 items, 120,000 links) the figures are 301 / 19, 219 / 16 and 323 / 10 ms. On an acyclic 100,000 item network, topological order takes 1039 / 12 (Firefox), 514 / 8.9 (Chromium) and 1289 / 8.3 ms (WebKitGTK). The first `path` call on a graph builds a links-into-items index and working arrays and takes 3 to 23 ms at this size (graphology paid for the same thing inside its 2 second build). The full tables are kept privately.

Breadth-first and loop marking are unchanged from 0.1.0 and match Netflow Map's inline copies. `betweennessAsync` on 4 reported cores, 5,000 items and 20,000 links: 2.1 to 2.9 seconds on one thread down to 0.59 to 0.83 seconds with JavaScript helpers (3.4x to 3.5x) and 0.56 to 0.69 seconds with WebAssembly helpers (3.5x to 4.6x) in Firefox 158, Chromium 155 and WebKitGTK 2.52.6. The helpers are kept by default: three jobs in a row on one graph average 1.2x to 1.75x faster per job than helpers made each time (1,000 to 2,000 items); the very first job is the same speed (a Firefox gap seen at first was a measuring artifact). Needs `worker-src blob:` in the page policy. Not measured for these new jobs: a laptop or a phone.

Since 0.7.2 the helpers get the WebAssembly code already compiled and keep one instance across graphs, take start items in small pieces as each one finishes (so a helper that drew the costly items does not hold up the rest), and give their result arrays back to be reused. Same answers (`tests/graph-walk-pool-browser.js`). On 4 cores, first call and a new graph on a warm pool, 20,000 to 200,000 items, against 0.7.1: Chromium 155 0.98 to 1.14x faster, Firefox 158 1.45 to 1.9x, WebKitGTK 2.52.6 1.2 to 1.4x; repeat calls on one graph are within noise (0.96 to 1.13x).


## Limits
- Item numbers must be whole numbers from 0 to n-1; `csr` throws a RangeError otherwise.
- Depth-first covers what is reached from `start`; links elsewhere stay 0 in both `closes` and `keep`.
- Memory is a few typed arrays of n or m entries per call. `path` keeps about 20 numbers per item on the graph after its first use.
- `topo` and `scc` need no recursion, so a million-item chain is fine.
- Weights must be non-negative; the shortest-path jobs do not handle negative links.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29.

## Prior art and credits
The textbook algorithms (Cormen et al., Introduction to Algorithms): breadth-first search; depth-first search with a three-color mark where a link to a gray item closes a loop; union-find with path halving for components; Tarjan for strongly connected components; Kahn for topological order; Dijkstra with a four-ary heap that moves items up instead of storing copies; bidirectional Dijkstra for one pair. The first two were lifted from Netflow Map's engine and tested against it; the rest are tested against slow references (reachability matrix, Bellman-Ford) on 400 random graphs.

## For AI agents
Checks: `node modules/graph-walk/test/run.js` and `node modules/graph-walk/test/run-wasm.js` (same checks with the WebAssembly kernels forced on); `sh modules/graph-walk/wasm/build.sh --check` proves the shipped `.wasm` is what the C builds, `python3 modules/graph-walk/wasm/embed.py --check` that the `.js` carries it; browser speed: `node tests/graph-walk-browser.js <chromium|firefox|webkit>` (inline walks) and `GRAPHOLOGY_BUNDLE=gra.js node tests/graph-walk-graphology-browser.js <chromium|firefox|webkit>` (against graphology; the bundle is graphology plus its components, shortest-path and dag packages built into one script that sets `window.GRA`). The reference walks in the test are verbatim copies of Netflow Map's inline code; if Netflow's copies change, update the references first.
