/*!
 * spotlight-tour.js: a short guided look at the parts of a page. One dimmed layer, one bright window measured live over the current part, a card beside it. No dependencies.
 * A native modal dialog (above the page's own pop-ups, the page behind is inert). Skip and Back buttons, Escape skips, a first-time memory ("seen") and a separate memory for a finishing gift that is given once, only to people who reach the end.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 *
 *   var tour = SpotlightTour.create({
 *     key: "mygame-tour", giftKey: "mygame-tourgift",
 *     steps: [{ title: "Welcome!", text: "Let me show you around.", button: "Show me!" },
 *             { target: "#bigButton", title: "The big button", text: "Tap it." }],
 *     onGift: function () { giveTheGift(); }
 *   });
 *   tour.maybeStart();   // shows it once for a new visitor, or when the address ends in #tour; tour.start() always shows it
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpotlightTour = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var uid = 0;
  var CSS = '.stt{position:fixed;inset:0;z-index:2147481000;margin:0;padding:0;border:0;width:100%;height:100%;max-width:none;max-height:none;overflow:visible;background:none;color:inherit;font:16px/1.4 system-ui,sans-serif}.stt::backdrop{background:none}.stt:not([open]){display:none}' +
    '.stt-hole{position:absolute;border-radius:12px;box-shadow:0 0 0 9999px rgba(8,10,20,.68),0 0 0 3px var(--stt-accent,#ffd24a);left:0;top:0;transition:transform .25s,width .25s,height .25s;pointer-events:none}' +
    '.stt.still .stt-hole,.stt.moving .stt-hole{transition:none}.stt.nohole .stt-hole{display:none}.stt.nohole{background:rgba(8,10,20,.68)}' +
    '.stt-card{position:absolute;box-sizing:border-box;width:min(calc(100vw - 24px),22rem);background:var(--stt-bg,#fffdf8);color:var(--stt-text,#222);border-radius:16px;padding:14px 16px 12px;box-shadow:0 10px 36px rgba(0,0,0,.4)}' +
    '.stt-n{margin:0 0 2px;font-size:.8rem;opacity:.65}.stt-t{margin:0 0 4px;font-size:1.15rem;font-weight:800}.stt-x{margin:0 0 10px}' +
    '.stt-b{display:flex;gap:8px;align-items:center;justify-content:flex-end}.stt-b button{padding:.55rem .95rem;border:0;border-radius:10px;font:inherit;font-weight:700;cursor:pointer;background:#e8eaf0;color:inherit}' +
    '.stt-b .stt-next{background:var(--stt-accent,#2a6ed6);color:var(--stt-on-accent,#fff)}.stt-b .stt-skip{margin-right:auto;background:none;text-decoration:underline;font-weight:500;opacity:.8}.stt-b [hidden]{display:none}' +
    '.stt button:focus-visible{outline:3px solid var(--stt-accent,#2a6ed6);outline-offset:2px}' +
    '@media (prefers-color-scheme:dark){.stt-card{--stt-bg:#232634;--stt-text:#f2f2f2}.stt-b button{background:#383c4f}}';
  var TEXTS = { next: 'Next', back: 'Back', skip: 'Skip', welcome: 'Welcome', step: function (i, n) { return 'Step ' + i + ' of ' + n; } };

  /**
   * Where the bright window and the card go. target: the part's box { left, top, right, bottom } in the window (or null), card: { w, h }, view: { w, h }, m: margin (12).
   * Returns { hole: { l, t, w, h } | null, x, y }. The card goes below the part, else above it; if neither has room it sits at the bottom and the window shrinks to fit above it.
   * A part that is mostly out of the window (less than 20 pixels showing) counts as no part: the card is centered and there is no window.
   */
  function layout(target, card, view, m) {
    m = m === undefined ? 12 : m;
    var r = null, x, y;
    if (target) {
      var t = Math.max(target.top, 0), b = Math.min(target.bottom, view.h), l = Math.max(target.left, 0), rt = Math.min(target.right, view.w);
      if (b - t >= 20 && rt - l >= 20) r = { l: l - 6, t: t - 6, w: rt - l + 12, h: b - t + 12 };
    }
    if (!r) return { hole: null, x: (view.w - card.w) / 2, y: (view.h - card.h) / 2 };
    var below = view.h - (r.t + r.h) - m, above = r.t - m;
    if (below >= card.h) y = r.t + r.h + m;
    else if (above >= card.h) y = r.t - card.h - m;
    else { y = view.h - card.h - m; r.h = Math.max(40, Math.min(r.h, y - m - r.t)); }
    x = r.l + r.w / 2 - card.w / 2;
    return { hole: r, x: Math.max(m, Math.min(x, view.w - card.w - m)), y: Math.max(m, Math.min(y, view.h - card.h - m)) };
  }

  function create(opts) {
    opts = opts || {};
    var doc = document, T = Object.assign({}, TEXTS, opts.texts || {}), id = 'stt' + (++uid), i = 0, steps = [], open = false, destroyed = false, returnTo = null;
    var store = opts.storage !== undefined ? opts.storage : (function () { try { return localStorage; } catch (e) { return null; } })();
    function get(k) { try { return !!k && !!store && store.getItem(k) === '1'; } catch (e) { return false; } }
    function put(k) { try { if (k && store) store.setItem(k, '1'); } catch (e) { /* storage blocked: it will show again next time */ } }
    var styleEl = doc.getElementById('stt-style');
    if (!styleEl) { styleEl = doc.createElement('style'); styleEl.id = 'stt-style'; styleEl.textContent = CSS; (doc.head || doc.documentElement).appendChild(styleEl); }
    var el = doc.createElement('dialog');
    el.className = 'stt'; el.setAttribute('aria-labelledby', id + 't');
    el.innerHTML = '<div class="stt-hole"></div><div class="stt-card"><p class="stt-n"></p><h2 class="stt-t" id="' + id + 't"></h2><p class="stt-x"></p>' +
      '<div class="stt-b"><button type="button" class="stt-skip"></button><button type="button" class="stt-back"></button><button type="button" class="stt-next"></button></div></div>';
    var q = function (s) { return el.querySelector(s); };
    var hole = q('.stt-hole'), card = q('.stt-card'), nEl = q('.stt-n'), tEl = q('.stt-t'), xEl = q('.stt-x'), skipB = q('.stt-skip'), backB = q('.stt-back'), nextB = q('.stt-next');
    skipB.textContent = T.skip; backB.textContent = T.back;
    (opts.root || doc.body).appendChild(el);

    function targetOf(st) { try { return typeof st.target === 'function' ? st.target() : st.target ? doc.querySelector(st.target) : null; } catch (e) { return null; } }
    var cs = null, raf = 0, mt = 0, ro = window.ResizeObserver ? new ResizeObserver(function () { place(); }) : null;
    function sched() { el.classList.add('moving'); clearTimeout(mt); mt = setTimeout(function () { el.classList.remove('moving'); }, 150); place(); }
    function place() {
      if (!open) return;
      var st = steps[i], tg = targetOf(st), box = tg ? tg.getBoundingClientRect() : null;
      var L = layout(box, cs || (cs = { w: card.offsetWidth, h: card.offsetHeight }), { w: window.innerWidth, h: window.innerHeight }, 12);
      el.classList.toggle('nohole', !L.hole);
      if (L.hole) { hole.style.transform = 'translate(' + L.hole.l + 'px,' + L.hole.t + 'px)'; hole.style.width = L.hole.w + 'px'; hole.style.height = L.hole.h + 'px'; }
      card.style.left = L.x + 'px'; card.style.top = L.y + 'px';
    }
    function show(n) {
      i = n; cs = null;
      var st = steps[n], tg = targetOf(st), vh = window.innerHeight, top = opts.topOffset === undefined ? 120 : opts.topOffset;
      if (ro) { ro.disconnect(); ro.observe(doc.documentElement); if (tg) ro.observe(tg); }   // follow the page when it reflows (an image loads, a block above grows)
      if (tg && opts.scroll !== false) {   // bring the part into view (first inside any scrolling box, then on the page, leaving room for a sticky bar), then place the window over it
        try { tg.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* not an element */ }
        var qd = tg.getBoundingClientRect(), abs = qd.top + window.pageYOffset, tall = qd.height > vh * 0.5;
        window.scrollTo(0, Math.max(0, tall ? abs - top : abs - (vh - qd.height) / 2));
      }
      var count = steps.length - (opts.welcome === false ? 0 : 1);   // the first step is a welcome without a number, unless welcome:false
      var numbered = opts.welcome === false || n > 0;
      nEl.textContent = numbered ? T.step(opts.welcome === false ? n + 1 : n, count) : T.welcome;
      tEl.textContent = st.title || ''; xEl.textContent = st.text || '';
      nextB.textContent = st.button || (n === steps.length - 1 ? (T.done || T.next) : T.next);
      backB.hidden = n < (opts.welcome === false ? 1 : 2);
      place();
      try { nextB.focus({ preventScroll: true }); } catch (e) { /* hidden */ }
      if (typeof opts.onStep === 'function') try { opts.onStep(n, st); } catch (e) { /* the page's code must not break the tour */ }
    }
    function shut() { if (ro) ro.disconnect(); if (el.close) { if (el.open) el.close(); } else el.removeAttribute('open'); }
    function close(finished) {
      if (!open) return;
      open = false; shut(); put(opts.key);
      var giveGift = finished === true && !get(opts.giftKey);
      if (giveGift) put(opts.giftKey);
      if (returnTo && returnTo.focus) { try { returnTo.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
      if (typeof opts.onClose === 'function') try { opts.onClose(finished === true); } catch (e) { /* the page's code must not break the tour */ }
      if (giveGift && typeof opts.onGift === 'function') { var g = opts.giftDelayMs === undefined ? 700 : opts.giftDelayMs; setTimeout(function () { try { opts.onGift(); } catch (e) { /* the page's code must not break the tour */ } }, g); }
    }
    var offs = [];
    function on(t, type, fn, o) { t.addEventListener(type, fn, o); offs.push(function () { t.removeEventListener(type, fn, o); }); }
    on(nextB, 'click', function () { if (i >= steps.length - 1) close(true); else show(i + 1); });
    on(backB, 'click', function () { if (i > 0) show(i - 1); });
    on(skipB, 'click', function () { close(false); });
    on(doc, 'keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key === 'Tab') {   // keep the focus on the card's own buttons
        var bs = [skipB, backB, nextB].filter(function (b) { return !b.hidden; }), k = bs.indexOf(doc.activeElement);
        e.preventDefault(); bs[(k + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
      }
    });
    on(el, 'cancel', function (e) { e.preventDefault(); close(false); });   // the browser's own close request (for example the Android back gesture)
    on(window, 'resize', function () { cs = null; place(); }); on(window, 'scroll', sched, { passive: true, capture: true });

    function start() {
      if (open || destroyed) return false;
      steps = typeof opts.steps === 'function' ? opts.steps() : (opts.steps || []);
      if (!steps || !steps.length) return false;
      returnTo = doc.activeElement; open = true;
      var reduce = false; try { reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (typeof opts.still === 'function' ? !!opts.still() : !!opts.still); } catch (e) { /* no matchMedia */ }
      el.classList.toggle('still', reduce); if (el.showModal) el.showModal(); else el.setAttribute('open', '');
      show(0); return true;
    }
    return {
      element: el, start: start,
      /** Shows the tour once, for a visitor who has not seen it, unless opts.autoStart() says not now (for example, an old saved game). A #tour address always shows it; opts.blockHash (a RegExp) never does. */
      maybeStart: function () {
        var h = location.hash;
        if (opts.blockHash && opts.blockHash.test(h)) return false;
        if (h !== (opts.forceHash || '#tour')) {
          if (get(opts.key)) return false;
          if (typeof opts.autoStart === 'function' && !opts.autoStart()) return false;
        }
        return start();
      },
      seen: function () { return get(opts.key); }, giftGiven: function () { return get(opts.giftKey); },
      /** Forget that the tour and the gift were seen. */
      reset: function (what) { try { if (store) { if (what !== 'gift') store.removeItem(opts.key); if (what === 'gift' || what === 'all') store.removeItem(opts.giftKey); } } catch (e) { /* blocked */ } },
      isOpen: function () { return open; }, goTo: function (n) { if (open && n >= 0 && n < steps.length) show(n); }, close: function () { close(false); },
      destroy: function () { destroyed = true; open = false; if (ro) ro.disconnect(); offs.forEach(function (f) { f(); }); if (el.parentNode) el.parentNode.removeChild(el); }
    };
  }

  return { create: create, layout: layout };
}));
