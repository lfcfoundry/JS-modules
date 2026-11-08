# netflow-circular changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

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
