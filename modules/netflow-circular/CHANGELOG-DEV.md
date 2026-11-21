# netflow-circular developer changelog

## 1.5.1 · API 1 · 2026-11-20

### Quick
The default chord layout runs the typed path and makes chart.flows (the band objects) when it is first read. Same output (300 random charts compared as JSON with sorted keys, flows included), no API change, no new setting.

### Details
400 items, 79,795 links, chordBy 'items', chordOrder 'fast', alternating pages, median: Chromium 156 32.1 to 18 ms (0.52x, 7 pages), Firefox 158 28 to 14.3 (0.51x, 7 pages), WebKitGTK 2.52.6 34 to 23 (0.70x, 2 pages). Against d3-chord 3.0.2 in Chromium the default is now ahead (28.9 against 22.7 ms in one run, 5 pages). Node: 32 to 14 ms.

### Deep
chart.flows is an own enumerable accessor that builds the list from the typed arrays on first read and then replaces itself with the list as a plain value; setting it also replaces it. scene() draws from the arrays while the getter has not run (a WeakMap keeps the arrays), and from the list afterward. toSvg of 80,000 links is byte equal (MD5) to 1.5.0. Reading chart.flows costs about what 1.5.0 spent in the layout.

## 1.5.0 · API 1 · 2026-11-20

### Quick
New opt-in `typed: true` for chord layout: the bands come back as typed arrays in `chart.flowsT` (no object per band; `chart.flows` is then absent). `scene()` draws either form and the picture is the same. Default output unchanged (compared on 300 charts). Approved by the owner on a card (11.20, "Yes, add typed:true option"). The default path is also faster: the neighbour lists are made only for chordOrder 'fewest', and the crossing tables only up to 3,000 bands.

### Details
400 items, 79,795 links, chordBy 'items', chordOrder 'fast', alternating pages. Typed against d3-chord 3.0.2 (ready matrix; ours from the edge list): Chromium 156 18.7 vs 29.3 ms (0.65x, 7 pages), Firefox 158 15.4 vs 24.8 (0.64x, 7 pages), WebKitGTK 2.52.6 24 vs 54 (0.44x, 2 pages). Default (objects) against 1.4.1: Chromium 38.3 vs 46.9 (0.82x, 9 pages), Firefox 33.6 vs 58 (0.60x), WebKitGTK 40 vs 61 (0.65x). Node: objects about 40, typed about 15.

