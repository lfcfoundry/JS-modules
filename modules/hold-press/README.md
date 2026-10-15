# hold-press

"Hold to keep pressing" for a button or any element, on mouse, touch and pen. About 6 KB.

## Use
```js
var h = HoldPress.attach(button, {
  onPress: function (info) { addPoints(); },       // info: { x, y, count, mini }
  canPress: function () { return !dialogOpen; },     // false ends the hold
  zone: function (x, y) { return insideTarget(x, y); },   // optional: must stay inside while holding
  delayMs: 400, everyMs: 200, slop: 30, onEnd: function () {}
});
h.detach();
```
A quick tap is still a normal `click` (use your own listener). After a hold, the click the browser sends on release is swallowed, so letting go never adds an extra press.

## The bug it fixes
On **Android Chrome** the browser can send `pointercancel` in the middle of a long press (it suspects a scroll, an image drag or a context menu) while the finger is still down. Code that listens only to pointer events stops repeating there. This module also follows touches directly with touch events, so the hold lasts until the finger really lifts. It also ends the hold if the page is hidden or `canPress` turns false, and cancels if the finger slides away before the hold starts.

## Limits
Repeat timing is `setInterval`, not frame-locked. Not for drag gestures.

## Prior art
Press-and-hold helpers exist (for example Hammer.js "press" gestures), but they are built on pointer/touch recognition and do not handle the Android `pointercancel` case or swallow the trailing click.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
