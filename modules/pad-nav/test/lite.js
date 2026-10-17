// Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
// Makes a smaller pad-nav by cutting the hint text and button names, the slider and drop-down support, or both, then proves
// the cut copy still loads and moves a ring. Usage: node test/lite.js [hint] [forms] [--write FILE]   (default: both)
// Every cut is an exact text match, so if pad-nav.js changes and a cut no longer fits, this stops with the name of the cut.
'use strict';
var fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'pad-nav.js'), 'utf8');
var args = process.argv.slice(2), out = null, want = [];
args.forEach(function (a, i) { if (a === '--write') out = args[i + 1]; else if (a === 'hint' || a === 'forms') want.push(a); });
if (!want.length) want = ['forms', 'hint'];
want.sort(function (a, b) { return a === 'forms' ? -1 : b === 'forms' ? 1 : 0; });   // forms first: its last cut ends where the hint cut starts

function between(s, from, to, name) {          // remove from the first `from` up to (not including) `to`
  var a = s.indexOf(from), b = s.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('cut "' + name + '" no longer fits pad-nav.js');
  return s.slice(0, a) + s.slice(b);
}
function swap(s, from, to, name) {
  if (s.split(from).length !== 2) throw new Error('cut "' + name + '" no longer fits pad-nav.js');
  return s.replace(from, function () { return to; });
}
var cuts = {
  forms: function (s) {
    s = between(s, '  /** Pure: decimal places', '  /** Pure: button names for the default hint', 'decimals, rangeNext, nextOption');
    s = swap(s, "    if (this.formControls) {\n      var tag = String(el.tagName).toUpperCase();\n      if (tag === 'INPUT' && String(el.type).toLowerCase() === 'range') { this.enterAdjust(el, now); return; }\n      if (tag === 'SELECT' && !el.multiple) { this.cycleSelect(el); return; }   // select.click() does not open the list in every browser, so cycle instead\n    }\n", '', 'activate: slider and drop-down branch');
    s = between(s, '  PadNav.prototype.enterAdjust', '  // ----- hint -----', 'enterAdjust, exitAdjust, adjustBy, cycleSelect, fire');
    s = swap(s, "        if (this.adjust && !(this.ringEl === this.adjust && this.ringShown(cands))) this.exitAdjust();   // the slider went away\n", '', 'move: slider went away');
    s = swap(s, "        if (this.adjust) { if (k === 'l' || k === 'r') this.adjustBy(this.adjust, k === 'r' ? 1 : -1); }   // up and down do nothing while adjusting\n        else if (!this.ringShown(cands))", "        if (!this.ringShown(cands))", 'move: adjust branch');
    s = swap(s, "        if (this.adjust) this.exitAdjust();\n        else {\n", "        {\n", 'A press: leave adjust');
    s = swap(s, "if (E.b) { if (this.adjust) this.exitAdjust(); else this.hook(this.onBack, 'onBack', scope); }", "if (E.b) this.hook(this.onBack, 'onBack', scope);", 'B press: leave adjust');
    s = swap(s, '    this.exitAdjust();\n    if (this.ringEl) this.ringEl', '    if (this.ringEl) this.ringEl', 'clearRing: leave adjust');
    return s;
  },
  hint: function (s) {
    s = swap(s, "    try {\n      var h = this.hintEl;\n      if (h && h.setAttribute && !(h.getAttribute && h.getAttribute('role'))) h.setAttribute('role', 'status');   // announced politely; the look is unchanged\n    } catch (e) { /* not an element */ }\n    this.setHint(false, '');\n", '', 'constructor: hint element');
    s = between(s, '  /** Pure: button names for the default hint', '  PadNav.clock', 'labelsFor');
    s = between(s, '  // ----- hint -----', '  PadNav.DEFAULT_SELECTOR', 'names, defaultHint, updateHint, setHint');
    s = swap(s, '    this.updateHint(now);\n', '', 'step: updateHint');
    s = swap(s, "  PadNav.DEFAULT_NAMES = { dpad: 'D-pad', a: 'A', b: 'B', start: 'Start' };\n", '', 'DEFAULT_NAMES');
    return s;
  }
};
var lite = src;
want.forEach(function (w) { lite = cuts[w](lite); });

// proof: it loads, finds buttons, wakes the ring and moves it
var mod = { exports: {} };
new Function('module', lite)(mod);   // runs in this process, so the fake document and getComputedStyle below are what it sees
var PadNav = mod.exports;
var kids = [0, 1, 2].map(function (i) {
  var el = { id: 'b' + i, tagName: 'BUTTON', cls: {}, classList: { add: function (c) { el.cls[c] = 1; }, remove: function (c) { delete el.cls[c]; } },
    matches: function () { return false; }, getAttribute: function () { return null; }, closest: function () { return null; }, getClientRects: function () { return [1]; },
    getBoundingClientRect: function () { return { left: i * 140, top: 0, width: 80, height: 40 }; }, focus: function () {}, click: function () { el.clicked = 1; } };
  return el;
});
global.document = { activeElement: null, body: { querySelectorAll: function () { return kids; }, clientHeight: 300, scrollTop: 0 }, addEventListener: function () {}, removeEventListener: function () {} };
global.window = { addEventListener: function () {}, removeEventListener: function () {} };
global.getComputedStyle = function () { return { visibility: 'visible' }; };
var pad = { id: 'x', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] }, i;
for (i = 0; i < 17; i++) pad.buttons.push({ pressed: false, value: 0 });
var pn = new PadNav({ getScope: function () { return document.body; }, getPads: function () { return [pad]; } }), T = 0;
function tap(n) { pad.buttons[n].pressed = true; pn.step(T += 16); pad.buttons[n].pressed = false; pn.step(T += 16); }
tap(15); tap(15); T += 1000; tap(0);
if (pn.lastError) console.log("lastError", pn.lastError.message, pn.lastErrorWhere);
var ring = kids.filter(function (k) { return k.cls['pad-focus']; }).map(function (k) { return k.id; }).join();
if (ring !== 'b1' || kids[1].clicked !== 1) { console.log('FAILED: cut copy did not move the ring and press (ring ' + ring + ')'); process.exit(1); }
console.log('cut ' + want.join(' + ') + ': loads, moves the ring right twice (b0 to b1), presses b1. ' + src.length + ' bytes before, ' + lite.length + ' after (not minified).');
if (out) { fs.writeFileSync(out, lite); console.log('wrote ' + out); }
