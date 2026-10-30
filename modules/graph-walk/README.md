# graph-walk

**Version 0.1.0 · API 0**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

The two small walks that map and flow tools keep rewriting: breadth-first distances from an item, and a depth-first pass that marks every link that closes a loop. They work on the plain "links of every item" layout in typed arrays, with no recursion, so a 30,000 item network with 93,000 links takes about 1.5 and 3 milliseconds.

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
```
`csr` also works if you already have the arrays: any object with `n`, `m`, `to`, `outStart` and `outEdge` (link numbers in input order) is accepted. Copy `graph-walk.js` next to your page (`<script src="graph-walk.js"></script>` sets `GraphWalk`) or `require` it in Node.

## How it compares
30,000 item generated network, 93,211 links, milliseconds per walk (median of 15 rounds of 20 walks, taking turns), against the copies Netflow Map writes inline today. Container, one browser at a time, not noise-guarded. Lower is better.

| Walk | Firefox inline / graph-walk | Chromium inline / graph-walk | WebKitGTK inline / graph-walk |
|---|---|---|---|
| breadth-first | 1.3 / 1.3 to 1.4 | 1.6 / 1.6 | 0.9 / 0.9 to 1.0 |
| loop marking | 3.3 to 3.4 / 2.5 to 3.2 | 2.8 to 3.0 / 2.8 to 3.0 | 2.6 to 2.7 / 2.1 |

Same answers, link for link, as the inline copies. The breadth-first differences are a tenth of a millisecond, which is timer noise at this size. Not measured: Jawad's laptop, and Netflow Map's full route search (that one is the bitmap search from the Elias-Fano work; this module does not replace it).

## Limits
- Item numbers must be whole numbers from 0 to n-1; `csr` throws a RangeError otherwise.
- Depth-first covers what is reached from `start`; links elsewhere stay 0 in both `closes` and `keep`.
- Memory is a few typed arrays of n or m entries per call.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29.

## Prior art and credits
Both walks are the textbook algorithms (breadth-first search, and depth-first search with a three-color mark where a link to a gray item closes a loop; Cormen et al., Introduction to Algorithms). The code was lifted from Netflow Map's engine and tested against it.

## For AI agents
Checks: `node modules/graph-walk/test/run.js`; browser speed: `node tests/graph-walk-browser.js <chromium|firefox|webkit>`. The reference walks in the test are verbatim copies of Netflow Map's inline code; if Netflow's copies change, update the references first.