### Deep
flowsT: n; s, t (arc numbers), v, sa0, sa1, ta0, ta1 (the band's slice on its source and target arc); firstEdge[i] is the first link of band i in the edges list, nextEdge[e] the next link of the same band (-1 ends the chain), count[i] the number of links. Typed and object results are equal on 120 charts (items and groups, fast and fewest, repeated links) and their SVG pictures are equal. The two paths share everything after the pair table except the first and last steps (the object path keeps its objects from the first pass; making them from the arrays afterwards was 16% slower in Chromium). Not typed yet: the bundles view.

## 1.4.1 · API 1 · 2026-11-20

### Quick
Chord layout of dense charts is 3 to 4 times faster. Same layout (compared on 300 random charts), no API change, no new setting.

### Details
400 items, 79,795 links, chordBy 'items', chordOrder 'fast', alternating pages, median: Chromium 156 185.5 to 47.5 ms (0.25x, 5 pages), Firefox 158 160.6 to 56 ms (0.34x), WebKitGTK 2.52.6 147 to 52 ms (0.35x). d3-chord 3.0.2 on a ready matrix in the same test: 24, 24 and 78 ms (measured 11.20 in the rivals test), so Chromium and Firefox are about 2x behind d3-chord on this task, WebKitGTK ahead. Node: about 207 to 60 ms.

### Deep
The profile was 31% garbage collection, 21% the pair table (a Map and four-field objects that grew to eight), 27% sorting each arc's bands with a comparator. Now: one object shape made whole, a table of places instead of a Map when edges are dense, and the bands of each arc placed into a K-place table by place distance (the arc middles grow with the place, so this is the same order as sorting by "where it lands, going round"). Output compared as JSON with sorted keys on 300 random charts (items, groups, fast, fewest): no difference. One difference: flows now have sa0, sa1, ta0, ta1 from the start, so the order of those keys can differ from before for bands whose target comes first.

## 1.4.0 · API 1 · 2026-11-08

### Quick
New opt-in NetflowCircular.warm(): draws two small made-up pictures in an idle callback; the first real chord/bundles (120 links) then takes 0.46 (Chromium 156), 0.69 (Firefox 158) and 0.58 (WebKitGTK 2.52.6) of the time. Idle work 7-14 ms. Nothing changes unless you call it.

### Details
New API, opt-in, no change to existing calls. Returns true when it ran, false when NetflowScene is missing. 11 paired fresh pages per browser: 0.46 (11/11), 0.69 (11/11), 0.58 (10/11). Owner approved the card ('Yes, add both').

### Deep
netflow-circular 1.4.0: opt-in warm(). First chord+bundles of 120 links after an idle warm(): Chromium 156 0.46 (22.9 ms base, idle 14.3 ms), Firefox 158 0.69, WebKitGTK 2.52.6 0.58 (idle 7, 7 ms). 11 pairs.

## 1.3.1 · API 1 · 2026-11-08

### Quick
A chord ring names an arc only when its name clears every name already placed, biggest arcs first. flights-10k at 300 wide: 23 names with about 6 overlapping become 19 names with none; at 600 wide all 23 stay. Requested by the owner.

### Details
Names stand out from the ring like spokes, so two touch when their middles are closer than one line of text (13 px times the label scale) along the ring at the label radius. The test scales with the drawing, so a bigger ring or zoom keeps more names. No API change.

### Deep
First tried a per-arc length test (brief CHORD-LABEL-FIX-2026.11.08.md): it fixed 300 but dropped 5 names at 600 that had room, because small arcs with gaps between them still have space. Spacing between kept names is the real limit.

## 1.3.0 · API 1 · 2026-11-07

### Quick
chord with width and height: ring radius from the smaller side, then toSvg measures the picture and shrinks the ring (at most twice) until the names fit. The SVG is then at most that size and fills it on the short side (a circle cannot fill a wide box). Without them nothing changes.

### Details
chord(): R = min(width, height)/2 - 45 (at least 40) or the internal _ringR from toSvg's refit; th scales with R. toSvg reads the viewBox and refits. Requested by the owner (card: lay out at that size).

### Deep
Chord charts fit the width and height you pass.

## 1.2.0 · API 1 · 2026-11-01

### Quick
toSvg(data, o) through netflow-hierarchy's asGraph and sceneLib; chordBy auto by default.

### Deep
toSvg(data, o) through netflow-hierarchy's asGraph and sceneLib; chordBy auto by default. One-call toSvg(data, options) (owner's 11:55 AM ET 11.01 name card; CONSISTENT-SYNTAX-PROPOSAL). Old forms keep working (told apart by shape). Checked in Chromium 155, Firefox 158, WebKitGTK 2.52.6 from page scripts: all six one-call pictures drawn. Requested by the owner.

## 1.1.0 · API 1 · 2026-11-01

### Quick
Through netflow-hierarchy 1.2.0 scene(); needs netflow-scene 1.4.0.

### Deep
Through netflow-hierarchy 1.2.0 scene(); needs netflow-scene 1.4.0.

## 1.0.1 · API 1 · 2026-11-01

### Quick
Uses netflow-hierarchy 1.0.1's faster shared frame.

### Deep
Uses netflow-hierarchy 1.0.1's faster shared frame. Look change on chord at 100,000 items, old/new ms: Chromium 753/97, Firefox 533/181, WebKitGTK 510/161. require() falls back to ./netflow-hierarchy.js when ../netflow-hierarchy/ is not there (asked by the Netflow Map thread, which vendors both files into one folder).

## 1.0.0 · API 1 · 2026-11-01
- **Quick:** split from Netflow Map src/charts.js (main 35db3f4, build 2026.11.01.1003) by view type, on the owner's ask.
- **Details:** netflow-hierarchy keeps the tree, values, nested layouts and the drawing frame; scene(L, o, NS, ext) takes an extension that draws its own view types. netflow-circular holds chord, bundles, bsplineToBezier and the ribbon drawing and draws inside that frame. Characters above U+007F written as escapes. Layout, SVG, names and the note line identical to the app copy on 756 layouts and pictures (7 views, 9 map sizes up to 3,000 items, 6 option sets, 2 themes); the app's 925 checks pass on the two together.
