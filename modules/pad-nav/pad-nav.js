/* pad-nav: gamepad (Gamepad API) navigation for ordinary on-screen DOM menus and panels. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules */
/**
 * @param {object} [o] options, all optional:
 *   getScope()          returns the element that currently owns the controller (the topmost open panel), or null for none
 *   scopeSelector       string alternative to getScope: the last visible match in document order is the scope
 *                       (with neither option, the whole document.body is the scope)
 *   focusableSelector   what counts as reachable inside the scope
 *   filter(el)          extra test; return false to leave an element out
 *   onBack(scope)       B pressed          onStart(scope)  Start pressed
 *   onA(el)             A pressed on the focused element; return false to cancel the default el.click()
 *   getPads()           returns an array-like of gamepads; default navigator.getGamepads (inject a fake in tests)
 *   deadzone            stick push (0..1) that counts as a press, default 0.45
 *   repeatDelay         ms a direction is held before it repeats, default 380
 *   repeatRate          ms between repeats after that, default 120
 *   focusClass          class put on the focused element (you style it), default 'pad-focus'
 *   hintEl              element whose text shows the button meanings (only after pad use)
 *   hintText            string or function(scope) overriding the default hint text
 *   hintMs              how long the hint stays up after waking or a scope change, default 3500
 *   guardMs             A is ignored this long after a scope appears (so the A that opened a panel does not also pick inside it), default 450
 *   wakeMs              a scope that opens within this long of pad use gets focus immediately, default 8000
 *   scroll              keep the focused element visible with scrollIntoView, default true
 *   requireStandard     only read pads whose mapping is 'standard', default true
 */
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
  this.getPads = typeof o.getPads === 'function' ? o.getPads : function () { return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; };
  this.deadzone = num(o.deadzone, 0.45);
  this.repeatDelay = num(o.repeatDelay, 380);
  this.repeatRate = num(o.repeatRate, 120);
  this.focusClass = o.focusClass || 'pad-focus';
  this.hintEl = o.hintEl || null;
  this.hintText = o.hintText || null;
  this.hintMs = num(o.hintMs, 3500);
  this.guardMs = num(o.guardMs, 450);
  this.wakeMs = num(o.wakeMs, 8000);
  this.scroll = o.scroll !== false;
  this.requireStandard = o.requireStandard !== false;

  this.prev = {};            // last frame's pressed state, for edge detection
  this.rep = {};             // per direction: when the next repeat is due
  this.awake = false;        // true after the first pad input; nothing is shown before that
  this.lastUsed = -Infinity; // time of the latest pad input
  this.seen = false;         // has a scope been looked at yet
  this.scope = null;
  this.scopeAt = -Infinity;
  this.hintAt = 0;
  this.ringEl = null;        // the element wearing focusClass
  this.memory = typeof WeakMap === 'function' ? new WeakMap() : null;   // last focused element per scope
  this.raf = 0;
  this.hintShown = null;     // cached so the DOM is only written when the hint changes
  this.hintShownText = null;

  var self = this;
  this.onBlur = function (e) { if (e.target && e.target === self.ringEl) self.clearRing(); };
  if (typeof document !== 'undefined') document.addEventListener('blur', this.onBlur, true);
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

/** Call once per frame. nowMs defaults to performance.now(). Returns true if a usable pad was read. */
PadNav.prototype.step = function (nowMs) {
  var now = typeof nowMs === 'number' ? nowMs : performance.now();
  var pads = this.getPads() || [], D = { l: 0, r: 0, u: 0, d: 0, a: 0, b: 0, s: 0 }, any = false, i, g, ax, x, y, ex, ey, dz = this.deadzone, k;
  for (i = 0; i < pads.length; i++) {
    g = pads[i];
    if (!g || !g.buttons || g.connected === false) continue;
    if (this.requireStandard && g.mapping !== 'standard') continue;
    any = true; ax = g.axes || []; x = ax[0] || 0; y = ax[1] || 0; ex = Math.abs(x); ey = Math.abs(y);
    if (PadNav.pressed(g, PadNav.BUTTONS.a)) D.a = 1;
    if (PadNav.pressed(g, PadNav.BUTTONS.b)) D.b = 1;
    if (PadNav.pressed(g, PadNav.BUTTONS.start)) D.s = 1;
    // the stick counts only along its stronger axis, so a diagonal push does not move twice
    if (PadNav.pressed(g, PadNav.BUTTONS.up) || (y < -dz && ey >= ex)) D.u = 1;
    if (PadNav.pressed(g, PadNav.BUTTONS.down) || (y > dz && ey >= ex)) D.d = 1;
    if (PadNav.pressed(g, PadNav.BUTTONS.left) || (x < -dz && ex > ey)) D.l = 1;
    if (PadNav.pressed(g, PadNav.BUTTONS.right) || (x > dz && ex > ey)) D.r = 1;
  }
  if (!any) { this.prev = {}; return false; }

  var E = {};
  for (k in D) E[k] = D[k] && !this.prev[k] ? 1 : 0;
  if (D.l || D.r || D.u || D.d || D.a || D.b || D.s) {
    this.lastUsed = now;
    if (!this.awake) { this.awake = true; this.hintAt = now; }
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
      if (!this.ringShown(cands)) { if (!woke) { this.showFocus(scope, cands, true); woke = true; } }   // first press only shows the focus ring
      else if (!woke) this.move(scope, cands, k);
    }
    if (E.a && now - this.scopeAt > this.guardMs && !woke) {
      if (!cands) cands = this.candidates(scope);
      var el = this.ringShown(cands) ? this.ringEl : cands.length === 1 ? cands[0] : null;
      if (el) { if (!(this.onA && this.onA(el) === false)) el.click(); }
      else this.showFocus(scope, cands, true);
    }
  }
  if (E.b && this.onBack) this.onBack(scope);
  if (E.s && this.onStart) this.onStart(scope);

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

PadNav.prototype.clearRing = function () {
  if (this.ringEl) this.ringEl.classList.remove(this.focusClass);
  this.ringEl = null;
};

// ----- internals -----

PadNav.prototype.currentScope = function () {
  if (this.getScopeFn) return this.getScopeFn() || null;
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
    if (this.filter && this.filter(el) === false) continue;
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

PadNav.prototype.updateHint = function (now) {
  var show = this.awake && !!this.scope && now - this.hintAt < this.hintMs, text = '';
  if (show) {
    if (typeof this.hintText === 'function') text = this.hintText(this.scope);
    else if (typeof this.hintText === 'string') text = this.hintText;
    else text = 'D-pad: move    A: pick' + (this.onBack ? '    B: back' : '') + (this.onStart ? '    Start: pause' : '');
  }
  this.setHint(show, text);
};

PadNav.prototype.setHint = function (show, text) {
  var el = this.hintEl;
  if (!el) return;
  if (this.hintShown === show && this.hintShownText === text) return;
  this.hintShown = show; this.hintShownText = text;
  if (show) el.textContent = text;
  el.hidden = !show;
};

PadNav.DEFAULT_SELECTOR = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
PadNav.BUTTONS = { a: 0, b: 1, start: 9, up: 12, down: 13, left: 14, right: 15 };   // Gamepad API 'standard' mapping
PadNav.DIRS = ['l', 'r', 'u', 'd'];
PadNav.pressed = function (g, n) { return !!(g.buttons[n] && g.buttons[n].pressed); };

if (typeof module !== 'undefined' && module.exports) module.exports = PadNav; else (typeof globalThis !== 'undefined' ? globalThis : this).PadNav = PadNav;
