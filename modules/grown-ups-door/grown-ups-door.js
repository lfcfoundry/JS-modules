/*!
 * grown-ups-door.js: a short task that a young child will not finish, in front of buttons and links a grown-up should press. No dependencies.
 * Step 1: press and hold a round button for 3 seconds. Step 2: drag the item into the target (or tap the item, then the target; the keyboard works too).
 * Once passed, the guarded controls stay open for 2 minutes. It is a speed bump, not security.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var door = GrownUpsDoor.attach({ guard: "#reset, #saveBtn, footer a" });   // clicks on these ask for the task first
 *   door.isOpen();   door.close();   door.destroy();
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GrownUpsDoor = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var uid = 0;
  var DEFAULT_ITEM = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="22" fill="#d6402f"/><path d="M32 12c0-6 4-9 9-9-1 6-4 9-9 9z" fill="#3f9b4a"/></svg>';
  var DEFAULT_TARGET = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 26h52l-6 28a4 4 0 0 1-4 3H16a4 4 0 0 1-4-3z" fill="#b9814a"/><path d="M6 26h52" stroke="#8a5a2a" stroke-width="4"/></svg>';
  var DEFAULT_TEXTS = {
    title: 'For grown-ups',
    whyButton: function (name) { return 'This opens “' + name + '”.'; },
    whyLink: function (name) { return 'This opens another website: ' + name + '.'; },
    hold: 'Press and hold the round button for 3 seconds.',
    holdLabel: 'Hold', keepHolding: 'Keep holding',
    drag: 'Drag the item into the target. Or tap the item, then tap the target.',
    itemName: 'Item', targetName: 'Target',
    opened: 'The grown-ups door is open.', openLink: function (name) { return 'Open ' + name; },
    notNow: 'Not now'
  };
  var CSS = '.gud{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,12,20,.62);font:16px/1.4 system-ui,sans-serif}.gud[hidden]{display:none}' +
    '.gud-box{box-sizing:border-box;width:min(100%,24rem);background:var(--gud-bg,#fffdf8);color:var(--gud-text,#222);border-radius:18px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.35)}' +
    '.gud-box h2{margin:0 0 4px;font-size:1.25rem}.gud-why{margin:0 0 12px;opacity:.8}' +
    '.gud-step{display:flex;gap:10px;align-items:flex-start;margin:10px 0;opacity:.45}.gud-step[data-state=on]{opacity:1}.gud-step[data-state=done]{opacity:.7}' +
    '.gud-n{flex:none;width:1.6rem;height:1.6rem;border-radius:50%;background:var(--gud-accent,#2a6ed6);color:#fff;font-weight:700;text-align:center;line-height:1.6rem}.gud-step[data-state=done] .gud-n{background:#2e9b4a}' +
    '.gud-txt{flex:1}.gud-hold{position:relative;flex:none;width:4.2rem;height:4.2rem;border-radius:50%;border:0;color:var(--gud-text,#222);font:700 .8rem system-ui,sans-serif;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;' +
    'background:conic-gradient(var(--gud-accent,#2a6ed6) calc(var(--p,0)*1%),#d9dce3 0)}.gud-hold::before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--gud-bg,#fffdf8)}.gud-hold span{position:relative}' +
    '.gud-hold:disabled{cursor:default}.gud-play{display:flex;justify-content:space-between;align-items:center;margin:8px 0 0}' +
    '.gud-pick,.gud-bask{width:4.2rem;height:4.2rem;padding:0;border:2px dashed transparent;border-radius:14px;background:none;cursor:pointer}.gud-pick svg,.gud-bask svg{width:100%;height:100%;pointer-events:none}' +
    '.gud-pick{touch-action:none;user-select:none;-webkit-user-select:none;position:relative;z-index:1}.gud-pick.drag{cursor:grabbing;z-index:2}.gud-pick[aria-pressed=true]{border-color:var(--gud-accent,#2a6ed6)}.gud-bask.on{border-color:var(--gud-accent,#2a6ed6)}' +
    '.gud-pick:disabled,.gud-bask:disabled{opacity:.5;cursor:default}.gud button:focus-visible,.gud a:focus-visible{outline:3px solid var(--gud-accent,#2a6ed6);outline-offset:2px}' +
    '.gud-link{margin:12px 0 4px;text-align:center}.gud-link a{display:inline-block;padding:.6rem 1rem;border-radius:10px;background:var(--gud-accent,#2a6ed6);color:#fff;font-weight:700;text-decoration:none}' +
    '.gud-x{display:block;margin:10px auto 0;padding:.5rem 1rem;border:0;border-radius:10px;background:#e8eaf0;color:inherit;font:inherit;cursor:pointer}' +
    '@media (prefers-color-scheme:dark){.gud-box{--gud-bg:#232634;--gud-text:#f2f2f2}.gud-x{background:#383c4f}}';

  function attach(opts) {
    opts = opts || {};
    var doc = document, T = Object.assign({}, DEFAULT_TEXTS, opts.texts || {}), HOLD = opts.holdMs > 0 ? opts.holdMs : 3000, OPEN = opts.openMs >= 0 ? opts.openMs : 120000;
    var guard = opts.guard, id = 'gud' + (++uid), openUntil = 0, pending = null, opener = null, step = 1, picked = false, hold = { t0: 0, raf: 0, id: null }, drag = null, destroyed = false;
    var matches = typeof guard === 'function' ? guard : function (el) { return !!guard && el.matches(guard); };
    var styleEl = doc.getElementById('gud-style');
    if (!styleEl) { styleEl = doc.createElement('style'); styleEl.id = 'gud-style'; styleEl.textContent = CSS; (doc.head || doc.documentElement).appendChild(styleEl); }
    var el = doc.createElement('div');
    el.className = 'gud'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', id + 't');
    el.innerHTML = '<div class="gud-box"><h2 id="' + id + 't"></h2><p class="gud-why"></p>' +
      '<div class="gud-step" data-s="1" data-state="on"><span class="gud-n" aria-hidden="true">1</span><span class="gud-txt"></span><button type="button" class="gud-hold"><span></span></button></div>' +
      '<div class="gud-step" data-s="2" data-state="off"><span class="gud-n" aria-hidden="true">2</span><span class="gud-txt"></span></div>' +
      '<div class="gud-play"><button type="button" class="gud-pick" aria-pressed="false" disabled></button><button type="button" class="gud-bask" disabled></button></div>' +
      '<div class="gud-link" hidden><a target="_blank" rel="noopener"></a></div><button type="button" class="gud-x"></button></div>';
    var q = function (s) { return el.querySelector(s); };
    var why = q('.gud-why'), holdBtn = q('.gud-hold'), holdLbl = q('.gud-hold span'), s1 = q('[data-s="1"]'), s2 = q('[data-s="2"]'), pick = q('.gud-pick'), bask = q('.gud-bask'), linkBox = q('.gud-link'), linkA = q('.gud-link a'), xBtn = q('.gud-x');
    q('h2').textContent = T.title; q('[data-s="1"] .gud-txt').textContent = T.hold; q('[data-s="2"] .gud-txt').textContent = T.drag; xBtn.textContent = T.notNow;
    pick.innerHTML = opts.itemHtml || DEFAULT_ITEM; bask.innerHTML = opts.targetHtml || DEFAULT_TARGET; pick.setAttribute('aria-label', T.itemName); bask.setAttribute('aria-label', T.targetName);
    (opts.root || doc.body).appendChild(el);

    function isOpen() { return (typeof opts.skip === 'function' ? !!opts.skip() : !!opts.skip) || Date.now() < openUntil; }
    function ring(p) { holdBtn.style.setProperty('--p', String(Math.round(p * 100))); }
    function holdStop(keep) { cancelAnimationFrame(hold.raf); hold.raf = 0; hold.t0 = 0; hold.id = null; holdLbl.textContent = T.holdLabel; if (!keep) ring(0); }
    function setStep(n) { step = n; s1.setAttribute('data-state', n === 1 ? 'on' : 'done'); s2.setAttribute('data-state', n === 2 ? 'on' : 'off'); holdBtn.disabled = n !== 1; pick.disabled = n !== 2; bask.disabled = n !== 2; }
    function setPicked(v) { picked = !!v; pick.setAttribute('aria-pressed', String(picked)); bask.classList.toggle('on', picked); }
    function tick() {
      if (!hold.t0) return;
      var p = (performance.now() - hold.t0) / HOLD;
      if (p >= 1) { holdStop(true); ring(1); setStep(2); try { pick.focus({ preventScroll: true }); } catch (e) { /* not focusable yet */ } return; }
      ring(p); hold.raf = requestAnimationFrame(tick);
    }
    function holdStart(pid) { if (step !== 1 || hold.t0) return; hold.t0 = performance.now(); hold.id = pid; holdLbl.textContent = T.keepHolding; hold.raf = requestAnimationFrame(tick); }
    function openFor(p) {
      pending = p; opener = doc.activeElement;
      why.textContent = p.link ? T.whyLink(p.name) : T.whyButton(p.name);
      linkBox.hidden = true; holdStop(); drag = null; setPicked(false); setStep(1);
      el.hidden = false; try { holdBtn.focus({ preventScroll: true }); } catch (e) { /* hidden */ }
      if (typeof opts.onOpen === 'function') try { opts.onOpen(p); } catch (e) { /* the page's code must not break the door */ }
    }
    function close(passed) {
      holdStop(); drag = null; setPicked(false); pick.style.transform = ''; pick.classList.remove('drag');
      el.hidden = true; pending = null;
      if (!passed && opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    }
    function pass() {
      openUntil = Date.now() + OPEN;
      var p = pending; pending = null;
      if (typeof opts.onPass === 'function') try { opts.onPass(p); } catch (e) { /* the page's code must not break the door */ }
      if (p && p.link) {
        linkA.href = p.link.href; linkA.textContent = T.openLink(p.name); linkBox.hidden = false; why.textContent = T.opened;
        try { linkA.focus({ preventScroll: true }); } catch (e) { /* hidden */ }
        return;
      }
      close(true);
      if (p && p.button) { try { p.button.click(); } catch (e) { /* gone */ } }
    }
    function nameOf(t) { return typeof opts.nameOf === 'function' ? opts.nameOf(t) : (t.getAttribute('data-door-name') || t.textContent.trim() || t.getAttribute('aria-label') || ''); }
    var offs = [];
    function on(target, type, fn, o) { target.addEventListener(type, fn, o); offs.push(function () { target.removeEventListener(type, fn, o); }); }
    on(linkA, 'click', function () { setTimeout(function () { close(true); }, 0); });
    on(xBtn, 'click', function () { close(false); });
    on(el, 'click', function (e) { if (e.target === el) close(false); });
    on(doc, 'keydown', function (e) {
      if (el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key === 'Tab') {   // keep the focus inside the door
        var f = [holdBtn, pick, bask, linkA, xBtn].filter(function (b) { return b && !b.disabled && b.offsetParent !== null; }), i = f.indexOf(doc.activeElement);
        if (!f.length) return; e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    });
    // Step 1: a held round button. Sliding off, lifting, a cancelled touch, or leaving the page starts it over.
    on(holdBtn, 'pointerdown', function (e) {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try { holdBtn.setPointerCapture(e.pointerId); } catch (er) { /* not capturable */ }
      holdStart(e.pointerId); e.preventDefault();
    });
    on(holdBtn, 'pointermove', function (e) {
      if (hold.id !== e.pointerId) return;
      var r = holdBtn.getBoundingClientRect(), m = 24;
      if (e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m) holdStop();
    });
    function holdEnd(e) { if (hold.id === e.pointerId) holdStop(); }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { on(holdBtn, t, holdEnd); });
    on(holdBtn, 'contextmenu', function (e) { e.preventDefault(); });
    on(holdBtn, 'keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdStart('key'); } });
    on(holdBtn, 'keyup', function (e) { if ((e.key === ' ' || e.key === 'Enter') && hold.id === 'key') holdStop(); });
    on(holdBtn, 'blur', function () { if (hold.id === 'key') holdStop(); });
    on(doc, 'visibilitychange', function () { if (doc.hidden && hold.t0) holdStop(); });
    // Step 2: drag the item to the target, or tap the item and then the target (also from the keyboard).
    on(pick, 'pointerdown', function (e) {
      if (step !== 2 || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try { pick.setPointerCapture(e.pointerId); } catch (er) { /* not capturable */ }
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false }; e.preventDefault();
    });
    on(pick, 'pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved && dx * dx + dy * dy > 64) { drag.moved = true; pick.classList.add('drag'); }
      if (drag.moved) pick.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.12)';
    });
    function dragEnd(e, cancelled) {
      if (!drag || drag.id !== e.pointerId) return;
      var d = drag; drag = null; pick.classList.remove('drag'); pick.style.transform = '';
      if (cancelled) return;
      if (d.moved) { var b = bask.getBoundingClientRect(), m = 10; if (e.clientX >= b.left - m && e.clientX <= b.right + m && e.clientY >= b.top - m && e.clientY <= b.bottom + m) pass(); }
      else setPicked(!picked);
    }
    on(pick, 'pointerup', function (e) { dragEnd(e, false); });
    on(pick, 'pointercancel', function (e) { dragEnd(e, true); });
    on(pick, 'click', function (e) { if (e.detail === 0 && step === 2) setPicked(!picked); });
    on(bask, 'click', function () { if (step === 2 && picked) pass(); });
    // The gate itself: a capture-phase click on a guarded control opens the door instead, unless it was passed lately.
    on(doc, 'click', function (e) {
      if (destroyed || !e.target || !e.target.closest || el.contains(e.target) || isOpen()) return;
      var t = e.target, hit = null;
      while (t && t !== doc) { if (t.nodeType === 1 && matches(t)) { hit = t; break; } t = t.parentNode; }
      if (!hit) return;
      e.preventDefault(); e.stopImmediatePropagation();
      var link = hit.tagName === 'A';
      openFor({ button: link ? null : hit, link: link ? hit : null, name: nameOf(hit) });
    }, true);

    return {
      element: el, options: { holdMs: HOLD, openMs: OPEN },
      isOpen: isOpen, isShown: function () { return !el.hidden; },
      /** Shows the door for a control without waiting for a click (call it from your own code). Returns false when the door is already open, so you can go ahead. */
      ask: function (control) { if (isOpen()) return false; var link = control.tagName === 'A'; openFor({ button: link ? null : control, link: link ? control : null, name: nameOf(control) }); return true; },
      close: function () { close(false); },
      /** Closes the door again right away (forget that it was passed). */
      lock: function () { openUntil = 0; },
      destroy: function () { destroyed = true; holdStop(); offs.forEach(function (f) { f(); }); if (el.parentNode) el.parentNode.removeChild(el); }
    };
  }

  return { attach: attach, DEFAULT_TEXTS: DEFAULT_TEXTS };
}));
