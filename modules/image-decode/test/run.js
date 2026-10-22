#!/usr/bin/env node
/* image-decode checks that need no browser. Plain Node (18+), no packages. Copyright (c) 2026 LFC Foundry. MIT License.
 * Run:  node modules/image-decode/test/run.js          (exit code 1 on any failure)
 *
 * Fake createImageBitmap / Image / URL objects stand in for the browser, so these checks cover the choosing logic, the
 * format sniffing, data: addresses, list loading order and the fallback. Whether the page really stays smooth is measured
 * in real browsers (test/browser.js and the README table).
 */
'use strict';
const assert = require('assert');
const ID = require('../image-decode.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
const b64 = s => Buffer.from(s, 'base64');
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IScHAAK2AQU0pnWqAAAAAElFTkSuQmCC');
const WEBP = b64('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQjyLXo/+BiOh/AAA=');
const AVIF = b64('AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAKAAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAMG1kYXQSAAoIGAAGiAhoNCAyGhlHh4Yhh5555oJAAJBBEdVElYPM3eMh23JA');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);

// A fake browser. `canAvif` decides whether AVIF bytes decode; `log` records which way each call took.
function fakeEnv(o) {
  o = o || {};
  const log = [], env = {
    log,
    navigator: o.navigator || { userAgent: 'x' },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Blob: o.noBlob ? undefined : Blob,
    blobs: {},
    URL: { createObjectURL: b => { log.push('url'); const a = 'blob:' + log.length; env.blobs[a] = b; return a; }, revokeObjectURL: () => log.push('revoke') },
    fetch: async u => { log.push('fetch ' + u); return { ok: u !== '/missing.png', status: 404, blob: async () => new Blob([PNG], { type: 'image/png' }) }; }
  };
  const readable = async blob => {
    const u8 = new Uint8Array(await blob.arrayBuffer()), k = ID.sniff(u8);
    if (!k || (k === 'avif' && !o.canAvif)) throw new Error('cannot decode');
    return k;
  };
  if (!o.noBitmap) env.createImageBitmap = async blob => { log.push('bitmap'); await (o.slow ? new Promise(r => setTimeout(r, o.slow)) : 0); if (o.bitmapFails) throw new Error('bitmap refused'); const k = await readable(blob); return { kind: k, close() { log.push('close'); } }; };
  if (!o.noImage) env.Image = class {
    set src(v) { this._src = v; this.blobIndex = log.length; }
    decode() {
      log.push('decode'); if (o.decodeFails) return Promise.reject(new Error('decode refused'));
      if (/^data:/.test(this._src)) { if (o.dataRefused) return Promise.reject(new Error('data refused')); log.push('decode-data'); const m = /^data:([^,]*),(.*)$/.exec(this._src); return readable(new Blob([Buffer.from(m[2], 'base64')])); }
      if (o.blobRefused) { log.push('blob-refused'); return Promise.reject(new Error('blob refused by the page')); }
      return readable(env.blobs[this._src]);
    }
  };
  env.FileReader = class { readAsDataURL(b) { log.push('reader'); b.arrayBuffer().then(ab => { this.result = 'data:' + (b.type || 'application/octet-stream') + ';base64,' + Buffer.from(ab).toString('base64'); this.onload(); }, e => { this.error = e; this.onerror(); }); } };
  env.Worker = class {
    constructor() { if (o.noWorker) throw new Error('worker refused by the page'); log.push('worker-start'); }
    postMessage(m) { log.push('worker-job'); readable(m.b).then(k => this.onmessage({ data: { i: m.i, m: { kind: k } } }), e => this.onmessage({ data: { i: m.i, e: String(e.message) } })); }
    terminate() {}
  };
  return env;
}

