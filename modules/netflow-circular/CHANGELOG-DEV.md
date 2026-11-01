# netflow-circular developer changelog

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
