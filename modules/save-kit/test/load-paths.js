#!/usr/bin/env node
/* save-kit 2.6.0 load paths: plain Node, no packages. Copyright (c) 2026 LFC Foundry. MIT License.
 * Run: node modules/save-kit/test/load-paths.js            (OLD_REF=<commit> picks the reference file, default 2.5.0)
 * Feeds the same random main and backup slots to this save-kit and to the 2.5.0 file and requires the same load() answer: same names (any order),
 * same values, same prototypes (counts maps have none), same `damagedKey` writes. Each load() is done on the
 * same slots four times (from the third on, load() starts from the remembered copy) and the answers must match; changing an answer must not change the next.
 * Schemas: flat numbers like Pineapple Defense, mixed with counts/str/raw, a stamp in the schema, afterValidate hooks (pure and stateful). */
'use strict';
const assert = require('assert'), cp = require('child_process'), path = require('path'), Module = require('module');
// The file under a given user agent: 'Chrome/' turns on the Chromium-only paths (stamp parsed away, counts maps as [names, counts]), 'AppleWebKit' the WebKit ones.
function withUA(ua) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), file = require.resolve('../save-kit.js');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true });
  try { delete require.cache[file]; return require(file); } finally { delete require.cache[file]; if (desc) Object.defineProperty(globalThis, 'navigator', desc); else delete globalThis.navigator; }
}
const UAS = { node: 'Node.js', chromium: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', webkit: 'Mozilla/5.0 (X11; Linux) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' };
let NEW = withUA(UAS.node);
const REF = process.env.OLD_REF || '6a9c3966';
const src = cp.execFileSync('git', ['-C', path.join(__dirname, '..', '..', '..'), 'show', REF + ':modules/save-kit/save-kit.js'], { encoding: 'utf8' });
const m0 = new Module('save-kit-ref'); m0._compile(src, path.join(__dirname, 'save-kit-ref.js'));   // same realm, so inherited values compare equal
const OLD = m0.exports;
const mem = (init) => { const m = Object.assign({}, init); return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
// Same names in any order, same values, same prototype kind at every level (objects from another realm compare by kind).
function canon(v) {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && Object.is(v, -0) ? '-0' : v;
  if (Array.isArray(v)) return ['A', v.map(canon)];
  const p = Object.getPrototypeOf(v), kind = p === null ? 'null' : 'obj', o = {};
  for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
  return [kind, o];
}
let seed = 2026; const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(r() * a.length)];
const vals = [0, 1, 2, 3, 5.7, 98, 99, 100, 1e300, 2 ** 60, -3, -0, null, 'x', 'abcdefg', '', true, false, [], [1, 2], {}, { a: 1 }, { a: -1 }, { b: 2, c: 3 }, 0.5];
const S = {
  flat: { schema: { stage: 'int:5', wave: 'int:8', golden: 'int:9999', cheer: 'int:100', bank: 'int:999999', tr: 'int:1', sk: 'int:3', wl: 'int:1', dg: 'int:1', bs1: 'int:9999', x: 'num', y: 'num' }, defaults: { stage: 1, cheer: 100, sk: 2, wl: 1, dg: 1, x: 0 } },
  mixed: { schema: { score: 'num', level: 'int:99', sound: 'flag', name: 'str:5', owned: { type: 'counts', max: 20 }, opts: 'raw', any: 'int', toString: 'num', z1: 'num', z2: 'num' }, defaults: { sound: 1, name: 'P', owned: { a: 2 }, opts: { q: 1 } } },
  stamped: { schema: { a: 'num', b: 'int:9', seen: 'num', c: 'flag', d: 'num', e: 'num', f: 'num', g: 'num', h: 'num' }, defaults: { b: 1 } },
  sound: { schema: { a: 'num', b: 'int:9', c: 'num', d: 'num', e: 'num', f: 'num', g: 'num', h: 'num', i: 'num' }, defaults: {}, soundKeys: ['a', 'extra', 'seen'] },
  custom: { schema: { a: 'num', b: 'int', c: 'num', d: 'num', e: 'num', f: 'num', g: 'num', h: 'num', i: 'num' }, defaults: { a: 1 }, stamp: 'savedAt' },
};
const names = s => Object.keys(s.schema).concat(['seen', 'savedAt', 'extra', 'v']);
function slot(s) {
  const roll = r();
  if (roll < 0.04) return 'not json';
  if (roll < 0.06) return '[1]';
  const x = {}, ks = names(s);
  if (r() < 0.5) { for (const f of Object.keys(s.schema)) if (r() < 0.9) x[f] = r() < 0.7 ? pick([0, 1, 2, 3, 1, 0, 5, 98]) : pick(vals); }
  else for (const f of ks) if (r() < 0.6) x[f] = pick(vals);
  if (r() < 0.05) Object.defineProperty(x, '__proto__', { value: { polluted: 1 }, enumerable: true });
  if (r() < 0.6) x[s.stamp || 'seen'] = pick([1795365984475, 1795365984475, 0, 12, -1, 1.5]);
  let t = JSON.stringify(x);
  if (r() < 0.05) t = t.replace(/,"(seen|savedAt)":(\d+)\}$/, ',"$1":0$2}');   // a leading zero: not JSON
  if (r() < 0.03) t = t.replace(/\}$/, ' }');
  return t;
}
const hooks = {
  none: null,
  pure: (c, raw) => { c.hooked = raw && typeof raw.a === 'number' ? raw.a : -1; },
  replace: (c) => Object.assign({}, c, { rep: 1 }),
  refuseOdd: (c, raw) => (raw && raw.b === 1 ? false : undefined),
};
let cases = 0, second = 0;
for (const ua of Object.keys(UAS)) { NEW = withUA(UAS[ua]);
for (const sname of Object.keys(S)) for (const hname of Object.keys(hooks)) {
  const s = S[sname];
  for (let i = 0; i < 1500; i++) {
    const init = {}; if (r() < 0.92) init.g = slot(s); if (r() < 0.6) init['g-backup'] = slot(s);
    const o = Object.assign({ key: 'g', damagedKey: r() < 0.3 ? 'g-dmg' : '' }, s); if (hooks[hname]) o.afterValidate = hooks[hname];
    const sa = mem(init), sb = mem(init);
    const ka = OLD.create(Object.assign({}, o, { storage: sa })), kb = NEW.create(Object.assign({}, o, { storage: sb }));
    const a = ka.load(), b = kb.load();
    const msg = ua + '/' + sname + '/' + hname + ' slots ' + JSON.stringify(init);
    assert.deepStrictEqual(canon(b), canon(a), msg);
    assert.deepStrictEqual(sb.m, sa.m, 'storage writes ' + msg);
    if (b && typeof b === 'object') { b.stage = 777; b.score = -5; if (b.owned) b.owned.zz = 3; if (b.opts && typeof b.opts === 'object') b.opts.mut = 1; }
    const a2 = ka.load(), b2 = kb.load();
    assert.deepStrictEqual(canon(b2), canon(a2), 'second load ' + msg);
    assert.deepStrictEqual(sb.m, sa.m, 'storage writes after second load ' + msg);
    if (b2 && typeof b2 === 'object') { b2.stage = 778; b2.extra2 = 1; if (b2.owned) b2.owned.yy = 4; }
    for (let rep = 0; rep < 2; rep++) {   // the third and fourth loads start from the remembered copy
      const a3 = ka.load(), b3 = kb.load();
      assert.deepStrictEqual(canon(b3), canon(a3), 'load ' + (rep + 3) + ' ' + msg);
      assert.deepStrictEqual(sb.m, sa.m, 'storage writes after load ' + (rep + 3) + ' ' + msg);
      if (b3 && typeof b3 === 'object') { b3.stage = 779; if (b3.opts && typeof b3.opts === 'object') b3.opts.mut2 = 1; }
    }
    cases++; if (b2) second++;
  }
}
}
// A stateful hook is asked again on every load (it may answer differently now).
{
  let cap = 100; const o = { key: 'g', schema: { score: 'num' }, afterValidate: c => { c.score = Math.min(c.score, cap); } };
  const st = mem({ g: '{"score":500}' }), k = NEW.create(Object.assign({ storage: st }, o));
  assert.strictEqual(k.load().score, 100); assert.strictEqual(k.load().score, 100); cap = 42; assert.strictEqual(k.load().score, 42);
  let refuse = false; const k2 = NEW.create({ key: 'g', schema: { score: 'num' }, storage: mem({ g: '{"score":5}', 'g-backup': '{"score":7}' }), afterValidate: () => (refuse ? false : undefined) });
  assert.strictEqual(k2.load().score, 5); assert.strictEqual(k2.load().score, 5); refuse = true; assert.strictEqual(k2.load(), null);
}
NEW = withUA(UAS.chromium);
// recover() compares against the stamp of the save load() used, also when the stamp was parsed away.
{
  const st = mem({ g: '{"a":1,"b":2,"c":1,"d":1,"e":1,"f":1,"g":1,"h":1,"i":1,"seen":1795365984475}' });
  const k = NEW.create({ key: 'g', schema: S.sound.schema, storage: st });
  const x = k.load(); assert.strictEqual(x.seen, undefined); assert.strictEqual(Object.keys(x).length, 9);
  assert.strictEqual(NEW.create({ key: 'g', schema: Object.assign({ seen: 'num' }, S.sound.schema), storage: st }).load().seen, 1795365984475);
}
console.log('save-kit load paths: ' + cases + ' random slot pairs (Node, Chromium and WebKit user agents) x 4 loads match 2.5.0 (' + second + ' second loads gave a state); hooks re-run; stamp kept for recover');
