# pad-nav

**Version 1.1.0 · API 1**

**Tested in:** Node: 112 checks pass (18 new). Module browser suite passes in ungoogled Chromium 155.0.8059.39-1. Candidate search compared old and new (same answers, 847 of 1000) in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6. Not run: that browser suite in Firefox 158.0, WebKitGTK, a real controller, a phone

## What it is and how it works

Gamepad navigation for ordinary on-screen HTML menus, in one file with no dependencies.

- The D-pad or stick moves focus to the nearest button in that direction; A clicks, B goes back.
- Sliders and drop-downs can be adjusted from the pad.
- A short hint appears after first use, and only the top open panel is navigable.

## Why it exists

Controller players could play a game but not get around its HTML menus, and most gamepad libraries assume everything is drawn on a canvas. This is that menu code, tested and with the game-specific parts removed.

**Where it helps**

- Games with HTML menus and controller support.
- Settings panels on TVs and handhelds.
- Kiosk-style pages driven by a pad.

**Not for:** pads that do not report the standard mapping (skipped by default).

## Use

Copy `pad-nav.js`, or open `demo.html` (double-click, no server needed).

```html
<style>.pad-focus { outline: 3px solid #6a3de8; }</style>   <!-- you write the ring; the library injects no CSS -->
<div id="menu">
  <button onclick="alert('Play')">Play</button>
  <button onclick="alert('Options')">Options</button>
</div>
<div id="hint" hidden></div>

<script src="pad-nav.js"></script>
<script>
  var pn = new PadNav({
    getScope: function () { return document.getElementById('menu'); },   // the open panel, or null
    hintEl: document.getElementById('hint'),
    onBack: function () { console.log('B pressed'); },
    onStart: function () { console.log('Start pressed'); }
  });
  pn.start();   // or call pn.step() once per frame from your own loop
</script>
```

Plug in a controller and press any button (browsers hide the pad until you do). The first press only shows the focus ring; the next ones move it. `require('./pad-nav.js')` also works in Node (navigation needs a DOM there; the pure helpers work anywhere).

Tests (offline): `node modules/pad-nav/test/run.js` (fake pads and a tiny fake DOM, no browser, under a second) and `python3 modules/pad-nav/test/run.py` (about 3 seconds, needs Playwright for Python and an installed Chromium).

## Options

`new PadNav(options)`, all optional:

| Option | Default | Meaning |
| --- | --- | --- |
| `getScope()` or `scopeSelector` | none | The element that owns the pad now (topmost open panel) or `null`; called every frame, so keep it cheap. Or a selector (last visible match). With neither, `document.body`. |
| `focusableSelector`, `filter(el)` | buttons, links, inputs, selects, textareas, `[tabindex]` except `-1` | What is reachable inside the scope; `filter` returns `false` to leave an element out. |
| `onBack(scope)`, `onStart(scope)` | none | B / Start pressed (edge only); called even with no scope. |
| `onA(el)` | none | A pressed, before the click or slider and drop-down handling; return `false` to cancel that. |
| `onUse(pad)`, `onDisconnect()` | none | First pad input (and first after an unplug) / last usable pad gone (once per unplug). |
| `onInput(pad)`, `inputMs` | none, `250` | Any pad input, at most every `inputMs` ms. Keeps the screen awake: `onInput: function () { wk.poke(); }` with [wake-keeper](../wake-keeper/README.md). |
| `onError(err, where)` | none | A swallowed error; `where` names the callback or step that threw. A repeating error is reported once; the latest is on `pn.lastError` and `pn.lastErrorWhere`. |
| `getPads()` | `navigator.getGamepads` | Inject a fake in tests. |
| `deadzone`, `release` | `0.45`, `0.35` | Stick push (0 to 1) at which a direction starts / lets go; the gap keeps a worn stick from flipping every frame (equal values turn it off). Starting points, not tuned on real sticks. |
| `repeatDelay`, `repeatRate` | `380`, `120` ms | Wait before a held direction repeats / time between repeats. |
| `focusClass`, `adjustClass` | `'pad-focus'`, `'pad-adjust'` | Classes on the focused element / a slider in adjust mode. You write the CSS. |
| `formControls` | `true` | A on `input[type=range]` enters adjust mode; A on a single-choice `select` cycles to the next enabled option. `false`: A just calls `click()`. |
| `hintEl`, `hintText` | none | Element whose text and `hidden` attribute are set (gets `role="status"`); text is built from the wired callbacks, or pass a string or `function (scope, names, mode)`. |
| `labels` | off | `true` guesses button names from the pad's `id` text (Cross, Circle, Options on PlayStation pads; B and A on Nintendo pads; A, B, Start otherwise); or `{ a: 'Jump' }`, or `function (padId)`. A guess. |
| `hintMs`, `guardMs`, `wakeMs` | `3500`, `450`, `8000` | Hint time on screen / A ignored after a scope appears, so the press that opened a panel does not click inside it / a scope opening within this long of pad use shows the ring at once. |
| `scroll` | `true` | `scrollIntoView({ block: 'nearest', inline: 'nearest' })` after each focus change (it scrolls every scrollable ancestor, including the page). |
| `requireStandard` | `true` | Read only pads whose `mapping` is `'standard'`. |
| `nextRule` | `'center'` | `'center'` scores center distance, sideways drift costing 2.5 times. `'edges'` first takes the nearest button directly in line, else falls back to `'center'`. |

