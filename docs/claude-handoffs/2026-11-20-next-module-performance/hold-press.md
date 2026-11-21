<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: hold-press input cost and lifecycle

**Baseline:** `hold-press` 1.1.0 at repository main `2de1058b` (2026-11-20). **Scope:** measure attach/detach and active-hold work across realistic control counts. Preserve the normal click, repeat timing, touch fallback, and release-click suppression.

## Evidence and hypothesis

The module already measures event cost: a single tap costs about 17–25 microseconds with the module attached in the listed desktop browsers, versus about 7–14 microseconds for `long-press-event`. The README explains that the extra work follows from repeat and touch behavior. Global move/end listeners are attached only while a press is active, so idle pointer-move work should stay low.

The remaining questions are whether many attached controls make setup/teardown or memory cost noticeable, and whether the active listener lifecycle stays bounded when many controls are detached, cancelled, or pressed in succession. A shared listener manager is only a prototype idea; it could reduce listener churn but make idle input handling more expensive.

## Test matrix

Use 1, 12, 100, and 1,000 attached controls. Measure initial attach, idle pointer/touch movement, one tap, a hold through the first repeat, a two-second repeat, and repeated attach/detach cycles. Compare `keyboard: false` and `true`; `zone`/`canPress` absent and present; and default repeat timing against a short test interval.

Cover input types and interruption paths: mouse, pen, touch, keyboard Enter, keyboard Space, pointer cancellation, touch cancellation, blur, page hidden, `setEnabled(false)`, `stop()`, and `detach()` during a pending delay and during repeats. For touch, include a second finger arriving, moving, and lifting before the tracked finger. Keep real-device touch separate from synthetic event results.

Record listener counts on the element and window, outstanding timers/intervals, attach and detach time, idle event cost, event-to-first-repeat lateness, and repeat cadence. Compare a 1-control page with a 1,000-control page; avoid measuring only a single tap and extrapolating.

## Correctness checks

- A short tap still produces one normal click and no `onPress`; a hold fires after `delayMs`, repeats at `everyMs`, and swallows only the associated release click.
- The original pointer/touch identifier owns the hold; another finger cannot keep it alive or end it.
- `zone`, `slop`, `canPress`, visibility, and callback exceptions retain their current behavior.
- After cancellation, blur, disable, or detach, no interval continues and all temporary window listeners are removed. Repeated detach remains safe.
- Keep the existing fake-clock cases and the real-browser event comparison in `tests/compare/hold-press-compare-browser.js`.

## Decision gate and Claude sequence

1. Run `node modules/hold-press/test/run.js` and the existing comparison harness before editing.
2. Extend the harness to cover control-count scaling and listener/timer counts; do not add timing assertions to the unit suite.
3. Prototype shared listener management only if setup/teardown or memory grows materially in a realistic control count. Compare idle movement cost as well as active-press cost.
4. Preserve the current implementation if a gain is visible only in artificial high-frequency dispatch or if idle cost rises. Identify real-device touch validation still outstanding.
