/*!
 * back-close.js: make the phone's back swipe or back button close the top panel, instead of leaving the page.
 * Uses CloseWatcher, which is also what the Escape key and the desktop close gestures go through.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 *
 *   var panelBack = BackClose.watch(panel, function () { closePanel(); });   // panel: any element that uses the `hidden` attribute
 *   closeButton.onclick = function () { panelBack.close(); };                // optional: the X button and pad B take the same route
 *
 * The watcher is armed while the panel is shown (its `hidden` attribute is absent and it is in the page) and removed when it
 * is hidden, however that happens, so your own close button needs no extra code. If your close function leaves the panel
 * open (for example while it is locked), the watcher is armed again, unless the panel was removed from the page or the
 * watcher was destroyed. CloseWatcher exists in Chrome 126+ and Firefox 149+, not in Safari or Safari on iPhone.
 *
 * Opt-in for browsers without CloseWatcher:  BackClose.watch(panel, closeFn, { historyFallback: true })
 * pushes one history entry when the panel is shown, closes the panel on the back button, and removes the entry again when the
 * panel is closed another way. Caveats: the address-bar history changes; Chrome may skip entries added without a tap, so
 * show the panel from a tap; not tried on a real iPhone. Without the option, browsers without CloseWatcher get
 * { supported: false } and your normal close controls still work.
 *
 * Panels that are not toggled with `hidden`: BackClose.watch(panel, closeFn, { isShown: function (el) { return el.classList.contains('open'); },
 * attributes: ['class'] }) decides "shown" your way and watches those attributes instead. Panels that are not an element at all (drawn on a
 * canvas, or several panels that one back swipe should close together):
 *   var back = BackClose.watchWhen(function () { return anyPanelOpen(); }, function () { closeAllPanels(); });
 *   // call back.sync() whenever panels open or close; it arms or removes the watcher to match (back.close() and back.destroy() work as above)
 *
 * Several panels open at once: the most recently shown one closes first. Panels shown without a tap or key in
 * between (for example by a timer) can be grouped by the browser and close together on one back swipe; show a panel
 * from a user action where you can. For a native <dialog> or popover you need none of this: the browser already routes close requests to them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BackClose = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function hasCW(needObserver) { return typeof CloseWatcher === 'function' && (!needObserver || typeof MutationObserver === 'function'); }
  function hasHistory(needObserver) {
    return typeof window !== 'undefined' && (!needObserver || typeof MutationObserver === 'function') && !!window.history &&
      typeof window.history.pushState === 'function' && typeof window.history.back === 'function' && typeof window.addEventListener === 'function';
  }

  // history fallback, shared by all panels: one popstate listener, a stack of the entries we pushed
  var stack = [], ignore = 0, listening = false;
  function sync() {
    if (stack.length || ignore) { if (!listening) { window.addEventListener('popstate', onPop); listening = true; } }
    else if (listening) { window.removeEventListener('popstate', onPop); listening = false; }
  }
  function backOne() { ignore++; try { window.history.back(); } catch (e) { ignore--; } }
  function onPop() {
    if (ignore > 0) { ignore--; sync(); return; }              // the popstate of an entry we removed ourselves
    var r = stack.pop();
    if (r) r.onBack();
    while (stack.length && stack[stack.length - 1].done) { stack.pop(); backOne(); }   // entries of panels closed another way: step over them
    sync();
  }
  function push(r) {
    try { window.history.pushState({ backClose: true }, ''); } catch (e) { return false; }
    stack.push(r); sync(); return true;
  }
  function unpush(r) {                                         // the panel closed another way: take our entry out again
    var i = stack.indexOf(r);
    if (i < 0) return;
    if (i === stack.length - 1) { stack.pop(); backOne(); }
    else r.done = true;                                        // buried under a newer panel: skipped when the user reaches it
    sync();
  }

  // watch(el, close, opts): the panel is an element; it counts as shown while `isShown(el)` says so (default: no `hidden` attribute and in the page)
  // and the element is watched for changes of the attributes in `opts.attributes` (default ['hidden']).
  function watch(el, close, opts) { return make(el, close, opts, null); }
  // watchWhen(isOpen, close, opts): for panels that are not an element (a canvas drawing, several panels at once). Nothing is watched:
  // call handle.sync() whenever isOpen() may have changed and the watcher is armed or removed to match.
  function watchWhen(isOpen, close, opts) { return make(null, close, opts, typeof isOpen === 'function' ? isOpen : null); }

  function make(el, close, opts, openFn) {
    var useFallback = !!(opts && opts.historyFallback), userShown = opts && typeof opts.isShown === 'function' ? opts.isShown : null;
    var attrs = opts && opts.attributes && opts.attributes.length ? opts.attributes : ['hidden'], needMO = !!el;
    var known = typeof close === 'function' && (el ? true : !!openFn);
    var mode = !known ? 'none' : hasCW(needMO) ? 'closewatcher' : useFallback && hasHistory(needMO) ? 'history' : 'none';
    var handle = { supported: mode !== 'none', mode: mode, destroy: function () {}, close: function () { return false; }, sync: function () {} };
    function shown() {
      try {
        if (openFn) return !!openFn();
        if (!el || el.isConnected === false) return false;
        return userShown ? !!userShown(el) : !el.hidden;
      } catch (e) { return false; }
    }
    if (mode === 'none') {                                     // no back-swipe support here, but handle.close() still runs your close function
      handle.close = function () {
        if (!known || !shown()) return false;
        try { close(); } catch (e) { /* the page's close function failed */ }
        return true;
      };
      return handle;
    }
    var cw = null, rec = null, mo = null, destroyed = false;

    function run() {                                           // the page's close function, then arm again if it stayed open
      try { close(); } catch (e) { /* the page's close function failed; do not trap the user */ }
      if (!destroyed && shown()) arm();
    }
    function arm() {
      if (destroyed || cw || rec || !shown()) return;
      if (mode === 'closewatcher') {
        try { cw = new CloseWatcher(); } catch (e) { cw = null; return; }
        cw.onclose = function () { cw = null; run(); };
      } else {
        var r = { done: false, onBack: function () {
          if (rec === r) rec = null;
          if (r.done || !shown()) backOne();                   // an entry whose panel is already closed: step over it
          else run();
        } };
        if (push(r)) rec = r;
      }
    }
    function disarm() {
      if (cw) { try { cw.destroy(); } catch (e) { /* already gone */ } cw = null; }
      if (rec) { var r = rec; rec = null; unpush(r); }
    }
    function sync() { if (destroyed) return; if (shown()) arm(); else disarm(); }
    if (el) {
      mo = new MutationObserver(sync);
      mo.observe(el, { attributes: true, attributeFilter: attrs });
    }
    arm();
    handle.sync = sync;
    handle.destroy = function () { destroyed = true; if (mo) mo.disconnect(); mo = null; disarm(); };
    // one route for every way to close: the on-screen X, the controller B button and the back swipe all end up in your close function
    handle.close = function () {
      if (destroyed || !shown()) return false;
      if (cw) { try { cw.requestClose(); return true; } catch (e) { /* fall through to the direct call */ } }
      else if (rec && stack[stack.length - 1] === rec) { try { window.history.back(); return true; } catch (e) { /* fall through */ } }
      run(); return true;
    };
    return handle;
  }

  var api = { watch: watch, watchWhen: watchWhen };
  Object.defineProperty(api, 'supported', { enumerable: true, get: function () { return hasCW(true); } });
  return api;
});
