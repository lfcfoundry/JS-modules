# pad-nav

**Version 1.0.0 · API 1**

Tests (offline): `node modules/pad-nav/test/run.js` (fake pads and a tiny fake DOM, no browser, under a second) and `python3 modules/pad-nav/test/run.py` (about 3 seconds, needs Playwright for Python and an installed Chromium).

## What it is

Gamepad navigation for ordinary on-screen DOM menus and panels, in one file with no dependencies. It reads the browser's [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) once per frame and then:

- the D-pad or left stick moves focus to the nearest visible, enabled button in the direction pressed,
- A clicks the focused element,
- B calls your `onBack`, Start calls your `onStart`,
- A on a slider (`input[type=range]`) enters adjust mode, where left and right change the value one step; A on a drop-down (`select`) moves to the next option,
- the open panel scrolls to keep the focused element visible,
- a one-line hint ("D-pad: move    A: pick    B: back") appears after the pad is first used, then fades.

Only the topmost open panel (the "scope") is navigable; you tell it which element that is.

It is built to be left running: `step()` never throws (a page that disables the Gamepad API, or a callback of yours that fails, is caught and reported through `onError`), a worn stick resting near the press point does not flip every frame, and unplugging a controller hides the hint and ring and calls `onDisconnect`.

## Why it exists

It was pulled out of a single-file browser game whose menus and panels are plain HTML buttons. Controller players could flap and steer but could not get around the menus, and most game-pad libraries assume you are drawing everything on a canvas. This is the small, tested version of that menu code, with all game-specific parts removed.

## Quick start

Save as `index.html` next to `pad-nav.js`, or open `demo.html` (double-click, no server needed).

```html
<style>.pad-focus { outline: 3px solid #6a3de8; }</style>

<div id="menu">
  <button onclick="alert('Play')">Play</button>
  <button onclick="alert('Options')">Options</button>
  <button onclick="alert('Quit')">Quit</button>
</div>
<div id="hint" hidden></div>

<script src="pad-nav.js"></script>
<script>
  var pn = new PadNav({
    getScope: function () { return document.getElementById('menu'); },   // the open panel, or null for none
    hintEl: document.getElementById('hint'),
    onBack: function () { console.log('B pressed'); },
    onStart: function () { console.log('Start pressed'); }
  });
  pn.start();   // or call pn.step() yourself once per frame from your own loop
</script>
```

Plug in a controller and press any button (browsers hide the pad until you do). The first press only shows the focus ring; the next ones move it.

The file is a small UMD wrapper: a plain `<script>` puts `PadNav` on the page, and `require('./pad-nav.js')` returns it in Node (the navigation itself needs a DOM, so in Node it is only useful with jsdom or similar; the pure helpers work anywhere).

To show "Press A" prompts only for controller players and to pause when the pad goes away:

```js
var pn = new PadNav({
  getScope: function () { return openPanel; },
  hintEl: hintDiv,
  labels: true,                                           // optional: Cross/Circle on PlayStation pads, B/A on Nintendo pads
  onUse: function (pad) { showPadPrompts(pad.id); },     // first pad input (and the first one after an unplug)
  onDisconnect: function () { pauseGame(); },             // no usable pad left
  onError: function (err, where) { console.warn(where, err); }
});
```

## API

`new PadNav(options)`, all options optional:

