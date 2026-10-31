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
// SAVEKIT_FILE=/path/to/save-kit-lean.js and SAVEKIT_WITHOUT=autosave,codes tell the checks to run against a lean build (modules/save-kit/lean.py): checks that
// need a part that was cut are skipped (and counted), every other check must pass unchanged.
const S = require(process.env.SAVEKIT_FILE ? path.resolve(process.env.SAVEKIT_FILE) : '../save-kit.js');
const WITHOUT = (process.env.SAVEKIT_WITHOUT || '').split(',').filter(Boolean);
const NEEDS = [   // [test name pattern, the lean.py parts the check needs]
  [/code|squeez|bomb|checksum|base64|prefix|pasted|limits/i, ['codes']], [/bomb|cut off early|cut early/i, ['streamLimit']], [/native base64/i, ['nativeBase64']], [/autosave|getState/i, ['autosave']], [/onOtherTab/, ['onOtherTab']],
  [/persist\(\)/, ['persist']], [/stageImport/, ['stageImport']], [/migrate/, ['migrate']], [/skipUnchangedMs/, ['skipUnchanged']], [/compactCodes/, ['compact']], [/raw/i, ['raw']], [/twoTap/, ['twoTap']], [/durable/, ['durable']],
];
const skippedByLean = (name) => NEEDS.some(([re, parts]) => re.test(name) && parts.some(x => WITHOUT.includes(x)));
let skipped = 0;

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
  if (skippedByLean(name)) { skipped++; return; }
  try { await fn(S); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}
