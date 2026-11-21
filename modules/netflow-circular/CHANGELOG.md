# netflow-circular changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.5.2 · API 1 · 2026-11-21
- Smaller file: the old object form of the Chord layout (unused since 1.5.0) is gone, 326 bytes less when minified and gzipped (6,769 to 6,443). Same output, same speed.

## 1.5.1 · API 1 · 2026-11-20
- The default chord layout is about twice as fast (400 items, 80,000 links: 32 to 18 ms in Chromium, 28 to 14 in Firefox, 34 to 23 in WebKitGTK); the band objects in chart.flows are now made the first time they are read. Same output.

## 1.5.0 · API 1 · 2026-11-20
- New option typed: true lays out a dense chord (400 items, 80,000 links) in 15 to 24 ms, 1.5 to 2.3 times faster than d3-chord 3.0.2 (Chromium 156, Firefox 158, WebKitGTK 2.52.6); the default is also 18 to 40% faster

## 1.4.1 · API 1 · 2026-11-20
- Chord layout is 3 to 4 times faster on dense charts (400 items, 80,000 links: 185 to 48 ms in Chromium); the drawing is the same

## 1.4.0 · API 1 · 2026-11-08
- New optional NetflowCircular.warm() makes the first chord or bundles draw much sooner.

## 1.3.1 · API 1 · 2026-11-08
- Chord names never overlap on small rings; bigger arcs keep their names first.

## 1.3.0 · API 1 · 2026-11-07
- A chord ring fits the width and height you pass, names included.

## 1.2.0 · API 1 · 2026-11-01
- One call draws a picture: NetflowCircular.toSvg(links) for a chord, or { type: 'bundles' }.

## 1.1.0 · API 1 · 2026-11-01
- Chord and arc pictures take an optional title, subtitle and source in the scene options.

## 1.0.1 · API 1 · 2026-11-01
- Changing a look on a big chord picture is 2.9 to 7.8 times faster (with netflow-hierarchy 1.0.1), and a copy kept next to netflow-hierarchy.js in one folder now finds it.

## 1.0.0 · API 1 · 2026-11-01
- First version: the circular views of Netflow Map (Chord, Bundles) as an add-on for netflow-engine.