| Option | Default | Meaning |
| --- | --- | --- |
| `getScope()` | none | Returns the element that owns the pad now (the topmost open panel) or `null` for none. Called every frame, so keep it cheap. |
| `scopeSelector` | none | String alternative to `getScope`: the last visible match in document order is the scope. With neither option, `document.body` is the scope. |
| `focusableSelector` | buttons, `a[href]`, inputs (not hidden), selects, textareas, `[tabindex]` except `-1` | What is reachable inside the scope. |
| `filter(el)` | none | Return `false` to leave an element out. |
| `onBack(scope)` | none | B pressed (edge only). Called even when there is no scope. |
| `onStart(scope)` | none | Start pressed (edge only). Called even when there is no scope. |
| `onA(el)` | none | A pressed on the focused element, before the click (or the slider and drop-down handling). Return `false` to cancel that. |
| `onUse(pad)` | none | The first pad input, and the first one after an unplug. `pad` is the Gamepad object, so you can read `pad.id`. |
| `onDisconnect()` | none | The last usable pad went away (seen on the next frame, or at once on `gamepaddisconnected`). Called once per unplug. |
| `onError(err, where)` | none | Something threw and was swallowed. `where` names it: `getPads`, `getScope`, `filter`, `onA`, `onBack`, `onStart`, `onUse`, `onDisconnect`, `hintText`, `labels`, `click`, `adjust`, `select` or `step`. The same error repeating every frame is reported once. The latest one is also on `pn.lastError` and `pn.lastErrorWhere`. |
| `getPads()` | `navigator.getGamepads` | Returns an array-like of gamepads. Inject a fake in tests. |
| `deadzone` | `0.45` | Stick push (0 to 1) at which a direction starts. It is a digital threshold, not a smoothing curve. |
| `release` | `deadzone - 0.1` (0.35) | Stick push below which a held direction lets go. The gap between the two keeps a worn stick resting near the press point from flipping every frame. Set it equal to `deadzone` to turn the gap off. Never above `deadzone`. The numbers are a starting point; tune them with a real stick. |
| `repeatDelay` | `380` ms | How long a held direction waits before repeating. |
| `repeatRate` | `120` ms | Time between repeats after that. |
| `focusClass` | `'pad-focus'` | Class put on the focused element. You write the CSS (for example `.pad-focus { outline: 3px solid #6a3de8; }`): the library injects none, so without it there is no visible ring. |
| `formControls` | `true` | A on `input[type=range]` enters adjust mode; A on a single-choice `select` cycles to the next enabled option. `false`: A always just calls `click()`, as in earlier versions. |
| `adjustClass` | `'pad-adjust'` | Class on the slider while it is in adjust mode. You write the CSS. |
| `hintEl` | none | Element whose text and `hidden` attribute the library sets. It gets `role="status"` (a polite live region, no visual change) unless it already has a role. |
| `hintText` | built from the wired callbacks | String, or `function (scope, names, mode)` returning a string. `names` is `{ dpad, a, b, start }`, `mode` is `'menu'` or `'adjust'`. |
| `labels` | off | Button names in the default hint. `true` guesses from the pad's `id` text: Cross, Circle and Options on PlayStation pads, B and A on Nintendo pads (the standard layout is by position, so the bottom button is printed B there), A, B and Start otherwise. Or an object such as `{ a: 'Jump' }` that replaces words, or `function (padId)` returning one. Off by default: the hint says A, B and Start. |
| `hintMs` | `3500` | How long the hint stays after waking or a scope change. |
| `guardMs` | `450` | A is ignored this long after a scope appears, so the A press that opened a panel does not also click inside it. |
| `wakeMs` | `8000` | A scope that opens within this long of pad use gets the focus ring on its first button (or the one remembered for it) right away. Later than that, the first direction press shows it. |
| `scroll` | `true` | After each focus change call `scrollIntoView({ block: 'nearest', inline: 'nearest' })`. |
| `requireStandard` | `true` | Read only pads whose `mapping` is `'standard'`. |

Methods:

- `step(nowMs?)` call once per frame; `nowMs` defaults to `performance.now()`. Returns `true` if a usable pad was read. Never throws.
- `start()` polls with `requestAnimationFrame`; `stop()` stops. `start()` returns the instance.
- `destroy()` stops, removes the blur and `gamepaddisconnected` listeners, clears the ring, hides the hint.
- `focus(el)` puts the ring on an element yourself. `clearRing()` removes it.
- `PadNav.nearest(fromRect, rects, 'l' | 'r' | 'u' | 'd')` is the pure direction chooser: it returns an index into `rects` or `-1`. Rects are `{ left, top, width, height }`.
- Other pure helpers, usable without a DOM: `PadNav.stick(x, y, was, press, release, out?)` (the stick press and release state machine), `PadNav.rangeNext(value, min, max, step, dir)`, `PadNav.nextOption(options, index)` and `PadNav.labelsFor(padId)`.

