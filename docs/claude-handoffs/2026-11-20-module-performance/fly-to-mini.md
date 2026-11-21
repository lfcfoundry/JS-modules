<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: fly-to-mini animation scaling

**Baseline:** `fly-to-mini` 1.2.0 at repository commit `68816c2b` (2026-11-20). **Scope:** measure the default flight engine's per-frame work, DOM geometry reads, and behavior with concurrent controllers. Preserve its defining behavior: the flight follows the destination while the page scrolls.

## Why this module

The flight path reads the art and mini bounding boxes on every animation frame, then updates a transformed fixed-position clone. That fresh geometry is intentional because a sticky mini can move while the page scrolls. The clone also copies canvas contents on creation. The performance question is which of those costs matters for real pages and whether multiple active instances multiply callback/layout work. Caching target geometry without tracking scroll/layout changes is not an acceptable optimization.

## Test and workload matrix

Use the default flight and opt-in View Transitions engine, including the fallback where View Transitions are unavailable. Test 1, 4, and 16 simultaneous controllers; one direction and repeated up/down reversals; a stationary page, steady scrolling, and a resize during flight.

Vary clone complexity: a simple image, a nested DOM subtree with 0/10/100 descendants, and 0/1/4 canvases at 64, 256, and 1,024 backing pixels per side. Separate clone setup from animation frames. Use short and long configured durations and a target that begins hidden with `display:none`.

Profile geometry-read count and duration, frame callback duration, style writes, clone creation/canvas-copy time, dropped/late frames, and total flight duration. Include a clean page and a page where unrelated layout changes occur during the flight. Keep visual size, viewport, and scroll path constant across paired runs.

## Correctness checks

- Destination follows scrolling and resizing throughout the animation; do not cache a single start-time rectangle.
- Up/down reversals begin from the current in-flight position without a jump; the large image is restored after completion, cancellation, exceptions, and the timer failsafe.
- Canvas content remains visible in the clone; duplicate IDs are removed; reduced motion, hidden-page handling, and focus settling remain unchanged.
- Compare screenshots at start, midpoint, after scroll, after reversal, and landing for the same browser/viewport. Check console errors and remaining `.flying`/`.mini-fly` elements after every path.

Use the existing Node suite at `modules/fly-to-mini/test/run.js`. Before adding browser automation, inspect whether a current shared browser harness already covers this module; if not, add a small, isolated harness that follows repository browser rules rather than making the Node suite depend on a browser.

## Benchmark protocol and decision gate

Run one browser at a time in the supported browser set. Alternate baseline and candidate order. Capture at least seven fresh-page pairs for setup/cold-start measurements and repeated warm flights for frame work. Report median and p90 frame callback times, missed-frame counts at 60 FPS, clone setup cost, and geometry reads per frame. Keep View Transitions separate from the flight engine: a browser snapshot path is not a like-for-like substitute when the page scrolls during flight.

Only optimize the geometry or scheduling path if measurements show it contributes materially to missed frames, especially with multiple controllers. Any geometry reuse must be invalidated or refreshed on scroll, resize, and relevant layout changes, and must pass the scroll-following tests. If current behavior remains within one frame on target hardware and results are within noise, recommend no code change.

## Claude sequence

1. Read `fly-to-mini.js` and its existing tests. Map start-up, per-frame, landing, and cleanup paths before editing.
2. Establish the workload above and record current behavior and performance.
3. If geometry reads or callback duplication are a measured bottleneck, prototype one scoped change and compare it to baseline.
4. Keep the scroll-following contract and all cleanup paths; report any path that was not verified on real hardware.
