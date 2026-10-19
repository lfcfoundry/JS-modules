/* Copyright (c) 2026 LFC Foundry. MIT License. test-runner checks that need no browser. Run: node tools/test-runner/test/run.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const T = require('../runner.js'), { same, twin, twinSource } = require('../twin.js'), S = require('../stamp.js');
let bad = 0, pending = Promise.resolve();
const ok = (c, m) => { if (!c) throw new Error(m); };
const t = (name, fn) => { pending = pending.then(async () => { try { await fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trt-'));
process.env.TEST_RUNNER_WARM = path.join(tmp, 'warm');

t('same: numbers by their bits (0 and -0 differ, NaN equals NaN), arrays, typed arrays, objects', () => {
  ok(same(1, 1) && same(NaN, NaN) && !same(0, -0) && !same(1, 2) && !same(1, '1'), 'numbers');
  ok(same([1, [2, 3]], [1, [2, 3]]) && !same([1, 2], [1, 2, 3]) && !same([1], { 0: 1 }), 'arrays');
  ok(same(new Uint8Array([1, 2]), new Uint8Array([1, 2])) && !same(new Uint8Array([1]), new Int8Array([1])) && !same(new Uint8Array([1, 2]), new Uint8Array([1, 3])), 'typed arrays');
  ok(same(new Float64Array([NaN, 0.1 + 0.2]), new Float64Array([NaN, 0.30000000000000004])) && !same(new Float64Array([0]), new Float64Array([-0])), 'float arrays by bits');
  ok(same({ a: 1, b: [1] }, { b: [1], a: 1 }) && !same({ a: 1 }, { a: 1, b: 2 }) && !same({ a: undefined }, { b: undefined }), 'objects');
});
t('twin: counts cases, names the ones that differ, gives each side its own copy, and treats one-sided throws as a difference', () => {
  const r = twin([{ name: 'ok', input: [1, 2] }, { name: 'off', input: [3, 4] }, [5, 6]], (a) => a.reduce((x, y) => x + y), (a) => (a[0] === 3 ? 99 : a.reduce((x, y) => x + y)));
  ok(r.tried === 3 && r.differing === 1 && r.names[0] === 'off', JSON.stringify(r));
  const seen = []; twin([[1]], (a) => { a.push(9); seen.push(a.length); return 0; }, (a) => { seen.push(a.length); return 0; });
  ok(seen.join() === '2,1', 'inputs were shared: ' + seen);
  const r2 = twin([1, 2], (x) => { if (x === 2) throw new Error('boom'); return x; }, (x) => x);
  ok(r2.differing === 1 && /JS threw: boom/.test(r2.names[0]), JSON.stringify(r2));
  ok(twin([1], () => { throw new Error('a'); }, () => { throw new Error('b'); }).differing === 0, 'both throw = same');
});
t('twinSource works inside new Function (to put in a page)', () => {
  const tw = new Function(twinSource + '; return twin;')();
  ok(tw([1, 2], (x) => x * 2, (x) => x + x).differing === 0 && tw([1], (x) => x, (x) => x + 1).differing === 1, 'page copy');
});
t('stamp: runs once, skips when nothing changed, rebuilds on a changed input, a missing output or a changed command, and records nothing for a failed build', () => {
  process.env.TEST_RUNNER_CACHE = tmp + '/cache';
  const S2 = (() => { delete require.cache[require.resolve('../stamp.js')]; return require('../stamp.js'); })();
  const dir = path.relative(path.resolve(__dirname, '..', '..', '..'), tmp + '/proj'); fs.mkdirSync(tmp + '/proj', { recursive: true });
  const inFile = path.join(dir, 'a.c'), outFile = path.join(dir, 'a.out'); fs.writeFileSync(path.resolve(__dirname, '..', '..', '..', inFile), 'one');
  const cmd = ['sh', '-c', 'cp ' + inFile + ' ' + outFile], run = (c, force) => S2.guarded('t1', [dir], [outFile], c || cmd, path.resolve(__dirname, '..', '..', '..'), force);
  fs.writeFileSync(path.resolve(__dirname, '..', '..', '..', outFile), '');
  let r = run(); ok(!r.skipped && r.status === 0, 'first run builds');
  r = run(); ok(r.skipped, 'second run skips');
  fs.writeFileSync(path.resolve(__dirname, '..', '..', '..', inFile), 'two'); r = run(); ok(!r.skipped, 'changed input rebuilds');
  fs.unlinkSync(path.resolve(__dirname, '..', '..', '..', outFile)); r = run(); ok(!r.skipped, 'missing output rebuilds');
  r = run(['sh', '-c', 'cp ' + inFile + ' ' + outFile + ' # other']); ok(!r.skipped, 'changed command rebuilds');
  ok(run(undefined, true).skipped === false, '--force rebuilds');
  fs.writeFileSync(path.resolve(__dirname, '..', '..', '..', inFile), 'three'); r = S2.guarded('t2', [dir], [], ['sh', '-c', 'exit 3'], path.resolve(__dirname, '..', '..', '..'));
  ok(r.status === 3 && !fs.existsSync(path.join(tmp, 'cache', 't2.stamp')), 'a failed build leaves no stamp');
  fs.rmSync(path.resolve(__dirname, '..', '..', '..', dir), { recursive: true, force: true });
});
t('stamp build --list names the wasm modules of this repository', () => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'stamp.js'), 'build', '--list'], { encoding: 'utf8' });
  ok(r.status === 0 && /gif-writer: /.test(r.stdout) && /zip-open: /.test(r.stdout), r.stdout + r.stderr);
});
t('rotate: drops the warm-up round, turns the order around every round, returns medians', async () => {
  const order = []; const r = await T.rotate(['a', 'b'], 4, (n, rep) => { order.push(rep + n); return n === 'a' ? rep : 10 + rep; });
  ok(order.join() === '0a,0b,1b,1a,2a,2b,3b,3a,4a,4b', order.join());
  ok(r.a === 3 && r.b === 13, JSON.stringify(r));
});
t('speedGuard: flags more than 5% slower, calls the rest faster or same', () => {
  const g = T.speedGuard([{ name: 'x', before: 100, after: 106 }, { name: 'y', before: 100, after: 104 }, { name: 'z', before: 100, after: 50 }, { name: 'w', before: 100, after: 100 }]);
  ok(g[0].slower && !g[1].slower && g[2].verdict === 'faster' && g[2].ratio === 2 && g[3].verdict === 'same', JSON.stringify(g.map((x) => x.verdict)));
});
t('table lines up columns', () => {
  const s = T.table([{ a: 'x', b: 1 }, { a: 'long', b: 22 }], [{ key: 'a', title: 'name', align: 'left' }, { key: 'b', title: 'n' }]).split('\n');
  ok(s.length === 3 && s.every((l) => l.length === s[0].length), s.join('|'));
});
t('lock: one owner at a time, a dead owner does not block, a second wait ends with a note', async () => {
  const free = await T.lock('x1', 100); ok(fs.existsSync(path.join(T.warmDir(), 'x1.lock')), 'lock file');
  const logs = []; const old = console.log; console.log = (m) => logs.push(m);
  const f2 = await T.lock('x1', 300); console.log = old; ok(/going ahead anyway/.test(logs[0] || ''), 'note ' + logs); f2(); free();
  fs.writeFileSync(path.join(T.warmDir(), 'x2.lock'), '999999'); const f3 = await T.lock('x2', 100); f3(); ok(true);
});
t('warmInfo: none without files, found for a live pid, ignored for a dead one', () => {
  ok(T.warmInfo('chromium') === null, 'none');
  fs.mkdirSync(T.warmDir(), { recursive: true });
  fs.writeFileSync(path.join(T.warmDir(), 'chromium.json'), JSON.stringify({ pid: process.pid, endpoint: 'ws://x', version: 'v' })); ok(T.warmInfo('chromium').version === 'v', 'live');
  fs.writeFileSync(path.join(T.warmDir(), 'chromium.json'), JSON.stringify({ pid: 999999, endpoint: 'ws://x' })); ok(T.warmInfo('chromium') === null, 'dead');
});
t('serve: routes, 404, content types and headers', async () => {
  const s = await T.serve({ '/a.js': 'x', '/p.html': () => ({ body: 'y', headers: { 'x-t': '1' } }), '/m.wasm': Buffer.from([0]) });
  const get = async (p) => { const r = await fetch(s.base + p); return { status: r.status, type: r.headers.get('content-type'), h: r.headers.get('x-t'), body: await r.text() }; };
  const a = await get('/a.js'), p = await get('/p.html'), w = await get('/m.wasm'), n = await get('/none');
  s.close(); ok(a.type === 'text/javascript' && p.h === '1' && w.type === 'application/wasm' && n.status === 404, JSON.stringify([a, p, w, n]));
});
t('fingerprint: pageHash gives the same 16 digits for the same pixels and another for one changed pixel (fake canvas)', () => {
  const F = require('../fingerprint.js'), mk = (px) => ({ width: 2, height: 1, getContext: () => ({ getImageData: () => ({ data: px }) }) });
  const run = (px) => { global.document = { querySelector: () => mk(px), querySelectorAll: () => [mk(px)] }; const h = F.pageHash('#c'); delete global.document; return h; };
  const a = run(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), b = run(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), c = run(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 7, 255]));
  ok(/^[0-9a-f]{16}$/.test(a) && a === b && a !== c, [a, b, c].join(' '));
});
t('fingerprint gate: records new pictures, passes the same ones, fails a changed one, accepts it with FINGERPRINT_UPDATE, records a new browser version instead of failing', () => {
  process.env.FINGERPRINT_DIR = tmp + '/fp'; const F = require('../fingerprint.js'), quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
  let g = F.gate('demo', 'chromium', 'Chrome/155.0.1'); g.check('a', 'aaaa'); g.check('b', 'bbbb'); ok(quiet(() => g.finish()) === true, 'first run records');
  g = F.gate('demo', 'chromium', 'Chrome/155.0.1'); g.check('a', 'aaaa'); g.check('b', 'bbbb'); ok(quiet(() => g.finish()) === true, 'same passes');
  g = F.gate('demo', 'chromium', 'Chrome/155.0.1'); g.check('a', 'aaaa'); g.check('b', 'XXXX'); ok(quiet(() => g.finish()) === false, 'changed fails');
  process.env.FINGERPRINT_UPDATE = '1'; g = F.gate('demo', 'chromium', 'Chrome/155.0.1'); g.check('b', 'XXXX'); ok(quiet(() => g.finish()) === true, 'update accepts'); delete process.env.FINGERPRINT_UPDATE;
  g = F.gate('demo', 'chromium', 'Chrome/155.0.1'); g.check('b', 'XXXX'); ok(quiet(() => g.finish()) === true, 'accepted picture now passes');
  g = F.gate('demo', 'chromium', 'Chrome/156.0.2'); g.check('b', 'other'); ok(quiet(() => g.finish()) === true && JSON.parse(fs.readFileSync(tmp + '/fp/demo.json', 'utf8'))['chromium 156.0.2'].b === 'other', 'new version records');
  delete process.env.FINGERPRINT_DIR;
});
t('bisect: finds the commit that broke a file in a throwaway repository, in log2 runs, without touching the checked-out files', () => {
  const B = require('../bisect.js'), repo = tmp + '/repo'; fs.mkdirSync(repo);
  const g = (...a) => cp.execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], { cwd: repo, encoding: 'utf8' });
  g('init', '-q'); const shas = [];
  for (let i = 0; i < 20; i++) { fs.writeFileSync(repo + '/v.txt', i >= 13 ? 'broken' : 'fine'); fs.writeFileSync(repo + '/n.txt', String(i)); g('add', '-A'); g('commit', '-q', '-m', 'commit ' + i); shas.push(g('rev-parse', 'HEAD').trim()); }
  const before = fs.readFileSync(repo + '/v.txt', 'utf8'), r = B.bisect(shas[0], shas[19], ['sh', '-c', 'grep -q fine v.txt'], { repo, quiet: true });
  ok(r.first && r.first.sha === shas[13] && r.first.subject === 'commit 13' && r.first.files.includes('v.txt'), JSON.stringify(r));
  ok(r.runs <= 2 + 5, 'runs ' + r.runs); ok(fs.readFileSync(repo + '/v.txt', 'utf8') === before, 'your files untouched');
  const none = B.bisect(shas[14], shas[19], ['sh', '-c', 'grep -q fine v.txt'], { repo, quiet: true, log: () => {} }); ok(none.first === null, 'a good that is not good');
  const sk = B.bisect(shas[0], shas[19], ['sh', '-c', 'test "$(cat n.txt)" = 12 && exit 125; grep -q fine v.txt'], { repo, quiet: true }); ok(sk.first && sk.first.sha === shas[13], 'skips a commit it cannot test');
});
pending.then(() => { fs.rmSync(tmp, { recursive: true, force: true }); console.log(bad ? 'test-runner: ' + bad + ' FAILED' : 'test-runner: all passed'); process.exit(bad ? 1 : 0); });
