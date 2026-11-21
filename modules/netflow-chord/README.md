# netflow-chord

**Version 1.0.0 · API 1**

**Tested in:** node tests (13 checks, the same arcs and bands as netflow-circular to the last digit and the same picture through it); layout timing against d3-chord in ungoogled Chromium 156, Firefox 158, WebKitGTK 2.52.6

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

The chord layout of Netflow Map as one small file with nothing to load first. Give it items and links; it gives back arcs around a circle (one per item, or one per group when there are many items) and a band for each pair of arcs, as wide as the amount it carries. The bands leaving an arc are sorted by where they land, so they do not cross each other at the arc.

- It makes numbers, not a picture: angles in radians, the ring's radius and thickness, and the bands as typed lists. Draw them with your own canvas or SVG code.
- The order around the circle is the order of the groups, then the order you give (d3-chord also keeps the order it is given). [netflow-circular](../netflow-circular/README.md) searches the order for fewer crossing bands and draws the picture through netflow-scene; it needs [netflow-hierarchy](../netflow-hierarchy/README.md) too.

## Why it exists

d3-chord is the usual small chord layout, but it takes a square matrix and needs d3-path to draw. Netflow Map already lays out chords from lists of links, so this is that code on its own, with no extra files: 1.6 KB gzipped, the same as d3-chord alone and smaller than d3-chord with d3-path, and faster in the three test browsers.

**Where it helps**

- A chord diagram from a list of links, with no matrix to build.
- A page that wants only the numbers and draws them its own way.

**Not for:** a finished picture with names, colors and a legend (use netflow-circular with netflow-scene), or an order searched for fewer crossings (netflow-circular).

## Use

```js
// netflow-chord.js, one file
var L = NetflowChord.layout({
  nodes: [{ id: 'a', label: 'A', group: 'x' }, { id: 'b', label: 'B', group: 'y' }, { id: 'c', label: 'C', group: 'y' }],
  edges: [{ from: 'a', to: 'b', value: 40 }, { from: 'b', to: 'c', value: 25 }, { from: 'c', to: 'a', value: 10 }]
}, { chordBy: 'items' });
var arcs = L.chart.arcs;      // [{ k, a0, a1, mid, label, group, item, out, inn }, ...]: angles in radians, the sending part of an arc first
var F = L.chart.flowsT;       // { n, s, t, v, sa0, sa1, ta0, ta1, firstEdge, nextEdge, count }: band q goes from arc s[q] to arc t[q], carries v[q]
// L.chart.cx, cy, R, th: centre, ring radius and thickness; a band's two ends are the angle ranges sa0..sa1 (at arc s[q]) and ta0..ta1 (at arc t[q])
```

- `NetflowChord.layout(G, options)`: `G` is `{ nodes: [{ id, label?, group? }], edges: [{ from, to, value }] }`, the same shape netflow-circular takes. The amount of a link is read from `widthV`, `value`, `flow`, `weight` or `count` (the first that is above zero); a link with none counts 1. Links with an unknown end make no band.
- Options: `chordBy` (`auto`, `items` or `groups`; auto gives one arc per group above 60 items), `width` and `height` (the circle is sized to fit them).
- Links between the same two arcs are added into one band; `firstEdge`, `nextEdge` and `count` list the links of a band (follow `firstEdge[q]`, then `nextEdge[e]` until -1).
- The result also carries `nodes` with the position of each item's arc (`cx`, `cy`, `w`, `h`, `x`, `y`) set on your item objects, as netflow-circular does, so the result can be given to `NetflowCircular.scene()`.

## How it compares

Against d3-chord 3.0.2 (chord layout, 400 x 400 random matrix, 79,795 links), the median of 15 calls, a fresh page for every library, alternating pages (7 in Chromium and Firefox, 2 in WebKitGTK): it takes 0.57, 0.68 and 0.46 of d3's time in Chromium 156, Firefox 158 and WebKitGTK 2.52.6. Size (esbuild minified, gzip -9): 1.6 KB, against 1.6 KB for d3-chord 3.0.1 alone (2.7 KB with d3-path 3.1.0). Both only lay out; d3 draws through d3-path.

## Prior art and credits

The code is Netflow Map's own (LFC Foundry), cut out of netflow-circular; no code from other projects. [d3-chord](https://github.com/d3/d3-chord) (Mike Bostock, ISC license) was the speed and size comparison only.

## For AI agents

One file, global `NetflowChord` (also `module.exports`), no dependencies. Tests: `node modules/netflow-chord/test/run.js` (13 checks; the netflow-circular comparison runs when the netflow-scene, netflow-hierarchy and netflow-circular folders are next to it).
