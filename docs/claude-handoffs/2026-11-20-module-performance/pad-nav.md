<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: pad-nav large-menu navigation

**Baseline:** `pad-nav` 1.1.1 at repository commit `68816c2b` (2026-11-20). **Scope:** directional candidate search and its per-move allocations. Preserve the current default rules and dynamic DOM behavior.

## Why this module

The README says directional candidates are queried on each move and notes that this is fine for ordinary menus but not thousands of elements. The 1.1.1 changelog already reports a 0.66x/0.71x/0.78x cost versus 1.1.0 for moving among 1,000 buttons. The README's current comparison also identifies reading every button's position as the dominant cost. A follow-up should measure the current version before proposing caching or a new index.

The lowest-risk hypothesis to test is whether the current movement path spends meaningful time allocating intermediate candidate/rectangle arrays in addition to the required DOM geometry reads. If so, prototype a streaming scan that retains the current candidate order and score/tie rules. Do not cache rectangles across moves: menu geometry, visibility, and the filter callback can change at any time.

## Test and workload matrix

Create fixed-seed DOM layouts with 20, 100, 1,000, and 5,000 focusable elements. Include a regular grid, one long row, a vertical list, and a scattered layout with ties. For each size, measure one direction press after setup and a sequence of 100 alternating presses.

Cover these behavior dimensions without taking the full Cartesian product:

- `nextRule: 'center'` and `'edges'`; each direction; no candidate and exact score ties.
- Hidden, disabled, offscreen, and filtered elements, including elements whose visibility changes between presses.
- Scope replacement, insertion/removal/reorder, changed bounding boxes, and a filter with side effects. Confirm the filter call order and exception handling stay unchanged.
- With and without the browser's `checkVisibility` support; stale focus element removed between frames; zero-size element behavior.
- A usable pad, no pad, and a connected pad whose input is idle. `step()`'s idle path must remain cheap and leave the DOM alone.

## Correctness checks

- Keep pure `PadNav.nearest()` tests and compare the optimized path with the existing result on fixed and seeded random layouts.
- Assert focused element identity, not just a score. Preserve stable tie-breaking by document order and existing handling of exact edge overlaps.
- Verify `getBoundingClientRect()` and visibility are read fresh on a directional move so resize and DOM changes cannot leave stale navigation.
- Run the existing 113-check Node suite and current real-browser test. Do not represent a fake gamepad as physical-controller validation.

## Benchmark protocol and decision gate

Separate candidate discovery, geometry reads, selection, and DOM focus/scroll work where possible. Report per-move median and p90 latency, number of candidate queries, geometry reads, and temporary array allocations. Compare the unmodified baseline and any prototype in alternating order in the same browser page. Run all supported browser builds one at a time and record viewport, layout, element count, and browser build.

At 20 and 100 elements, require no meaningful regression (use a 5% guard unless noise is larger). At 1,000 and 5,000, require a repeatable improvement larger than run-to-run spread. If geometry reads dominate and allocation removal does not help, stop; do not add cache invalidation machinery for a theoretical gain.

## Claude sequence

1. Read `pad-nav.js` around candidate collection and `PadNav.nearest`; reuse the existing test fakes and current benchmark setup.
2. Record a baseline for the matrix before editing.
3. If intermediate arrays are a material cost, test a streaming scan behind the same API and prove exact destination parity for all seeded cases.
4. Keep current behavior for dynamic menus and report the result even if there is no winning change.
