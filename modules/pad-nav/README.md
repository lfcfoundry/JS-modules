# pad-nav

Test (offline, about 3 seconds, needs Playwright for Python and an installed Chromium): `python3 modules/pad-nav/test/run.py`

## What it is

Gamepad navigation for ordinary on-screen DOM menus and panels, in one file with no dependencies. It reads the browser's [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) once per frame and then:

- the D-pad or left stick moves focus to the nearest visible, enabled button in the direction pressed,
- A clicks the focused element,
- B calls your `onBack`, Start calls your `onStart`,
- the open panel scrolls to keep the focused element visible,
- a one-line hint ("D-pad: move    A: pick    B: back") appears after the pad is first used, then fades.

Only the topmost open panel (the "scope") is navigable; you tell it which element that is.

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

In Node: `const PadNav = require('./pad-nav.js')` (it needs a DOM, so only useful with jsdom or similar).

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
| `onA(el)` | none | A pressed on the focused element, before the click. Return `false` to cancel the click. |
| `getPads()` | `navigator.getGamepads` | Returns an array-like of gamepads. Inject a fake in tests. |
| `deadzone` | `0.45` | Stick push (0 to 1) that counts as a press. It is a digital threshold, not a smoothing curve. |
| `repeatDelay` | `380` ms | How long a held direction waits before repeating. |
| `repeatRate` | `120` ms | Time between repeats after that. |
| `focusClass` | `'pad-focus'` | Class put on the focused element. You write the CSS; the library injects none. |
| `hintEl` | none | Element whose text and `hidden` attribute the library sets. |
| `hintText` | built from the wired callbacks | String, or `function (scope)` returning a string. |
| `hintMs` | `3500` | How long the hint stays after waking or a scope change. |
| `guardMs` | `450` | A is ignored this long after a scope appears, so the A press that opened a panel does not also click inside it. |
| `wakeMs` | `8000` | A scope that opens within this long of pad use gets the focus ring on its first button (or the one remembered for it) right away. Later than that, the first direction press shows it. |
| `scroll` | `true` | After each focus change call `scrollIntoView({ block: 'nearest', inline: 'nearest' })`. |
| `requireStandard` | `true` | Read only pads whose `mapping` is `'standard'`. |

Methods:

- `step(nowMs?)` call once per frame; `nowMs` defaults to `performance.now()`. Returns `true` if a usable pad was read.
- `start()` polls with `requestAnimationFrame`; `stop()` stops. `start()` returns the instance.
- `destroy()` stops, removes the blur listener, clears the ring, hides the hint.
- `focus(el)` puts the ring on an element yourself. `clearRing()` removes it.
- `PadNav.nearest(fromRect, rects, 'l' | 'r' | 'u' | 'd')` is the pure direction chooser: it returns an index into `rects` or `-1`. Rects are `{ left, top, width, height }`.

Button map (Gamepad API "standard" mapping): 12 up, 13 down, 14 left, 15 right, axes 0 and 1 (left stick), 0 = A, 1 = B, 9 = Start. With several pads connected, their inputs are merged.

Behavior details worth knowing:

- Presses are edge-detected. A held direction moves immediately, again after `repeatDelay`, then every `repeatRate`. A missed frame moves once, not several times.
- Distance is measured between element centers: `distance along the direction + 2.5 x sideways drift`, ignoring anything less than 4 px in that direction. There is no wrapping; at an edge the focus stays. If nothing is further up or down, the scope scrolls by half its height instead (and a scope with a single reachable element scrolls the same way).
- The stick counts along its stronger axis only, so a diagonal push does not move twice. The D-pad buttons are independent.
- When the ring is not showing (first use, a new scope after a long idle, or after the focused element lost focus), the first direction press only shows it, on the element that already has focus if that is reachable, else the one remembered for this scope, else the first one. A with no ring does the same, except that a scope with exactly one reachable element clicks it.
- Each scope remembers its last focused element, so closing a sub-panel returns to the button that opened it.
- Reachable means: matches the selector, not `:disabled`, not `aria-disabled="true"`, not inside `[inert]`, rendered (not `display: none`), not `visibility: hidden`, and passing `filter`.
- The hint is written to the DOM only when it changes, and nothing at all is shown before the first pad input.

## How it differs from existing open source

Moving focus spatially is a known technique with plenty of prior art, and these projects are more complete than this one at that job:

- [js-spatial-navigation](https://github.com/luke-chang/js-spatial-navigation) (Luke Chang, MPL 2.0): framework-free, with named sections, `restrict` rules (stay inside a section or cross freely), per-element target overrides, cancelable events, pause and resume. It is built for TV-style apps. From its README it listens to arrow and Enter key events, not the Gamepad API.
- [Norigin Spatial Navigation](https://github.com/NoriginMedia/norigin-spatial-navigation) (MIT): React hooks, designed for Smart TV and set-top-box apps, tested across many TV platforms. Its README describes key and remote-control navigation, not the Gamepad API.
- The [CSS Spatial Navigation Level 1](https://drafts.csswg.org/css-nav-1/) proposal and its [explainer](https://drafts.csswg.org/css-spatial-nav-1/explainer.html), with an experimental [polyfill from the WICG](https://github.com/WICG/spatial-navigation): focus containers (`spatial-navigation-contain`), a `navbeforefocus` event you can cancel, and a search API, aimed at being built into browsers. It centers on arrow keys; its explainer does not mention gamepads.

If you need nested sections, focus that moves between groups with rules, React integration, TV remotes, or a standard-track API, use one of those. A common way to combine them is to turn pad input into the key events they already understand.

What is different here is narrower:

- **Gamepad API input handling** is built in: standard-mapping buttons and stick, deadzone, edge detection, key repeat, merging several pads, ignoring non-standard ones.
- **Panel-scoped.** One element owns the pad at a time (the topmost open panel), and per-scope focus memory returns you to the opener.
- **Pad-use awareness.** Nothing shows until the pad is used; the first press only wakes the ring; a hint line appears after pad use and fades.
- **Single-file, no framework**, aimed at small browser games and tools with a handful of HTML panels, where the rest of the game is on a canvas.

I searched for these alternatives briefly, not exhaustively. Other gamepad-to-focus libraries almost certainly exist, so this is not a claim of novelty.

## Limits and gotchas

- Only the Gamepad API "standard" mapping is read. A controller reporting any other `mapping` (including `''`) is ignored without error. Set `requireStandard: false` to try the standard layout on it anyway. The game this came from also handled a hat-switch D-pad on one axis of such pads; that is not carried over.
- Browsers expose a pad only after a button is pressed on it, and only on secure contexts (`https:` or `localhost`; whether a double-clicked `file:` page counts depends on the browser, and I have not checked it with real hardware). Background tabs do not get pad input.
- Left stick only (axes 0 and 1); the right stick, triggers and other buttons do nothing.
- Spatial choice has no hard cone: a distant straight neighbor can lose to a nearby diagonal one if the diagonal is much closer. Equal scores go to the element earlier in document order.
- No nested sections, no wrap-around, no per-element overrides, no shadow DOM piercing (`querySelectorAll` does not see into shadow roots) and no iframes.
- Candidates are re-queried on every directional press (not every frame), which is fine for menus and not meant for thousands of elements. `getScope` or `scopeSelector` runs every frame while a pad is connected.
- Focus uses a class plus `element.focus({ preventScroll: true })`. You supply the CSS for `focusClass`; `:focus-visible` is not relied on.
- `scrollIntoView` scrolls every scrollable ancestor, including the page, as little as it can. Turn it off with `scroll: false` if that bothers you.
- Tested only in headless Chromium with a fake pad. Not tested on real hardware, Firefox or Safari.
- The default hint text is English and mentions `Start: pause`; use `hintText` to change it.

## For AI agents

Invariants to preserve:

- Edge detection: a press acts once (`pressed && !previous`). Held directions repeat on absolute times: first at `+repeatDelay`, then each `+repeatRate`. Missed frames do not queue extra moves.
- The first direction press when the ring is not showing only shows it; it never also moves. A on that same frame does not click.
- `guardMs`: A is ignored right after a scope changes, except for the very first scope seen.
- No wrap. No candidate in the direction means stay, and on up/down means scroll the scope.
- `onBack` and `onStart` fire even with a `null` scope; direction and A need a scope.
- Nothing is shown or written to the DOM before the first pad input, and the hint DOM is written only when it changes.
- `step()` must stay cheap when no usable pad is connected: it returns before touching the DOM.
- The two-line dual-loading footer in `pad-nav.js` and the license header on line 1 are required by the repository's `AGENTS.md`. Text stays American English, with no game-specific names or art.

Run the tests: `python3 modules/pad-nav/test/run.py` from the repository root (Playwright for Python plus Chromium; it never touches the network). It prints one line per section and exits non-zero on any failure. Time is a virtual clock passed to `step()`, so the repeat-timing checks are exact; keep them that way.

What not to change without updating the tests: the 380 ms and 120 ms repeat defaults, the 0.45 deadzone, the `2.5` sideways-drift weight, the 4 px minimum, and the button numbers. `test/page.html` places the grid and panel with fixed positions on purpose; changing its layout changes the expected focus paths.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Fancy, the Banana](https://github.com/JNFoo/fancy-banana)