(async () => {
  console.log('image-decode ' + ID.version + ' (Node ' + process.version + ')');

  await test('sniff names the five kinds from their first bytes and nothing else', () => {
    assert.strictEqual(ID.sniff(PNG), 'png'); assert.strictEqual(ID.sniff(WEBP), 'webp'); assert.strictEqual(ID.sniff(AVIF), 'avif');
    assert.strictEqual(ID.sniff(JPG), 'jpeg'); assert.strictEqual(ID.sniff(GIF), 'gif');
    assert.strictEqual(ID.sniff(Buffer.alloc(20)), ''); assert.strictEqual(ID.sniff(new Uint8Array(3)), '');
    const heic = Buffer.from(AVIF); heic.write('heic', 8); assert.strictEqual(ID.sniff(heic), '');
  });

  await test('the module loads in Node and says plainly that it has no browser to use', async () => {
    assert.strictEqual(ID.strategy, '');
    await assert.rejects(ID.load(PNG), /neither createImageBitmap nor Image/);
  });

  await test('auto uses bitmap in Chromium-family browsers (client hints and old user agents) and decode elsewhere', () => {
    const c = n => ID.create(fakeEnv({ navigator: n })).strategy;
    assert.strictEqual(c({ userAgentData: { brands: [{ brand: 'Not.A/Brand' }, { brand: 'Chromium' }] } }), 'bitmap');
    assert.strictEqual(c({ userAgentData: { brands: [{ brand: 'Google Chrome' }, { brand: 'Chromium' }] } }), 'bitmap');
    assert.strictEqual(c({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36' }), 'bitmap');
    assert.strictEqual(c({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0' }), 'decode');
    assert.strictEqual(c({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' }), 'decode');
    assert.strictEqual(c({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Epiphany/46.5 Safari/605.1.15' }), 'decode');
    assert.strictEqual(c({ userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/150 Mobile Safari/537.36 EdgA/150' }), 'bitmap');
  });

  await test('a worker (no Image) uses bitmap; a browser with no createImageBitmap uses decode', () => {
    assert.strictEqual(ID.create(fakeEnv({ noImage: true })).strategy, 'bitmap');
    assert.strictEqual(ID.create(fakeEnv({ noBitmap: true })).strategy, 'decode');
  });

  await test('load of bytes in a Chromium-like browser takes the bitmap way and returns the drawable', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Chrome/155 Safari/537' } }), I = ID.create(env);
    const d = await I.load(new Uint8Array(PNG)); assert.strictEqual(d.kind, 'png'); assert.deepStrictEqual(env.log, ['bitmap']);
  });

  await test('load of bytes in a Firefox-like browser takes the decode way, makes one object address and gives it back', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Firefox/158.0' } }), I = ID.create(env);
    const d = await I.load(PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length));
    assert.ok(d && d._src); assert.deepStrictEqual(env.log, ['url', 'decode', 'revoke']);
  });

  await test('a view into a bigger buffer is read from the right place', async () => {
    const big = new Uint8Array(100); big.set(WEBP, 40);
    const I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' } }));
    assert.strictEqual((await I.load(big.subarray(40, 40 + WEBP.length))).kind, 'webp');
  });

  await test('data: addresses become bytes with no fetch (base64 and percent-coded)', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Chrome/155' } }), I = ID.create(env);
    assert.strictEqual((await I.load('data:image/png;base64,' + PNG.toString('base64'))).kind, 'png');
    assert.deepStrictEqual(env.log.filter(x => /^fetch/.test(x)), []);
    await assert.rejects(I.load('data:text/plain,hello%20there'), /cannot decode/);
  });
  await test('data: address with the wrong stated type is read by its first bytes', async () => {
    const env2 = fakeEnv({ navigator: { userAgent: 'Chrome/155' } });
    assert.strictEqual((await ID.create(env2).load('data:image/jpeg;base64,' + WEBP.toString('base64'))).kind, 'webp');
    assert.deepStrictEqual(env2.log.filter(x => /^fetch/.test(x)), []);
  });
  await test('a broken data: address rejects with a plain message', async () => {
    const I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' } }));
    await assert.rejects(I.load('data:image/png;base64,@@@'), /not valid|cannot decode/);
  });

  await test('a url is fetched; a missing one rejects with its status', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Chrome/155' } }), I = ID.create(env);
    assert.strictEqual((await I.load('/sheet.png')).kind, 'png'); assert.ok(env.log.includes('fetch /sheet.png'));
    await assert.rejects(I.load('/missing.png'), /answered 404/);
  });

  await test('anything else is refused plainly', async () => {
    const I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' } }));
    await assert.rejects(I.load(42), /must be a Blob/); await assert.rejects(I.load(null), /must be a Blob/);
  });

  await test('if the chosen way fails, the other way is tried once; if both fail, the first error is the one reported', async () => {
    let env = fakeEnv({ navigator: { userAgent: 'Chrome/155' }, bitmapFails: true }), I = ID.create(env);
    const d = await I.load(PNG); assert.ok(d._src); assert.deepStrictEqual(env.log.filter(x => x === 'bitmap' || x === 'decode'), ['bitmap', 'decode']);
    env = fakeEnv({ navigator: { userAgent: 'Firefox/158' }, decodeFails: true }); I = ID.create(env);
    assert.strictEqual((await I.load(PNG)).kind, 'png');
    env = fakeEnv({ navigator: { userAgent: 'Firefox/158' }, decodeFails: true, bitmapFails: true }); I = ID.create(env);
    await assert.rejects(I.load(PNG), /decode refused/);
  });

  await test('a chosen strategy is obeyed and not retried on the other way', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Firefox/158' }, bitmapFails: true }), I = ID.create(env);
    await assert.rejects(I.load(PNG, { strategy: 'bitmap' }), /bitmap refused/);
    assert.ok(!env.log.includes('decode'));
  });

  await test('supports: PNG, WebP and JPEG yes; AVIF only when the browser can; each asked once', async () => {
    let env = fakeEnv({ navigator: { userAgent: 'Chrome/155' }, canAvif: false }), I = ID.create(env);
    assert.strictEqual(await I.supports('png'), true); assert.strictEqual(await I.supports('webp'), true); assert.strictEqual(await I.supports('jpg'), true);
    assert.strictEqual(await I.supports('avif'), false); assert.strictEqual(await I.supports('avif'), false);
    assert.strictEqual(env.log.filter(x => x === 'bitmap').length, 4);
    assert.strictEqual(await I.supports('tiff'), false); assert.strictEqual(await I.supports('gif'), true);
    env = fakeEnv({ navigator: { userAgent: 'Chrome/155' }, canAvif: true }); assert.strictEqual(await ID.create(env).supports('AVIF'), true);
  });

  await test('the built-in one-pixel probes are what they claim (sniff names them)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'image-decode.js'), 'utf8');
    for (const k of ['png', 'webp', 'avif', 'jpeg']) {
      const m = new RegExp("\\b" + k + ": '([^']+)'").exec(src); assert.ok(m, k);
      assert.strictEqual(ID.sniff(Buffer.from(m[1], 'base64')), k);
    }
  });

  await test('pick gives the first listed format the browser can read, or null', async () => {
    let I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' }, canAvif: false }));
    assert.strictEqual(await I.pick({ avif: 'a.avif', webp: 'a.webp', png: 'a.png' }), 'a.webp');
    I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' }, canAvif: true }));
    assert.strictEqual(await I.pick({ avif: 'a.avif', webp: 'a.webp' }), 'a.avif');
    assert.strictEqual(await I.pick({ avif: 'a.avif' }) , 'a.avif');
    I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' }, canAvif: false }));
    assert.strictEqual(await I.pick({ avif: 'a.avif' }), null);
  });

  await test('loadAll keeps order, never runs more than the limit at once and starts the first pictures first', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Chrome/155' }, slow: 5 }); let live = 0, peak = 0; const started = [];
    const orig = env.createImageBitmap; env.createImageBitmap = async b => { live++; peak = Math.max(peak, live); started.push(b.size); try { return await orig(b); } finally { live--; } };
    const I = ID.create(env), sizes = [PNG, WEBP, JPG, GIF, PNG, WEBP].map((x, i) => Buffer.concat([x, Buffer.alloc(i * 2)]));
    const got = []; const out = await I.loadAll(sizes, { concurrency: 2, onEach: (d, i) => got.push(i) });
    assert.strictEqual(out.length, 6); assert.ok(out.every(Boolean)); assert.strictEqual(peak, 2);
    assert.deepStrictEqual(started, sizes.map(x => x.length));
    assert.deepStrictEqual(got.slice().sort(), [0, 1, 2, 3, 4, 5]);
  });

  await test('loadAll puts null for a bad picture, keeps going, and lists the errors by index', async () => {
    const I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' } }));
    const out = await I.loadAll([PNG, Buffer.alloc(30), WEBP, 7]);
    assert.ok(out[0] && !out[1] && out[2] && !out[3]); assert.ok(out.errors[1] instanceof Error && out.errors[3] instanceof Error); assert.ok(!out.errors[0]);
    assert.deepStrictEqual(await I.loadAll([]), []);
  });

  await test('a callback that throws does not stop the list', async () => {
    const I = ID.create(fakeEnv({ navigator: { userAgent: 'Chrome/155' } }));
    const out = await I.loadAll([PNG, WEBP], { onEach: () => { throw new Error('boom'); } });
    assert.ok(out[0] && out[1]);
  });

  await test('close frees a bitmap, ignores an Image, and ignores null', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Chrome/155' } }), I = ID.create(env), d = await I.load(PNG);
    I.close(d); assert.ok(env.log.includes('close')); I.close({}); I.close(null); I.close(undefined);
  });

  await test('a Blob works too, including when the page has no Blob (bytes then fail plainly)', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Chrome/155' } }), I = ID.create(env);
    assert.strictEqual((await I.load(new Blob([WEBP]))).kind, 'webp');
  });

  await test('a page that refuses blob: pictures: Firefox falls back to a data: address and remembers the refusal', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0' }, blobRefused: true }), I = ID.create(env);
    assert.ok(await I.load(PNG));
    assert.ok(env.log.includes('blob-refused') && env.log.includes('decode-data') && !env.log.includes('worker-start') && !env.log.includes('bitmap'));
    env.log.length = 0; await I.load(WEBP);
    assert.ok(!env.log.includes('blob-refused') && !env.log.includes('url') && env.log.includes('decode-data'), 'the second picture goes straight to data:');
  });

  await test('a page that refuses blob: pictures: WebKit tries a background worker first, then data:', async () => {
    const ua = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' };
    const a = fakeEnv({ navigator: ua, blobRefused: true }), A = ID.create(a);
    assert.strictEqual((await A.load(PNG)).kind, 'png'); assert.ok(a.log.includes('worker-start') && a.log.includes('worker-job') && !a.log.includes('decode-data'));
    const b = fakeEnv({ navigator: ua, blobRefused: true, noWorker: true }), B = ID.create(b);
    assert.ok(await B.load(PNG)); assert.ok(b.log.includes('decode-data'));
    b.log.length = 0; await B.load(WEBP); assert.ok(!b.log.includes('worker-start'), 'a refused worker is not tried again');
  });

  await test('forced addresses: blob, data and worker each take only their own way, and a refusal is an error, not a retry', async () => {
    const ua = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0' };
    const e1 = fakeEnv({ navigator: ua }), I1 = ID.create(e1);
    await I1.load(PNG, { strategy: 'decode', address: 'data' }); assert.ok(e1.log.includes('decode-data') && !e1.log.includes('url'));
    const e2 = fakeEnv({ navigator: ua, blobRefused: true }), I2 = ID.create(e2);
    await assert.rejects(I2.load(PNG, { strategy: 'decode', address: 'blob' }), /blob refused/);
    const e3 = fakeEnv({ navigator: ua }), I3 = ID.create(e3);
    assert.strictEqual((await I3.load(PNG, { strategy: 'decode', address: 'worker' })).kind, 'png'); assert.ok(e3.log.includes('worker-job'));
  });

  await test('when blob:, the worker and data: are all refused the load fails with the first error', async () => {
    const env = fakeEnv({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0' }, blobRefused: true, dataRefused: true, noBitmap: true }), I = ID.create(env);
    await assert.rejects(I.load(PNG), /blob refused/);
  });

  await test('supports() still answers under a page that refuses blob: pictures', async () => {
    const I = ID.create(fakeEnv({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0' }, blobRefused: true }));
    assert.strictEqual(await I.supports('png'), true);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
