/*!
 * hold-press.js: "hold to keep pressing" for a button or any element, on mouse, touch and pen.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 * A short tap stays a normal click (your own 'click' listener). Holding for `delayMs` starts repeating onPress every
 * `everyMs`. When the hold ends, the click the browser sends on release is swallowed, so letting go never adds an
 * extra press.
 *
 * Why it exists: Android Chrome may fire pointercancel in the middle of a long press (it thinks a scroll, a picture drag or a
 * context menu is starting) while the finger is still down. Pointer-only hold code stops there. This follows touches
 * directly with touch events as well, so the hold lasts until the finger really lifts.
 *
 *   var h = HoldPress.attach(button, {
 *     onPress: function (info) { addPoints(); },          // info: { x, y, count, mini }
 *     canPress: function () { return !dialogOpen; },        // return false: the hold ends
 *     zone: function (x, y) { return insideApple(x, y); }   // optional: must stay inside while holding
 *   });
 *   h.detach();
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoldPress = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function attach(el, o) {
    o = o || {};
    var delayMs = o.delayMs == null ? 400 : o.delayMs, everyMs = o.everyMs == null ? 200 : o.everyMs;
    var slop2 = Math.pow(o.slop == null ? 30 : o.slop, 2);
    var hold = null, touchDown = false, swallow = false, swallowTimer = 0, enabled = true;

    function inZone(x, y) { return !o.zone || o.zone(x, y); }
    function stop() {
      if (!hold) return;
      clearTimeout(hold.t); clearInterval(hold.iv);
      var fired = hold.fired;
      hold = null;
      if (fired) {
        swallow = true; clearTimeout(swallowTimer);
        swallowTimer = setTimeout(function () { swallow = false; }, 700);   // (if no click follows, forget it)
        if (o.onEnd) o.onEnd();
      }
    }
    function fire(h) {
      if (hold !== h || (o.canPress && o.canPress() === false) || (typeof document !== 'undefined' && document.hidden)) { stop(); return; }
      h.fired = true; h.count++;
      o.onPress({ x: h.x, y: h.y, count: h.count });
    }
    function start(id, x, y) {
      stop();
      if (!enabled) return;
      var h = hold = { id: id, x: x, y: y, x0: x, y0: y, fired: false, count: 0 };
      h.t = setTimeout(function () {
        if (hold !== h) return;
        fire(h);
        if (hold === h) h.iv = setInterval(function () { fire(h); }, everyMs);
      }, delayMs);
    }
    // a finger or pointer that slides away ends the hold: before it started, by more than `slop`; after, by leaving the zone
    function move(x, y) {
      if (!hold) return;
      hold.x = x; hold.y = y;
      var dx = x - hold.x0, dy = y - hold.y0;
      if (!hold.fired ? dx * dx + dy * dy > slop2 : !inZone(x, y)) stop();
    }

    function onPointerDown(e) {
      if (e.pointerType === 'touch') return;                           // touches are followed by the touch handlers below
      if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return;
      if (!inZone(e.clientX, e.clientY) || (o.canPress && o.canPress() === false)) return;
      start(e.pointerId, e.clientX, e.clientY);
    }
    function onPointerMove(e) { if (hold && e.pointerId === hold.id) move(e.clientX, e.clientY); }
    function onPointerEnd(e) {
      if (!hold) return;
      if (e.pointerType === 'touch' && touchDown) return;              // the touch handlers end it
      if (e.pointerId !== hold.id) return;
      stop();
    }
    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      touchDown = true;
      var t = e.changedTouches[0];
      if (!hold) { if (inZone(t.clientX, t.clientY) && !(o.canPress && o.canPress() === false)) start('touch', t.clientX, t.clientY); }
      else hold.id = 'touch';
    }
    function onTouchMove(e) { if (hold && touchDown) { var t = e.changedTouches[0]; move(t.clientX, t.clientY); } }
    function onTouchEnd(e) { if (!e.touches.length) { touchDown = false; stop(); } }
    function onClickCapture(e) {
      if (!swallow) return;
      swallow = false; clearTimeout(swallowTimer);
      e.preventDefault(); e.stopImmediatePropagation();
    }
    function onContext(e) { if (hold && hold.fired) e.preventDefault(); }   // a long press must not open the phone's picture menu

    var pass = { passive: true };
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, pass);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('touchstart', onTouchStart, pass);
    window.addEventListener('touchmove', onTouchMove, pass);
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('blur', stop);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('contextmenu', onContext);

    return {
      stop: stop,
      setEnabled: function (v) { enabled = !!v; if (!enabled) stop(); },
      get holding() { return !!(hold && hold.fired); },
      detach: function () {
        stop();
        el.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove, pass);
        window.removeEventListener('pointerup', onPointerEnd);
        window.removeEventListener('pointercancel', onPointerEnd);
        el.removeEventListener('touchstart', onTouchStart, pass);
        window.removeEventListener('touchmove', onTouchMove, pass);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
        window.removeEventListener('blur', stop);
        el.removeEventListener('click', onClickCapture, true);
        el.removeEventListener('contextmenu', onContext);
      }
    };
  }
  return { attach: attach };
});
