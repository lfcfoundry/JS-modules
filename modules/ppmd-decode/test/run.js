/* Copyright (c) 2026 LFC Foundry. MIT License.
   Tests for ppmd-decode: the fixtures in test/fixtures were written by the C reference encoder (7-Zip's Ppmd7, public domain), so a pass means
   byte-for-byte agreement with it. Also checks arguments, cut-short and corrupt input (must end fast, with an Error or a result), and globals.
   Run: node modules/ppmd-decode/test/run.js   (Node only; no packages, no network; a few seconds) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { build, rng } = require('./fixtures/gen.js');

const FILE = path.join(__dirname, '..', 'ppmd-decode.js');
const FIX = path.join(__dirname, 'fixtures');
const globalsBefore = Object.getOwnPropertyNames(globalThis).sort().join('|');
const ppmd7Decode = require(FILE);
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; if (process.env.VERBOSE) console.log('ok   ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? ' ' + extra : '')); } }
const same = (a, b) => !!a && a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
// run f(); report { ok, value } or { ok: false, err } where err is always an Error whose message starts with "PPMd:" (or the RangeError/TypeError text)
function attempt(f) { try { return { ok: true, value: f() }; } catch (e) { return { ok: false, err: e }; } }
const ourError = (r) => !r.ok && r.err instanceof Error && /^PPMd:/.test(r.err.message);

const man = JSON.parse(fs.readFileSync(path.join(FIX, 'manifest.json'), 'utf8'));
const cases = man.map((m) => ({ m, src: new Uint8Array(fs.readFileSync(path.join(FIX, m.file))), raw: build(m.gen, m.size) }));
const byName = (n) => cases.find((c) => c.m.name === n);

// 1. the shape of the module
check('exports a function named ppmd7Decode', typeof ppmd7Decode === 'function' && ppmd7Decode.name === 'ppmd7Decode');
check('exports fromProps', typeof ppmd7Decode.fromProps === 'function');

// 2. every fixture, byte for byte (orders 2-64, memory 2 KB - 16 MB, several model restarts, odd memory sizes)
for (const c of cases) {
  const t0 = process.hrtime.bigint();
  const r = attempt(() => ppmd7Decode(c.src, c.m.size, c.m.order, c.m.mem));
  check('fixture ' + c.m.name + ' (' + c.m.size + ' bytes, order ' + c.m.order + ', mem ' + c.m.mem + ')', r.ok && r.value instanceof Uint8Array && r.value.length === c.m.size && same(r.value, c.raw), r.err && r.err.message);
  check('fixture ' + c.m.name + ' is quick (' + ms(t0).toFixed(0) + ' ms)', ms(t0) < 3000);
}
check('the fixtures cover orders 2, 6, 12, 32, 64', [2, 6, 12, 32, 64].every((o) => cases.some((c) => c.m.order === o && c.m.size >= 30000)));
check('the fixtures include memory that is not a multiple of 4', cases.some((c) => c.m.mem % 4 !== 0) && cases.some((c) => c.m.mem === 2048));

// 3. the same call twice and interleaved gives the same answer (no state is kept between calls)
{ const a = byName('js-5000'), b = byName('page-12k-m2048');
  const r1 = ppmd7Decode(a.src, a.m.size, a.m.order, a.m.mem), r2 = ppmd7Decode(b.src, b.m.size, b.m.order, b.m.mem), r3 = ppmd7Decode(a.src, a.m.size, a.m.order, a.m.mem);
  check('repeated and interleaved calls agree', same(r1, a.raw) && same(r2, b.raw) && same(r3, a.raw) && r1 !== r3); }

// 4. src may be a view into a bigger buffer, or a Node Buffer
{ const a = byName('js-5000'), big = new Uint8Array(a.src.length + 20); big.fill(0xAB); big.set(a.src, 10);
  check('src as a subarray with an offset', same(ppmd7Decode(big.subarray(10, 10 + a.src.length), a.m.size, a.m.order, a.m.mem), a.raw));
  check('src as a Node Buffer', same(ppmd7Decode(Buffer.from(a.src), a.m.size, a.m.order, a.m.mem), a.raw)); }

// 5. fromProps: the 5-byte 7z coder property blob (order, then memory size as 4 little-endian bytes)
{ const props = (order, mem) => Uint8Array.from([order, mem & 255, (mem >>> 8) & 255, (mem >>> 16) & 255, (mem >>> 24) & 255]);
  for (const n of ['page-30k-odd', 'page-30k-o12', 'run-50k', 'html-100']) {
    const c = byName(n), r = attempt(() => ppmd7Decode.fromProps(c.src, c.m.size, props(c.m.order, c.m.mem)));
    check('fromProps ' + n + ' (props ' + Buffer.from(props(c.m.order, c.m.mem)).toString('hex') + ')', r.ok && same(r.value, c.raw), r.err && r.err.message);
  }
  const c = byName('js-5000');
  check('fromProps accepts a Node Buffer and a plain array', same(ppmd7Decode.fromProps(c.src, c.m.size, Buffer.from(props(c.m.order, c.m.mem))), c.raw) && same(ppmd7Decode.fromProps(c.src, c.m.size, Array.from(props(c.m.order, c.m.mem))), c.raw));
  check('fromProps: maxSize is passed through', /maxSize/.test((attempt(() => ppmd7Decode.fromProps(c.src, c.m.size, props(c.m.order, c.m.mem), { maxSize: 10 })).err || {}).message || ''));
  check('fromProps: 4 bytes is refused', ourError(attempt(() => ppmd7Decode.fromProps(c.src, c.m.size, props(12, 65536).subarray(0, 4)))));
  check('fromProps: nothing is refused', ourError(attempt(() => ppmd7Decode.fromProps(c.src, c.m.size, undefined))));
  check('fromProps: order 1 is refused', ourError(attempt(() => ppmd7Decode.fromProps(c.src, c.m.size, props(1, 65536)))));
  check('fromProps: 0xFFFFFFFF bytes of memory is refused without trying to allocate it', ourError(attempt(() => ppmd7Decode.fromProps(c.src, c.m.size, props(12, 0xFFFFFFFF)))));
  check('fromProps: 2 GB of memory is refused', ourError(attempt(() => ppmd7Decode.fromProps(c.src, c.m.size, props(12, 0x80000000))))); }

// 6. maxSize
{ const c = byName('js-5000'), n = c.m.size;
  const a = attempt(() => ppmd7Decode(c.src, n, c.m.order, c.m.mem, { maxSize: n - 1 }));
  check('maxSize below the size is refused', ourError(a) && /maxSize/.test(a.err.message), a.err && a.err.message);
  check('maxSize equal to the size decodes', same(ppmd7Decode(c.src, n, c.m.order, c.m.mem, { maxSize: n }), c.raw));
  check('an empty opts object decodes', same(ppmd7Decode(c.src, n, c.m.order, c.m.mem, {}), c.raw));
  const t0 = process.hrtime.bigint(), b = attempt(() => ppmd7Decode(c.src, 4e9, c.m.order, c.m.mem, { maxSize: 1 << 20 }));
  check('a 4 GB claim with maxSize is an Error that mentions maxSize, and costs nothing', ourError(b) && /maxSize/.test(b.err.message) && ms(t0) < 100, b.err && b.err.message); }

// 7. a cut-short stream throws, and fast
{ for (const n of ['page-30k-o6', 'js-5000', 'page-12k-m2048', 'random-20k']) {
    const c = byName(n), len = c.src.length, cuts = [0, 1, 4, 5, 6, 7, 20, len >> 3, len >> 2, len >> 1, (len * 3) >> 2, len - 40, len - 12];
    let allThrow = true, worst = 0, odd = '';
    for (const cut of cuts) {
      const t0 = process.hrtime.bigint(), r = attempt(() => ppmd7Decode(c.src.subarray(0, cut), c.m.size, c.m.order, c.m.mem)), t = ms(t0);
      worst = Math.max(worst, t);
      if (!ourError(r)) { allThrow = false; odd += ' cut=' + cut + (r.ok ? ' returned' : ' ' + r.err); }
    }
    check('cut-short ' + n + ' throws at every cut point (worst ' + worst.toFixed(0) + ' ms)' , allThrow && worst < 1500, odd);
    // the last few bytes are the range coder's flush: losing them is allowed to go unnoticed, but then the answer must still be right
    for (const cut of [len - 1, len - 2, len - 4]) {
      const r = attempt(() => ppmd7Decode(c.src.subarray(0, cut), c.m.size, c.m.order, c.m.mem));
      check('cut-short ' + n + ' by ' + (len - cut) + ' byte(s): an Error or the right answer', r.ok ? same(r.value, c.raw) : ourError(r), r.err && r.err.message);
    }
  }
  const t0 = process.hrtime.bigint(), r = attempt(() => ppmd7Decode(new Uint8Array(8), 64 << 20, 12, 1 << 20));
  check('8 zero bytes with a 64 MB claim fail fast (' + ms(t0).toFixed(0) + ' ms)', ourError(r) && ms(t0) < 1500, r.err && r.err.message);
  const r2 = attempt(() => ppmd7Decode(new Uint8Array(0), 10, 12, 1 << 20));
  check('an empty source throws', ourError(r2));
  const r3 = attempt(() => ppmd7Decode(Uint8Array.from([1, 0, 0, 0, 0, 0, 0]), 10, 12, 1 << 20));
  check('a first byte that is not 0 throws', ourError(r3));
  const r4 = attempt(() => ppmd7Decode(Uint8Array.from([0, 255, 255, 255, 255, 0, 0]), 10, 12, 1 << 20));
  check('a start code of all ones throws', ourError(r4));
  check('outSize 0 returns an empty result, even for an empty source', ppmd7Decode(new Uint8Array(0), 0, 12, 1 << 20).length === 0); }

// 8. 300 corrupted copies of a fixture: each one ends within a time limit with an Error or a result of the right length, never a hang or a stray crash
{ const r = rng(1234), picks = [byName('js-5000'), byName('js-5000'), byName('html-100'), byName('page-12k-m2048')];
  let threw = 0, returned = 0, slowest = 0, strange = '';
  const tAll = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) {
    const c = picks[i % picks.length], bad = Uint8Array.from(c.src), mode = i % 3;
    if (mode === 0) { bad[(r() * bad.length) | 0] ^= 1 + ((r() * 255) | 0); }
    else if (mode === 1) for (let k = 0; k < 3; k++) bad[(r() * bad.length) | 0] ^= 1 + ((r() * 255) | 0);
    else { const at = (r() * bad.length) | 0; for (let k = 0; k < 8 && at + k < bad.length; k++) bad[at + k] = (r() * 256) | 0; }
    const t0 = process.hrtime.bigint(), res = attempt(() => ppmd7Decode(bad, c.m.size, c.m.order, c.m.mem)), t = ms(t0);
    slowest = Math.max(slowest, t);
    if (res.ok) { returned++; if (!(res.value instanceof Uint8Array && res.value.length === c.m.size)) strange += ' #' + i + ' wrong result shape'; }
    else { threw++; if (!ourError(res)) strange += ' #' + i + ' ' + res.err; }
  }
  const total = ms(tAll);
  check('300 corrupted copies: only clean Errors or results of the right length' + (strange ? ' (' + strange + ')' : ''), !strange);
  check('300 corrupted copies: none took long (slowest ' + slowest.toFixed(0) + ' ms, all together ' + total.toFixed(0) + ' ms; ' + threw + ' threw, ' + returned + ' returned)', slowest < 1500 && total < 20000);
  check('300 corrupted copies: the check is meaningful (most were noticed)', threw > 30); }

// 9. a wrong outSize
{ const c = byName('js-5000'), n = c.m.size;
  for (const big of [n + 1, n + 100, n * 3, 5 << 20]) {
    const t0 = process.hrtime.bigint(), r = attempt(() => ppmd7Decode(c.src, big, c.m.order, c.m.mem));
    check('outSize ' + big + ' (too big) ends quickly with an Error or a result of that size (' + ms(t0).toFixed(0) + ' ms)', ms(t0) < 3000 && (r.ok ? r.value.length === big : ourError(r)), r.err && r.err.message);
  }
  const small = ppmd7Decode(c.src, 1234, c.m.order, c.m.mem);
  check('outSize too small gives the start of the data', small.length === 1234 && same(small, c.raw.subarray(0, 1234)));
  const rr = byName('run-50k'), t0 = process.hrtime.bigint(), r2 = attempt(() => ppmd7Decode(rr.src, 20 << 20, rr.m.order, rr.m.mem));
  check('a tiny run stream with a 20 MB claim ends quickly (' + ms(t0).toFixed(0) + ' ms)', ms(t0) < 5000 && (r2.ok ? r2.value.length === 20 << 20 : ourError(r2)), r2.err && r2.err.message); }

// 10. bad arguments throw an Error with a clear message
{ const c = byName('js-5000'), good = [c.src, c.m.size, c.m.order, c.m.mem];
  const bad = (label, i, v) => { const a = good.slice(); a[i] = v; const r = attempt(() => ppmd7Decode.apply(null, a)); check('bad argument: ' + label, ourError(r), r.ok ? 'it returned' : String(r.err)); };
  bad('order 1', 2, 1); bad('order 0', 2, 0); bad('order 65', 2, 65); bad('order NaN', 2, NaN); bad('order 2.5', 2, 2.5); bad('order undefined', 2, undefined); bad('order "abc"', 2, 'abc');
  bad('memSize 100', 3, 100); bad('memSize 2047', 3, 2047); bad('memSize NaN', 3, NaN); bad('memSize undefined', 3, undefined); bad('memSize 5000.5', 3, 5000.5);
  bad('memSize 2^31', 3, 2147483648); bad('memSize 4294967231', 3, 4294967231); bad('memSize Infinity', 3, Infinity);
  bad('outSize -1', 1, -1); bad('outSize NaN', 1, NaN); bad('outSize 1.5', 1, 1.5); bad('outSize undefined', 1, undefined);
  check('memSize 2048 is accepted', same(ppmd7Decode(byName('html-100').src, 100, 6, 2048), byName('html-100').raw));
  check('order 2 and order 64 are accepted', same(ppmd7Decode(byName('page-30k-o2').src, 30000, 2, 1048576), byName('page-30k-o2').raw) && same(ppmd7Decode(byName('page-30k-o64').src, 30000, 64, 1048576), byName('page-30k-o64').raw));
  // a memory size that is legal on paper but that the machine cannot give is an Error, not a crash
  const t0 = process.hrtime.bigint(), r = attempt(() => ppmd7Decode(c.src, 5e12, 12, 65536));
  check('an impossible result size is an Error', ourError(r) && ms(t0) < 500, r.err && r.err.message); }

// 11. no global variables are left behind, in Node or in a bare context
{ check('Node: no new globals after all of the above', Object.getOwnPropertyNames(globalThis).sort().join('|') === globalsBefore);
  const text = fs.readFileSync(FILE, 'utf8'), at = text.indexOf('\nif (typeof module');
  check('the export block starts at a line that begins with "if (typeof module"', at > 0 && text.indexOf('\nif (typeof module', at + 1) === -1);
  const head = text.slice(0, at);
  const ctx = vm.createContext({});
  const before = Object.getOwnPropertyNames(ctx).join('|');
  vm.runInContext('"use strict";' + head, ctx);
  const added = Object.getOwnPropertyNames(ctx).filter((k) => before.split('|').indexOf(k) < 0);
  check('the part above the export line defines exactly one global, ppmd7Decode (' + added.join(',') + ')', added.length === 1 && added[0] === 'ppmd7Decode' && typeof ctx.ppmd7Decode === 'function');
  const c = byName('page-30k-o12');
  const namesBefore = Object.getOwnPropertyNames(ctx).join('|');
  const out = ctx.ppmd7Decode(c.src, c.m.size, c.m.order, c.m.mem);
  check('the pasted part decodes on its own (no helpers from below the export line)', same(new Uint8Array(out), c.raw));
  check('...and leaves no global behind', Object.getOwnPropertyNames(ctx).join('|') === namesBefore);
  check('the part above the export line has no fromProps and no module code', !/fromProps|module\.exports/.test(head.replace(/\/\*[\s\S]*?\*\//, '')));
  // house rules for the packer: plain ASCII, one-line throws, lean-cut lines that stand alone
  check('the file is plain ASCII', !/[^\x00-\x7F]/.test(text));
  const lines = text.split('\n'), codeLines = text.slice(text.indexOf('*/') + 2).split('\n');
  const throwsOk = codeLines.every((l) => !/\bthrow\b/.test(l) || /\bthrow new Error\(/.test(l) && (l.split('(').length === l.split(')').length));
  check('every throw is "throw new Error(...)" on one line with balanced parentheses', throwsOk);
  const lean = lines.filter((l) => /\/\/ lean-cut$/.test(l));
  check('lean-cut lines are whole statements that start with "if (" and balance their parentheses (' + lean.length + ' of them)', lean.length >= 5 && lean.every((l) => /^\s*if \(/.test(l) && l.replace(/'[^']*'/g, '').split('(').length === l.replace(/'[^']*'/g, '').split(')').length));
  check('the lean-cut lines cover the argument, maxSize and header checks', ['order >= 2', 'opts.maxSize', 'little-endian', 'bad stream header'].every((w) => lean.some((l) => l.indexOf(w) >= 0)));
  check('the file has the MIT header line', /Copyright \(c\) 2026 LFC Foundry\. MIT License/.test(text.slice(0, 300)));
  check('no tabs and no ES2015+ syntax in the function (let, const, =>, template strings, classes)', !/\t|\blet\s|\bconst\s|=>|`|\bclass\s/.test(head.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^'\n]*'/g, "''"))); }

// 12. speed floor: about 3.5 MB/s in Node; fail only if something is badly wrong (10x slower)
{ const c = byName('page-30k-o6'); ppmd7Decode(c.src, c.m.size, c.m.order, c.m.mem); const t0 = process.hrtime.bigint(); for (let i = 0; i < 5; i++) ppmd7Decode(c.src, c.m.size, c.m.order, c.m.mem); const t = ms(t0) / 5;
  check('30 KB decodes in under 300 ms (took ' + t.toFixed(1) + ' ms, ' + (30000 / 1048576 / (t / 1000)).toFixed(1) + ' MB/s)', t < 300); }

// 13. optional: a round trip through the pure-Python encoder of tools/ppmd-pack, if it is there and python3 runs
{ const py = path.join(__dirname, '..', '..', '..', 'tools', 'ppmd-pack', 'ppmd7_encode.py');
  if (fs.existsSync(py)) {
    let enc = null;
    try {
      const sample = build({ kind: 'slice', off: 3000 }, 6000), tmp = path.join(require('os').tmpdir(), 'ppmd-rt-' + process.pid);
      fs.writeFileSync(tmp, sample);
      const script = 'import sys; sys.path.insert(0, sys.argv[1]); from ppmd7_encode import encode; open(sys.argv[3], "wb").write(encode(open(sys.argv[2], "rb").read(), 8, 65536))';
      execFileSync('python3', ['-I', '-c', script, path.dirname(py), tmp, tmp + '.out'], { stdio: 'ignore', timeout: 60000 });
      enc = { sample, z: new Uint8Array(fs.readFileSync(tmp + '.out')) };
      fs.unlinkSync(tmp); fs.unlinkSync(tmp + '.out');
    } catch (e) { enc = null; }   // python3 missing, a different interface or too slow: skip quietly
    if (enc) { const r = attempt(() => ppmd7Decode(enc.z, enc.sample.length, 8, 65536)); check('round trip through tools/ppmd-pack/ppmd7_encode.py', r.ok && same(r.value, enc.sample), r.err && r.err.message); }
  }
}

console.log(`ppmd-decode: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