Methods: `step(nowMs?)` (once per frame; `true` if a usable pad was read; never throws), `start()` (polls with `requestAnimationFrame`, returns the instance), `stop()`, `destroy()`, `focus(el)`, `clearRing()`. Pure helpers that work without a DOM: `PadNav.nearest(fromRect, rects, 'l'|'r'|'u'|'d', rule?)` (index or `-1`; rects are `{ left, top, width, height }`), `PadNav.stick(...)`, `PadNav.rangeNext(...)`, `PadNav.nextOption(...)`, `PadNav.labelsFor(padId)`. Buttons ("standard" mapping): 12 up, 13 down, 14 left, 15 right, left stick axes 0 and 1, 0 = A, 1 = B, 9 = Start; several pads are merged.

How it behaves:
- Presses are edge-detected. A held direction moves at once, again after `repeatDelay`, then every `repeatRate`. The stick counts along its stronger axis only. No wrapping; if nothing is further up or down, the scope scrolls by half its height. Distance (rule `'center'`) is `distance along the direction + 2.5 x sideways drift`, ignoring anything under 4 px that way.
- Slider adjust mode: left and right change the value by the input's `step`, clamped, firing `input` then `change`; A or B leaves it (that B does not call `onBack`). Drop-downs: A moves to the next option (wrapping) and fires `input` and `change`; for a long list use `onA` returning `false` and show your own picker. Checkboxes, radios, links and buttons get a normal `click()`.
- With no ring showing, the first direction press only shows it; A does the same, except that a scope with exactly one reachable element clicks it. Each scope remembers its last focus, so closing a sub-panel returns to the button that opened it. Reachable means: matches the selector, not disabled, not `aria-disabled="true"`, not in `[inert]`, rendered, not `visibility: hidden`, and passing `filter`.
- A throwing outside function is caught (a failing `getScope` means no scope, a failing `onA` still allows the click).
- `nextRule: 'edges'` is opt-in because the default has shipped. On 2,000 random menus of 3 to 6 rows with 1 to 3 buttons of mixed widths (59,981 presses) the two rules choose a different button in 21.2% of presses; when a button sat directly in line, `'center'` jumped past it in 5.4% of those presses (2,467 of 45,538), `'edges'` never does; on regular grids (8,496 presses) they always agree. Not tried with real players.

## Making it smaller (optional)

The file is 13,091 bytes minified with esbuild. Two big parts can be cut if a game does not use them:

| Cut | Minified / gzip bytes saved |
| --- | --- |
| Hint text and button names (`hintEl`, `hintText`, `labels`, `PadNav.labelsFor`) | 1,826 / 672 |
| Slider and drop-down support (`formControls`, `rangeNext`, `nextOption`, `decimals`, adjust mode) | 1,862 / 661 |
| Both | 3,688 / 1,346 (9,403 / 3,430 left, 28% smaller) |

