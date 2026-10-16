/*!
 * fly-to-mini.js: when a big element scrolls away, a copy of its small stand-in flies from it to the sticky mini version
 * (and back again when you scroll up). A shared-element transition for scroll, with an arc, a tilt and a squash.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 *
 *   var fly = FlyToMini.create({
 *     big: document.querySelector('#apple'),          // watched with IntersectionObserver
 *     mini: document.querySelector('#miniButton'),    // the small sticky version (hidden until `on`)
 *     onChange: function (on) { bar.classList.toggle('mini-on', on); }   // show/hide the mini for real
 *   });
 *
 * The mini may be hidden with `display:none` or with `visibility:hidden` / opacity. With display:none it has no size, so on the way
 * down the module calls onChange(true) while the mini is made invisible (inline visibility:hidden) to measure where it will sit, and
 * keeps it that way until the copy lands. So onChange(true) can arrive at the START of the flight in that case, and again at the end.
 *
 * The flying copy is a clone of `mini`'s first child (or of the `content` option), drawn in a fixed layer on the page (NOT inside a
 * section the browser may skip while it is off screen: content-visibility, hidden tabs; the first version of this was invisible on
 * the way down). A flight cut short by a quick scroll back starts the next one from where the last one was left. If the window
 * becomes wide and the mini disappears (offsetWidth 0), the flight ends at once. A timer lands the copy even if frames stop coming,
 * and a throwing frame lands it at once, so the art is never left at opacity 0. When the system asks for reduced motion there is
 * no flight (the state just changes). create() with a missing element returns an inert object instead of throwing.
 *
 * Optional engine: pass engine:'transition' to let the browser's View Transitions API do the move (the same arc, tilt and squash are
 * added on top). It is used only where document.startViewTransition exists; everywhere else the flight above runs. While it plays,
 * the whole page is a frozen snapshot, and the mini is not followed if the page scrolls, so the flight stays the default.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlyToMini = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function isBox(x) { return !!x && typeof x.getBoundingClientRect === 'function'; }

  // Default for canAnimate: false when the system asks for less motion.
  function motionOk() {
    try { return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return true; }
  }

  // What create() returns when the setup is unusable (no window, no element): set() just reports the state, nothing else happens.
  function inert(o) {
    var on = false;
    return {
      set: function (next) {
        on = !!next;
        try { if (o && typeof o.onChange === 'function') o.onChange(on); } catch (e) {}
      },
      stop: function () {}, destroy: function () {}, get isMini() { return on; }
    };
  }

  function create(o) {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !o || !isBox(o.big) || !isBox(o.mini)) return inert(o);
    var big = o.big, mini = o.mini, art = isBox(o.art) ? o.art : big;
    var onChangeFn = typeof o.onChange === 'function' ? o.onChange : function () {};
    var canAnimate = typeof o.canAnimate === 'function' ? o.canAnimate : motionOk;
    var downMs = o.downMs || 440, upMs = o.upMs || 400, arc = o.arc == null ? 18 : o.arc;
    var wantVT = o.engine === 'transition', vtName = String(o.transitionName || 'fly-to-mini').replace(/[^\w-]/g, '') || 'fly-to-mini';
    var vt = null, vtToken = 0, vtStyle = null;   // the running View Transition, a counter that retires stale ones, the page's <style> for it
    var inset = o.topInset == null ? 130 : Number(o.topInset);
    if (!isFinite(inset)) inset = 130;
    var on = false, first = true, flyEl = null, raf = 0, dir = 0, cur = null, io = null, timer = 0;
    var revealed = false, prevVis = '';   // true while a display:none mini is shown invisibly so it can be measured

    // The caller's callback may throw; that must not stop a landing. The error is reported, not swallowed silently.
    function notify(v) {
      try { onChangeFn(v); } catch (e) { try { if (typeof console !== 'undefined' && console.error) console.error(e); } catch (e2) {} }
    }
    function unreveal() {
      if (!revealed) return;
      revealed = false;
      try { mini.style.visibility = prevVis; } catch (e) {}
    }
    function stop() {
      try { if (raf) cancelAnimationFrame(raf); } catch (e) {}
      raf = 0; dir = 0; cur = null;
      if (timer) { try { clearTimeout(timer); } catch (e) {} timer = 0; }
      try { if (flyEl && flyEl.parentNode) flyEl.parentNode.removeChild(flyEl); } catch (e) {}
      flyEl = null;
      try { big.classList.remove('flying'); } catch (e) {}
      unreveal();
      vtStop();
    }
    function pop(isOn) {
      try {
        var el = isOn ? mini : big;
        el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed');   // CSS: .landed { animation: pop 400ms }
        setTimeout(function () { try { el.classList.remove('landed'); } catch (e) {} }, 400);
      } catch (e) {}
    }
    function land(isOn) { stop(); notify(isOn); pop(isOn); }

    // ---- optional engine: View Transitions ----
    function face() { return isBox(o.content) ? o.content : (mini.firstElementChild || mini); }
    function setName(e, v) {
      try { if (v) e.style.setProperty('view-transition-name', v); else e.style.removeProperty('view-transition-name'); } catch (err) {}
    }
    function vtClear() { setName(art, ''); setName(face(), ''); if (vtStyle) vtStyle.textContent = ''; }
    function vtStop() {
      if (!vt && !vtStyle) return;
      vtToken++;
      try { if (vt) vt.skipTransition(); } catch (e) {}
      vt = null; vtClear();
    }
    function vtStart() {
      var myOn = on, token = ++vtToken, dur = myOn ? downMs : upMs, src = myOn ? art : face(), dst = myOn ? face() : art;
      if (!vtStyle) {
        vtStyle = document.createElement('style'); vtStyle.setAttribute('data-fly-to-mini', '');
        (document.head || document.documentElement).appendChild(vtStyle);
      }
      setName(art, ''); setName(face(), '');
      setName(src, vtName);                                   // the old picture is captured under this name
      // Our own element moves; the rest of the page must not cross-fade while it does. This style lives only as long as the move.
      vtStyle.textContent = '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}' +
        '::view-transition-group(' + vtName + '){animation-duration:' + dur + 'ms;animation-timing-function:cubic-bezier(.65,0,.35,1)}';
      var t = document.startViewTransition(function () {
        if (token !== vtToken) return;                        // a newer move took over; it sets the final state
        setName(src, ''); notify(myOn); setName(dst, vtName); // the new picture is captured under the same name
      });
      vt = t;
      function done() { if (token !== vtToken) return; vt = null; vtClear(); pop(myOn); }
      t.finished.then(done, done);
      t.ready.then(function () {
        if (token !== vtToken) return;
        try {   // arc, tilt and squash on top of the browser's own move (individual properties add to its transform)
          document.documentElement.animate({
            rotate: ['0deg', (myOn ? -16 : 16) + 'deg', '0deg'],
            translate: ['0px 0px', '0px ' + (-arc) + 'px', '0px 0px'],
            scale: ['1 1', '1.06 0.943', '1 1']
          }, { duration: dur, easing: 'ease-in-out', pseudoElement: '::view-transition-group(' + vtName + ')' });
        } catch (e) {}
      }, function () {});
    }
    function noFlight() { stop(); notify(on); }

    function startFlight() {
      unreveal();
      var h = o.host || document.body || document.documentElement;
      if (!h) return noFlight();
      // A mini hidden with display:none has no size. Show it invisibly (the page's own onChange(true) does the showing) so it can
      // be measured, and keep it laid out but invisible until the copy lands. If it still has no box, there is nothing to fly to.
      if (on && mini.offsetWidth === 0) {
        revealed = true; prevVis = mini.style.visibility || '';
        mini.style.visibility = 'hidden';
        notify(true);
      }
      if (mini.offsetWidth === 0 && !cur) return noFlight();   // (flying up from a mini that is not on screen: nothing to start from)
      var b = art.getBoundingClientRect(), m = mini.getBoundingClientRect(), base = m.width || (cur ? cur.s : 0), vh = window.innerHeight;
      if (!(base > 0)) return noFlight();
      var from = cur ? { x: cur.x, y: cur.y, s: cur.s } : (on
        ? { x: b.left + b.width / 2, y: Math.min(Math.max(b.top + b.height / 2, base / 2), vh - base / 2), s: b.width }
        : { x: m.left + m.width / 2, y: m.top + m.height / 2, s: m.width });
      if (!flyEl) {
        flyEl = document.createElement('div'); flyEl.className = 'mini-fly'; flyEl.setAttribute('aria-hidden', 'true');
        flyEl.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;will-change:transform;width:' + base + 'px;height:' + base + 'px';
        flyEl.appendChild((isBox(o.content) ? o.content : (mini.firstElementChild || mini)).cloneNode(true));
        h.appendChild(flyEl);
      }
      dir = on ? 1 : -1;
      big.classList.add('flying');                // CSS: .flying .your-art { opacity: 0 } (the clone stands in for it)
      if (!revealed) notify(false);               // the mini stays hidden while the copy is in the air
      if (raf) cancelAnimationFrame(raf);
      var t0 = performance.now(), dur = on ? downMs : upMs, myDir = dir, myOn = on, sx = from.x, sy = from.y, ss = from.s;
      if (timer) clearTimeout(timer);
      // Failsafe: if frames stop coming (hidden tab, stalled page) the copy still lands, so the art is never left invisible.
      timer = setTimeout(function () { timer = 0; if (dir === myDir) land(myOn); }, dur + 300);
      (function frame(now) {
        if (dir !== myDir) return;
        try {
          if (myOn && mini.offsetWidth === 0) { land(myOn); return; }
          var p = (now - t0) / dur;
          if (!(p > 0)) p = 0;                      // the frame time can be a hair earlier than t0, and may be missing
          if (p > 1) p = 1;
          var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          var bb = art.getBoundingClientRect(), mm = mini.getBoundingClientRect();   // targets are re-read every frame: the page may be scrolling
          var tx = myOn ? mm.left + mm.width / 2 : bb.left + bb.width / 2, ty = myOn ? mm.top + mm.height / 2 : bb.top + bb.height / 2, ts = myOn ? mm.width : bb.width;
          var x = sx + (tx - sx) * e, y = sy + (ty - sy) * e - Math.sin(Math.PI * p) * arc, sz = ss + (ts - ss) * e;
          var rot = Math.sin(Math.PI * p) * (myOn ? -16 : 16), sq = 1 + Math.sin(Math.PI * p) * 0.06;
          cur = { x: x, y: y, s: sz };
          flyEl.style.transform = 'translate3d(' + (x - base / 2).toFixed(1) + 'px,' + (y - base / 2).toFixed(1) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + (sz / base * sq).toFixed(3) + ',' + (sz / base / sq).toFixed(3) + ')';
          if (p >= 1) { land(myOn); return; }
          raf = requestAnimationFrame(frame);
        } catch (err) {
          land(myOn);                               // a frame threw (an element was removed, say): land at once
        }
      })(t0);
    }

    function set(next, animate) {
      next = !!next;
      if (next === on) return;
      on = next;
      var can = false;
      try { can = !!animate && !!canAnimate() && !document.hidden && !!mini.animate; } catch (e) {}
      if (!can) { noFlight(); return; }
      try {
        if (wantVT && typeof document.startViewTransition === 'function') vtStart(); else startFlight();
      } catch (err) { noFlight(); }
    }

    try {
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(function (entries) {
          set(entries[0].intersectionRatio < 0.5, !first);
          first = false;
        }, { threshold: [0, 0.5, 1], rootMargin: inset > 0 ? '-' + inset + 'px 0px 0px 0px' : '0px' });
        io.observe(big);
      } else { notify(true); }
    } catch (e) { io = null; }
    return { set: set, stop: stop, destroy: function () { stop(); try { if (io) io.disconnect(); } catch (e) {} try { if (vtStyle && vtStyle.parentNode) vtStyle.parentNode.removeChild(vtStyle); } catch (e) {} vtStyle = null; }, get isMini() { return on; } };
  }
  return { create: create };
});
