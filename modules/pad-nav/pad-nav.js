/*!
 * pad-nav.js: gamepad (Gamepad API) navigation for ordinary on-screen DOM menus and panels.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *   var pn = new PadNav({ getScope: function () { return openPanel; }, hintEl: hintDiv, onBack: closePanel });
 *   pn.start();   // or call pn.step() once per frame from your own loop
 *
 * Options, all optional:
 *   getScope()          returns the element that currently owns the controller (the topmost open panel), or null for none
 *   scopeSelector       string alternative to getScope: the last visible match in document order is the scope
 *                       (with neither option, the whole document.body is the scope)
 *   focusableSelector   what counts as reachable inside the scope
 *   filter(el)          extra test; return false to leave an element out
 *   onBack(scope)       B pressed          onStart(scope)  Start pressed
 *   onA(el)             A pressed on the focused element; return false to cancel the default action (el.click(), or the
 *                       slider and drop-down handling below)
 *   onUse(pad)          the first pad input (and the first one after an unplug): switch your hints to "Press A"
 *   onDisconnect()      the last usable pad went away: pause the game
 *   onError(err, where) a callback or getGamepads threw; the error was swallowed. Same error repeated is reported once
 *   getPads()           returns an array-like of gamepads; default navigator.getGamepads (inject a fake in tests)
 *   deadzone            stick push (0..1) that counts as a press, default 0.45
 *   release             stick push below which a pressed direction lets go, default deadzone - 0.1 (0.35). Keeps a worn
 *                       stick resting near the press point from flipping every frame. Set equal to deadzone to turn off.
 *   repeatDelay         ms a direction is held before it repeats, default 380
 *   repeatRate          ms between repeats after that, default 120
 *   focusClass          class put on the focused element (you style it), default 'pad-focus'
 *   formControls        A on input[type=range] enters adjust mode (left/right = one step, A or B = done); A on a
 *                       select cycles to the next option; default true. false: A always just clicks.
 *   adjustClass         class on the slider while it is in adjust mode, default 'pad-adjust'
 *   hintEl              element whose text shows the button meanings (only after pad use); gets role="status" if it has no role
 *   hintText            string or function(scope, names, mode) overriding the default hint text; mode is 'menu' or 'adjust'
 *   labels              brand-aware button names in the default hint: true (guess from the pad's id text: Cross/Circle on
 *                       PlayStation pads, B/A on Nintendo pads), an object { a, b, start } of your own words, or
 *                       function(padId) returning such an object. Default off: the hint says A, B and Start.
 *   hintMs              how long the hint stays up after waking or a scope change, default 3500
 *   guardMs             A is ignored this long after a scope appears (so the A that opened a panel does not also pick inside it), default 450
 *   wakeMs              a scope that opens within this long of pad use gets focus immediately, default 8000
 *   scroll              keep the focused element visible with scrollIntoView, default true
 *   requireStandard     only read pads whose mapping is 'standard', default true
 *
 * step() never throws: getGamepads (which throws a SecurityError when the page disables the feature) and every callback
 * above are wrapped, and the error goes to onError and pn.lastError.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PadNav = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EMPTY = [];

  function PadNav(o) {
    o = o || {};
    var num = function (v, d) { return typeof v === 'number' && isFinite(v) ? v : d; };
    this.getScopeFn = typeof o.getScope === 'function' ? o.getScope : null;
    this.scopeSelector = o.scopeSelector || null;
    this.selector = o.focusableSelector || PadNav.DEFAULT_SELECTOR;
    this.filter = typeof o.filter === 'function' ? o.filter : null;
    this.onBack = o.onBack || null;
    this.onStart = o.onStart || null;
    this.onA = o.onA || null;
    this.onUse = o.onUse || null;
    this.onDisconnect = o.onDisconnect || null;
    this.onError = o.onError || null;
    this.getPads = typeof o.getPads === 'function' ? o.getPads : function () { return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; };
    this.deadzone = num(o.deadzone, 0.45);
    this.release = typeof o.release === 'number' && isFinite(o.release) ? Math.max(0, o.release) : null;   // null: deadzone - 0.1
    this.repeatDelay = num(o.repeatDelay, 380);
    this.repeatRate = num(o.repeatRate, 120);
    this.focusClass = o.focusClass || 'pad-focus';
    this.formControls = o.formControls !== false;
    this.adjustClass = o.adjustClass || 'pad-adjust';
    this.hintEl = o.hintEl || null;
    this.hintText = o.hintText || null;
    this.labels = o.labels || null;
    this.hintMs = num(o.hintMs, 3500);
    this.guardMs = num(o.guardMs, 450);
    this.wakeMs = num(o.wakeMs, 8000);
    this.scroll = o.scroll !== false;
    this.requireStandard = o.requireStandard !== false;

    this.prev = {};            // last frame's pressed state, for edge detection
    this.rep = {};             // per direction: when the next repeat is due
    this.latch = {};           // per pad: which stick directions are held (for the press/release gap)
    this.hadPad = false;       // was a usable pad read on the latest frame
    this.awake = false;        // true after the first pad input; nothing is shown before that
    this.lastUsed = -Infinity; // time of the latest pad input
    this.useId = '';           // id text of the pad that gave the latest input
    this.seen = false;         // has a scope been looked at yet
    this.scope = null;
    this.scopeAt = -Infinity;
    this.hintAt = 0;
    this.ringEl = null;        // the element wearing focusClass
    this.adjust = null;        // the slider in adjust mode, if any
    this.memory = typeof WeakMap === 'function' ? new WeakMap() : null;   // last focused element per scope
    this.raf = 0;
    this.hintShown = null;     // cached so the DOM is only written when the hint changes
    this.hintShownText = null;
    this.lastError = null;
    this.lastErrorWhere = '';
    this.errKey = '';
    this.nameFor = null;       // cached button names for the pad id in nameFor
    this.nameObj = null;
    this.hintCache = null;

    var self = this;
    this.onBlur = function (e) { if (e.target && e.target === self.ringEl) self.clearRing(); };
    this.onGpGone = function () { self.checkLost(); };
    if (typeof document !== 'undefined') document.addEventListener('blur', this.onBlur, true);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('gamepaddisconnected', this.onGpGone);
    try {
      var h = this.hintEl;
      if (h && h.setAttribute && !(h.getAttribute && h.getAttribute('role'))) h.setAttribute('role', 'status');   // announced politely; the look is unchanged
    } catch (e) { /* not an element */ }
    this.setHint(false, '');
  }

  /** Pure helper: index of the nearest rect from `from` in direction 'l','r','u' or 'd', or -1. Rects are {left, top, width, height}. */
  PadNav.nearest = function (from, rects, dir) {
    var cx = from.left + from.width / 2, cy = from.top + from.height / 2, best = -1, bs = Infinity, i, p, dx, dy, along, across, score;
    for (i = 0; i < rects.length; i++) {
      p = rects[i]; dx = p.left + p.width / 2 - cx; dy = p.top + p.height / 2 - cy;
      along = dir === 'l' ? -dx : dir === 'r' ? dx : dir === 'u' ? -dy : dy;
      across = dir === 'l' || dir === 'r' ? Math.abs(dy) : Math.abs(dx);
      if (along < 4) continue;                  // not really in that direction (also skips the element itself)
      score = along + across * 2.5;             // sideways drift costs 2.5x: a roughly straight neighbor beats a nearer diagonal one
      if (score < bs) { bs = score; best = i; }
    }
    return best;
  };

  /**
   * Pure stick state machine. x, y are axes 0 and 1; `was` holds last frame's {l, r, u, d} (0 or 1) for this stick;
   * a direction starts above `press` and lets go only below `release`. The stick counts along its stronger axis only.
   * Writes into `out` (may be the same object as `was`) and returns it, so a caller can reuse one object per pad.
   */
  PadNav.stick = function (x, y, was, press, release, out) {
    var ex = Math.abs(x), ey = Math.abs(y);
    was = was || {}; out = out || {};
    if (!(release <= press)) release = press;
    var wl = was.l, wr = was.r, wu = was.u, wd = was.d;
    out.u = y < 0 && ey >= ex && ey > (wu ? release : press) ? 1 : 0;
    out.d = y > 0 && ey >= ex && ey > (wd ? release : press) ? 1 : 0;
    out.l = x < 0 && ex > ey && ex > (wl ? release : press) ? 1 : 0;
    out.r = x > 0 && ex > ey && ex > (wr ? release : press) ? 1 : 0;
    return out;
  };

  /** Pure: decimal places a number needs when written out (0.25 gives 2). */
  PadNav.decimals = function (n) {
    var m = /(?:\.(\d+))?(?:e-(\d+))?$/.exec(String(n));
    return m ? (m[1] ? m[1].length : 0) + (m[2] ? +m[2] : 0) : 0;
  };

  /**
   * Pure: the slider value after one step in direction dir (1 or -1), as a string. Arguments are the input's value, min, max
   * and step strings. HTML defaults apply: min 0, max 100, step 1; step "any" uses one hundredth of the range.
   */
  PadNav.rangeNext = function (value, min, max, step, dir) {
    var lo = parseFloat(min), hi = parseFloat(max), st = parseFloat(step), v = parseFloat(value), n;
    if (!isFinite(lo)) lo = 0;
    if (!isFinite(hi)) hi = 100;
    if (hi < lo) hi = lo;
    if (!(st > 0) || !isFinite(st)) st = String(step).toLowerCase() === 'any' && hi > lo ? (hi - lo) / 100 : 1;
    if (!isFinite(v)) v = lo;
    n = v + (dir < 0 ? -st : st);
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return String(Number(n.toFixed(Math.min(20, Math.max(PadNav.decimals(st), PadNav.decimals(lo), PadNav.decimals(v))))));
  };

  /** Pure: index of the next enabled option after `cur`, wrapping around; `cur` itself if it is the only enabled one; -1 if none. opts is an array-like of {disabled}. */
  PadNav.nextOption = function (opts, cur) {
    var n = opts ? opts.length : 0, j, k;
    for (j = 1; j <= n; j++) {
      k = ((cur < 0 ? -1 : cur) + j) % n;
      if (opts[k] && !opts[k].disabled) return k;
    }
    return -1;
  };

  /** Pure: button names for the default hint, guessed from a pad's id text (not standardized, so it is a guess). Always returns a new object { dpad, a, b, start }. */
  PadNav.labelsFor = function (id) {
    var s = String(id || '').toLowerCase(), o = { dpad: 'D-pad', a: 'A', b: 'B', start: 'Start' };
    if (/playstation|dualshock|dualsense|sony|054c|\bps[345]\b/.test(s)) { o.a = 'Cross'; o.b = 'Circle'; o.start = 'Options'; }
    else if (/nintendo|057e|joy-?con|pro controller|switch/.test(s)) { o.a = 'B'; o.b = 'A'; o.start = '+'; }   // the standard layout is by position: index 0 is the bottom button, printed B on Nintendo pads
    return o;
  };

  PadNav.clock = function () { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); };

  /** Call once per frame. nowMs defaults to performance.now(). Returns true if a usable pad was read. Never throws. */
  PadNav.prototype.step = function (nowMs) {
    try { return this.run(typeof nowMs === 'number' ? nowMs : PadNav.clock()); }
    catch (e) { this.fail('step', e); return false; }
  };

  PadNav.prototype.run = function (now) {
    var pads = this.readPads();
    if (!pads) return false;   // getPads threw: nothing is known about the pad, so change nothing
    var D = { l: 0, r: 0, u: 0, d: 0, a: 0, b: 0, s: 0 }, any = false, inPad = null, i, g, ax, x, y, gany, lt, key, k;
    var dz = this.deadzone, rel = typeof this.release === 'number' ? Math.min(this.release, dz) : Math.max(0, dz - 0.1);
    for (i = 0; i < pads.length; i++) {
      g = pads[i];
      if (!this.usable(g)) continue;
      any = true; gany = 0; ax = g.axes || []; x = ax[0] || 0; y = ax[1] || 0;
      if (PadNav.pressed(g, PadNav.BUTTONS.a)) { D.a = 1; gany = 1; }
      if (PadNav.pressed(g, PadNav.BUTTONS.b)) { D.b = 1; gany = 1; }
      if (PadNav.pressed(g, PadNav.BUTTONS.start)) { D.s = 1; gany = 1; }
      key = typeof g.index === 'number' ? g.index : i;
      lt = this.latch[key] || (this.latch[key] = { l: 0, r: 0, u: 0, d: 0 });
      PadNav.stick(x, y, lt, dz, rel, lt);   // the stick counts only along its stronger axis, so a diagonal push does not move twice
      if (PadNav.pressed(g, PadNav.BUTTONS.up) || lt.u) { D.u = 1; gany = 1; }
      if (PadNav.pressed(g, PadNav.BUTTONS.down) || lt.d) { D.d = 1; gany = 1; }
      if (PadNav.pressed(g, PadNav.BUTTONS.left) || lt.l) { D.l = 1; gany = 1; }
      if (PadNav.pressed(g, PadNav.BUTTONS.right) || lt.r) { D.r = 1; gany = 1; }
      if (gany) inPad = g;
    }
    if (!any) { if (this.hadPad) this.lost(); return false; }
    this.hadPad = true;

    var E = {};
    for (k in D) E[k] = D[k] && !this.prev[k] ? 1 : 0;
    if (inPad) {
      this.lastUsed = now;
      if (typeof inPad.id === 'string') this.useId = inPad.id;
      if (!this.awake) { this.awake = true; this.hintAt = now; this.hook(this.onUse, 'onUse', inPad); }
    }

    var scope = this.currentScope(), woke = false;
    if (!this.seen || scope !== this.scope) woke = this.scopeChanged(scope, now);   // true if the ring was just shown, so a press this same frame must not also move it

    if (scope) {
      var cands = null;
      for (i = 0; i < 4; i++) {
        k = PadNav.DIRS[i];
        if (!D[k] || !(E[k] || now >= this.rep[k])) continue;
        if (!cands) cands = this.candidates(scope);
        this.rep[k] = now + (E[k] ? this.repeatDelay : this.repeatRate);
        if (this.adjust && !(this.ringEl === this.adjust && this.ringShown(cands))) this.exitAdjust();   // the slider went away
        if (this.adjust) { if (k === 'l' || k === 'r') this.adjustBy(this.adjust, k === 'r' ? 1 : -1); }   // up and down do nothing while adjusting
        else if (!this.ringShown(cands)) { if (!woke) { this.showFocus(scope, cands, true); woke = true; } }   // first press only shows the focus ring
        else if (!woke) this.move(scope, cands, k);
      }
      if (E.a && now - this.scopeAt > this.guardMs && !woke) {
        if (this.adjust) this.exitAdjust();
        else {
          if (!cands) cands = this.candidates(scope);
          var el = this.ringShown(cands) ? this.ringEl : cands.length === 1 ? cands[0] : null;
          if (el) { if (this.hook(this.onA, 'onA', el) !== false) this.activate(el, now); }
          else this.showFocus(scope, cands, true);
        }
      }
    }
    if (E.b) { if (this.adjust) this.exitAdjust(); else this.hook(this.onBack, 'onBack', scope); }
    if (E.s) this.hook(this.onStart, 'onStart', scope);

    this.prev = D;
    this.updateHint(now);
    return true;
  };

  /** Poll with requestAnimationFrame until stop(). */
  PadNav.prototype.start = function () {
    if (this.raf || typeof requestAnimationFrame !== 'function') return this;
    var self = this;
    var loop = function (t) { self.raf = requestAnimationFrame(loop); self.step(t); };
    this.raf = requestAnimationFrame(loop);
    return this;
  };

  PadNav.prototype.stop = function () {
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.raf = 0;
    return this;
  };

  /** stop(), remove listeners, clear the focus ring and hide the hint. */
  PadNav.prototype.destroy = function () {
    this.stop();
    if (typeof document !== 'undefined') document.removeEventListener('blur', this.onBlur, true);
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('gamepaddisconnected', this.onGpGone);
    this.clearRing();
    this.setHint(false, '');
  };

  /** Put the focus ring on el (it must be inside the scope to be reachable by the pad). */
  PadNav.prototype.focus = function (el) {
    this.clearRing();
    this.ringEl = el;
    el.classList.add(this.focusClass);
    try { el.focus({ preventScroll: true }); } catch (e) { /* element not focusable */ }
    if (this.scroll && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old browser */ } }
    if (this.memory && this.scope) this.memory.set(this.scope, el);
  };

  /** Remove the focus ring (this also ends slider adjust mode). */
  PadNav.prototype.clearRing = function () {
    this.exitAdjust();
    if (this.ringEl) this.ringEl.classList.remove(this.focusClass);
    this.ringEl = null;
  };

  // ----- internals -----

  // Call an outside function so that a throw cannot escape step(). Returns its result, or undefined if it threw or is not a function.
  PadNav.prototype.hook = function (fn, where, a, b, c) {
    if (typeof fn !== 'function') return undefined;
    try { return fn.call(this, a, b, c); } catch (e) { this.fail(where, e); }
    return undefined;
  };

  PadNav.prototype.fail = function (where, e) {
    this.lastError = e; this.lastErrorWhere = where;
    var key = where + ':' + (e && e.name) + ':' + (e && e.message);
    if (key === this.errKey) return;   // a call that throws every frame is reported once
    this.errKey = key;
    if (typeof this.onError === 'function') { try { this.onError(e, where); } catch (x) { /* a failing error handler is ignored */ } }
  };

  // The pad list, or null if getGamepads threw (it throws a SecurityError when the page disables the feature).
  PadNav.prototype.readPads = function () {
    try { return this.getPads() || EMPTY; } catch (e) { this.fail('getPads', e); return null; }
  };

  PadNav.prototype.usable = function (g) {
    return !!(g && g.buttons && g.connected !== false && (!this.requireStandard || g.mapping === 'standard'));
  };

  // gamepaddisconnected arrived: if no usable pad is left, clean up now instead of waiting for the next frame.
  PadNav.prototype.checkLost = function () {
    if (!this.hadPad) return;
    var pads = this.readPads(), i;
    if (!pads) return;
    for (i = 0; i < pads.length; i++) if (this.usable(pads[i])) return;
    this.lost();
  };

  // No usable pad any more: hide the hint and the ring, forget "awake", and tell the game.
  PadNav.prototype.lost = function () {
    var had = this.hadPad;
    this.hadPad = false;
    this.clearRing();
    this.awake = false;
    this.lastUsed = -Infinity;
    this.prev = {}; this.rep = {}; this.latch = {}; this.errKey = '';
    this.setHint(false, '');
    if (had) this.hook(this.onDisconnect, 'onDisconnect');
  };

  PadNav.prototype.currentScope = function () {
    if (this.getScopeFn) return this.hook(this.getScopeFn, 'getScope') || null;
    if (typeof document === 'undefined') return null;
    if (!this.scopeSelector) return document.body;
    var l = document.querySelectorAll(this.scopeSelector), i;
    for (i = l.length - 1; i >= 0; i--) if (l[i].getClientRects().length) return l[i];
    return null;
  };

  PadNav.prototype.scopeChanged = function (next, now) {
    var first = !this.seen;
    this.seen = true;
    this.clearRing();
    this.scope = next;
    this.scopeAt = first ? -Infinity : now;
    this.hintAt = now;
    if (first || !next || !this.awake || now - this.lastUsed >= this.wakeMs) return false;
    var c = this.candidates(next);
    this.showFocus(next, c, false);
    return c.length > 0;
  };

  PadNav.prototype.candidates = function (scope) {
    var l = scope.querySelectorAll(this.selector), o = [], i, el;
    for (i = 0; i < l.length; i++) {
      el = l[i];
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || (el.closest && el.closest('[inert]'))) continue;
      if (!el.getClientRects().length) continue;                         // display:none on it or an ancestor, or not rendered
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (this.filter && this.hook(this.filter, 'filter', el) === false) continue;
      o.push(el);
    }
    return o;
  };

  PadNav.prototype.ringShown = function (cands) { return !!this.ringEl && cands.indexOf(this.ringEl) >= 0; };

  // Show the ring without moving: on the element that already has focus, else the one remembered for this scope, else the first.
  PadNav.prototype.showFocus = function (scope, cands, preferActive) {
    if (!cands.length) return;
    var a = typeof document !== 'undefined' ? document.activeElement : null, mem = this.memory ? this.memory.get(scope) : null, el;
    if (preferActive && a && cands.indexOf(a) >= 0) el = a;
    else if (mem && cands.indexOf(mem) >= 0) el = mem;
    else el = cands[0];
    this.focus(el);
  };

  PadNav.prototype.move = function (scope, cands, dir) {
    if (!cands.length) return;
    var vertical = dir === 'u' || dir === 'd';
    if (cands.length === 1) { if (vertical) this.scrollScope(scope, dir); return; }
    var cur = this.ringEl, rects = [], map = [], i, r, j;
    r = cur.getBoundingClientRect();
    for (i = 0; i < cands.length; i++) if (cands[i] !== cur) { rects.push(cands[i].getBoundingClientRect()); map.push(cands[i]); }
    j = PadNav.nearest(r, rects, dir);
    if (j >= 0) this.focus(map[j]);
    else if (vertical) this.scrollScope(scope, dir);   // nothing further that way (no wrap): a tall scope scrolls instead
  };

  PadNav.prototype.scrollScope = function (scope, dir) {
    var d = Math.max(60, scope.clientHeight * 0.5) * (dir === 'd' ? 1 : -1);
    scope.scrollTop += d;
  };

  // ----- A on the focused element: click it, or handle sliders and drop-downs -----

  PadNav.prototype.activate = function (el, now) {
    if (this.formControls) {
      var tag = String(el.tagName).toUpperCase();
      if (tag === 'INPUT' && String(el.type).toLowerCase() === 'range') { this.enterAdjust(el, now); return; }
      if (tag === 'SELECT' && !el.multiple) { this.cycleSelect(el); return; }   // select.click() does not open the list in every browser, so cycle instead
    }
    try { el.click(); } catch (e) { this.fail('click', e); }   // buttons, links, checkboxes and radios toggle natively and fire their own events
  };

  PadNav.prototype.enterAdjust = function (el, now) {
    this.adjust = el;
    try { el.classList.add(this.adjustClass); } catch (e) { /* no classList */ }
    this.hintAt = now;   // show the "left/right: change" hint
  };

  PadNav.prototype.exitAdjust = function () {
    var el = this.adjust;
    if (!el) return;
    this.adjust = null;
    try { el.classList.remove(this.adjustClass); } catch (e) { /* no classList */ }
  };

  PadNav.prototype.adjustBy = function (el, dir) {
    try {
      var before = String(el.value);
      el.value = PadNav.rangeNext(before, el.min, el.max, el.step, dir);
      if (String(el.value) !== before) { PadNav.fire(el, 'input'); PadNav.fire(el, 'change'); }
    } catch (e) { this.fail('adjust', e); }
  };

  PadNav.prototype.cycleSelect = function (el) {
    try {
      var cur = el.selectedIndex, k = PadNav.nextOption(el.options, cur);
      if (k >= 0 && k !== cur) { el.selectedIndex = k; PadNav.fire(el, 'input'); PadNav.fire(el, 'change'); }
    } catch (e) { this.fail('select', e); }
  };

  // Fire a bubbling event the way a user change would, so the page's own listeners run.
  PadNav.fire = function (el, type) {
    var ev;
    if (typeof Event === 'function') ev = new Event(type, { bubbles: true });
    else { ev = document.createEvent('Event'); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  };

  // ----- hint -----

  // Button names for the current pad: A/B/Start unless the labels option is on.
  PadNav.prototype.names = function () {
    var L = this.labels, id = this.useId, base, custom, k;
    if (!L) return PadNav.DEFAULT_NAMES;
    if (this.nameObj && this.nameFor === id) return this.nameObj;
    base = PadNav.labelsFor(id);
    custom = typeof L === 'function' ? this.hook(L, 'labels', id) : typeof L === 'object' ? L : null;
    if (custom && typeof custom === 'object') for (k in custom) if (typeof custom[k] === 'string') base[k] = custom[k];
    this.nameFor = id; this.nameObj = base;
    return base;
  };

  // Built only when the names or the wired callbacks change, so showing the hint makes no garbage per frame.
  PadNav.prototype.defaultHint = function (adjusting) {
    var n = this.names(), hb = !!this.onBack, hs = !!this.onStart, c = this.hintCache;
    if (c && c.n === n && c.hb === hb && c.hs === hs && c.adj === adjusting) return c.text;
    var text = adjusting ? 'Left/Right: change    ' + n.a + ' or ' + n.b + ': done'
      : n.dpad + ': move    ' + n.a + ': pick' + (hb ? '    ' + n.b + ': back' : '') + (hs ? '    ' + n.start + ': pause' : '');
    this.hintCache = { n: n, hb: hb, hs: hs, adj: adjusting, text: text };
    return text;
  };

  PadNav.prototype.updateHint = function (now) {
    var show = this.awake && !!this.scope && now - this.hintAt < this.hintMs, text = '';
    if (show) {
      if (typeof this.hintText === 'function') {
        text = this.hook(this.hintText, 'hintText', this.scope, this.names(), this.adjust ? 'adjust' : 'menu');
        if (typeof text !== 'string') text = this.defaultHint(!!this.adjust);
      } else if (typeof this.hintText === 'string') text = this.hintText;
      else text = this.defaultHint(!!this.adjust);
    }
    this.setHint(show, text);
  };

  PadNav.prototype.setHint = function (show, text) {
    var el = this.hintEl;
    if (!el) return;
    if (this.hintShown === show && this.hintShownText === text) return;
    this.hintShown = show; this.hintShownText = text;
    try {
      if (show) { el.hidden = false; el.textContent = text; }   // visible first, so a screen reader sees the text change
      else el.hidden = true;
    } catch (e) { /* not an element */ }
  };

  PadNav.DEFAULT_SELECTOR = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  PadNav.BUTTONS = { a: 0, b: 1, start: 9, up: 12, down: 13, left: 14, right: 15 };   // Gamepad API 'standard' mapping
  PadNav.DIRS = ['l', 'r', 'u', 'd'];
  PadNav.DEFAULT_NAMES = { dpad: 'D-pad', a: 'A', b: 'B', start: 'Start' };
  if (Object.freeze) Object.freeze(PadNav.DEFAULT_NAMES);   // shared by every instance
  PadNav.pressed = function (g, n) { return !!(g.buttons[n] && g.buttons[n].pressed); };

  return PadNav;
});
