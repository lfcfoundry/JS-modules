// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ graph section (footer section 23, optional; since 0.17.0; SPEC.md 2.3c)
  // A graph kept ready to use: CSR (compressed sparse rows) arrays stored raw in a region after the blocks, so a reader gets typed views onto the file bytes with no parse and no build.
  // Section 23 is JSON { v: 1, nodes, edges, pairs, directed, weights: 'f32' | null, reverse, labels, nodeIds, at: [offset, length, crc32], parts: { name: [offset in region, count] } }.
  // Parts, each starting on an 8-byte boundary of the region (which starts on an 8-byte boundary of the file): offsets (Uint32, nodes + 1), targets (Uint32, edges), weights (Float32, edges, when weighted),
  // then with reverse: rOffsets, rTargets, rWeights (the incoming edges). Undirected graphs store every link both ways (a link from a node to itself once); `pairs` is the number of links given.
  var SEC_GRAPH = 23;
  function graphCol(v, name, obj) {   // a column of the table by key, or an array given directly
    var a = typeof v === 'string' ? (obj && Object.prototype.hasOwnProperty.call(obj, v) ? obj[v] : undefined) : v;
    if (a === undefined || a === null || typeof a.length !== 'number') throw new Error('LfcPack: graph.' + name + ' must be a column name of the table or an array');
    return a;
  }
  // -> { header, region } for graph options g ({ from, to, weight?, directed?, reverse?, nodes?, labels?, nodeIds? }); obj is the table when names are given
  function graphBuild(g, obj) {
    if (!g || typeof g !== 'object') throw new Error('LfcPack: graph must be an object { from, to, weight?, directed?, reverse?, nodes? }');
    var F = graphCol(g.from, 'from', obj), T = graphCol(g.to, 'to', obj), W = g.weight != null ? graphCol(g.weight, 'weight', obj) : null, m = F.length, i, a, b, N = 0, dir = g.directed !== false, rev = !!g.reverse && dir;
    if (T.length !== m || (W && W.length !== m)) throw new Error('LfcPack: graph.from, graph.to and graph.weight must have the same length');
    for (i = 0; i < m; i++) { a = F[i]; b = T[i]; if (!(a >= 0 && a === Math.floor(a) && a < 4294967295) || !(b >= 0 && b === Math.floor(b) && b < 4294967295)) throw new Error('LfcPack: graph link ' + i + ' needs whole node numbers from 0'); if (a >= N) N = a + 1; if (b >= N) N = b + 1; }
    if (g.nodes != null) { if (!(g.nodes >= N && g.nodes === Math.floor(g.nodes) && g.nodes < 4294967295)) throw new Error('LfcPack: graph.nodes must be a whole number at least the highest node number + 1 (' + N + ')'); N = g.nodes; }
    var E = 0; for (i = 0; i < m; i++) E += dir || F[i] === T[i] ? 1 : 2;
    function csr(src, dst, both) {   // counting sort by source; links keep their given order inside a node
      var off = new Uint32Array(N + 1), tg = new Uint32Array(E), wt = W ? new Float32Array(E) : null, fill, j, u, v, p;
      for (j = 0; j < m; j++) { off[src[j] + 1]++; if (both && src[j] !== dst[j]) off[dst[j] + 1]++; }
      for (j = 0; j < N; j++) off[j + 1] += off[j];
      fill = off.slice(0, N);
      for (j = 0; j < m; j++) { u = src[j]; v = dst[j]; p = fill[u]++; tg[p] = v; if (wt) wt[p] = W[j]; if (both && u !== v) { p = fill[v]++; tg[p] = u; if (wt) wt[p] = W[j]; } }
      return [off, tg, wt];
    }
    var out = csr(F, T, !dir), parts = [['offsets', out[0]], ['targets', out[1]]];
    if (W) parts.push(['weights', out[2]]);
    if (rev) { var r = csr(T, F, false); parts.push(['rOffsets', r[0]], ['rTargets', r[1]]); if (W) parts.push(['rWeights', r[2]]); }
    var size = 0, k, at = {}; for (k = 0; k < parts.length; k++) { at[parts[k][0]] = [size, parts[k][1].length]; size += (parts[k][1].byteLength + 7) & ~7; }
    var region = new Uint8Array(size); for (k = 0; k < parts.length; k++) region.set(new Uint8Array(parts[k][1].buffer, 0, parts[k][1].byteLength), at[parts[k][0]][0]);
    var hd = { v: 1, nodes: N, edges: E, pairs: m, directed: dir, weights: W ? 'f32' : null, reverse: rev, labels: typeof g.labels === 'string' ? g.labels : null, nodeIds: typeof g.nodeIds === 'string' ? g.nodeIds : null, parts: at };
    return { header: hd, region: region };
  }
  // the same file with the graph region placed after the blocks (8-byte aligned) and section 23 in the footer; no byte of the blocks changes
  function addGraph(file, gb) {   // gb: graphBuild's result
    var n = file.length, flen = rd32(file, n - 16), bodyEnd = n - 16 - flen, f = file.subarray(bodyEnd, n - 16), body = f[0] === 1 ? S.zfull.decompress(f.subarray(1)) : f.subarray(1), p, have = {};
    for (p = 0; p < body.length; p += 8 + rd32(body, p + 4)) have[rd16(body, p)] = 1;
    if (have[SEC_GRAPH]) throw new Error('LfcPack: the file already has a graph section');
    var off = (bodyEnd + 7) & ~7; gb.header.at = [off, gb.region.length, crcOf(gb.region)];
    var js = te.encode(JSON.stringify(gb.header)), h = new Uint8Array(8); h[0] = SEC_GRAPH; h[1] = SEC_GRAPH >> 8; h.set(u32le(js.length), 4);
    var nf = concat([new Uint8Array([1]), S.zfull.compress(concat([body, h, js]), 3)]), t = new Uint8Array(16);
    t.set(u32le(nf.length), 0); t.set(u32le(crcJS(nf, 0)), 4); t.set(file.subarray(n - 8, n - 4), 8); t.set(MAGIC, 12);
    return concat([file.subarray(0, bodyEnd), new Uint8Array(off - bodyEnd), gb.region, nf, t]);
  }
  // typed views onto the region (no copy when the file's bytes sit on a 4-byte boundary; otherwise one copy of the region)
  function graphViews(hd, rg) {
    if (rg.byteOffset & 3) rg = rg.slice();
    var o = { nodes: hd.nodes, edges: hd.edges, pairs: hd.pairs, directed: hd.directed, labels: hd.labels, nodeIds: hd.nodeIds }, P = hd.parts, k, q;
    var kinds = { offsets: Uint32Array, targets: Uint32Array, weights: Float32Array, rOffsets: Uint32Array, rTargets: Uint32Array, rWeights: Float32Array };
    for (k in kinds) { q = P[k]; if (!q) { if (k === 'weights' || k === 'rWeights' || k.charAt(0) === 'r') o[k] = null; continue; }
      if (q[0] + q[1] * kinds[k].BYTES_PER_ELEMENT > rg.length) throw new Error('LfcPack: graph section part ' + k + ' out of range');
      o[k] = new kinds[k](rg.buffer, rg.byteOffset + q[0], q[1]); }
    if (o.offsets.length !== o.nodes + 1 || o.offsets[o.nodes] !== o.edges) throw new Error('LfcPack: graph section offsets damaged');
    return o;
  }
  function graphHeader(f) { var s = f.sec[SEC_GRAPH]; if (!s) return null; var hd = JSON.parse(tdr.decode(s)); if (!hd || hd.v !== 1 || !Array.isArray(hd.at)) throw new Error('LfcPack: graph section header damaged'); return hd; }
  // graph(bytes, { verify }) -> { nodes, edges, pairs, directed, labels, nodeIds, offsets, targets, weights, rOffsets, rTargets, rWeights } or null; verify: false skips the region checksum
  function graph(bytes, opts) {
    bytes = bytesOf(bytes); var f = readFooter(S.zdec, bytes), hd = graphHeader(f), rg;
    if (!hd) return null;
    if (hd.at[0] + hd.at[1] > f.bodyEnd) throw new Error('LfcPack: graph region out of range');
    rg = bytes.subarray(hd.at[0], hd.at[0] + hd.at[1]);
    if (!(opts && opts.verify === false) && crcOf(rg) !== hd.at[2]) throw new Error('LfcPack: graph region checksum mismatch');
    return graphViews(hd, rg);
  }
