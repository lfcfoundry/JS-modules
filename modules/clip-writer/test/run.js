/* Copyright (c) 2026 LFC Foundry. MIT License. clip-writer byte writers (Node, pass/fail only): the MP4 and WebM files it builds are read back by a small independent parser that checks every box / element, the sample table and every sample's bytes. */
'use strict';
const C = require('../clip-writer.js');
let fails = 0; const ok = (c, t) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t); };
const be = (b, p, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p + i]; return v; };
const tag = (b, p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
const samples = (n) => Array.from({ length: n }, (_, i) => ({ data: Uint8Array.from({ length: 5 + (i * 7) % 11 }, (_, k) => (i * 31 + k) & 255), ms: i % 4 === 3 ? 80 : 40, key: i % 5 === 0 }));

function boxes(b, from, to) { const out = []; for (let p = from; p < to;) { const size = be(b, p, 4); out.push({ type: tag(b, p + 4), start: p, body: p + 8, end: p + size }); if (size < 8) throw new Error('bad box size'); p += size; } return out; }
function find(list, t) { return list.find((x) => x.type === t); }
const S = samples(23), avcC = Uint8Array.from([1, 100, 0, 40, 255, 225, 0, 4, 103, 100, 0, 40, 1, 0, 2, 104, 238]);
{
  const data = new Uint8Array([1, 2, 3]), key = { data, ms: 40, key: true };
  let e = null; try { C.writeWebm([{ data, ms: Infinity, key: true }, key], 64, 64); } catch (x) { e = x; }
  ok(e instanceof RangeError && /duration/.test(e.message), 'webm rejects infinite sample durations before writing timestamps');
  e = null; try { C.writeMp4([{ data, ms: NaN, key: true }], 64, 64, avcC); } catch (x) { e = x; }
  ok(e instanceof RangeError && /duration/.test(e.message), 'mp4 rejects NaN sample durations');
  e = null; try { C.writeMp4([{ data, ms: 0x100000000, key: true }], 64, 64, avcC); } catch (x) { e = x; }
  ok(e instanceof RangeError && /MP4 duration/.test(e.message), 'mp4 refuses a duration beyond its 32-bit time field');
  e = null; try { C.writeWebm([key], Infinity, 64); } catch (x) { e = x; }
  ok(e instanceof RangeError && /WebM integer/.test(e.message), 'webm refuses an infinite dimension');
}
const mp4 = C.writeMp4(S, 640, 360, avcC);
{
  const top = boxes(mp4, 0, mp4.length); ok(top.map((x) => x.type).join() === 'ftyp,mdat,moov', 'mp4: top boxes are ftyp, mdat, moov');
  const total = S.reduce((a, s) => a + s.data.length, 0), mdat = find(top, 'mdat'); ok(mdat.end - mdat.body === total, 'mp4: mdat holds exactly the sample bytes');
  const moov = boxes(mp4, find(top, 'moov').body, find(top, 'moov').end), trak = boxes(mp4, find(moov, 'trak').body, find(moov, 'trak').end);
  const mdia = boxes(mp4, find(trak, 'mdia').body, find(trak, 'mdia').end), minf = boxes(mp4, find(mdia, 'minf').body, find(mdia, 'minf').end), stbl = boxes(mp4, find(minf, 'stbl').body, find(minf, 'stbl').end);
  const dur = S.reduce((a, s) => a + s.ms, 0); ok(be(mp4, find(mdia, 'mdhd').body + 4 + 12, 4) === dur, 'mp4: media duration is the sum of the sample times (' + dur + ' ms)');
  const stts = find(stbl, 'stts'), runs = be(mp4, stts.body + 4, 4); let count = 0, ms = 0; for (let r = 0; r < runs; r++) { const c = be(mp4, stts.body + 8 + r * 8, 4), d = be(mp4, stts.body + 12 + r * 8, 4); count += c; ms += c * d; }
  ok(count === S.length && ms === dur, 'mp4: stts covers every sample and the whole duration');
  const stsz = find(stbl, 'stsz'); ok(be(mp4, stsz.body + 8, 4) === S.length && S.every((s, i) => be(mp4, stsz.body + 12 + i * 4, 4) === s.data.length), 'mp4: stsz lists every sample size');
  const stss = find(stbl, 'stss'), keys = []; for (let i = 0; i < be(mp4, stss.body + 4, 4); i++) keys.push(be(mp4, stss.body + 8 + i * 4, 4)); ok(keys.join() === S.map((s, i) => s.key ? i + 1 : 0).filter(Boolean).join(), 'mp4: stss lists the key pictures');
  const stco = find(stbl, 'stco'), off = be(mp4, stco.body + 8, 4); ok(off === mdat.body, 'mp4: the chunk offset points at the first sample');
  let p = off, same = true; for (const s of S) { for (let k = 0; k < s.data.length; k++) if (mp4[p + k] !== s.data[k]) same = false; p += s.data.length; } ok(same, 'mp4: every sample is where the table says');
  const vf = (bx) => mp4[bx.body] + ':' + be(mp4, bx.body + 1, 3);   // version:flags
  const dinf = boxes(mp4, find(minf, 'dinf').body, find(minf, 'dinf').end), dref = find(dinf, 'dref'), urlb = boxes(mp4, dref.body + 8, dref.end)[0];
  ok(vf(find(trak, 'tkhd')) === '0:3' && vf(find(minf, 'vmhd')) === '0:1' && urlb.type === 'url ' && vf(urlb) === '0:1' && ['mvhd'].every((k) => vf(find(moov, k)) === '0:0'), 'mp4: tkhd is version 0 with flags 3, vmhd and the self-contained url entry have flags 1 (strict players need this)');
  const stsd = find(stbl, 'stsd'), avc1 = boxes(mp4, stsd.body + 8, stsd.end)[0], inner = boxes(mp4, avc1.body + 78, avc1.end);
  ok(avc1.type === 'avc1' && be(mp4, avc1.body + 24, 2) === 640 && be(mp4, avc1.body + 26, 2) === 360 && find(inner, 'avcC') && mp4.slice(find(inner, 'avcC').body, find(inner, 'avcC').end).join() === avcC.join(), 'mp4: avc1 has the size and the avcC record');
}

// WebM: a small EBML reader
function vint(b, p, keepMarker) { let l = 1; while (l <= 8 && !(b[p] & (0x80 >> (l - 1)))) l++; let v = keepMarker ? b[p] : b[p] & (0xff >> l); for (let i = 1; i < l; i++) v = v * 256 + b[p + i]; return { v, len: l }; }
function elements(b, from, to) { const out = []; for (let p = from; p < to;) { const id = vint(b, p, true), sz = vint(b, p + id.len, false); const start = p + id.len + sz.len; out.push({ id: id.v, start: p, body: start, end: start + sz.v }); p = start + sz.v; } return out; }
const W = C.writeWebm(S, 320, 180);
{
  const top = elements(W, 0, W.length); ok(top.length === 2 && top[0].id === 0x1a45dfa3 && top[1].id === 0x18538067, 'webm: an EBML header then one Segment');
  ok(top[1].end === W.length, 'webm: the Segment size covers the file');
  const seg = elements(W, top[1].body, top[1].end), tracks = seg.find((e) => e.id === 0x1654ae6b), cues = seg.find((e) => e.id === 0x1c53bb6b), clusters = seg.filter((e) => e.id === 0x1f43b675);
  ok(tracks && cues && clusters.length >= 2, 'webm: tracks, cues and ' + clusters.length + ' clusters (a new one at each key picture)');
  let blocks = 0, bytes = 0, t = 0, same = true, si = 0; const clusterStart = [];
  for (const c of clusters) {
    clusterStart.push(c.start - top[1].body); const kids = elements(W, c.body, c.end), ct = kids.find((e) => e.id === 0xe7); let tv = 0; for (let i = ct.body; i < ct.end; i++) tv = tv * 256 + W[i];
    for (const k of kids.filter((e) => e.id === 0xa3)) { const rel = (W[k.body + 1] << 8) | W[k.body + 2]; if (tv + rel !== t) same = false; const flags = W[k.body + 3], data = W.slice(k.body + 4, k.end), s = S[si++]; if (!!(flags & 0x80) !== s.key || data.join() !== Array.from(s.data).join()) same = false; t += s.ms; blocks++; bytes += data.length; }
  }
  ok(blocks === S.length && same, 'webm: every picture is a SimpleBlock with the right time, key flag and bytes');
  const cp = elements(W, cues.body, cues.end).map((pt) => { const kids = elements(W, pt.body, pt.end), tp = kids.find((e) => e.id === 0xb7), pos = elements(W, tp.body, tp.end).find((e) => e.id === 0xf1); let v = 0; for (let i = pos.body; i < pos.end; i++) v = v * 256 + W[i]; return v; });
  if (process.env.DEBUG) console.log(cp, clusterStart);
  ok(cp.length === S.filter((s) => s.key).length && cp.every((v) => clusterStart.includes(v)), 'webm: each cue points at the start of a cluster');
}
// cue positions must hold for any file size (their own length depends on the numbers in them)
{
  let all = true;
  for (const n of [1, 6, 26, 200, 900]) {
    const sm = Array.from({ length: n }, (_, i) => ({ data: new Uint8Array(40 + (i * 13) % 300).fill(i & 255), ms: 40, key: i % 5 === 0 })), w = C.writeWebm(sm, 64, 64), top = elements(w, 0, w.length), seg = elements(w, top[1].body, top[1].end);
    const cues = seg.find((e) => e.id === 0x1c53bb6b), starts = seg.filter((e) => e.id === 0x1f43b675).map((e) => e.start - top[1].body);
    for (const pt of elements(w, cues.body, cues.end)) { const tp = elements(w, pt.body, pt.end).find((e) => e.id === 0xb7), pos = elements(w, tp.body, tp.end).find((e) => e.id === 0xf1); let v = 0; for (let i = pos.body; i < pos.end; i++) v = v * 256 + w[i]; if (!starts.includes(v)) all = false; }
  }
  ok(all, 'webm: cue positions are right for 1, 6, 26, 200 and 900 pictures');
}
// random sample sets (seeded): every file must read back exactly, whatever the sizes, times and key pattern
{
  let seed = 11, bad = '';
  const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let round = 0; round < 300 && !bad; round++) {
    const n = 1 + Math.floor(r() * (round % 10 === 0 ? 400 : 40)), sm = Array.from({ length: n }, (_, i) => ({ data: Uint8Array.from({ length: 1 + Math.floor(Math.pow(r(), 3) * 3000) }, () => Math.floor(r() * 256)), ms: [1, 33, 40, 40, 40, 100, 1000][Math.floor(r() * 7)], key: i === 0 || r() < 0.1 }));
    const m = C.writeMp4(sm, 2 + 2 * Math.floor(r() * 400), 2 + 2 * Math.floor(r() * 300), avcC), tp = boxes(m, 0, m.length), md = find(tp, 'mdat'), mo = boxes(m, find(tp, 'moov').body, find(tp, 'moov').end);
    const tr = boxes(m, find(mo, 'trak').body, find(mo, 'trak').end), mi = boxes(m, find(tr, 'mdia').body, find(tr, 'mdia').end), st = boxes(m, find(boxes(m, find(mi, 'minf').body, find(mi, 'minf').end), 'stbl').body, find(boxes(m, find(mi, 'minf').body, find(mi, 'minf').end), 'stbl').end);
    const sz = find(st, 'stsz'); let p = md.body; for (let i = 0; i < n && !bad; i++) { if (be(m, sz.body + 12 + i * 4, 4) !== sm[i].data.length) bad = 'mp4 size ' + round; for (let k = 0; k < sm[i].data.length; k += 97) if (m[p + k] !== sm[i].data[k]) bad = 'mp4 bytes ' + round; p += sm[i].data.length; }
    if (md.end - md.body !== p - md.body) bad = bad || 'mp4 mdat ' + round;
    const w = C.writeWebm(sm, 64, 48), t2 = elements(w, 0, w.length), sg = elements(w, t2[1].body, t2[1].end), cu = sg.find((e) => e.id === 0x1c53bb6b), cl = sg.filter((e) => e.id === 0x1f43b675), starts = cl.map((e) => e.start - t2[1].body);
    if (t2[1].end !== w.length) bad = bad || 'webm size ' + round;
    for (const pt of elements(w, cu.body, cu.end)) { const q = elements(w, pt.body, pt.end).find((e) => e.id === 0xb7), pe = elements(w, q.body, q.end).find((e) => e.id === 0xf1); let v = 0; for (let i = pe.body; i < pe.end; i++) v = v * 256 + w[i]; if (!starts.includes(v)) bad = bad || 'webm cue ' + round; }
    let cnt = 0; for (const c of cl) cnt += elements(w, c.body, c.end).filter((e) => e.id === 0xa3).length; if (cnt !== n) bad = bad || 'webm count ' + round;
  }
  ok(!bad, 'random sample sets: 300 rounds read back exactly in both formats' + (bad ? ' (' + bad + ')' : ''));
}
// fragmented MP4: read back with a separate parser (init, then moof + mdat pairs), including random sets
function readFmp4(f) {
  const top = boxes(f, 0, f.length), types = top.map((x) => x.type), res = { types, samples: [], frag: [], err: '' };
  if (types[0] !== 'ftyp' || types[1] !== 'moov') res.err = 'order';
  const moov = boxes(f, find(top, 'moov').body, find(top, 'moov').end); res.mvex = !!find(moov, 'mvex'); res.mvhdDur = be(f, find(moov, 'mvhd').body + 16, 4);
  let t = 0, seq = 0;
  for (let i = 2; i < top.length; i += 2) {
    const mo = top[i], md = top[i + 1]; if (mo.type !== 'moof' || !md || md.type !== 'mdat') { res.err = res.err || 'pair ' + i; break; }
    const k = boxes(f, mo.body, mo.end), mfhd = find(k, 'mfhd'), traf = boxes(f, find(k, 'traf').body, find(k, 'traf').end);
    if (be(f, mfhd.body + 4, 4) !== ++seq) res.err = res.err || 'seq';
    const tfhd = find(traf, 'tfhd'), tfdt = find(traf, 'tfdt'), trun = find(traf, 'trun'), tf = be(f, tfhd.body + 1, 3);
    let q = tfhd.body + 8, defDur = 0, defFlags = 0; if (tf & 8) { defDur = be(f, q, 4); q += 4; } if (tf & 0x20) { defFlags = be(f, q, 4); q += 4; }
    if (!(tf & 0x20000) || (tf & 1)) res.err = res.err || 'tfhd flags';
    if (be(f, tfdt.body + 4, 8) !== t) res.err = res.err || 'tfdt ' + be(f, tfdt.body + 4, 8) + ' vs ' + t;
    const tr = be(f, trun.body + 1, 3), n = be(f, trun.body + 4, 4), off = be(f, trun.body + 8, 4); q = trun.body + 12; let first = defFlags; if (tr & 4) { first = be(f, q, 4); q += 4; }
    if (mo.start + off !== md.body) res.err = res.err || 'data offset';
    let pos = md.body; const fr = { n, key: !!(first & 0x02000000) && !(first & 0x10000), ms: 0 };
    for (let j = 0; j < n; j++) {
      let d = defDur, sz; if (tr & 0x100) { d = be(f, q, 4); q += 4; } sz = be(f, q, 4); q += 4;
      res.samples.push({ data: f.subarray(pos, pos + sz), ms: d, key: j === 0 && fr.key }); pos += sz; t += d; fr.ms += d;
    }
    if (pos !== md.end) res.err = res.err || 'mdat size';
    res.frag.push(fr);
  }
  res.total = t; return res;
}
{
  const f = C.writeFmp4(S, 640, 360, avcC), R = readFmp4(f), keyCount = S.filter((s) => s.key).length;
  ok(!R.err && R.types.join() === ['ftyp', 'moov'].concat(...Array(keyCount).fill(['moof', 'mdat'])).join(), 'fmp4: ftyp, moov, then a moof + mdat pair for each of the ' + keyCount + ' key-picture runs' + (R.err ? ' (' + R.err + ')' : ''));
  ok(R.mvex && R.mvhdDur === 0 && R.frag.every((x) => x.key), 'fmp4: moov has mvex, no duration of its own, and every run starts on a key picture');
  ok(R.samples.length === S.length && R.samples.every((s, i) => s.ms === S[i].ms && Array.from(s.data).join() === Array.from(S[i].data).join()), 'fmp4: every picture comes back with its bytes and its time');
  ok(R.total === S.reduce((a, s) => a + s.ms, 0), 'fmp4: the fragment times add up to the whole clip');
  const seg = C.writeFmp4Segments(S, 640, 360, avcC), join = new Uint8Array(seg.init.length + seg.fragments.reduce((a, x) => a + x.length, 0)); let pp = 0; for (const x of [seg.init].concat(seg.fragments)) { join.set(x, pp); pp += x.length; }
  ok(seg.fragments.length === keyCount && join.length === f.length && join.every((v, i) => v === f[i]), 'fmp4: writeFmp4Segments pieces joined are exactly the file');
  ok(C.writeFmp4([], 64, 64, avcC).length === C.writeFmp4Segments([], 64, 64, avcC).init.length, 'fmp4: no pictures gives only the start-up header');
  let e = null; try { C.writeFmp4([{ data: new Uint8Array(1), ms: -1, key: true }], 64, 64, avcC); } catch (x) { e = x; } ok(e instanceof RangeError, 'fmp4: refuses a bad frame time');
  let seed = 5, bad = '';
  const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let round = 0; round < 300 && !bad; round++) {
    const n = 1 + Math.floor(r() * (round % 10 === 0 ? 400 : 40)), same = r() < 0.5, keyEvery = 1 + Math.floor(r() * 12);
    const sm = Array.from({ length: n }, (_, i) => ({ data: Uint8Array.from({ length: 1 + Math.floor(Math.pow(r(), 3) * 2000) }, () => Math.floor(r() * 256)), ms: same ? 40 : 1 + Math.floor(r() * 200), key: i % keyEvery === 0 }));
    const g = readFmp4(C.writeFmp4(sm, 2 + 2 * Math.floor(r() * 400), 2 + 2 * Math.floor(r() * 300), avcC));
    if (g.err) bad = g.err + ' ' + round; else if (g.samples.length !== n) bad = 'count ' + round;
    else for (let i = 0; i < n && !bad; i++) if (g.samples[i].ms !== sm[i].ms || g.samples[i].data.length !== sm[i].data.length || g.samples[i].data.some((v, k) => v !== sm[i].data[k])) bad = 'sample ' + i + ' round ' + round;
  }
  ok(!bad, 'fmp4: random sample sets (equal and different times): 300 rounds read back exactly' + (bad ? ' (' + bad + ')' : ''));
}
// sound: one AAC track in MP4 and in fragmented MP4 (bytes only; real decoding was checked with ffmpeg)
{
  const mkAudio = (m, seed0) => { let sd = seed0; const r = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296; return { samples: Array.from({ length: m }, (_, i) => ({ data: Uint8Array.from({ length: 20 + Math.floor(r() * 300) }, () => Math.floor(r() * 256)), ticks: i % 7 === 6 ? 512 : 1024 })), sampleRate: 44100, channels: 2, config: Uint8Array.from([18, 16]) }; };
  const traks = (f) => { const top = boxes(f, 0, f.length), moov = find(top, 'moov'); return boxes(f, moov.body, moov.end).filter((x) => x.type === 'trak'); };
  const trackInfo = (f, trak) => { const k = boxes(f, trak.body, trak.end), mdia = boxes(f, find(k, 'mdia').body, find(k, 'mdia').end), hdlr = find(mdia, 'hdlr'), mdhd = find(mdia, 'mdhd'); return { kind: tag(f, hdlr.body + 8), scale: be(f, mdhd.body + 12, 4), dur: be(f, mdhd.body + 16, 4), tkhd: find(k, 'tkhd'), mdia }; };
  const A = mkAudio(30, 9), ticksAll = A.samples.reduce((a, x) => a + x.ticks, 0);
  const f = C.writeMp4(S, 640, 360, avcC, A), tk = traks(f).map((t) => ({ t, i: trackInfo(f, t) }));
  ok(tk.length === 2 && tk[0].i.kind === 'vide' && tk[1].i.kind === 'soun', 'mp4 + sound: a video track then a sound track');
  const at = tk[1], minf = boxes(f, find(at.i.mdia, 'minf').body, find(at.i.mdia, 'minf').end), stbl = boxes(f, find(minf, 'stbl').body, find(minf, 'stbl').end);
  ok(at.i.scale === 44100 && at.i.dur === ticksAll && be(f, at.i.tkhd.body + 12, 4) === 2, 'mp4 + sound: sound time scale is the sample rate, duration is the sum of the sample lengths, track number 2');
  const stsz = find(stbl, 'stsz'), stco = find(stbl, 'stco'); let ap = be(f, stco.body + 8, 4), same = be(f, stsz.body + 8, 4) === A.samples.length;
  A.samples.forEach((x, i) => { if (be(f, stsz.body + 12 + i * 4, 4) !== x.data.length) same = false; for (let q = 0; q < x.data.length; q++) if (f[ap + q] !== x.data[q]) same = false; ap += x.data.length; });
  ok(same, 'mp4 + sound: every sound sample is where its table says');
  const stsd = find(stbl, 'stsd'), mp4a = boxes(f, stsd.body + 8, stsd.end)[0], esds = boxes(f, mp4a.body + 28, mp4a.end)[0], ed = Array.from(f.subarray(esds.body + 4, esds.end)).join();
  ok(mp4a.type === 'mp4a' && be(f, mp4a.body + 16, 2) === 2 && be(f, mp4a.body + 24, 2) === 44100 && esds.type === 'esds' && ed.includes('5,2,18,16,6,1,2'), 'mp4 + sound: mp4a has 2 channels, 44100 Hz and the AAC config in esds');
  const top = boxes(f, 0, f.length), mdat = find(top, 'mdat'); ok(mdat.end - mdat.body === S.reduce((a, x) => a + x.data.length, 0) + A.samples.reduce((a, x) => a + x.data.length, 0), 'mp4 + sound: mdat holds the pictures then the sound');
  ok(be(f, find(boxes(f, find(top, 'moov').body, find(top, 'moov').end), 'mvhd').body + 16, 4) === Math.max(S.reduce((a, x) => a + x.ms, 0), Math.round(ticksAll * 1000 / 44100)), 'mp4 + sound: movie length is the longer of the two');
  // fragmented
  function readFmp4av(g) {
    const top = boxes(g, 0, g.length), res = { v: [], a: [], err: '' }, tr = traks(g); if (tr.length !== 2) res.err = 'tracks';
    let at2 = 0; const trex = boxes(g, find(boxes(g, find(top, 'moov').body, find(top, 'moov').end), 'mvex').body, find(boxes(g, find(top, 'moov').body, find(top, 'moov').end), 'mvex').end).filter((x) => x.type === 'trex'); if (trex.length !== 2) res.err = res.err || 'trex';
    for (let i = 2; i < top.length; i += 2) {
      const mo = top[i], md = top[i + 1]; if (mo.type !== 'moof' || md.type !== 'mdat') { res.err = res.err || 'pair'; break; }
      let used = 0;
      for (const tf of boxes(g, mo.body, mo.end).filter((x) => x.type === 'traf')) {
        const k = boxes(g, tf.body, tf.end), tfhd = find(k, 'tfhd'), id = be(g, tfhd.body + 4, 4), trun = find(k, 'trun'), tfdt = find(k, 'tfdt'), fl = be(g, trun.body + 1, 3), n = be(g, trun.body + 4, 4), off = be(g, trun.body + 8, 4);
        let q = trun.body + 12, defDur = 0, tf0 = be(g, tfhd.body + 1, 3), z = tfhd.body + 8; if (tf0 & 8) { defDur = be(g, z, 4); z += 4; } if (fl & 4) q += 4;
        let pos = mo.start + off; const base = be(g, tfdt.body + 4, 8);
        for (let j = 0; j < n; j++) { let d = defDur; if (fl & 0x100) { d = be(g, q, 4); q += 4; } const sz = be(g, q, 4); q += 4; (id === 1 ? res.v : res.a).push({ data: g.subarray(pos, pos + sz), ms: d, base: j === 0 ? base : -1 }); pos += sz; used += sz; }
      }
      if (md.body + used !== md.end) res.err = res.err || 'mdat size';
    }
    return res;
  }
  let g = C.writeFmp4(S, 640, 360, avcC, A), R = readFmp4av(g);
  ok(!R.err && R.v.length === S.length && R.a.length === A.samples.length, 'fmp4 + sound: every picture and every sound sample comes back' + (R.err ? ' (' + R.err + ')' : ''));
  ok(R.a.every((x, i) => x.ms === A.samples[i].ticks && Array.from(x.data).join() === Array.from(A.samples[i].data).join()) && R.v.every((x, i) => x.ms === S[i].ms && Array.from(x.data).join() === Array.from(S[i].data).join()), 'fmp4 + sound: bytes and times are right for both tracks');
  let cum = 0, okBase = true; R.a.forEach((x) => { if (x.base >= 0 && x.base !== cum) okBase = false; cum += x.ms; }); ok(okBase, 'fmp4 + sound: each sound piece starts at the right time (tfdt)');
  const seg = C.writeFmp4Segments(S, 640, 360, avcC, A); ok(seg.fragments.length === S.filter((x) => x.key).length, 'fmp4 + sound: still one piece per key-picture run');
  let bad = '', sd2 = 17; const r2 = () => (sd2 = (Math.imul(sd2, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let round = 0; round < 200 && !bad; round++) {
    const n = 1 + Math.floor(r2() * 50), ke = 1 + Math.floor(r2() * 8), sm = Array.from({ length: n }, (_, i) => ({ data: Uint8Array.from({ length: 1 + Math.floor(r2() * 300) }, () => Math.floor(r2() * 256)), ms: 40, key: i % ke === 0 })), Au = mkAudio(Math.floor(r2() * 120), round + 100);
    const Q = Au.samples.length ? readFmp4av(C.writeFmp4(sm, 64, 48, avcC, Au)) : null; if (!Q) continue;
    if (Q.err) bad = Q.err + ' ' + round; else if (Q.v.length !== n || Q.a.length !== Au.samples.length) bad = 'count ' + round; else if (Q.a.some((x, i) => x.ms !== Au.samples[i].ticks || x.data.some((v, k) => v !== Au.samples[i].data[k]))) bad = 'audio ' + round;
    const P = C.writeMp4(sm, 64, 48, avcC, Au); if (!bad && P.length < 100) bad = 'mp4 ' + round;
  }
  ok(!bad, 'sound: 200 random clips read back exactly in fragmented MP4' + (bad ? ' (' + bad + ')' : ''));
  let e = null; try { C.writeMp4(S, 64, 64, avcC, { samples: [{ data: new Uint8Array(1), ticks: -1 }], sampleRate: 44100, channels: 2, config: Uint8Array.from([18, 16]) }); } catch (x) { e = x; } ok(e instanceof RangeError, 'sound: a bad sample length is refused');
}
// output options: fast-start MP4, segment index, Blob output
(async () => {
  const A2 = { samples: Array.from({ length: 12 }, (_, i) => ({ data: Uint8Array.from({ length: 30 + i }, (_, k) => i * 5 + k & 255), ticks: 1024 })), sampleRate: 44100, channels: 2, config: Uint8Array.from([18, 16]) };
  for (const au of [null, A2]) {
    const nm = au ? ' with sound' : '', plain = C.writeMp4(S, 640, 360, avcC, au), fast = C.writeMp4(S, 640, 360, avcC, au, { fastStart: true });
    const top = boxes(fast, 0, fast.length), moov = find(top, 'moov'), mdat = find(top, 'mdat');
    ok(top.map((x) => x.type).join() === 'ftyp,moov,mdat' && fast.length === plain.length, 'fast-start' + nm + ': index before the pictures, same file size');
    const tr = boxes(fast, moov.body, moov.end).filter((x) => x.type === 'trak'); let offsets = [];
    for (const t of tr) { const k = boxes(fast, t.body, t.end), mdia = boxes(fast, find(k, 'mdia').body, find(k, 'mdia').end), minf = boxes(fast, find(mdia, 'minf').body, find(mdia, 'minf').end), stbl = boxes(fast, find(minf, 'stbl').body, find(minf, 'stbl').end), co = find(stbl, 'stco'); offsets.push(be(fast, co.body + 8, 4)); }
    ok(offsets[0] === mdat.body && (!au || offsets[1] === mdat.body + S.reduce((a, x) => a + x.data.length, 0)), 'fast-start' + nm + ': chunk offsets point at the first picture' + (au ? ' and the first sound sample' : ''));
    const pk = C.writeMp4(S, 640, 360, avcC, au, { blob: true }), fk = C.writeFmp4(S, 640, 360, avcC, au), fb = C.writeFmp4(S, 640, 360, avcC, au, { blob: true });
    const same = async (a, b) => { const x = new Uint8Array(await b.arrayBuffer()); return a.length === x.length && a.every((v, i) => v === x[i]); };
    ok(pk instanceof Blob && pk.type === 'video/mp4' && await same(plain, pk) && await same(fk, fb) && await same(fast, C.writeMp4(S, 640, 360, avcC, au, { fastStart: true, blob: true })), 'blob' + nm + ': Blob output holds exactly the same bytes as the array output (mp4, fast-start, fmp4)');
    const si = C.writeFmp4(S, 640, 360, avcC, au, { sidx: true }), t2 = boxes(si, 0, si.length), sx = find(t2, 'sidx'), cnt = be(si, sx.body + 4 + 20 - 2, 2);
    const frs = t2.filter((x) => x.type === 'moof'), keyN = S.filter((x) => x.key).length; let good = t2[2].type === 'sidx' && cnt === keyN && frs.length === keyN;
    for (let i = 0; i < cnt && good; i++) { const e = sx.body + 24 + i * 12, size = be(si, e, 4), dur = be(si, e + 4, 4), want = t2.find((x, q) => x === frs[i]); const mdN = t2[t2.indexOf(frs[i]) + 1]; if (mdN.end - frs[i].start !== size) good = false; if (i === 0 && dur !== S.slice(0, S.findIndex((x, q) => q > 0 && x.key)).reduce((a, x) => a + x.ms, 0)) good = false; }
    ok(good && await same(si, C.writeFmp4(S, 640, 360, avcC, au, { sidx: true, blob: true })), 'sidx' + nm + ': one entry per piece with the right byte size and the first piece length; Blob equals array');
  }
  console.log(fails ? 'clip-writer: ' + fails + ' FAILED' : 'clip-writer: all passed'); process.exit(fails ? 1 : 0);
})();