Button map (Gamepad API "standard" mapping): 12 up, 13 down, 14 left, 15 right, axes 0 and 1 (left stick), 0 = A, 1 = B, 9 = Start. With several pads connected, their inputs are merged.

Behavior details worth knowing:

- Presses are edge-detected. A held direction moves immediately, again after `repeatDelay`, then every `repeatRate`. A missed frame moves once, not several times.
- Distance is measured between element centers: `distance along the direction + 2.5 x sideways drift`, ignoring anything less than 4 px in that direction. There is no wrapping; at an edge the focus stays. If nothing is further up or down, the scope scrolls by half its height instead (and a scope with a single reachable element scrolls the same way).
- The stick counts along its stronger axis only, so a diagonal push does not move twice. The D-pad buttons are independent.
- A stick direction starts above `deadzone` and ends only below `release`. Between the two it keeps its state, so a stick wobbling between 0.4 and 0.5 holds one direction instead of pressing it again every other frame. Each pad has its own state.
- Slider adjust mode: A (after `onA`) adds `adjustClass` and shows "Left/Right: change    A or B: done". Left and right move the value by the input's `step` (default 1, `any` means one hundredth of the range) and clamp at `min` and `max`; the key repeat timing applies. Each change fires `input` and then `change`, the way the keyboard does. Up and down do nothing while adjusting. A or B leaves the mode; that B does not call `onBack`. Moving the ring elsewhere, losing the scope or unplugging also leaves it.
- Drop-downs: A moves to the next enabled option (wrapping around) and fires `input` and `change`. `select.click()` is not used because it does not open the list in every browser. A long list is slow to cycle; use `onA` and return `false` to show your own picker instead. A multiple-select, checkbox, radio, link and button get a normal `click()`, which toggles checkboxes and radios natively.
- When no usable pad is found after one was (unplugged, or `connected` turned false), the ring, the hint and the awake state are cleared and `onDisconnect` runs once. `gamepaddisconnected` triggers the same check at once. Browsers fire that event only for a pad the page has received data from. With no pad ever seen, `step()` does nothing.
- An outside function that throws (`getPads`, `getScope`, `filter`, `onA`, `onBack`, `onStart`, `onUse`, `onDisconnect`, `hintText`) is caught. `getPads` failing means nothing is known, so nothing changes that frame. A failing `getScope` means no scope; a failing `filter` keeps the element; a failing `onA` still allows the click; a failing `hintText` falls back to the default text.
- When the ring is not showing (first use, a new scope after a long idle, or after the focused element lost focus), the first direction press only shows it, on the element that already has focus if that is reachable, else the one remembered for this scope, else the first one. A with no ring does the same, except that a scope with exactly one reachable element clicks it.
- Each scope remembers its last focused element, so closing a sub-panel returns to the button that opened it.
- Reachable means: matches the selector, not `:disabled`, not `aria-disabled="true"`, not inside `[inert]`, rendered (not `display: none`), not `visibility: hidden`, and passing `filter`.
- The hint is written to the DOM only when it changes, and nothing at all is shown before the first pad input.

## How it differs from existing open source

Moving focus spatially is a known technique with plenty of prior art, and these projects are more complete than this one at that job:

