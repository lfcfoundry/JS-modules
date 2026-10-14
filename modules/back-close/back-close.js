/*!
 * back-close.js: make the phone's back swipe or back button close the top panel, instead of leaving the page.
 * Uses CloseWatcher, which is also what the Escape key and the desktop close gestures go through.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 JNFoo. MIT License (see LICENSE at the repository root).
 *
 *   BackClose.watch(panel, function () { closePanel(); });   // panel: any element that uses the `hidden` attribute
 *
 * The watcher is armed while the panel is shown (its `hidden` attribute is absent) and removed when it is hidden,
 * however that happens, so your own close button needs no extra code. If your close function leaves the panel open
 * (for example while it is locked), the watcher is armed again. Nothing happens in a browser without CloseWatcher
 * (Chrome 126+, Firefox 149+); the call returns { supported: false } and your normal close controls still work.
 *
 * Several panels open at once: the most recently shown one closes first. Panels shown without a tap or key in
 * between (for example by a timer) can be grouped by the browser and close together on one back swipe; show a panel
 * from a user action where you can.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BackClose = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var supported = typeof CloseWatcher === 'function' && typeof MutationObserver === 'function';

  function watch(el, close) {
    var handle = { supported: supported, destroy: function () {} };
    if (!supported || !el || typeof close !== 'function') return handle;
    var cw = null, mo = null;
    function arm() {
      if (cw || el.hidden) return;
      try { cw = new CloseWatcher(); } catch (e) { cw = null; return; }
      cw.onclose = function () {
        cw = null;
        try { close(); } catch (e) { /* the page's close function failed; do not trap the user */ }
        if (!el.hidden) arm();
      };
    }
    function disarm() { if (cw) { try { cw.destroy(); } catch (e) { /* already gone */ } cw = null; } }
    mo = new MutationObserver(function () { if (el.hidden) disarm(); else arm(); });
    mo.observe(el, { attributes: true, attributeFilter: ['hidden'] });
    arm();
    handle.destroy = function () { if (mo) mo.disconnect(); mo = null; disarm(); };
    return handle;
  }

  return { watch: watch, supported: supported };
});
