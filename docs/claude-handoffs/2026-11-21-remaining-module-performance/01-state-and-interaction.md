<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# State and interaction modules

All cases use synthetic pages and the module’s existing API. Preserve documented fallbacks and do not turn a guard into a security or age-verification claim.

## back-close

**Base:** `back-close` 1.2.0. Start with `modules/back-close/test/run.js` and `test/lean.js`; read the README’s CloseWatcher and history-fallback limits.

| Dimension | Cases |
|---|---|
| Capability | Real CloseWatcher; absent CloseWatcher; throwing constructor; history fallback off/on. Keep unsupported distinct from pass. |
| Panel lifecycle | Open/close once; nested panels; repeated arm/disarm; close callback throws; dispose while a close request is pending. |
| Request source | Escape, browser close request, Back/history traversal, unrelated `popstate`, and a page with preexisting history state. |
| Ordering | Close top panel only; repeat close after it is gone; open another panel during callback; ensure one request cannot close two panels. |
| Scale | 1, 10, 100 sequential open/close cycles; count live watchers/listeners/history entries rather than extrapolating from one panel. |

Assert that only the module’s own history state is removed, preexisting state is preserved, handlers stop after disposal, and the callback runs at most once per request. Run the real-browser checks in Chromium and Firefox; record WebKitGTK’s lack of CloseWatcher and exercise only its supported fallback. Do not claim physical Android Back or iPhone swipe behavior without a device.

## env-probes

**Base:** `env-probes` 1.1.0. Start with `modules/env-probes/test/run.js` and the browser pieces test. The module reports observed capability; it must not identify a browser or infer a permission from a failed probe.

Cover clock resolution at native, quantized, frozen, and throwing values; canvas readback allowed, scrambled, denied, tainted, and API absent; storage working, quota-full, blocked, getter-throwing, and absent; media queries matching, not matching, and unavailable. Run in page, Worker, and Node only where each probe is documented. Exercise normal profiles and the documented privacy profile separately. Test `report()` and `explain()` for stable field types and plain explanations under partial results.

The oracle is an injected fake capability surface with each API independently missing or throwing. Assert no probe escapes an exception, performs network access, requests permission, or changes stored data. Keep a real privacy-profile run as a separately labeled browser observation; a fake API is not a substitute.

## grown-ups-door

**Base:** `grown-ups-door` 1.0.1. The 3-second hold and drag are a child-facing speed bump, not a security boundary. Start with the package’s current test script and the demo.

Use fake time for hold boundaries at 2,999 / 3,000 / 3,001 ms and for the two-minute open interval immediately before, at, and after expiry. Pair valid and invalid drag paths with tap, keyboard, pointer, and touch activation. Interrupt at every state with pointercancel, touchcancel, blur, hidden tab, Escape, second pointer, resize, and callback exception. Repeat task, restart, and expiration without reload.

Assert guarded controls never open early, a completed task opens only the documented interval, cancellation clears timers/listeners, keyboard users can complete the same task, and repeated activation cannot multiply grants. Browser automation should test event logic; a physical touch run remains separate. Do not describe the module as parental control, age verification, or protection against a determined user.

## slow-note

**Base:** `slow-note` 1.0.0. Start with `modules/slow-note/test/run.js` and the README’s 30-line and per-kind rate limits.

Inject errors, rejected promises, slow taps, and long frames with timestamps at the same instant, just under/at/over one second, and across a reload. Mix event kinds, flood one kind, send malformed fields, and make localStorage absent, read-only, quota-full, or throwing. Exercise a full 30-entry buffer followed by new events and test `note.copy()` with empty and populated logs.

Assert the buffer stays bounded, at most one event of each kind is retained per second as documented, later events evict in the documented order, and the module does not persist URLs, prompt text, file paths, story contents, credentials, or other unneeded page data. Verify setup/teardown does not leave global listeners after the owning page object is disposed if the API exposes disposal. Treat privacy review as a correctness gate, not a benchmark.

## spotlight-tour

**Base:** `spotlight-tour` 1.1.1. Start with `modules/spotlight-tour/test/run.js`; prior mobile finger-scroll evidence does not establish screen-reader behavior.

Pair target states that are visible, partly clipped, offscreen, inside a scrolling container, resized, moved, or removed while the tour is open. Exercise scrolling and resize before, during, and after a tour; assert listeners exist only while needed. Run forward/back/skip/close, reopen-after-seen, and “gift exactly once” across reload and interrupted completion. Include no target, delayed target, reduced motion, keyboard-only focus, and a screen-reader pass where available.

Check focus entry/return, Escape and buttons, accessible names, dialog semantics, and that a missing target produces a safe documented outcome. Compare layout and target geometry after scroll/resize; do not use timing thresholds in tests. Record physical phone and screen-reader coverage separately.

## tab-guard

**Base:** `tab-guard` 1.1.1. The README’s phone result used `storage-probe`; code behavior itself is not recently browser-qualified. Start with `modules/tab-guard/test/run.js` and `test/page.html`.

Use two independent pages in one browser context and two isolated contexts. Cover simultaneous first open, owner reload/close/crash, hidden owner, explicit `takeOver()`, a second takeover, lock unavailable, lock API throwing, storage events delayed/missing, and storage disabled. Vary whether the first page has an unsaved value before takeover. Include a third read-only viewer and repeated start/stop cycles.

Assert at most one page is authorized to write, ownership changes are observable, no prior owner resumes writes after losing the lock, and fallback behavior is conservative when ownership cannot be established. Use real browser contexts for locking/storage semantics; mocks only validate local state transitions. Record WebKitGTK’s actual capabilities and phone results, never infer them from Chromium.