`node modules/pad-nav/test/lite.js [hint] [forms] [--write FILE]` makes the cut copy (both cuts by default) and proves it still loads, wakes the ring, moves it right twice and presses the button. If `pad-nav.js` changes and a cut no longer fits, the script stops and names it. A cut copy is not a released version; check which options you pass.

## How it compares

The libraries below are more complete at moving focus; this one is the small, panel-scoped version that reads the Gamepad API itself. Speed against the alternatives: not measured.

| Alternative | Size (smaller is better) | Features | Where it wins / loses |
| --- | --- | --- | --- |
| **pad-nav 1.1.0** (MIT) | 13,091 B minified (esbuild); 9,403 B (3,430 B gzipped) with the hint text and slider support cut | Gamepad API, panel scopes, focus memory, sliders and drop-downs, hint line | Made for game authors, moves focus in your own menus. No nested sections, no wrap-around. |
| [js-spatial-navigation](https://github.com/luke-chang/js-spatial-navigation) (MPL 2.0) | Not measured | Named sections, `restrict` rules, per-element overrides, cancelable events; keys, not the Gamepad API | Far more complete for TV-style apps; no gamepad input. |
| [Norigin Spatial Navigation](https://github.com/NoriginMedia/norigin-spatial-navigation) (MIT) | Not measured | React hooks for Smart TV apps; key and remote-control input | Wins with React and on TV platforms; no gamepad input. |
| [CSS Spatial Navigation](https://drafts.csswg.org/css-nav-1/) (W3C draft) | The archived WICG polyfill is about 73.5 KB unminified; a built-in feature would cost no bytes | Focus containers, a cancelable `navbeforefocus` event; arrow keys, no gamepads | No browser had shipped it when checked (October 2026). |
| [gamecontroller.js](https://github.com/Linie3/gamecontroller.js) (a fork) and [gamepad-navigator](https://github.com/dmahajan980/gamepad-navigator) | gamecontroller.js: about 6 KB. gamepad-navigator: not measured (browser extension) | gamecontroller.js: an event per button, no focus movement. gamepad-navigator: navigates whole pages for users | gamecontroller.js is smaller but moves no focus; the extension is for players, not game authors. |

Speed of pad-nav, lower is faster. Finding reachable buttons among 1000 buttons, old check to `checkVisibility()`: ungoogled Chromium 155.0.8059.39-1 8.1 to 3.2 ms; Firefox 158.0 4 to 1 ms; WebKitGTK 2.52.6 5 to 1 ms (timers round to 1 ms outside Chromium). Idle `step()` with no controller (measured on 1.0.0): Chromium 155.0.8059.39 1.9 µs, Firefox 158.0 0.2 µs.

Where it loses: no nested sections, wrap-around, per-element overrides, shadow DOM or iframes; the default rule can jump past a button directly in line in 5.4% of presses where one exists (synthetic menus; `nextRule: 'edges'` does not); standard mapping and left stick only; not tried on a real controller or phone, and the module browser suite ran in ungoogled Chromium 155.0.8059.39-1 only. Not measured: size and speed of the alternatives; speed on a phone. Other gamepad-to-focus libraries almost certainly exist (the search was brief), so this is not a claim of novelty.

## What it is not

- **Standard mapping only.** A pad reporting any other `mapping` (including `''`) is skipped without error. Firefox has had non-standard reports for generic and older Xbox pads on Windows, and for the DualSense its D-pad showed up on an axis (fixed in Firefox 152 and 153, per its bug tracker). `requireStandard: false` tries the standard layout anyway, but the D-pad may still not arrive as buttons. The source game's hat-switch D-pad handling is not carried over.
- **Press a button first.** Firefox shows a pad to the page only after the user touches it while the page is visible, and a button held at page load is not seen. `gamepaddisconnected` fires only for a pad the page had data from.
- **Secure context.** Gamepad access needs `https:` or `localhost` (Firefox 81 and later returns an empty list on plain `http:`). A double-clicked `file:` page depends on the browser and was not checked on hardware. Background tabs get no pad input; cross-origin iframes may need `allow="gamepad"` (unverified).
- **Android, unconfirmed.** An old report (2016, Samsung Internet) says a Bluetooth controller's B button can act as the browser's Back key. To settle it, press B on a page with `onBack` set and see whether the browser also goes back or closes a panel.
- Left stick only. Only `input[type=range]` and single-choice `select` get special handling. With the default rule a distant straight neighbor can lose to a nearby diagonal one. Candidates are re-queried on every directional press (fine for menus, not thousands of elements).
- The ring shows only if you write CSS for `.pad-focus` (and `.pad-adjust`). Focus is the real DOM focus, so a screen reader follows it; the hint is a live region it may read each time. The default hint is English and mentions `Start: pause`; use `hintText` to change it.
- Tested with fake pads only (Node fake DOM; headless Chromium). Not tested on real hardware, Firefox or Safari.

## For AI agents

- A press acts once (`pressed && !previous`); held directions repeat on absolute times; missed frames queue nothing. The first direction press with no ring only shows it, and A on that frame does not click. `guardMs`: A is ignored right after a scope changes, except for the very first scope.
- No wrap; no candidate means stay (scroll the scope on up/down). `onBack` and `onStart` fire even with a `null` scope.
- Nothing is shown or written to the DOM before the first pad input. `step()` stays cheap with no usable pad and never throws; every outside function goes through `hook()`, and a new callback must too.
- `PadNav.stick()` stays pure and allocation-free, with vertical winning ties. Unplugging clears the ring, hint and `awake` and calls `onDisconnect` once. Slider adjust mode ends on any ring change, scope change or unplug.
- UMD wrapper (global `PadNav`, or `module.exports`) with `'use strict'` inside, ES5, no dependencies, the header `Copyright (c) 2026 LFC Foundry. MIT License`; American English, no game-specific names or art.
- Run `node modules/pad-nav/test/run.js` and `python3 modules/pad-nav/test/run.py` from the repository root. Time is a virtual clock passed to `step()`; keep the repeat checks exact. Do not change without updating the tests: the 380 and 120 ms repeat defaults, 0.45 deadzone, 0.35 release, the `2.5` drift weight, the 4 px minimum, the button numbers, or the fixed layout of `test/page.html`.

## Prior art and credits

- js-spatial-navigation (MPL 2.0): read (README only) as prior art for spatial focus. Idea only, no code taken.
- [Norigin Spatial Navigation](https://github.com/NoriginMedia/norigin-spatial-navigation) (MIT): prior art for letting the developer choose corners, edges or center to pick the next button; `nextRule` offers a similar choice. Idea only, no code.
- [CSS Spatial Navigation Level 1](https://drafts.csswg.org/css-nav-1/) (W3C CSS Working Group draft; [explainer](https://drafts.csswg.org/css-spatial-nav-1/explainer.html); work now in the [CSS Working Group repository](https://github.com/w3c/csswg-drafts)) and the archived [WICG spatial-navigation](https://github.com/WICG/spatial-navigation): prior art for counting overlap and edge gaps. Ideas only, no code.
- [gamecontroller.js (fork)](https://github.com/Linie3/gamecontroller.js), [gamepad-navigator](https://github.com/dmahajan980/gamepad-navigator) and [gamepad_standardizer](https://www.npmjs.org/package/gamepad_standardizer) (MIT): read (READMEs only) for comparison. Nothing taken. gamepad_standardizer uses SDL's controller database to fix odd layouts, the problem pad-nav skips.
- The W3C Gamepad API "standard" mapping (button numbers 0, 1, 9, 12 to 15; axes 0 and 1) is the format this module reads; see [MDN's Gamepad API guide](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API). A specification, no code.
- The menu code was pulled out of LFC Foundry's own single-file game, and Fancy, the Banana's controller menu code uses the same center rule, so the rule is the project's own.

No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (the longer comparison with each alternative, every behavior detail and failure case written out in full, and the list of what is different here) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
