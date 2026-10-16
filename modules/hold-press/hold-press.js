/*!
 * hold-press.js: "hold to keep pressing" for a button or any element, on mouse, touch and pen.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 * A short tap stays a normal click (your own 'click' listener). Holding for `delayMs` starts repeating onPress every
 * `everyMs`. When the hold ends, the click the browser sends on release is swallowed, so letting go never adds an
 * extra press.
 *
 * Why it exists: Android Chrome may fire pointercancel in the middle of a long press (it thinks a scroll, a picture drag or a
 * context menu is starting) while the finger is still down. Pointer-only hold code stops there. This follows touches
 * directly with touch events as well, so the hold lasts until the finger really lifts. It follows the one finger that started
 * the hold (by its touch identifier): a second finger can neither keep a hold alive nor pull it away.
 *
 *   var h = HoldPress.attach(button, {
 *     onPress: function (info) { addPoints(); },          // info: { x, y, count }  (count = 1 on the first repeat)
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
    var delayMs = o.delayMs >= 0 ? o.delayMs : 400, everyMs = o.everyMs > 0 ? o.everyMs : 200;   // a zero or negative repeat time would spin: use the default
    var slop2 = Math.pow(o.slop >= 0 ? o.slop : 30, 2);
    var hold = null, touchId = null, pressId = null, swallow = false, swallowTimer = 0, enabled = true, detached = false;

    function allowed() { try { return !(o.canPress && o.canPress() === false); } catch (e) { return false; } }
    function inZone(x, y) { try { return !o.zone || !!o.zone(x, y); } catch (e) { return false; } }
    function outsideEl(x, y) {
      try { var r = el.getBoundingClientRect(); return x < r.left || x > r.right || y < r.top || y > r.bottom; } catch (e) { return false; }
    }
    function startSwallowTimer() { clearTimeout(swallowTimer); swallowTimer = setTimeout(function () { swallow = false; }, 700); }   // (if no click follows, forget it)
    function dropSwallow() { swallow = false; clearTimeout(swallowTimer); }
    function stop() {
      if (!hold) return;
      clearTimeout(hold.t); clearInterval(hold.iv);
      var fired = hold.fired;
      hold = null;
      if (fired) {
        swallow = true;
        if (pressId === null) startSwallowTimer(); else clearTimeout(swallowTimer);   // finger still down: wait for the lift, then start the 700 ms
        if (typeof o.onEnd === 'function') { try { o.onEnd(); } catch (e) { /* the page's callback failed */ } }
      }
    }
    // after the finger or mouse is lifted: decide whether a click is still coming
    function settle(x, y, cancelled) {
      if (cancelled) { dropSwallow(); return; }                       // a cancelled press never sends a click
      if (!swallow) return;
      if (x != null && y != null && outsideEl(x, y)) { dropSwallow(); return; }   // lifted off the button: no click will come
      startSwallowTimer();
    }
    // if the page removed the button without calling detach(), clean up on the next event or repeat
    function alive() { if (!detached && el.isConnected === false) { detach(); } return !detached; }
    function fire(h) {
      if (!alive() || hold !== h || !allowed() || (typeof document !== 'undefined' && document.hidden)) { stop(); return; }
      h.fired = true; h.count++;
      if (typeof o.onPress === 'function') { try { o.onPress({ x: h.x, y: h.y, count: h.count }); } catch (e) { /* the page's callback failed; keep the hold alive */ } }
    }
    function start(id, x, y) {
      stop();
      if (!enabled) return;
      pressId = id;
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
    // find one touch by its identifier in a TouchList (or array)
    function byId(list, id) {
      if (!list) return null;
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }

    function onPointerDown(e) {
      if (e.pointerType === 'touch') return;                           // touches are followed by the touch handlers below
      if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return;
      dropSwallow(); pressId = null;                                    // a new press: no click from an earlier one is still coming
      if (!inZone(e.clientX, e.clientY) || !allowed()) return;
      start(e.pointerId, e.clientX, e.clientY);
    }
    function onPointerMove(e) { if (alive() && hold && e.pointerId === hold.id) move(e.clientX, e.clientY); }
    function onPointerEnd(e) {
      if (!alive()) return;
      if (e.pointerType === 'touch' && touchId !== null) return;       // the touch handlers end it
      if (pressId === null || e.pointerId !== pressId) return;
      pressId = null; stop();
      settle(e.clientX, e.clientY, e.type === 'pointercancel');
    }
    function onTouchStart(e) {
      if (e.touches.length !== 1) return;                              // a second finger never starts or joins a hold
      dropSwallow();                                                    // a new press: no click from an earlier one is still coming
      var t = e.changedTouches[0];
      touchId = t.identifier;
      if (!hold) { pressId = null; if (inZone(t.clientX, t.clientY) && allowed()) start('touch', t.clientX, t.clientY); }
      else { hold.id = 'touch'; pressId = 'touch'; }
    }
    function onTouchMove(e) {
      if (!alive() || !hold || touchId === null) return;
      var t = byId(e.changedTouches, touchId);                         // only the finger that started the hold counts
      if (t) move(t.clientX, t.clientY);
    }
    function onTouchEnd(e) {
      if (!alive() || touchId === null) return;
      var t = byId(e.changedTouches, touchId);
      if (!t && byId(e.touches, touchId)) return;                      // some other finger lifted; ours is still down
      touchId = null; if (pressId === 'touch') pressId = null;
      stop();
      settle(t ? t.clientX : null, t ? t.clientY : null, e.type === 'touchcancel');
    }
    function onBlur() { pressId = null; touchId = null; stop(); }
    function onClickCapture(e) {
      if (!swallow || e.detail === 0) return;                          // detail 0 = keyboard or script click: never swallowed
      dropSwallow();
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
    window.addEventListener('blur', onBlur);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('contextmenu', onContext);

    function detach() {
      if (detached) return;
      detached = true;
      pressId = null; touchId = null; stop(); dropSwallow();
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove, pass);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('touchstart', onTouchStart, pass);
      window.removeEventListener('touchmove', onTouchMove, pass);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('blur', onBlur);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('contextmenu', onContext);
    }
    return {
      stop: stop,
      setEnabled: function (v) { enabled = !!v; if (!enabled) stop(); },
      get holding() { return !!(hold && hold.fired); },
      detach: detach
    };
  }
  return { attach: attach };
});
