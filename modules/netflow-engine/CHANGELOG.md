# netflow-engine changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.2.1 · API 2 · 2026-10-22
- The two-pair Distances sweeps no longer stop at 20,000 items: they run at any size (1.02 to 1.10 times faster at 30,000 and 60,000 items in the four test browsers), same positions.

## 2.2.0 · API 2 · 2026-10-18
- A page can keep finished Network map positions and put them back: reopening a big map is 2.4 to 14.9 times faster (higher is better), same picture.
- Distances sweeps run two pairs of items at a time in WebAssembly up to 20,000 items: 1.0 to 1.44 times faster, same positions.

## 2.1.0 · API 2 · 2026-10-18
- More of the engine runs as WebAssembly, there is a new Distances 3D arrangement, and big flat Force maps are 1.5 to 2.4 times faster at 5,000 to 10,000 items (higher is better).

## 2.0.0 · API 2 · 2026-10-18
- The sixth view is now called "sankey" (the old name is gone), so a page that typed the old name by hand must change it.
- New tight or wide spread for the story views.

## 1.0.0 · API 1 · 2026-10-18
- The engine code arrives: the engine of Netflow Map as one file you can adapt, with nine map views and layouts for networks of any size.

## 0.1.0 · API 0 · 2026-10-18
- Placeholder with no engine code yet.
