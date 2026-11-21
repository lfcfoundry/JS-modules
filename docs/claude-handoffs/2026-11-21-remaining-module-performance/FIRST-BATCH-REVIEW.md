<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Review of the two earlier five-module handoff batches

This is a code and merged-history review as of `JS-modules` main `a056fbd1`. The referenced PRs are evidence from their descriptions and file lists; this review did not rerun them.

## First five

The earlier `netflow-hierarchy` handoff asked for an end-to-end comparison of object rectangles with the opt-in `typedRects` representation, including layout, scene, style, SVG export, object-helper access and retained memory. That question remains unanswered. PR [#840](https://github.com/lfcfoundry/JS-modules/pull/840) expanded a tester to compare all five hierarchy views with d3-hierarchy over five tree shapes and three sizes. PRs [#844](https://github.com/lfcfoundry/JS-modules/pull/844) and [#845](https://github.com/lfcfoundry/JS-modules/pull/845) then fixed circle-pack's two-children-per-parent loss, reported exact output parity, and published browser-specific paired results. PR [#858](https://github.com/lfcfoundry/JS-modules/pull/858) made the 23 closest nested-view races a stoppable quick run; it is still a timing tester only. PR [#831](https://github.com/lfcfoundry/JS-modules/pull/831) reduced repeated color work in treemap/icicle scene creation and reports same-SVG results. These are meaningful layout/scene improvements, but none compares typed rectangles with object output across consumers. Treat that path as open, while retaining the new two-child circle-pack shape as a regression control.

Follow-up for `netflow-hierarchy`: use the original matrix at the current `netflow-hierarchy` and `netflow-scene` versions. Compare object and `typedRects: true` at 1, 1,000, 10,000, 50,000 and 100,000 items; use balanced, wide, deep, skewed, and extra-link graphs. Time layout, scene, style, SVG serialization, and the full path separately. Repeat with untouched typed output, every rectangle read through `rectTAt`, and the consumer that serializes immediately. Check field and tile order, byte-identical SVG where promised, no object leakage, and heap/allocation scope. Keep the default unchanged. Use seven cold pairs and warm repetitions, with current Chromium, Firefox and WebKitGTK versions.

The other four first-batch modules (`pad-nav`, `frame-kit`, `field-report`, `fly-to-mini`) have no post-handoff main commits in their module paths. Their earlier plans remain unexecuted rather than disproven. In particular, the task board still records `pad-nav` WebKit coverage and a physical controller as outstanding. Do not claim those checks from synthetic input; report them as device/browser gaps until actually run.

## Next five

The second batch’s `idle-core` item has a close match in merged PR [#841](https://github.com/lfcfoundry/JS-modules/pull/841): an exact-fraction oracle over 4,000 cases, cross-browser answer checks, and separate performance measurements. The PR reports errors dropping from 327 to 3 for prices and 345 to 3 for `maxAffordable`, with the three remaining cases involving fractional discounts that binary doubles cannot represent exactly. Keep this limitation visible. Do not expand the numeric method or change the API without a new exactness proposal.

There are no later module-path commits for `sticker-text`, `hold-press`, `fx-governor`, or `cartoon-3d-kit`. Their prior test designs still stand; no implementation was justified by the main history. The next five-module batch must not silently treat a plan as completed work.
