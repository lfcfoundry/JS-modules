# hold-press

**Version 1.1.0 · API 1**

**Tested in:** Node: 33 checks pass (16 new). Real key presses (Enter and Space, hold 1.1 s, quick tap, hold then tap): ungoogled Chromium 155.0.8059.39-1 and Firefox 158.0. Idle cost compared old and new in those two plus WebKitGTK 2.52.6 and GNOME Web 46.5; keyboard hold by script key events in the last two. Not run: touch on a real phone, the browser-side Space click swallow in WebKitGTK and GNOME Web (script keys send no click)

## What it is and how it works

"Hold to keep pressing" for a button, on mouse, touch and pen. About 9 KB, no dependencies.

- After a short delay (400 ms) it calls your `onPress`, then repeats every 200 ms.
- It follows the finger with touch events too, so a hold lasts until the finger really lifts.
- It swallows the click the browser sends on release, so letting go never adds a press.

## Why it exists

On Android Chrome the browser can send `pointercancel` mid-hold while the finger is still down, and code that listens only to pointer events stops repeating. The release click also adds one press too many.

**Where it helps**

- Buttons that add points or buy items while held.
- Steppers and counters on touch screens.
- Any repeat action that must stop exactly when the finger lifts.

**Not for:** switch devices (keyboard hold is opt-in, switch hold is not covered).

## Try it and test it
**Test it:** `node modules/hold-press/test/run.js` (fake touch, pointer and key events and a fake clock, 33 checks, no browser).

## Use
```js
var h = HoldPress.attach(button, {
  onPress: function (info) { addPoints(); },       // info: { x, y, count } (count is 1 on the first repeat)
  canPress: function () { return !dialogOpen; },     // false ends the hold
  zone: function (x, y) { return insideTarget(x, y); },   // optional: must stay inside while holding
  delayMs: 400, everyMs: 200, slop: 30, onEnd: function () {},
  lockTouch: false,                                 // true: touch-action none while attached (below)
  keyboard: false                                   // true: hold Enter or Space on the focused button (below)
});
h.detach();
```
A quick tap is still a normal `click` (use your own listener). After a hold, the click the browser sends on release is swallowed, so letting go never adds an extra press.

`attach` returns `{ stop(), setEnabled(bool), holding, detach() }`. `onPress` and `onEnd` are wrapped so a bug in them cannot break the timer; a repeat time of `0` or less is ignored (the 200 ms default is used).

