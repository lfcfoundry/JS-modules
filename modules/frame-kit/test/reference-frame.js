'use strict';
/* NOTE: this copy lives in JS-modules as the reference for test/lean.js. The code below the header is Fancy Banana's, unchanged. */
/* Fancy Banana's even-frame-steps and quality-governor code, copied VERBATIM from game.js (build 2026.10.17.0249) so a JS-modules change can be tested
   for identical answers on the same frame-time series. Only this header, stub game state and module.exports are added.
   Stubs: state ('play'), document.hidden (false), save options (opt('saver') = 0), toast (records messages), fxMax / ART.lite / resize / render (recorded in `log`).
   Copyright (c) 2026 LFC Foundry. MIT licensed. Use: const F = require('./reference-frame.js'); F.reset(); F.evenDt(ms) -> ms; F.govStep(ri, t) changes F.get() = { qLvl, dprMax, lite, fxMax, log }. */
var state = 'play', document = { hidden: false }, log = [], fxMax = 70, ART = { lite: false }, saverOn = 0, hints = [];
function opt(k) { return k === 'saver' ? saverOn : 0; }
function toast(msg) { hints.push(msg); }
function resize() { log.push('resize'); } function render() { log.push('render'); } function logError(w, e) { log.push('error ' + w); }
var edGaps = [], edPer = 0, edDrift = 0;
function evenDt(ri) {
  if (!(ri > 2 && ri < 60)) return ri > 0 ? ri : 0;
  edGaps.push(ri); if (edGaps.length > 40) edGaps.shift();
  if (edGaps.length < 12) return ri;
  if (edGaps.length % 8 === 0 || !edPer) { var q = edGaps.slice().sort(function (a, b) { return a - b; }); edPer = q[q.length >> 1]; }
  var n = Math.round(ri / edPer), snap = n * edPer;
  if (n < 1 || n > 3 || Math.abs(ri - snap) > edPer * .3) { edDrift = 0; return ri; }
  edDrift += ri - snap; var pay = edDrift * .04; edDrift -= pay;
  return snap + pay;
}
var qLvl = 0, qEma = 16.7, qSlow = 0, qFast = 0, qAt = 0, qHint = false, dprMax = 2, govOn = true;
function qApply() {
  fxMax = qLvl >= 1 ? 36 : 70; ART.lite = qLvl >= 2; var d = qLvl >= 4 ? 1 : qLvl >= 3 ? 1.5 : 2;
  if (d !== dprMax) { dprMax = d; try { resize(); render(); } catch (e) { logError('render', e); } }
}
function govStep(ri, t) {
  if (!govOn) return;
  if (document.hidden || (state !== 'play' && state !== 'mini') || ri > 100 || ri <= 0) { qSlow = 0; return; }
  qEma += (ri - qEma) * 0.06;
  if (qEma > 22) { qSlow++; qFast = 0; } else { qSlow = 0; if (qEma < 18.5) qFast += ri; else qFast = 0; }
  if (qSlow >= 100 && qLvl < 4 && t - qAt > 3000) { qLvl++; qAt = t; qSlow = 0; qEma = 16.7; qApply(); if (qLvl >= 2 && !qHint && !opt('saver')) { qHint = true; toast('This screen is working hard. Settings has a Battery saver that makes it lighter.', 5000); } }
  else if (qFast > 10000 && qLvl > 0 && t - qAt > 10000) { qLvl--; qAt = t; qFast = 0; qApply(); }
}
function reset() { edGaps = []; edPer = 0; edDrift = 0; qLvl = 0; qEma = 16.7; qSlow = 0; qFast = 0; qAt = 0; qHint = false; dprMax = 2; govOn = true; state = 'play'; document.hidden = false; log = []; hints = []; fxMax = 70; ART.lite = false; saverOn = 0; }
module.exports = { evenDt: evenDt, govStep: govStep, reset: reset, setState: function (s) { state = s; }, setHidden: function (h) { document.hidden = h; }, get: function () { return { qLvl: qLvl, dprMax: dprMax, lite: ART.lite, fxMax: fxMax, log: log.slice(), hints: hints.slice() }; } };
