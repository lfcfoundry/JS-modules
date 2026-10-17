/*!
 * sticker-text.js: die-cut "sticker" lettering for logos and titles, in plain HTML + CSS (no images, scales with font-size).
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 *
 * CSS has no good text stroke (-webkit-text-stroke straddles the glyph edge and chews up thin letters). The trick: draw the
 * word three times: (1) the real invisible text for layout and accessibility, (2) a copy behind it whose `text-shadow` is a
 * ring of zero-blur offsets in the outline color, (3) a gradient-filled copy on top. Then stack drop-shadows for a hard bottom
 * edge and a soft ground shadow. All sizes are in `em`, so the whole lockup scales with one font-size.
 *
 *   StickerText.apply(document.querySelector('.logo-word'));          // needs sticker-text.css
 *   StickerText.update(el);                                              // after the text changed: refresh the copied text
 *   StickerText.ringShadow('#fff7e3');                                  // -> the text-shadow list, if you want to place it yourself
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StickerText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_OUTLINE = '#fff7e3';

  // A ring of zero-blur shadows. One ring of 32 gives a smooth edge (the old default, three rings of 16 at .05/.075/.098 em, drew the
  // same outline as one ring of 16, so two thirds of its shadows were wasted). Raise `steps` for very large lettering.
  // Bad arguments fall back to the defaults (a text color, a list of numbers, a whole number of steps); this never throws.
  function ringShadow(color, radiiEm, steps) {
    var out = [], radii = [], n = Math.floor(Number(steps));
    if (typeof color !== 'string' || !color) color = DEFAULT_OUTLINE;
    if (Object.prototype.toString.call(radiiEm) === '[object Array]') {
      for (var j = 0; j < radiiEm.length; j++) { var r0 = Number(radiiEm[j]); if (isFinite(r0) && r0 > 0) radii.push(r0); }
    }
    if (!radii.length) radii = [0.098];
    if (!(n >= 1)) n = 32;
    if (n > 96) n = 96;
    radii.forEach(function (r) {
      for (var i = 0; i < n; i++) {
        var a = i / n * 2 * Math.PI;
        out.push((Math.cos(a) * r).toFixed(3) + 'em ' + (Math.sin(a) * r).toFixed(3) + 'em 0 ' + color);
      }
    });
    return out.join(',');
  }

  // Marks an element as sticker text: copies its text into data-t (the pseudo-elements draw from it); the ring comes from the stylesheet
  // unless radii or steps are given.
  // opts: outline (default '#fff7e3'), radii, steps.
  // The ring's color is read from the CSS variable --st-outline when the stylesheet sets one; otherwise from the `outline`
  // option given here (stored as --st-outline-default), otherwise cream. So changing --st-outline in CSS always recolors it.
  // Returns the element (or null/undefined if it was not an element). Never throws.
  function apply(el, opts) {
    try {
      if (!el || typeof el.setAttribute !== 'function') return el;
      opts = opts || {};
      el.setAttribute('data-t', el.textContent == null ? '' : String(el.textContent));
      if (el.classList) el.classList.add('sticker-text');
      if (el.style && typeof el.style.setProperty === 'function') {
        if (opts.radii || opts.steps) el.style.setProperty('--st-ring', ringShadow('currentColor', opts.radii, opts.steps));   // the default ring is in sticker-text.css
        if (typeof opts.outline === 'string' && opts.outline) el.style.setProperty('--st-outline-default', opts.outline);
      }
    } catch (e) {}
    return el;
  }

  // Call after the element's text changed (a score, a translation): copies the new text into data-t so the pretty copies
  // follow. Pass opts only if the ring settings also changed (it then does the same as apply()). Never throws.
  function update(el, opts) {
    try {
      if (!el || typeof el.setAttribute !== 'function') return el;
      if (opts || !(el.classList && el.classList.contains && el.classList.contains('sticker-text'))) return apply(el, opts);
      el.setAttribute('data-t', el.textContent == null ? '' : String(el.textContent));
    } catch (e) {}
    return el;
  }
  // Keeps data-t current by itself while the element's text changes (no update() calls). Returns a function that stops watching.
  // Where MutationObserver is missing (old browsers, Node) it only applies once and the stop function does nothing.
  function watch(el, opts) {
    var mo = null;
    try {
      apply(el, opts);
      if (el && typeof MutationObserver === 'function' && el.nodeType === 1) {
        mo = new MutationObserver(function () { update(el); });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) {}
    return function () { if (mo) { mo.disconnect(); mo = null; } };
  }
  return { ringShadow: ringShadow, apply: apply, update: update, watch: watch };
});