## Keyboard hold (`keyboard: true`, opt-in)
Holding Enter or Space on the focused element repeats `onPress` the same way a mouse or finger does: first after `delayMs`, then every `everyMs`; letting go of the key (or the element losing focus) ends it and calls `onEnd`. `canPress` and `zone` apply (`zone` gets the element's center). Enter's one normal click still happens when it is first pressed, and the repeats of a held key are not turned into extra clicks. A Space hold that fired also swallows the click the browser sends when Space is released (a Space tap, or a hold that never fired, clicks normally). Ctrl, Alt and Meta combinations are ignored. Real key presses in Chromium 155.0.8059.39 and Firefox 158.0: holding either key for 1.1 s gives 4 presses; Enter gives 1 click, Space 0; a quick tap gives 0 presses and 1 click; a Space hold followed by a normal Space tap gives exactly 1 click.

## Locking touch (`lockTouch: true`, opt-in)
Sets `touch-action: none` on the element while it is attached and puts the old value back on `detach()`, so the browser does not start a scroll, pan or zoom from a finger that began on the button. Measured in Chromium 155 touch emulation (finger starts on the button and drags up 120 px on a scrollable page): with `touch-action: auto` or `manipulation` the browser sends `pointercancel` and scrolls the page 83 px; with `none` it sends no cancel and the page does not scroll. So the paste-in `manipulation` style below does not stop the cancel (the touch handling in this module copes with it); `lockTouch` does. Do not use it on something the player must be able to scroll with.

## Paste-in styles
The button needs these, or the phone will fight the hold (scrolling, text selection, the picture menu):
```css
.hold-button { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
```
`touch-action: manipulation` stops double-tap zoom and its delay, `user-select: none` stops text and image selection during the hold, and `-webkit-touch-callout: none` stops the iPhone's press-and-hold menu. The demo does the same.

## Cost when idle
The page-wide listeners that follow a finger or mouse (`pointermove`, `pointerup`, `pointercancel`, `touchmove`, `touchend`, `touchcancel`, `blur`) exist only while a press is being followed and are removed afterwards. Before, every attached button kept all of them for ever. Measured per `pointermove` that nothing is holding (20,000 events, median of 7), 12 buttons attached: Chromium 155.0.8059.39 10.9 to 0.075 µs; Firefox 158.0 3.25 to 0.65 µs. 50 buttons: Chromium 41.3 to 0.075 µs; Firefox 10.55 to 0.6 µs. With none attached the cost is the browser's own (0.07 µs and 0.6 µs).

## The bug it fixes
On **Android Chrome** the browser can send `pointercancel` in the middle of a long press (it suspects a scroll, an image drag or a context menu) while the finger is still down. Code that listens only to pointer events stops repeating there. This module also follows touches directly with touch events, so the hold lasts until the finger really lifts. It also ends the hold if the page is hidden or `canPress` turns false, and cancels if the finger slides away before the hold starts.

## Two fingers
The module remembers which finger started the hold (its touch `identifier`). A second finger on the screen cannot keep the hold alive after the first one lifts, cannot count as "sliding away", and cannot start a hold of its own while another finger is down.

## The swallowed click
After a hold ends, the next click on the button is swallowed, for up to 700 ms after the finger lifts. It is dropped sooner when it cannot come: the finger lifted outside the button, the press was cancelled, a new press began, or the click was made by keyboard or script (`event.detail` of 0). If a hold ends early (for example `canPress` turns false) while the finger stays down, the swallow waits for the lift. If you remove the button without calling `detach()`, the window listeners and the repeat are cleaned up on the next window event or repeat.

## How it compares
Bigger than a one-purpose long-press script, smaller than a gesture suite, and it repeats while held, survives Android's `pointercancel`, and swallows the release click. Speed against the alternatives: not measured.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins / loses |
| --- | --- | --- | --- | --- |
| **hold-press 1.1.0** (this module, MIT) | 4,707 B minified (1,754 B gzipped, esbuild) | Cost of one idle `pointermove` with 12 buttons attached, lower is faster: ungoogled Chromium 155.0.8059.39-1 0.075 µs, Firefox 158.0 0.65 µs, WebKitGTK 2.52.6 0.75 µs, GNOME Web 46.5 0.35 µs | Repeat while held, touch events as a fallback, one finger followed, swallowed release click, opt-in keyboard hold and `lockTouch` | Does the whole "hold to repeat" job. Loses: larger than the one-event scripts |
| long-press-event (MIT, version not recorded) | About 1 KB | Not measured | Fires one "long press" event after a delay; no repeat, no swallowed click | Wins: smaller. Loses: no repeat |
| Hammer.js `press` (the maintained fork is `@egjs/hammerjs`, MIT, version not recorded) | Not measured | Not measured | Part of a full gesture suite; `press` is one event and does not repeat | Wins if you already use the suite. Whether it handles Android's `pointercancel`: unverified |
| Pointer capture plus `touch-action: none` (the browser's own, a few lines you write) | A few lines | Not measured | Often enough when the page owns the whole gesture | Wins: no library. Loses: the page cannot scroll from that button (`lockTouch: true` here does the same) |

**Where it loses**
- Larger than a single-event script such as long-press-event.
- Touch is checked with fake events and Chromium touch emulation only. Not tried on a real Android phone or iPhone; touch `identifier` was not checked in Safari on iPhone.
- Repeat timing is `setInterval`, not frame-locked; not for drag gestures.
- Mouse, touch and pen by default; the keyboard hold is opt-in and there is no switch-device hold.
- Every hold needs a plain-tap alternative.
- Not measured: size and speed of the alternatives; speed on a phone.

## Limits
- **Mouse, touch and pen by default.** A keyboard hold is opt-in (above); there is no switch-device hold. Without `keyboard: true`, a person using a keyboard or switch device gets the plain click only (holding Enter on a native button may repeat clicks by itself; that was not checked here, and Space does not repeat).
- **Every hold needs a tap alternative.** Do not make a game action possible only by holding. Hold-only controls are a barrier for people who cannot keep a press, and accessibility guidance (WCAG 2.5.2, pointer cancellation) judges them strictly. Let a plain tap (or key press) do the same job, only slower.
- Repeat timing is `setInterval`, not frame-locked. Not for drag gestures.
- The checks here use fake events. Real Android and iPhone behavior has not been tried by them; `identifier` is stable in Chrome and Firefox touch events, and was not checked in Safari on iPhone.
- The off-button rule uses the button's rectangle, so a round or rotated button counts its bounding box.

## Prior art and credits
- long-press-event (MIT): read as prior art for a long press. Idea only, no code.
- Hammer.js `press` and its maintained fork `@egjs/hammerjs` (MIT): read as prior art. Idea only, no code.
- The pointer-capture plus `touch-action: none` pattern is standard web practice (MDN's pointer events advice: set `touch-action`, use pointer capture, treat cancel like up); the touch fallback here goes the other way and follows touch events directly.
- WCAG 2.5.2 (Pointer Cancellation, W3C): the guidance behind the "every hold needs a tap alternative" rule. A guideline, no code.

No code from others; the ideas above are theirs.

## For AI agents
Attach once per button after it exists, call `detach()` when the button goes away, and always keep a plain tap (a normal `click` listener) that does the same action. Add the paste-in styles to the button. Do not rely on `info.mini`; it does not exist.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
