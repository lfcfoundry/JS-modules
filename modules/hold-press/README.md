# hold-press

"Hold to keep pressing" for a button or any element, on mouse, touch and pen. About 9 KB, no dependencies.

**Test it:** `node modules/hold-press/test/run.js` (fake touch and pointer events and a fake clock, 17 checks, no browser).

## Use
```js
var h = HoldPress.attach(button, {
  onPress: function (info) { addPoints(); },       // info: { x, y, count } (count is 1 on the first repeat)
  canPress: function () { return !dialogOpen; },     // false ends the hold
  zone: function (x, y) { return insideTarget(x, y); },   // optional: must stay inside while holding
  delayMs: 400, everyMs: 200, slop: 30, onEnd: function () {}
});
h.detach();
```
A quick tap is still a normal `click` (use your own listener). After a hold, the click the browser sends on release is swallowed, so letting go never adds an extra press.

`attach` returns `{ stop(), setEnabled(bool), holding, detach() }`. `onPress` and `onEnd` are wrapped so a bug in them cannot break the timer; a repeat time of `0` or less is ignored (the 200 ms default is used).

## Paste-in styles
The button needs these, or the phone will fight the hold (scrolling, text selection, the picture menu):
```css
.hold-button { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
```
`touch-action: manipulation` stops double-tap zoom and its delay, `user-select: none` stops text and image selection during the hold, and `-webkit-touch-callout: none` stops the iPhone's press-and-hold menu. The demo does the same.

## The bug it fixes
On **Android Chrome** the browser can send `pointercancel` in the middle of a long press (it suspects a scroll, an image drag or a context menu) while the finger is still down. Code that listens only to pointer events stops repeating there. This module also follows touches directly with touch events, so the hold lasts until the finger really lifts. It also ends the hold if the page is hidden or `canPress` turns false, and cancels if the finger slides away before the hold starts.

## Two fingers
The module remembers which finger started the hold (its touch `identifier`). A second finger on the screen cannot keep the hold alive after the first one lifts, cannot count as "sliding away", and cannot start a hold of its own while another finger is down.

## The swallowed click
After a hold ends, the next click on the button is swallowed, for up to 700 ms after the finger lifts. It is dropped sooner when it cannot come: the finger lifted outside the button, the press was cancelled, a new press began, or the click was made by keyboard or script (`event.detail` of 0). If a hold ends early (for example `canPress` turns false) while the finger stays down, the swallow waits for the lift. If you remove the button without calling `detach()`, the window listeners and the repeat are cleaned up on the next window event or repeat.

## Limits
- **Mouse, touch and pen only.** There is no keyboard or switch hold. A person using a keyboard or switch device gets the plain click only (holding Enter on a native button may repeat clicks by itself; that was not checked here, and Space does not repeat).
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
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
