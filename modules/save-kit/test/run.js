#!/usr/bin/env node
/* save-kit checks. Plain Node (18+), no packages, no browser. Copyright (c) 2026 LFC Foundry. MIT License.
 * Run:  node modules/save-kit/test/run.js          (exit code 1 on any failure)
 *
 * "Regression" checks are defects measured in the audit of 2026-10-15. Each one must pass on the current save-kit.js and, when git can
 * show the version from before the fixes, must FAIL on that old file (proof that the check really catches the defect).
 * The old version is read with `git show <ref>:modules/save-kit/save-kit.js`; set OLD_REF to another commit or tag, or OLD_REF=none to skip.
 */
'use strict';
const assert = require('assert'), path = require('path'), cp = require('child_process'), zlib = require('zlib');
const S = require('../save-kit.js');

// ---- load the old file, if git can show it -------------------------------------------------------------------------------------------
const OLD_REF = process.env.OLD_REF || '4271ecb28a068f29d6e0dec43ee92f3b87ced050';
let OLD = null;
if (OLD_REF !== 'none') {
  try {
    const repo = path.resolve(__dirname, '..', '..', '..');
    const src = cp.execFileSync('git', ['-C', repo, 'show', OLD_REF + ':modules/save-kit/save-kit.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = { exports: {} };
    new Function('module', src)(m);
    OLD = m.exports;
    if (typeof OLD.create !== 'function') OLD = null;
  } catch (e) { OLD = null; }
}

let pass = 0, fail = 0, caught = 0, oldTried = 0;
async function test(name, fn) {
  try { await fn(S); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}
// A regression check: passes on the new file; must fail on the old one.
async function regress(name, fn) {
  let ok = true;
  try { await fn(S); } catch (e) { ok = false; fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
  if (!ok) return;
  if (!OLD) { pass++; console.log('  ok   ' + name + '   (old file not available, so not compared)'); return; }
  oldTried++;
  let oldFailed = false;
  try { await fn(OLD); } catch (e) { oldFailed = true; }
  if (oldFailed) { pass++; caught++; console.log('  ok   ' + name + '   (fails on the old file, as it should)'); }
  else { fail++; console.log('  FAIL ' + name + '\n       the check also passes on the old file, so it does not catch the defect'); }
}

const mem = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, _d: d }; };
const schema = { score: 'num', level: 'int:9', sound: 'flag', name: 'str:20', owned: 'counts' };
const b64url = buf => Buffer.from(buf).toString('base64url');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const codeOf = (K, prefix, bytes) => { const d = b64url(bytes); return prefix + 'z.' + d + '.' + K.checksum(d); };

// Counts how many bytes the unpacker pulls out of DecompressionStream, so a test can see that a bomb was cut early.
function countUnpacked(counter) {
  const Real = globalThis.DecompressionStream;
  globalThis.DecompressionStream = function (fmt) {
    const real = new Real(fmt);
    const tap = new TransformStream({ transform(chunk, c) { counter.n += chunk.length; c.enqueue(chunk); } });
    return { writable: real.writable, readable: real.readable.pipeThrough(tap) };
  };
  return () => { globalThis.DecompressionStream = Real; };
}

(async () => {
  console.log('save-kit (node)' + (OLD ? '   [old file for comparison: ' + OLD_REF.slice(0, 8) + ']' : '   [no old file for comparison]'));

  // ---------- 1. pasted codes: size limits ----------
  await regress('a 1000:1 deflate bomb is refused and cut off early', async K => {
    const json = Buffer.from('{"score":1,"pad":"' + 'a'.repeat(50e6) + '"}');
    const bomb = zlib.deflateRawSync(json, { level: 9 });
    assert.ok(bomb.length < 150000 && b64url(bomb).length < 350000, 'the bomb must fit under the text limit: ' + b64url(bomb).length);
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' });
    const seen = { n: 0 }, undo = countUnpacked(seen);
    try {
      await assert.rejects(k.importCode(codeOf(K, 'GM1', bomb)), /too big/);
    } finally { undo(); }
    assert.ok(seen.n < 4 * 1024 * 1024, 'unpacked ' + seen.n + ' bytes before giving up');
  });
  await regress('pasted text over the length limit is refused before any work', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' });
    await assert.rejects(k.importCode('GM1p.' + 'A'.repeat(400000) + '.0000000'), /too big/);
    await assert.rejects(k.importCode(' '.repeat(400000)), /too big/);
  });
  await test('limits can be changed: maxCodeBytes and maxCodeChars', async K => {
    const json = Buffer.from('{"score":4,"pad":"' + 'a'.repeat(3e6) + '"}');   // 3 MB unpacked, small code
    const code = codeOf(K, 'GM1', zlib.deflateRawSync(json));
    await assert.rejects(K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' }).importCode(code), /too big/);
    const roomy = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1', maxCodeBytes: 8e6 });
    assert.strictEqual((await roomy.importCode(code)).score, 4);
    const tight = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1', maxCodeChars: 30 });
    const small = await K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' }).exportCode({ score: 1 });
    await assert.rejects(tight.importCode(small), /too big/);
    const tinyBytes = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1', maxCodeBytes: 20 });
    await assert.rejects(tinyBytes.importCode(await K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' }).exportCode({ score: 1, name: 'a longer name than twenty bytes' })), /too big/);
  });
  await test('a plain (p) code over the byte limit is refused too', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1', maxCodeBytes: 50 });
    const d = b64url(Buffer.from('{"score":1,"name":"' + 'x'.repeat(100) + '"}'));
    await assert.rejects(k.importCode('GM1p.' + d + '.' + K.checksum(d)), /too big/);
  });
  await test('exportCode refuses a save bigger than the limit (so it never makes a code it would not open)', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1', maxCodeBytes: 60 });
    await assert.rejects(k.exportCode({ score: 1, name: 'x'.repeat(100), owned: {} }), /too big/);
  });
  await test('a damaged or cut-off squeezed code is "damaged" or "not complete", never a hang or a throw', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' });
    const good = zlib.deflateRawSync(Buffer.from(JSON.stringify({ score: 5, name: 'x'.repeat(300) })));
    await assert.rejects(k.importCode(codeOf(K, 'GM1', good.subarray(0, good.length - 6))), /damaged/);
    await assert.rejects(k.importCode(codeOf(K, 'GM1', Buffer.from('this is not deflate data at all'))), /damaged/);
    const code = codeOf(K, 'GM1', good);
    assert.strictEqual((await k.importCode(code)).score, 5);
  });

  // ---------- 2. storage lookup ----------
  await regress('create() survives a localStorage that throws when touched', async K => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: storage is blocked'); } });
    try {
      const k = K.create({ key: 'g', schema });
      assert.strictEqual(k.load(), null); assert.strictEqual(k.save({ score: 1 }), false);
      assert.strictEqual(k.stageImport({ score: 1 }), false);
    } finally { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; }
  });

  // ---------- 3. load, save, autosave ----------
  await regress('load() salvages a slot with one bad number instead of returning null', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, defaults: { score: 0, level: 1 }, storage: st });
    st.setItem('g', JSON.stringify({ score: null, level: 4, name: 'Zed', owned: { a: 2 } }));
    const s = k.load();
    assert.ok(s, 'got null');
    assert.strictEqual(s.level, 4); assert.strictEqual(s.name, 'Zed'); assert.strictEqual(s.score, 0); assert.strictEqual(s.owned.a, 2);
  });
  await regress('load() with both slots bad rebuilds from the better one', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, defaults: { score: 0, level: 1 }, storage: st });
    st.setItem('g', JSON.stringify({ score: null, level: null, name: 'main' }));        // two bad numbers
    st.setItem('g-backup', JSON.stringify({ score: -3, level: 6, name: 'backup' }));    // one bad number
    assert.strictEqual(k.load().name, 'backup'); assert.strictEqual(k.load().level, 6);
    st.setItem('g', JSON.stringify({ score: null, level: 5, name: 'main' }));           // tie: main wins
    assert.strictEqual(k.load().name, 'main');
  });
  await test('load() still prefers a sound backup over a damaged main slot, and returns null for nothing', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, storage: st });
    assert.strictEqual(k.load(), null);
    st.setItem('g', '{broken'); assert.strictEqual(k.load(), null);
    st.setItem('g-backup', JSON.stringify({ score: 9 })); assert.strictEqual(k.load().score, 9);
    st.setItem('g', JSON.stringify([1, 2])); assert.strictEqual(k.load().score, 9);
  });
  await regress('flag keeps its default when the field is missing', async K => {
    const sc = { sound: 'flag', music: 'flag' }, def = { sound: 1, music: 0 };
    const v = K.validate(sc, def, {});
    assert.strictEqual(v.sound, 1); assert.strictEqual(v.music, 0);
    const st = mem(), k = K.create({ key: 'g', schema: sc, defaults: def, storage: st });
    st.setItem('g', JSON.stringify({ music: 1 }));                    // an old save from before "sound" existed
    assert.strictEqual(k.load().sound, 1); assert.strictEqual(k.load().music, 1);
    assert.strictEqual(K.validate(sc, def, { sound: 0 }).sound, 0);   // a real 0 stays 0
    assert.strictEqual(K.validate(sc, def, { sound: 1 }).sound, 1);
  });
  await regress('a broken number inside counts is refused on save', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, storage: st });
    assert.strictEqual(k.save({ score: 1, owned: { a: 2 } }), true);
    assert.strictEqual(k.save({ score: 1, owned: { a: NaN } }), false);
    assert.strictEqual(k.save({ score: 1, owned: { a: -4 } }), false);
    assert.strictEqual(k.save({ score: 1, owned: { a: Infinity } }), false);
    assert.strictEqual(JSON.parse(st._d.g).owned.a, 2);
  });
  await test('a stored counts value that came back as null does not cost the other counts', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, storage: st });
    st.setItem('g', '{"score":3,"owned":{"a":null,"b":3}}');
    const s = k.load(); assert.strictEqual(s.score, 3); assert.strictEqual(s.owned.b, 3); assert.strictEqual(s.owned.a, undefined);
  });
  await regress('save(null) and exportCode(null) do not throw', async K => {
    const k = K.create({ key: 'g', schema, storage: mem() });
    assert.strictEqual(k.save(null), false); assert.strictEqual(k.save(undefined), false); assert.strictEqual(k.save('x'), false); assert.strictEqual(k.save([1]), false);
    let p; assert.doesNotThrow(() => { p = k.exportCode(null); });
    await assert.rejects(p, /nothing to make/);
  });
  await regress('a getState() that throws does not crash the autosave timer', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, storage: st, backupEveryMs: 0 });
    let err = null, calls = 0;
    const onErr = e => { err = e; };
    process.on('uncaughtException', onErr);
    const stop = k.autosave(() => { calls++; if (calls < 3) throw new Error('game bug'); return { score: 5 }; }, 5);
    await sleep(80); stop(); await sleep(10);
    process.removeListener('uncaughtException', onErr);
    assert.strictEqual(err, null); assert.ok(calls >= 3);
    assert.strictEqual(JSON.parse(st._d.g).score, 5);   // it kept going and saved once the state was fine
  });
  await regress('main write OK but backup write full: save() returns true, and the backup is retried', async K => {
    const st = mem(); let full = true;
    const store = { getItem: st.getItem, setItem(k, v) { if (full && /-backup$/.test(k)) throw new Error('QuotaExceededError'); st.setItem(k, v); } };
    const k = K.create({ key: 'g', schema, storage: store });
    assert.strictEqual(k.save({ score: 1 }), true); assert.strictEqual(JSON.parse(st._d.g).score, 1); assert.ok(!('g-backup' in st._d));
    full = false;
    assert.strictEqual(k.save({ score: 2 }), true); assert.strictEqual(JSON.parse(st._d['g-backup']).score, 2);
    const k2 = K.create({ key: 'h', schema, storage: { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } } });
    assert.strictEqual(k2.save({ score: 1 }), false);   // main write failing is still false
  });
  await test('exportCode refuses a state with a broken number; JSON that cannot be written is a rejection, not a throw', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' });
    await assert.rejects(k.exportCode({ score: NaN }), /broken/);
    const loop = { score: 1 }; loop.me = loop;
    await assert.rejects(k.exportCode(loop), /could not/);
    await assert.rejects(k.importCode({ toString() { throw new Error('x'); } }), /damaged/);
  });

  // ---------- 4. code form ----------
  await regress('the shorter code form is used (small saves stay plain)', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' });
    const small = await k.exportCode({ score: 1 });
    assert.strictEqual(small[3], 'p', small);
    const bigState = { score: 1, owned: {} }; for (let i = 0; i < 80; i++) bigState.owned['item' + i] = i + 1;
    const big = await k.exportCode(bigState);
    assert.strictEqual(big[3], 'z', 'a larger save should be squeezed');
    const plainLen = b64url(Buffer.from(JSON.stringify(Object.assign({}, bigState, { seen: Date.now() })))).length;
    assert.ok(big.split('.')[1].length < plainLen, 'squeezed form must be shorter than plain');
    assert.strictEqual((await k.importCode(small)).score, 1);
    assert.strictEqual((await k.importCode(big)).owned.item79, 80);
  });
  await test('native base64 is used when the browser has it, gives the same text as the loops, and a throwing native method falls back', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' });
    const st = { score: 7.25, name: 'Ann', owned: { x: 3 } }, loopCode = await k.exportCode(Object.assign({}, st));
    const bigState = { score: 1, owned: {} }; for (let i = 0; i < 80; i++) bigState.owned['i' + i] = i + 1;
    const bytes = Buffer.from('some bytes \xff\xfe?>~ to encode');
    const loopB64 = K.toBase64Url(new Uint8Array(bytes));
    const calls = { to: 0, from: 0 }, hadFrom = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64'), hadTo = Object.getOwnPropertyDescriptor(Uint8Array.prototype, 'toBase64');
    Object.defineProperty(Uint8Array.prototype, 'toBase64', { configurable: true, writable: true, value(o) { calls.to++; assert.strictEqual(o.alphabet, 'base64url'); let s = Buffer.from(this).toString('base64url'); while (s.length % 4) s += '='; return s; } });
    Object.defineProperty(Uint8Array, 'fromBase64', { configurable: true, writable: true, value(t, o) { calls.from++; assert.strictEqual(o.alphabet, 'base64url'); return new Uint8Array(Buffer.from(t, 'base64url')); } });
    try {
      assert.strictEqual(K.toBase64Url(new Uint8Array(bytes)), loopB64);                       // padding removed by hand
      assert.deepStrictEqual(Array.from(K.fromBase64Url(loopB64)), Array.from(bytes));
      const nativeCode = await k.exportCode(Object.assign({}, st));
      assert.ok(calls.to > 0);
      const strip = c => c.replace(/\.[0-9a-z]{7}$/, '');
      assert.ok(nativeCode.split('.')[2], 'has a check');
      assert.strictEqual((await k.importCode(nativeCode)).score, 7.25);
      assert.strictEqual((await k.importCode(loopCode)).owned.x, 3);                           // a code made without native base64 still opens
      assert.ok(calls.from > 0);
      assert.strictEqual(strip(nativeCode).slice(0, 4), strip(loopCode).slice(0, 4));
    } finally {
      if (hadFrom) Object.defineProperty(Uint8Array, 'fromBase64', hadFrom); else delete Uint8Array.fromBase64;
      if (hadTo) Object.defineProperty(Uint8Array.prototype, 'toBase64', hadTo); else delete Uint8Array.prototype.toBase64;
    }
    // a native method that throws falls back to the loops
    Object.defineProperty(Uint8Array.prototype, 'toBase64', { configurable: true, writable: true, value() { throw new Error('nope'); } });
    Object.defineProperty(Uint8Array, 'fromBase64', { configurable: true, writable: true, value() { throw new Error('nope'); } });
    try { assert.strictEqual(K.toBase64Url(new Uint8Array(bytes)), loopB64); assert.deepStrictEqual(Array.from(K.fromBase64Url(loopB64)), Array.from(bytes)); }
    finally { delete Uint8Array.fromBase64; delete Uint8Array.prototype.toBase64; }
  });
  await regress('a prefix with regular-expression characters works', async K => {
    for (const prefix of ['A+1', 'A(1', 'A.1', 'A[1', 'A*1']) {
      const k = K.create({ key: 'g', schema, storage: mem(), prefix });
      const code = await k.exportCode({ score: 3 });
      assert.strictEqual((await k.importCode('see ' + code + ' ok')).score, 3, prefix);
      await assert.rejects(k.importCode('AX1p.AAAA.0000000'), /not a save code|not complete/);
    }
    // 'A.1' must not accept 'AX1' as its own prefix
    const dot = K.create({ key: 'g', schema, storage: mem(), prefix: 'A.1' });
    await assert.rejects(dot.importCode('AX1p.' + 'eyJzY29yZSI6MX0' + '.' + K.checksum('eyJzY29yZSI6MX0')), /not a save code/);
  });

  // ---------- 5. smaller things ----------
  await regress('counts keeps at most maxKeys names (default 1000)', async K => {
    const many = {}; for (let i = 0; i < 5000; i++) many['k' + i] = 1;
    assert.strictEqual(Object.keys(K.validate({ o: 'counts' }, {}, { o: many }).o).length, 1000);
    assert.strictEqual(Object.keys(K.validate({ o: { type: 'counts', maxKeys: 3 } }, {}, { o: many }).o).length, 3);
    assert.strictEqual(Object.keys(K.validate({ o: { type: 'counts', max: 5, maxKeys: 5000 } }, {}, { o: many }).o).length, 5000);
  });
  await regress('raw fields drop __proto__, constructor and prototype keys, at any depth', async K => {
    const input = JSON.parse('{"r":{"__proto__":{"x":1},"b":2,"constructor":3,"inner":[{"prototype":1,"ok":4}],"deep":{"__proto__":5,"keep":6}}}');
    const r = K.validate({ r: 'raw' }, {}, input).r;
    assert.deepStrictEqual(Object.keys(r).sort(), ['b', 'deep', 'inner']);
    assert.deepStrictEqual(Object.keys(r.inner[0]), ['ok']); assert.deepStrictEqual(Object.keys(r.deep), ['keep']);
    assert.strictEqual(Object.getPrototypeOf(r), Object.prototype);
    assert.strictEqual({}.x, undefined);
  });
  await test('raw fields: absurdly deep data falls back to the default', async K => {
    let deep = 'end'; for (let i = 0; i < 60; i++) deep = { d: deep };
    assert.strictEqual(K.validate({ r: 'raw' }, { r: 'dflt' }, { r: deep }).r, 'dflt');
    assert.deepStrictEqual(K.validate({ r: 'raw' }, {}, { r: { a: [1, { b: 2 }] } }).r, { a: [1, { b: 2 }] });
  });
  await test('counts objects have no prototype; SaveKit.has() is the safe way to ask', async K => {
    const v = K.validate({ o: 'counts' }, {}, { o: { a: 2 } }).o;
    assert.strictEqual(Object.getPrototypeOf(v), null); assert.strictEqual(typeof v.hasOwnProperty, 'undefined');
    assert.strictEqual(K.has(v, 'a'), true); assert.strictEqual(K.has(v, 'b'), false); assert.strictEqual(K.has({}, 'toString'), false);
  });
  await test('`seen` is stamped on save, written to storage, and dropped on load unless the schema lists it', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, storage: st }), state = { score: 1 };
    k.save(state);
    assert.strictEqual(typeof state.seen, 'number'); assert.strictEqual(typeof JSON.parse(st._d.g).seen, 'number');
    assert.ok(!('seen' in k.load()));
    const k2 = K.create({ key: 'g', schema: Object.assign({ seen: 'num' }, schema), storage: st });
    assert.strictEqual(k2.load().seen, state.seen);
  });
  await test('a frozen state does not make save() throw', async K => {
    const k = K.create({ key: 'g', schema, storage: mem() });
    assert.doesNotThrow(() => k.save(Object.freeze({ score: 1 })));
  });

  // ---------- 6. old saves and old codes still open ----------
  await test('an old saved slot and old pasted codes (made by the earlier version) still load', async K => {
    const sc = { score: 'num', level: 'int:9', sound: 'flag', name: 'str:20', owned: 'counts' };
    const st = mem(), k = K.create({ key: 'g', schema: sc, defaults: { sound: 1 }, storage: st, prefix: 'GM1' });
    st.setItem('g', '{"score":12.5,"level":3,"sound":1,"name":"Ann","owned":{"apple":3,"pear":7},"seen":1792109721940}');
    const s = k.load();
    assert.strictEqual(s.score, 12.5); assert.strictEqual(s.level, 3); assert.strictEqual(s.name, 'Ann'); assert.strictEqual(s.owned.pear, 7);
    // made by the old exporter (squeezed forms)
    const oldZ1 = 'GM1z.Hco7CoAwEAXAu7x6kcQPMdt5lKCvi5tgUAvx7oJTz4O2loNQ33eTIPNihg6CVk7boF5gaScUixkE5TZu0Aep1sx_VqYDGl5BIw3qQ-y9iyGOzs3vBw.0wkrkmr';
    const a = await k.importCode('my code:\n' + oldZ1.slice(0, 25) + '\n' + oldZ1.slice(25) + ' thanks');
    assert.strictEqual(a.score, 12.5); assert.strictEqual(a.owned.apple, 3);
    const oldZ2 = 'GM1z.NdI7bsMwEIThu0ytgvuSxClzkyRWEcCWgDiPIvDdA1mj7m_ID0vuH-7v2-cC2oDr8rNcQR9w377XC9gGrK-3BcTL9oYB2--6XMA_fHwtt_Y8s5c9z-zlYBwVYB6VYB1V4HjUCE5HTeB81Az2ozpoTVfvyskYaILMQRNlAZowS9DEWYEm0EbQRNoEmlCbQRNrHXS53kCX6_t854AOulwP0OV6gi7XC3S5PoIu1yfQ5foMulzvYMiNBobcMDDkxv6y59MGGHIjwZAbBYbcGMGQGxMYcmMGQ250MOVmA1NuGphy08GUm_ufnp-aYMrNAlNujmDKzQlMuTmDKTc7WHKrgSW3DCy55WDJrQBLbu3bdK5TgSW3RrDk1gSW3JrBklsdHNtjwH1Z1n0dulvrU8_W_fEP.02c63fj';
    const b = await k.importCode(oldZ2); assert.strictEqual(b.name, 'Bob'); assert.strictEqual(b.owned.item59, 60);
    const plainJson = '{"score":4,"level":2,"name":"Cy","owned":{"z":1}}', d = b64url(Buffer.from(plainJson));
    const c = await k.importCode('GM1p.' + d + '.' + K.checksum(d));
    assert.strictEqual(c.score, 4); assert.strictEqual(c.sound, 1); assert.strictEqual(c.owned.z, 1);   // the missing flag takes its default
    // the other things the first version promised
    assert.strictEqual(K.validate({ f: 'flag' }, {}, { f: 7 }).f, 0);
    await assert.rejects(k.importCode('hello'), /not a save code/);
    await assert.rejects(k.importCode(oldZ1.slice(0, oldZ1.length - 6)), /not complete|damaged/);
  });

  const extra = OLD ? '; the old file was caught by ' + caught + ' of ' + oldTried + ' regression checks' : '; old file not available for comparison';
  console.log('save-kit: ' + pass + ' passed, ' + fail + ' failed' + extra);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('save-kit: crashed: ' + (e && e.stack || e)); process.exit(1); });
