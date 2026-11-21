# netflow-chord developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-11-21

### Quick
New module: `NetflowChord.layout(G, options)` returns the arcs and the bands (as typed lists) of a chord diagram. Cut from netflow-circular 1.5.2's chord layout, without the order search, the object form of the bands, the scene and Bundles. No dependencies.

### Details
Same input as `NetflowCircular.layout('chord', G, o)` (`G = { nodes, edges }`, options `chordBy`, `width`, `height`), plus `value` as an amount name. Result: `{ kind, dir, nodes, edges, chart: { type, cx, cy, R, th, arcs, flowsT, byGroup, total }, width, height }`; the bands are only the typed lists `chart.flowsT` (netflow-circular's `typed: true` form). The order is the group order (netflow-circular's `chordOrder: 'fast'`). Size 1.6 KB (esbuild minified, gzip -9; d3-chord 3.0.1 is 1.6 KB, 2.7 KB with d3-path 3.1.0). Layout of a dense 400 x 400 matrix, median of 15 calls, fresh page per library: d3-chord 31.6 / 26.7 / 62 ms against 16.7 / 16.4 / 23 ms (0.57, 0.68, 0.46) in Chromium 156 / Firefox 158 / WebKitGTK 2.52.6.

### Deep
Chosen by the owner on 2026-11-21 from four options (small layout file, with or without the order search; split Bundles out of netflow-circular; leave as is). With the order search the file was 2.9 KB and slower than d3-chord in Firefox (1.26x), so it stays in netflow-circular. Tests (13): arcs and bands as in the netflow-circular output to the last digit at 12, 40, 90, 150 and 300 items (items, auto and groups), the same SVG when the layout is drawn through `NetflowCircular.scene()`, amount names, joined links, empty and unknown-end input, `chordBy` and `width`/`height`.
