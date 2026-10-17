# hold-press

**Version 1.1.0 · API 1**

**Tested in:** Node: 33 checks pass (16 new). Real key presses (Enter and Space, hold 1.1 s, quick tap, hold then tap): ungoogled Chromium 155.0.8059.39-1 and Firefox 158.0. Idle cost compared old and new in those two plus WebKitGTK 2.52.6 and GNOME Web 46.5; keyboard hold by script key events in the last two. Not run: touch on a real phone, the browser-side Space click swallow in WebKitGTK and GNOME Web (script keys send no click)

"Hold to keep pressing" for a button or any element, on mouse, touch and pen. About 9 KB, no dependencies.

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

## Limits
- **Mouse, touch and pen by default.** A keyboard hold is opt-in (above); there is no switch-device hold. Without `keyboard: true`, a person using a keyboard or switch device gets the plain click only (holding Enter on a native button may repeat clicks by itself; that was not checked here, and Space does not repeat).
- **Every hold needs a tap alternative.** Do not make a game action possible only by holding. Hold-only controls are a barrier for people who cannot keep a press, and accessibility guidance (WCAG 2.5.2, pointer cancellation) judges them strictly. Let a plain tap (or key press) do the same job, only slower.
- Repeat timing is `setInterval`, not frame-locked. Not for drag gestures.
- The checks here use fake events. Real Android and iPhone behavior has not been tried by them; `identifier` is stable in Chrome and Firefox touch events, and was not checked in Safari on iPhone.
- The off-button rule uses the button's rectangle, so a round or rotated button counts its bounding box.

## Prior art
- long-press-event (MIT, about 1 KB): fires a single "long press" event after a delay; no repeat and no swallowed click.
- Hammer.js "press" (the maintained fork is `@egjs/hammerjs`, MIT): part of a full gesture suite; "press" is one event and does not repeat. Whether Hammer.js handles the Android `pointercancel` case: **unverified**; I could not confirm or refute it.
- The pointer-capture plus `touch-action: none` pattern is standard and often makes the touch fallback unnecessary when the page owns the whole gesture. hold-press is for buttons where the page also needs scrolling or text selection nearby.

## For AI agents
Attach once per button after it exists, call `detach()` when the button goes away, and always keep a plain tap (a normal `click` listener) that does the same action. Add the paste-in styles to the button. Do not rely on `info.mini`; it does not exist.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
