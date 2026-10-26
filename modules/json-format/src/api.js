
  // ================================================================ public API
  var BLOCK_BYTES = 21 << 20;
  function init(opts) {   // -> Promise; loads the wasm modules once. { readOnly: true } skips the zstd encoder.
    var ro = !!(opts && opts.readOnly);
    if (S.ready && (ro || S.zfull)) return S.ready;
    var names = [ro ? 'zstd-dec' : 'zstd-full'].concat(ro ? [] : [coreName()]);
    S.ready = loadAsync(names).then(function (r) {
      if (ro) S.zdec = makeZstd(r[0]); else { S.zfull = makeZstd(r[0]); S.core = r[1]; S.sh = makeShredder(r[1]); S.zdec = S.zfull; }
      return api;
    });
    return S.ready;
  }
  function need(w) { if (w && !S.sh) throw new Error('JsonFormat: call init() first'); if (!S.zdec) throw new Error('JsonFormat: call init({readOnly:true}) or init() first'); }
  function pack(input, opts) {
    opts = opts || {}; need(true);
    var b = bytesOf(input), bb = opts.blockBytes || BLOCK_BYTES, p = 0, blocks = [], parts = [], zone = [], off = 0, rows = 0;
    var ctx = { zs: S.zfull, sh: S.sh };
    while (p < b.length) {
      var e = Math.min(b.length, p + bb);
      if (e < b.length) { var nl = b.indexOf(10, e); e = nl < 0 ? b.length : nl + 1; }
      var blk = writeNestedBlock(ctx, b.subarray(p, e), opts);
      blocks.push([off, blk.bytes.length, crcJS(blk.bytes, 0), blk.rows, 'n']); zone.push(blk.zone); parts.push(blk.bytes);
      off += blk.bytes.length; rows += blk.rows; p = e;
    }
    var secs = [
      { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify({ rows: rows, blocks: blocks.length, writer: 'json-format 0.1.0' })) },
      { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
      { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
      { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: false })) }
    ];
    parts.push(writeFooter(S.zfull, secs, true));
    return concat(parts);
  }
  function openFile(bytes) {
    need(false); bytes = bytesOf(bytes);
    var f = readFooter(S.zdec, bytes), blocks = jsonSec(f.sec[SEC_BLOCKS]);
    if (!blocks) throw new Error('damaged file: block table missing');
    return { bytes: bytes, footer: f, blocks: blocks, header: jsonSec(f.sec[SEC_HEADER]), zone: jsonSec(f.sec[SEC_ZONE]) };
  }
  function blockBytes(file, i) {
    var b = file.blocks[i], x = file.bytes.subarray(b[0], b[0] + b[1]);
    if (b[0] + b[1] > file.footer.bodyEnd) throw new Error('block ' + i + ' out of range');
    if (crcJS(x, 0) !== b[2]) throw new Error('block ' + i + ' checksum mismatch');
    return x;
  }
  function unpack(bytes) {   // -> array of row objects
    var file = openFile(bytes), rd = makeNestedReader(S.zdec), out = [], i, r, j;
    for (i = 0; i < file.blocks.length; i++) { r = rd.readBlock(blockBytes(file, i)); for (j = 0; j < r.length; j++) out.push(r[j]); }
    return out;
  }
  function info(bytes) { var f = openFile(bytes); return { rows: f.header.rows, blocks: f.blocks.length, size: f.bytes.length, major: f.footer.major, minor: f.footer.minor }; }
  var api = { init: init, pack: pack, unpack: unpack, info: info, version: '0.1.0', apiVersion: 0 };
  return api;
});
