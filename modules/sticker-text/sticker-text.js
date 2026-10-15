/*!
 * sticker-text.js: die-cut "sticker" lettering for logos and titles, in plain HTML + CSS (no images, scales with font-size).
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 * CSS has no good text stroke (-webkit-text-stroke straddles the glyph edge and chews up thin letters). The trick: draw the
 * word three times: (1) the real invisible text for layout and accessibility, (2) a copy behind it whose `text-shadow` is a
 * ring of zero-blur offsets in the outline color, (3) a gradient-filled copy on top. Then stack drop-shadows for a hard bottom
 * edge and a soft ground shadow. All sizes are in `em`, so the whole lockup scales with one font-size.
 *
 *   StickerText.apply(document.querySelector('.logo-word'));          // needs sticker-text.css
 *   StickerText.ringShadow('#fff7e3');                                  // -> the text-shadow list, if you want to place it yourself
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StickerText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Rings of zero-blur shadows. Three rings of 16 give a smooth edge; two rings look rough at large sizes.
  function ringShadow(color, radiiEm, steps) {
    var out = [];
    (radiiEm || [0.05, 0.075, 0.098]).forEach(function (r) {
      for (var i = 0; i < (steps || 16); i++) {
        var a = i / (steps || 16) * 2 * Math.PI;
        out.push((Math.cos(a) * r).toFixed(3) + 'em ' + (Math.sin(a) * r).toFixed(3) + 'em 0 ' + color);
      }
    });
    return out.join(',');
  }

  // Marks an element as sticker text: copies its text into data-t (the pseudo-elements draw from it) and sets the ring.
  // opts: outline (default '#fff7e3'), radii, steps.
  function apply(el, opts) {
    opts = opts || {};
    el.setAttribute('data-t', el.textContent);
    el.classList.add('sticker-text');
    el.style.setProperty('--st-ring', ringShadow(opts.outline || '#fff7e3', opts.radii, opts.steps));
    return el;
  }
  return { ringShadow: ringShadow, apply: apply };
});
