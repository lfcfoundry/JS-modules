# netflow-circular developer changelog

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
