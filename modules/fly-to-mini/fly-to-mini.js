/*!
 * fly-to-mini.js: when a big element scrolls away, a copy of its small stand-in flies from it to the sticky mini version
 * (and back again when you scroll up). A shared-element transition for scroll, with an arc, a tilt and a squash.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *   var fly = FlyToMini.create({
 *     big: document.querySelector('#apple'),          // watched with IntersectionObserver
 *     mini: document.querySelector('#miniButton'),    // the small sticky version (hidden until `on`)
 *     onChange: function (on) { bar.classList.toggle('mini-on', on); }   // show/hide the mini for real
 *   });
 *
 * The flying copy is a clone of `mini`'s first child, drawn in a fixed layer on the page (NOT inside a section the browser may
 * skip while it is off screen: content-visibility, hidden tabs; the first version of this was invisible on the way down).
 * A flight cut short by a quick scroll back starts the next one from where the last one was left. If the window becomes wide and
 * the mini disappears (offsetWidth 0), the flight ends at once.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlyToMini = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function create(o) {
    var big = o.big, mini = o.mini, art = o.art || big, host = o.host || document.body;
    var onChange = o.onChange || function () {}, canAnimate = o.canAnimate || function () { return true; };
    var downMs = o.downMs || 440, upMs = o.upMs || 400, arc = o.arc == null ? 18 : o.arc;
    var on = false, first = true, flyEl = null, raf = 0, dir = 0, cur = null, io = null;

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; dir = 0; cur = null;
      if (flyEl && flyEl.parentNode) flyEl.parentNode.removeChild(flyEl);
      flyEl = null;
      big.classList.remove('flying');
    }
    function land(isOn) {
      stop(); onChange(isOn);
      var el = isOn ? mini : big;
      el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed');   // CSS: .landed { animation: pop 400ms }
      setTimeout(function () { el.classList.remove('landed'); }, 400);
    }
    function set(next, animate) {
      if (next === on) return;
      on = next;
      var can = animate && canAnimate() && !document.hidden && mini.offsetWidth > 0 && !!mini.animate;
      if (!can) { stop(); onChange(on); return; }
      var b = art.getBoundingClientRect(), m = mini.getBoundingClientRect(), base = m.width, vh = window.innerHeight;
      var from = cur ? { x: cur.x, y: cur.y, s: cur.s } : (on
        ? { x: b.left + b.width / 2, y: Math.min(Math.max(b.top + b.height / 2, base / 2), vh - base / 2), s: b.width }
        : { x: m.left + m.width / 2, y: m.top + m.height / 2, s: m.width });
      if (!flyEl) {
        flyEl = document.createElement('div'); flyEl.className = 'mini-fly'; flyEl.setAttribute('aria-hidden', 'true');
        flyEl.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;will-change:transform;width:' + base + 'px;height:' + base + 'px';
        flyEl.appendChild((o.content || mini.firstElementChild || mini).cloneNode(true));
        host.appendChild(flyEl);
      }
      dir = on ? 1 : -1;
      big.classList.add('flying');                // CSS: .flying .your-art { opacity: 0 } (the clone stands in for it)
      onChange(false);                            // the mini stays hidden while the copy is in the air
      if (raf) cancelAnimationFrame(raf);
      var t0 = performance.now(), dur = on ? downMs : upMs, myDir = dir, sx = from.x, sy = from.y, ss = from.s;
      (function frame(now) {
        if (dir !== myDir) return;
        if (mini.offsetWidth === 0) { land(on); return; }
        var p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        var bb = art.getBoundingClientRect(), mm = mini.getBoundingClientRect();   // targets are re-read every frame: the page may be scrolling
        var tx = on ? mm.left + mm.width / 2 : bb.left + bb.width / 2, ty = on ? mm.top + mm.height / 2 : bb.top + bb.height / 2, ts = on ? mm.width : bb.width;
        var x = sx + (tx - sx) * e, y = sy + (ty - sy) * e - Math.sin(Math.PI * p) * arc, sz = ss + (ts - ss) * e;
        var rot = Math.sin(Math.PI * p) * (on ? -16 : 16), sq = 1 + Math.sin(Math.PI * p) * 0.06;
        cur = { x: x, y: y, s: sz };
        flyEl.style.transform = 'translate3d(' + (x - base / 2).toFixed(1) + 'px,' + (y - base / 2).toFixed(1) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + (sz / base * sq).toFixed(3) + ',' + (sz / base / sq).toFixed(3) + ')';
        if (p >= 1) { land(on); return; }
        raf = requestAnimationFrame(frame);
      })(t0);
    }
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        set(entries[0].intersectionRatio < 0.5, !first);
        first = false;
      }, { threshold: [0, 0.5, 1], rootMargin: (o.topInset == null ? 130 : o.topInset) > 0 ? '-' + (o.topInset == null ? 130 : o.topInset) + 'px 0px 0px 0px' : '0px' });
      io.observe(big);
    } else { onChange(true); }
    return { set: set, stop: stop, destroy: function () { stop(); if (io) io.disconnect(); }, get isMini() { return on; } };
  }
  return { create: create };
});