// A regression check: passes on the new file; must fail on the old one.
async function regress(name, fn) {
  if (skippedByLean(name)) { skipped++; return; }
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
      if (k.stageImport) assert.strictEqual(k.stageImport({ score: 1 }), false);
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
      assert.strictEqual(strip(nativeCode).slice(0, 3), strip(loopCode).slice(0, 3));   // the prefix only: the z/p letter can differ when the two codes are almost the same length (their `seen` stamps differ)
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
  await regress('zero schema bounds reject nonempty strings and count entries', async K => {
    const clean = K.validate({ a: 'str:0', b: { type: 'str', max: 0 }, c: { type: 'counts', max: 0 }, d: { type: 'counts', maxKeys: 0 } },
      { a: '', b: '', c: {}, d: {} }, { a: 'text', b: 'text', c: { apple: 1 }, d: { pear: 2 } });
    assert.strictEqual(clean.a, ''); assert.strictEqual(clean.b, '');
    assert.deepStrictEqual(Object.keys(clean.c), []); assert.deepStrictEqual(Object.keys(clean.d), []);
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

  // ---------- 7. added in 1.1.0 ----------
  await regress('a raw default is copied, so editing a state never changes the defaults (and Reset stays a reset)', async K => {
    const defaults = { tut: { done: false, steps: [1] } };
    const k = K.create({ key: 'g', schema: { tut: 'raw' }, defaults, storage: mem() });
    const s = k.validate({}); s.tut.done = true; s.tut.steps.push(2);
    assert.deepStrictEqual(defaults.tut, { done: false, steps: [1] });
    assert.deepStrictEqual(k.validate({}).tut, { done: false, steps: [1] });
    assert.deepStrictEqual(k.validate({ tut: 'broken-not-json-plain' }).tut, 'broken-not-json-plain');   // a plain string is JSON-plain, so it is kept
  });
  await regress('a counts field starts from its default when missing or not a map', async K => {
    const k = K.create({ key: 'g', schema: { owned: { type: 'counts', max: 9 } }, defaults: { owned: { apple: 2, pear: 50, __proto__x: 1 } }, storage: mem() });
    const a = k.validate({}), b = k.validate({ owned: 'nope' }), c = k.validate({ owned: { kiwi: 1 } });
    assert.strictEqual(a.owned.apple, 2); assert.strictEqual(a.owned.pear, 9);            // the same rules (cap 9) apply to the default
    assert.strictEqual(b.owned.apple, 2); assert.strictEqual(c.owned.kiwi, 1); assert.strictEqual(c.owned.apple, undefined);   // a real map is used as it is
  });
  await test('load() reads the backup slot only when the main slot is missing or has a broken number', async K => {
    const st = mem(); let backupReads = 0; const real = st.getItem; st.getItem = k => { if (k === 'g-backup') backupReads++; return real(k); };
    const k = K.create({ key: 'g', schema, defaults: { sound: 1 }, storage: st, backupEveryMs: 0 });
    k.save({ score: 5, level: 1, name: 'A', owned: {} });
    assert.strictEqual(k.load().score, 5); assert.strictEqual(backupReads, 0);
    st.setItem('g', '{"score":null,"level":1}'); st.setItem('g-backup', '{"score":9,"level":1}');   // main has a broken number: the sound backup wins, as before
    assert.strictEqual(k.load().score, 9); assert.strictEqual(backupReads, 1);
    st._d.g = undefined; delete st._d.g; assert.strictEqual(k.load().score, 9); assert.strictEqual(backupReads, 2);   // main missing
  });
  await test('skipUnchangedMs: an unchanged save is not written again until the time is up; save(state, true) and changes always write', async K => {
    const st = mem(); let writes = 0; const real = st.setItem; st.setItem = (k, v) => { if (k === 'g') writes++; real(k, v); };
    const k = K.create({ key: 'g', schema, storage: st, skipUnchangedMs: 5000, backupEveryMs: 1e9 });
    const realNow = Date.now; let t = 1e12; Date.now = () => t;
    try {
      const s = { score: 1, level: 1, name: 'A', owned: { x: 1 } };
      assert.strictEqual(k.save(s), true); assert.strictEqual(writes, 1); const seen0 = s.seen;
      t += 2000; assert.strictEqual(k.save(s), true); assert.strictEqual(writes, 1); assert.strictEqual(s.seen, seen0);   // skipped, state still shows the stored stamp
      t += 2000; assert.strictEqual(k.save(s), true); assert.strictEqual(writes, 1);
      t += 2000; assert.strictEqual(k.save(s), true); assert.strictEqual(writes, 2); assert.ok(s.seen > seen0);          // 6 s since the write: refreshed
      s.score = 2; t += 100; assert.strictEqual(k.save(s), true); assert.strictEqual(writes, 3);                          // changed: written at once
      t += 100; assert.strictEqual(k.save(s, true), true); assert.strictEqual(writes, 4);                                  // forced
      assert.strictEqual(JSON.parse(st._d.g).score, 2);
      s.score = NaN; assert.strictEqual(k.save(s), false); assert.strictEqual(writes, 4);                                  // a broken number is still refused
    } finally { Date.now = realNow; }
    const plain = K.create({ key: 'h', schema, storage: st }); let w2 = 0; const r2 = st.setItem; st.setItem = (k2, v) => { if (k2 === 'h') w2++; r2(k2, v); };
    const s2 = { score: 1, level: 1, name: 'A', owned: {} }; plain.save(s2); plain.save(s2); assert.strictEqual(w2, 2);   // default: every save writes, as before
  });
  await test('compactCodes: shorter codes that open to the same state; default fields and an unlisted `seen` are left out', async K => {
    const sc = { score: 'num', level: 'int:99', sound: 'flag', music: 'flag', name: 'str:20' }, df = { level: 1, sound: 1, music: 1, name: 'player' };
    const full = K.create({ key: 'g', schema: sc, defaults: df, storage: mem(), prefix: 'GM1' }), small = K.create({ key: 'g', schema: sc, defaults: df, storage: mem(), prefix: 'GM1', compactCodes: true });
    const st = { score: 4210.5, level: 1, sound: 1, music: 0, name: 'player' };
    const a = await full.exportCode(Object.assign({}, st)), b = await small.exportCode(Object.assign({}, st));
    assert.ok(b.length < a.length * 0.8, 'compact ' + b.length + ' vs ' + a.length);
    const back = await full.importCode(b); assert.deepStrictEqual(back, full.validate(st));          // another kit (not compact) opens it too
    assert.deepStrictEqual(await small.importCode(a), small.validate(st));                           // and the compact kit opens full codes
    const flat = Buffer.from(b.split('.')[1], 'base64url').toString(); if (b[3] === 'p') { assert.ok(!/seen|level|sound|player/.test(flat), flat); assert.ok(/score/.test(flat)); }
    const keepSeen = K.create({ key: 'g', schema: Object.assign({ seen: 'num' }, sc), defaults: df, storage: mem(), prefix: 'GM1', compactCodes: true });
    assert.ok((await keepSeen.importCode(await keepSeen.exportCode(Object.assign({}, st)))).seen > 0);   // listed `seen` is kept
  });
  await test('version + migrate: old saves and old codes are upgraded on load/import; new ones are stamped and left alone; a bad migrate changes nothing', async K => {
    const sc = { gold: 'num', coins: 'num' }, st = mem(); const seenFrom = [];
    const migrate = (raw, from) => { seenFrom.push(from); if (from < 2) { raw.coins = raw.gold; delete raw.gold; } return raw; };
    const k = K.create({ key: 'g', schema: sc, storage: st, version: 2, migrate, prefix: 'GM1' });
    st.setItem('g', '{"gold":15,"seen":1}');                                         // written by version 1 (no `v`)
    assert.strictEqual(k.load().coins, 15); assert.deepStrictEqual(seenFrom.slice(0, 1), [0]);
    const s = { gold: 1, coins: 7 }; k.save(s); assert.strictEqual(JSON.parse(st._d.g).v, 2);
    seenFrom.length = 0; assert.strictEqual(k.load().coins, 7); assert.deepStrictEqual(seenFrom, []);   // already version 2: migrate not called
    const old = 'GM1p.' + b64url(Buffer.from('{"gold":3}')); const code = old + '.' + K.checksum(b64url(Buffer.from('{"gold":3}')));
    assert.strictEqual((await k.importCode(code)).coins, 3);
    const bs = mem(), bad = K.create({ key: 'b', schema: sc, storage: bs, version: 2, migrate() { throw new Error('x'); } });
    bs._d.b = JSON.stringify({ gold: 1 }); assert.strictEqual(bad.load().gold, 1); assert.strictEqual(bad.load().coins, undefined);      // the throwing migrate left the save as it was
    assert.strictEqual(K.create({ key: 'n', schema: sc, storage: mem(), migrate }).save({ gold: 1 }), true);   // migrate without version does nothing
  });
  await test('onOtherTab: hears a save written by another tab, a removal, and stops when asked; ignores other keys', async K => {
    const st = mem(), handlers = {}, win = { addEventListener(t, f) { handlers[t] = f; }, removeEventListener(t, f) { if (handlers[t] === f) delete handlers[t]; } };
    globalThis.window = win;
    try {
      const k = K.create({ key: 'g', schema, defaults: { sound: 1 }, storage: st }), got = [];
      const stop = k.onOtherTab((s, e) => got.push(s));
      handlers.storage({ key: 'other', newValue: '{}', storageArea: st }); assert.strictEqual(got.length, 0);
      handlers.storage({ key: 'g', newValue: '{"score":9,"level":2,"owned":{"a":1}}', storageArea: st });
      assert.strictEqual(got[0].score, 9); assert.strictEqual(got[0].sound, 1); assert.strictEqual(got[0].owned.a, 1);
      handlers.storage({ key: 'g', newValue: null, storageArea: st }); assert.strictEqual(got[1], null);
      handlers.storage({ key: null, newValue: null, storageArea: st }); assert.strictEqual(got[2], null);   // another tab cleared everything
      handlers.storage({ key: 'g', newValue: '{broken', storageArea: st }); assert.strictEqual(got[3], null);
      handlers.storage({ key: 'g', newValue: '{"score":1}', storageArea: {} }); assert.strictEqual(got.length, 4);   // another storage area (sessionStorage)
      stop(); assert.strictEqual(handlers.storage, undefined);
      assert.strictEqual(typeof k.onOtherTab(() => { throw new Error('cb'); }), 'function'); handlers.storage({ key: 'g', newValue: '{}', storageArea: st });   // a throwing callback is swallowed
    } finally { delete globalThis.window; }
    assert.strictEqual(typeof K.create({ key: 'g', schema, storage: mem() }).onOtherTab(() => {}), 'function');       // no window: harmless
  });
  await test('persist(): true when granted or already persistent, false when refused, unsupported or throwing; never rejects', async K => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), k = K.create({ key: 'g', schema, storage: mem() });
    const setNav = v => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true });
    try {
      setNav({ storage: { persisted: async () => false, persist: async () => true } }); assert.strictEqual(await k.persist(), true);
      let asked = 0; setNav({ storage: { persisted: async () => true, persist: async () => { asked++; return false; } } }); assert.strictEqual(await k.persist(), true); assert.strictEqual(asked, 0);
      setNav({ storage: { persisted: async () => false, persist: async () => false } }); assert.strictEqual(await k.persist(), false);
      setNav({ storage: { persist: () => Promise.reject(new Error('no')) } }); assert.strictEqual(await k.persist(), false);
      setNav({ storage: { persist() { throw new Error('no'); } } }); assert.strictEqual(await k.persist(), false);
      setNav({}); assert.strictEqual(await k.persist(), false);
    } finally { if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator; }
  });


  // ---------- 7. options added in 1.2.0 (all off unless given): old-code endings, slot names, damaged slot, own checks, stamp name ----------
  const fancyFnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); };   // Fancy the Banana's own check, copied from its source
  const apFnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };   // Apple Press's: base 36, no padding
  const oldCode = (prefix, flag, obj, fnv) => { const raw = Buffer.from(JSON.stringify(obj)), d = b64url(flag === 'z' ? zlib.deflateRawSync(raw) : raw); return prefix + flag + '.' + d + '.' + fnv(d); };
  await test('codeCheck "hex8": writes Fancy\'s 8-hex ending, reads Fancy\'s old codes (z and p), and the default style refuses them', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, storage: st, prefix: 'BF1', codeCheck: 'hex8' }), plain = K.create({ key: 'g', schema, storage: st, prefix: 'BF1' });
    const s0 = { score: 7, level: 3, sound: 1, name: 'ab', owned: { a: 2 } };
    for (const flag of ['z', 'p']) {
      const code = oldCode('BF1', flag, s0, fancyFnv), got = await k.importCode(code);
      assert.strictEqual(got.score, 7); assert.strictEqual(got.owned.a, 2);
      await assert.rejects(plain.importCode(code), /not complete/);
    }
    const mine = await k.exportCode(Object.assign({}, s0));
    const m = /^(BF1[zp])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(mine);   // Fancy's own pattern, whole text
    assert.ok(m && fancyFnv(m[2]) === m[3], 'Fancy would accept this ending: ' + mine);
    assert.strictEqual((await k.importCode('please load ' + mine + ' thanks')).score, 7);
    await assert.rejects(k.importCode(mine.slice(0, -1)), /not complete/);
  });
  await test('codeCheck "plain36": writes no leading zeros, reads Apple Press\'s short and full endings, ignores words after the code', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'AP1', codeCheck: 'plain36' });
    let shortSeen = false, fullSeen = false;
    for (let i = 0; i < 400 && !(shortSeen && fullSeen); i++) {
      const s0 = { score: i, level: 1, sound: 1, name: 'n' + i, owned: {} }, code = oldCode('AP1', 'p', s0, apFnv), tail = code.split('.')[2];
      if (tail.length < 7) shortSeen = true; else fullSeen = true;
      const got = await k.importCode('my save: ' + code + ' bye');
      assert.strictEqual(got.score, i);
      const mine = await k.exportCode(Object.assign({}, s0)), mt = mine.split('.')[2];
      assert.ok(mt === apFnv(mine.split('.')[1]) && !/^0/.test(mt), 'the written ending has no leading zeros: ' + mt);
    }
    assert.ok(shortSeen && fullSeen, 'the sample held both short and 7-character endings');
    const d = oldCode('AP1', 'p', { score: 1, level: 1, sound: 1, name: '', owned: {} }, apFnv).split('.')[1];
    await assert.rejects(k.importCode('AP1p.' + d + '.0' + apFnv(d)), /not complete/);   // a padded ending is not what Apple Press wrote
    await assert.rejects(k.importCode('AP1p.' + d + '.' + apFnv(d).slice(0, -1)), /not complete/);
    await assert.rejects(k.importCode('AP1p.' + d + '.'), /not complete/);
  });
  await test('the default code ending is unchanged: 7 base-36 characters, as in 1.1.0', async K => {
    const k = K.create({ key: 'g', schema, storage: mem(), prefix: 'SK1' });
    for (let i = 0; i < 20; i++) assert.ok(/^SK1[zp]\.[A-Za-z0-9_-]+\.[0-9a-z]{7}$/.test(await k.exportCode({ score: i, level: 1, sound: 1, name: 'x', owned: {} })));
    assert.strictEqual(K.checksum('abc'), K.checksum('abc', 'padded36')); assert.strictEqual(K.checksum('abc', 'hex8').length, 8);
  });
  await test('backupKey: the backup lives under the given name, is read from it, and stageImport writes it too', async K => {
    const st = mem(), k = K.create({ key: 'bf1', schema, storage: st, backupKey: 'bf1-bak' });
    k.save({ score: 1 }); k.forceBackupNext(); k.save({ score: 2 });
    assert.ok(st._d['bf1-bak'] && !('bf1-backup' in st._d)); assert.strictEqual(JSON.parse(st._d['bf1-bak']).score, 2);
    st._d.bf1 = '{broken'; assert.strictEqual(k.load().score, 2);
    assert.ok(k.stageImport({ score: 9 }, { score: 5 }) && JSON.parse(st._d['bf1-bak']).score === 9 && !('bf1-backup' in st._d) && JSON.parse(st._d['bf1-before-load']).score === 5);
    const dflt = K.create({ key: 'zz', schema, storage: st }); dflt.save({ score: 3 }); assert.ok('zz-backup' in st._d);
  });
  await test('readBackupWithoutMain:false: an empty main slot never brings back a leftover backup; a damaged one still falls back to it', async K => {
    const st = mem(); st._d['g-backup'] = JSON.stringify({ score: 4 });
    assert.strictEqual(K.create({ key: 'g', schema, storage: st }).load().score, 4);   // the 1.1.0 behavior stays the default
    const k = K.create({ key: 'g', schema, storage: st, readBackupWithoutMain: false });
    assert.strictEqual(k.load(), null);
    st._d.g = 'not json'; assert.strictEqual(k.load().score, 4);
    st._d.g = JSON.stringify({ score: 8 }); assert.strictEqual(k.load().score, 8);
  });
  await test('damagedKey: main-slot text that is not used is kept aside; used text is not copied; off by default', async K => {
    const st = mem(), k = K.create({ key: 'g', schema, storage: st, damagedKey: 'g-damaged' });
    st._d.g = JSON.stringify({ score: 5 }); k.load(); assert.ok(!('g-damaged' in st._d), 'a good main slot is not copied');
    k.load(); st._d.g = '{cut off'; st._d['g-backup'] = JSON.stringify({ score: 3 });
    assert.strictEqual(k.load().score, 3); assert.strictEqual(st._d['g-damaged'], '{cut off');
    delete st._d['g-backup']; st._d.g = '[1,2]'; assert.strictEqual(k.load(), null); assert.strictEqual(st._d['g-damaged'], '[1,2]');
    st._d.g = JSON.stringify({ score: -1 }); st._d['g-backup'] = JSON.stringify({ score: 6 }); assert.strictEqual(k.load().score, 6); assert.strictEqual(st._d['g-damaged'], JSON.stringify({ score: -1 }));
    const st2 = mem(); st2._d.g = '{cut off'; K.create({ key: 'g', schema, storage: st2 }).load(); assert.ok(!('g-damaged' in st2._d));
    const full = { getItem: k2 => st2._d[k2] ?? null, setItem() { throw new Error('full'); } };
    assert.doesNotThrow(() => K.create({ key: 'g', schema, storage: full, damagedKey: 'g-damaged' }).load());   // a full storage never makes load() throw
  });
  await test('afterValidate(clean, raw): runs on load, importCode and onOtherTab; may change in place, return a replacement or refuse; a throw is ignored', async K => {
    const calls = []; let mode = 'edit';
    const hook = (clean, raw) => { calls.push([clean.score, raw.score]); if (mode === 'edit') { clean.score = Math.min(clean.score, 100); return; } if (mode === 'replace') return Object.assign({}, clean, { score: 42 }); if (mode === 'refuse') return raw.score > 50 ? false : undefined; if (mode === 'null') return null; throw new Error('boom'); };
    const st = mem(), k = K.create({ key: 'g', schema, storage: st, prefix: 'GM1', afterValidate: hook });
    st._d.g = JSON.stringify({ score: 500 }); assert.strictEqual(k.load().score, 100); assert.deepStrictEqual(calls[0], [500, 500]);
    assert.strictEqual((await k.importCode(await K.create({ key: 'x', schema, storage: mem(), prefix: 'GM1' }).exportCode({ score: 900, level: 1, sound: 1, name: '', owned: {} }))).score, 100);
    mode = 'replace'; assert.strictEqual(k.load().score, 42);
    mode = 'refuse'; st._d['g-backup'] = JSON.stringify({ score: 7 }); assert.strictEqual(k.load().score, 7, 'main refused: the backup is tried'); st._d['g-backup'] = JSON.stringify({ score: 70 }); assert.strictEqual(k.load(), null, 'both refused');
    st._d.g = JSON.stringify({ score: 9 }); delete st._d['g-backup']; assert.strictEqual(k.load().score, 9);
    const code = await K.create({ key: 'x', schema, storage: mem(), prefix: 'GM1' }).exportCode({ score: 80, level: 1, sound: 1, name: '', owned: {} });
    await assert.rejects(k.importCode(code), /damaged/);
    mode = 'null'; assert.strictEqual(k.load(), null);
    mode = 'throw'; assert.strictEqual(k.load().score, 9); assert.strictEqual((await k.importCode(code)).score, 80);
    // onOtherTab goes through the hook too
    const had = Object.getOwnPropertyDescriptor(globalThis, 'window'), L = {};
    globalThis.window = { addEventListener: (t, f) => { L[t] = f; }, removeEventListener() {} };
    try { mode = 'edit'; let got; k.onOtherTab(c => { got = c; }); L.storage({ key: 'g', newValue: JSON.stringify({ score: 700 }) }); assert.strictEqual(got.score, 100); }
    finally { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; }
  });
  await test('stamp: the timestamp is written under the given name (not `seen`), in saves, codes and staged imports, and the schema may list it', async K => {
    const st = mem(), sc = Object.assign({ savedAt: 'num' }, schema), k = K.create({ key: 'g', schema: sc, storage: st, stamp: 'savedAt', prefix: 'BF1' });
    const state = { score: 1 }; k.save(state);
    assert.strictEqual(typeof state.savedAt, 'number'); assert.ok(!('seen' in state)); assert.ok(!('seen' in JSON.parse(st._d.g)));
    assert.strictEqual(k.load().savedAt, state.savedAt);
    const code = await k.exportCode({ score: 2 }); const back = await k.importCode(code); assert.strictEqual(typeof back.savedAt, 'number');
    if (k.stageImport) { k.stageImport({ score: 3 }, null); assert.strictEqual(typeof JSON.parse(st._d.g).savedAt, 'number'); }
  });
  await test('skipUnchangedMs with a custom stamp: an unchanged save is not written again', async K => {
    const st = mem(), sc = Object.assign({ savedAt: 'num' }, schema);
    let writes = 0, now = 1e12;
    const setItem = st.setItem;
    st.setItem = (key, value) => { if (key === 'g') writes++; setItem(key, value); };
    const k = K.create({ key: 'g', schema: sc, storage: st, stamp: 'savedAt', skipUnchangedMs: 60000 });
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const state = { score: 1 };
      k.save(state);
      const saved = st._d.g;
      now++;
      k.save(state);
      assert.strictEqual(st._d.g, saved);
      assert.strictEqual(writes, 1);
    } finally { Date.now = realNow; }
  });

  // A tiny in-memory IndexedDB: open / createObjectStore / transaction(get, put) with async callbacks, and a log of the durability asked for.
  function fakeIdb() {
    const dbs = {}, log = [];
    const later = f => setTimeout(f, 1);
    return { log, dbs, open(name) {
      const rq = {}; const fresh = !dbs[name]; if (fresh) dbs[name] = {};
      const data = dbs[name];
      const d = { createObjectStore() {}, close() {}, transaction(store, mode, opt) {
        log.push(mode + ':' + (opt && opt.durability || '-'));
        const t = { objectStore() { return {
          get(k) { const r = {}; later(() => { r.result = data[k]; r.onsuccess && r.onsuccess(); }); return r; },
          put(v, k) { later(() => { data[k] = JSON.parse(JSON.stringify(v)); later(() => t.oncomplete && t.oncomplete()); }); },
        }; } };
        return t;
      } };
      later(() => { rq.result = d; if (fresh && rq.onupgradeneeded) rq.onupgradeneeded(); rq.onsuccess && rq.onsuccess(); });
      return rq;
    } };
  }
  await test('durable: every save is mirrored to IndexedDB with strict durability, newest only', async K => {
    const st = mem(), idb = fakeIdb();
    const k = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: idb });
    for (let i = 1; i <= 5; i++) k.save({ score: i });
    assert.strictEqual(await k.flushed(), true);
    const rec = idb.dbs['save-kit-durable:g'].main;
    assert.strictEqual(JSON.parse(rec.t).score, 5);
    assert.strictEqual(rec.n, rec.t.length);
    const writes = idb.log.filter(x => x.startsWith('readwrite'));
    assert.ok(writes.length <= 2, 'coalesced: ' + writes.length);
    assert.ok(writes.every(x => x === 'readwrite:strict'));
  });
  await test('durable: recover() brings back a newer copy that localStorage lost in a crash', async K => {
    const st = mem(), idb = fakeIdb();
    const a = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: idb });
    a.save({ score: 1 }); await a.flushed();
    const lost = st._d.g;   // what localStorage still held when the browser crashed
    a.save({ score: 9 }); await a.flushed();
    st._d.g = lost;
    const b = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: idb });
    assert.strictEqual(b.load().score, 1);   // the fast synchronous read
    b.save({ score: 2 });                     // a save before recover() must not cover the newer copy
    const r = await b.recover();
    assert.strictEqual(r && r.score, 9);
    assert.strictEqual(JSON.parse(st._d.g).score, 9);
  });
  await test('durable: recover() gives null when localStorage is as new or newer, and without the option', async K => {
    const st = mem(), idb = fakeIdb();
    const a = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: idb });
    a.save({ score: 4 }); await a.flushed();
    const b = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: idb });
    assert.strictEqual(b.load().score, 4);
    assert.strictEqual(await b.recover(), null);
    assert.strictEqual(await K.create({ key: 'g', schema, storage: st }).recover(), null);
    const c = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: null });   // no IndexedDB: saving still works
    assert.strictEqual(c.save({ score: 5 }), true);
    assert.strictEqual(await c.flushed(), false);
    assert.strictEqual(await c.recover(), null);
  });
  await test('durable: a damaged or broken IndexedDB copy is ignored', async K => {
    const st = mem(), idb = fakeIdb();
    idb.dbs['save-kit-durable:g'] = { main: { t: '{"score":7,"seen":99999999999999}', n: 3 } };
    const b = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: idb });
    assert.strictEqual(await b.recover(), null);
    idb.dbs['save-kit-durable:g'] = { main: { t: '{"score":"x","seen":99999999999999}', n: 33 } };
    const c = K.create({ key: 'g', schema, storage: st, durable: true, indexedDB: idb });
    assert.strictEqual(await c.recover(), null);
  });

  const extra = OLD ? '; the old file was caught by ' + caught + ' of ' + oldTried + ' regression checks' : '; old file not available for comparison';
  console.log('save-kit' + (WITHOUT.length ? ' (lean build without ' + WITHOUT.join(', ') + ')' : '') + ': ' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', ' + skipped + ' skipped (they need a cut part)' : '') + extra);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('save-kit: crashed: ' + (e && e.stack || e)); process.exit(1); });
