<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: sticker-text paint cost and quality

**Baseline:** `sticker-text` 1.2.0 at repository main `2de1058b` (2026-11-20). **Scope:** quantify CSS paint cost and quality trade-offs; do not remove the rounded Chromium outline or change the default automatically.

## Evidence and hypothesis

The default Chromium outline uses 32 text shadows because Chromium draws sharp corners for the built-in HTML text stroke. Firefox and WebKit use the single `st-round` stroke path. The README's 40-word, 100 px changing-text example reports much higher cost for the full ring than for `st-flat st-stroke`, with the exact cost varying by browser and test load. The module already exposes `st-flat` and `st-stroke`, and recommends the lighter path for frequently changing or numerous words.

The main unknown is the practical break-even point: how many visible titles, at what font size and update rate, make the ring materially affect a frame? `ringShadow()` string construction is separate and happens during setup; do not mistake that cost for browser text painting.

## Test matrix

Build one stable fixture with plain text and a fixed font set. Compare these existing styles: default, `st-flat`, `st-stroke`, and `st-flat st-stroke`; test the browser-selected `st-round` path where applicable. Use 1, 4, 16, and 40 visible title elements; font sizes 24, 64, 100, and 160 px; short words, long words, wrapped titles, punctuation, descenders, and accented text.

Separate three workloads:

1. Static text for at least 10 seconds (paint only when the browser needs it).
2. One title updated at 1, 10, and 60 times per second through `update()`.
3. All visible titles updated once per animation frame, matching the existing stress case.

Measure `apply()`/`update()` JavaScript time separately from frame gaps and browser paint/composite work. Use paired screenshots at 24, 64, 100, and 160 px, and compare line wraps, descenders, edge shape, contrast, and clipping. Test reduced motion and forced-colors styling as regression checks; the text stays accessible as real DOM text.

## Correctness checks

- Keep `ringShadow()` output count, color, radii, and argument fallback behavior unchanged for all existing API tests.
- Verify `apply`, `update`, and `watch` keep `data-t` synchronized for nested text mutations; stopping `watch` prevents later updates.
- Confirm default classes and custom `steps`/`radii` do not collide, and custom rings retain their current shadow path.
- Confirm the real text remains selectable and exposed to assistive technology; decorative pseudo-elements stay hidden from the accessibility tree.

Run `node modules/sticker-text/test/run.js`. If a browser fixture is added, keep it outside the unit test and use the current supported browsers one at a time.

## Decision gate and Claude sequence

1. Reproduce the current README benchmark in a controlled page before proposing a new rendering method.
2. Identify the smallest title-count/update-rate cell where the full ring misses the target frame budget; include the simpler styles as controls.
3. If exploring another CSS rendering path or a new opt-in class, compare its appearance and accessibility behavior at the same sizes. Keep it opt-in unless the default look is unchanged and the owner approves a default change.
4. Recommend no code change when only `ringShadow()` setup is measurable or when static title pages do not show a user-visible issue. Report a clear usage threshold instead.