- [js-spatial-navigation](https://github.com/luke-chang/js-spatial-navigation) (Luke Chang, MPL 2.0): framework-free, with named sections, `restrict` rules (stay inside a section or cross freely), per-element target overrides, cancelable events, pause and resume. It is built for TV-style apps. From its README it listens to arrow and Enter key events, not the Gamepad API.
- [Norigin Spatial Navigation](https://github.com/NoriginMedia/norigin-spatial-navigation) (MIT): React hooks, designed for Smart TV and set-top-box apps, tested across many TV platforms. Its README describes key and remote-control navigation, not the Gamepad API.
- The [CSS Spatial Navigation Level 1](https://drafts.csswg.org/css-nav-1/) proposal and its [explainer](https://drafts.csswg.org/css-spatial-nav-1/explainer.html): focus containers (`spatial-navigation-contain`), a `navbeforefocus` event you can cancel, and a search API, aimed at being built into browsers. The spec work now lives in the [CSS Working Group repository](https://github.com/w3c/csswg-drafts); the earlier [WICG spatial-navigation](https://github.com/WICG/spatial-navigation) repository (which held a polyfill) was archived on 2026-03-23 and says so. When this was checked (October 2026) no browser had shipped it. It centers on arrow keys; its explainer does not mention gamepads.
- Gamepad libraries that stop at input: [gamecontroller.js (a fork)](https://github.com/Linie3/gamecontroller.js) (about 6 KB, standard layout names and an event per button, no focus movement) and [gamepad-navigator](https://github.com/dmahajan980/gamepad-navigator) (a browser extension that navigates whole pages by pad, for users rather than game authors). [gamepad_standardizer](https://www.npmjs.org/package/gamepad_standardizer) (MIT) uses SDL's controller database to fix odd layouts, which is the problem pad-nav skips (see Limits). I read their READMEs only; licenses are not all stated there.

If you need nested sections, focus that moves between groups with rules, React integration, TV remotes, or a standard-track API, use one of those. A common way to combine them is to turn pad input into the key events they already understand.

What is different here is narrower:

- **Gamepad API input handling** is built in: standard-mapping buttons and stick, deadzone, edge detection, key repeat, merging several pads, ignoring non-standard ones.
- **Panel-scoped.** One element owns the pad at a time (the topmost open panel), and per-scope focus memory returns you to the opener.
- **Pad-use awareness.** Nothing shows until the pad is used; the first press only wakes the ring; a hint line appears after pad use and fades.
- **Single-file, no framework**, aimed at small browser games and tools with a handful of HTML panels, where the rest of the game is on a canvas.

I searched for these alternatives briefly, not exhaustively. Other gamepad-to-focus libraries almost certainly exist, so this is not a claim of novelty.

## Limits and gotchas

- Only the Gamepad API "standard" mapping is read. A controller reporting any other `mapping` (including `''`) is skipped without error, so on some browser and pad combinations the pad simply does nothing. Firefox has had non-standard reports for generic and older Xbox pads on Windows, and for the DualSense its D-pad showed up on an axis instead of buttons 12 to 15 (fixed in Firefox 152 and 153, per its bug tracker). `requireStandard: false` tries the standard layout on such a pad anyway, but the D-pad may still not arrive as buttons. The game this came from also handled a hat-switch D-pad on one axis of such pads; that is not carried over.
- Firefox shows a pad to the page only after the user touches it while the page is visible, and a button held down when the page loads is not seen (the spec counts a press only if the button was released before). Treat "press a button first" as the rule in every browser. `gamepaddisconnected` fires only for a pad the page had data from.
- Gamepad access needs a secure context: `https:` or `localhost`. Firefox 81 and later returns an empty list on plain `http:` pages. Whether a double-clicked `file:` page counts depends on the browser, and I have not checked it with real hardware. Background tabs do not get pad input. Inside a cross-origin iframe, browsers differ on whether the host page must add `allow="gamepad"`; embeds are unverified.
- Android: an old report (2016, Samsung Internet) says a Bluetooth controller's B button can act as the browser's Back key. I could not confirm that it still happens. One real-phone check settles it: on an Android phone with a Bluetooth pad, press B on a page with `onBack` set and see whether the browser also goes back or closes a panel (for example one managed by `back-close`). If it does, B would fire both; until someone checks, do not assume either way.
- The stick thresholds (`deadzone` 0.45, `release` 0.35) are reasonable defaults, not tuned on real worn sticks. Raise `deadzone` or lower `release` if your players report drifting or sticky directions.
- Left stick only (axes 0 and 1); the right stick, triggers and other buttons do nothing.
- Spatial choice has no hard cone: a distant straight neighbor can lose to a nearby diagonal one if the diagonal is much closer. Equal scores go to the element earlier in document order.
- No nested sections, no wrap-around, no per-element overrides, no shadow DOM piercing (`querySelectorAll` does not see into shadow roots) and no iframes.
- Candidates are re-queried on every directional press (not every frame), which is fine for menus and not meant for thousands of elements. `getScope` or `scopeSelector` runs every frame while a pad is connected.
- Focus uses a class plus `element.focus({ preventScroll: true })`, so a screen reader follows the real focus. The ring is only visible if you write CSS for `.pad-focus` (and `.pad-adjust` for a slider in adjust mode); `:focus-visible` is not relied on.
- Sliders and drop-downs: only `input[type=range]` and single-choice `select` get special handling; number, date and text inputs are focused and clicked as before. Left and right are the only adjust keys, up and down are ignored while adjusting.
- The `labels` option guesses the brand from the pad's `id` text, which is not standardized and differs between Chrome and Firefox. It is a guess; pass your own words when you know the pad.
- `scrollIntoView` scrolls every scrollable ancestor, including the page, as little as it can. Turn it off with `scroll: false` if that bothers you.
- Tested with fake pads only: the Node checks use a tiny fake DOM and the browser checks run in headless Chromium. Not tested on real hardware, Firefox or Safari.
- The default hint text is English and mentions `Start: pause`; use `hintText` to change it. The hint is a live region (`role="status"`), so a screen reader may read it each time it appears.

## For AI agents

Invariants to preserve:

- Edge detection: a press acts once (`pressed && !previous`). Held directions repeat on absolute times: first at `+repeatDelay`, then each `+repeatRate`. Missed frames do not queue extra moves.
- The first direction press when the ring is not showing only shows it; it never also moves. A on that same frame does not click.
- `guardMs`: A is ignored right after a scope changes, except for the very first scope seen.
- No wrap. No candidate in the direction means stay, and on up/down means scroll the scope.
- `onBack` and `onStart` fire even with a `null` scope; direction and A need a scope.
- Nothing is shown or written to the DOM before the first pad input, and the hint DOM is written only when it changes.
- `step()` must stay cheap when no usable pad is connected: it returns before touching the DOM (the one exception is the single cleanup on the frame a pad is lost).
- `step()` never throws, and every outside function goes through `hook()`. A new callback must too.
- The stick press and release state lives in `PadNav.stick()`, which is pure and allocation-free; keep it that way and keep its tie rule (vertical wins when both axes are equal).
- Unplugging clears the ring, the hint and `awake` and calls `onDisconnect` once; `onUse` fires when `awake` turns on.
- Slider adjust mode ends on any ring change, scope change or unplug. B in adjust mode never reaches `onBack`.
- The file is a UMD wrapper (browser global `PadNav`, or `module.exports`) with `'use strict'` inside it, ES5 syntax, no dependencies, and the header `Copyright (c) 2026 LFC Foundry. MIT License`, as `AGENTS.md` asks of every module. Text stays American English, with no game-specific names or art.

Run the tests from the repository root: `node modules/pad-nav/test/run.js` (Node only; fake gamepads and a tiny fake DOM) and `python3 modules/pad-nav/test/run.py` (Playwright for Python plus Chromium; it never touches the network). Both print one line per section and exit non-zero on any failure. Time is a virtual clock passed to `step()`, so the repeat-timing checks are exact; keep them that way.

What not to change without updating the tests: the 380 ms and 120 ms repeat defaults, the 0.45 deadzone and 0.35 default release, the `2.5` sideways-drift weight, the 4 px minimum, and the button numbers. `test/page.html` places the grid and panel with fixed positions on purpose; changing its layout changes the expected focus paths.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
