<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: netflow-hierarchy typed scene scaling

**Baseline:** `netflow-hierarchy` 1.7.0, `netflow-scene` 1.14.x; repository commit `68816c2b` (2026-11-20). **Scope:** investigate the existing opt-in `scene(..., { typedRects: true })` path for treemap and icicle. Do not change its default or expand it to other views without evidence and a separate compatibility review.

## Why this module

The 1.7.0 option writes rectangle data into typed arrays rather than one object per tile. Its README promises the same SVG and documents `rectTAt()` for object-style access. The developer changelog reports a 50,000-item treemap improvement in hierarchy/scene work, but that is not a direct object-versus-typed-rectangle comparison. The unanswered question is whether typed rectangles reduce total cost for real consumers after layout, styling, SVG export, and any object reads are included.

This is a benchmark and parity investigation first. The typed path should remain opt-in unless the complete results justify a default change and the owner approves it.

## Questions to answer

1. What are the time and memory costs of layout, `scene()`, `NetflowScene.style()`, and SVG serialization separately and together?
2. At which item counts does typed output reduce retained allocation or peak memory enough to matter?
3. Do `toSvg`, `style`, and `rectTAt` preserve tile order, bounds, colors, strokes, and final SVG exactly?
4. Does first access through an object helper erase the typed path's memory or speed advantage?

## Test and workload matrix

Use `treemap` and `icicle`, the two supported typed-rectangle views. Include 1, 1,000, 10,000, 50,000, and 100,000 items; add smaller sizes if a transition point is found. Use deterministic graphs with: balanced groups, one very wide parent, a deep chain, highly skewed sizes, zero/missing values, and extra non-tree links. Keep node and edge counts explicit in each result.

For each graph, compare object output and `typedRects: true`:

- Layout only; scene construction only; `style()` only; SVG serialization only; and the full layout-to-SVG path.
- Cold page and warmed page. Do not include module loading in only one side.
- Typed arrays untouched; every tile read through `rectTAt`; and a consumer that serializes the result immediately.
- Default style and a representative customized theme. Include title/source options if they alter scene bounds.
- Supported `netflow-scene` version and the oldest version the repository still claims to support. Confirm that an old scene safely ignores the option as documented.

## Correctness checks

- Compare the resulting SVG strings byte for byte where the API promises the same picture text.
- Compare each tile field through `rectTAt` with the object rectangle at the same index; include empty, one-tile, boundary, and maximum-size inputs.
- Check array lengths, element types, sentinel node `-1`, fill/stroke table references, and that `S.rects` remains empty in typed mode.
- Confirm unsupported view types retain their existing representation and that no partially typed result leaks on errors or empty input.
- Keep hierarchy layout and scene generation separate so a changed layout cannot be mistaken for an output-storage win.

Inspect `modules/netflow-hierarchy/test/run.js` and `test/both.js` first. Add only missing cases; keep all existing tests, including the existing no-overlap and layout parity checks.

## Performance protocol and decision gate

Use the repository's pinned Chromium, Firefox, and WebKitGTK builds, one at a time. For every browser and workload, run paired pages in alternating order with at least seven fresh-page pairs for cold results and enough warm repetitions to stabilize the median. Capture elapsed time for each stage, peak/retained heap when available, output byte size, and raw samples. Treat GC pauses as data; do not selectively discard them.

Recommend a production change only if the typed path has exact output parity and a repeatable end-to-end benefit in the workload that needs it. A useful candidate gate is at least a 15% reduction in scene-plus-export time or a clear reduction in peak memory at 50k+ items, with no more than a 5% regression at 1k items. If the advantage appears only when callers avoid `rectTAt`, say so and keep the caller trade-off explicit. If it is within noise, ship no code change.

## Claude sequence

1. Read current scene code and tests; identify what is already covered for typed arrays before adding assertions.
2. Add or extend a reproducible benchmark harness that emits machine-readable rows; do not fold timing assertions into the correctness suite.
3. Run correctness first, then the paired browser matrix. Keep the default object path unchanged during the investigation.
4. Submit results and a recommendation. Only implement a follow-up after the data identifies a material bottleneck and the API/default decision is clear.
