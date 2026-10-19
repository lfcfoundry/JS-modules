/* Copyright (c) 2026 LFC Foundry. MIT License. The twin test: proves a WebAssembly path and its plain-JavaScript twin give identical answers, to the last bit.
     const { twin, same } = require('./tools/test-runner/twin.js');
     const r = twin(cases, (c) => jsVersion(c), (c) => wasmVersion(c));          // r = { tried, differing, names: [...] }
   `same(a, b)` compares numbers by their bits (so 0 and -0 differ, NaN equals NaN), typed arrays and arrays item by item, and objects key by key.
   `twinSource` is the same code as text, to put in a page: new Function(twinSource + '; return twin;')(). */
'use strict';
function same(a, b) {
  if (a === b) return typeof a !== 'number' || a !== 0 || 1 / a === 1 / b;   // 0 and -0 are different answers
  if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;   // NaN with NaN
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(b) || !ArrayBuffer.isView(a) || a.constructor !== b.constructor || a.length !== b.length) return false;
    if (a instanceof Float64Array || a instanceof Float32Array) { for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
  const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !same(a[k], b[k])) return false;
  return true;
}
/** cases: array of inputs, or [{ name, input }]. Each side is run on its own copy: structuredClone when the input allows it. Throws inside a side count as a difference unless both throw. */
function twin(cases, jsSide, wasmSide) {
  const names = []; let tried = 0;
  cases.forEach((c, i) => {
    const name = c && c.name !== undefined ? c.name : '#' + i, input = c && c.name !== undefined && 'input' in c ? c.input : c, copy = (x) => { try { return structuredClone(x); } catch (e) { return x; } };
    let a, b, ea = null, eb = null; tried++;
    try { a = jsSide(copy(input)); } catch (e) { ea = e; } try { b = wasmSide(copy(input)); } catch (e) { eb = e; }
    if (ea || eb) { if (!(ea && eb)) names.push(name + (ea ? ' (JS threw: ' + ea.message + ')' : ' (wasm threw: ' + eb.message + ')')); return; }
    if (!same(a, b)) names.push(name);
  });
  return { tried, differing: names.length, names };
}
const twinSource = same.toString() + '\n' + twin.toString();
module.exports = { same, twin, twinSource };
