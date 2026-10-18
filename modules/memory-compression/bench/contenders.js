'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Each contender: {id, kind, make(sample)->{enc(v)->bytes|string, dec(x)->value}, bytes(x)->size}
// 'bytes' contenders produce a Uint8Array/Buffer; size = its length. Everything must round-trip to a deep-equal value.
module.exports = function (L, opts) {
  opts = opts || {};
  var C = [], TE = new TextEncoder(), TD = new TextDecoder();
  function add(id, group, make, note) { C.push({ id: id, group: group, make: make, note: note || '', cap: /^(zipson|compress-json|lz-string|jsonpack|bson|JSON\+fflate6)$/.test(id) ? 20000 : 0 }); }
  var J = L.JSO;
  add('jso-fast', 'this module', function () { return { enc: function (v) { return J.pack(v, { mode: 'fast' }); }, dec: function (b) { return J.unpack(b); } }; });
  add('jso-small', 'this module', function () { return { enc: function (v) { return J.pack(v, { mode: 'small' }); }, dec: function (b) { return J.unpack(b); } }; });
  if (L.JSO_OLD) {
    add('jso-1.0.0-fast', 'this module (old)', function () { return { enc: function (v) { return L.JSO_OLD.pack(v, { mode: 'fast' }); }, dec: function (b) { return L.JSO_OLD.unpack(b); } }; });
    add('jso-1.0.0-small', 'this module (old)', function () { return { enc: function (v) { return L.JSO_OLD.pack(v, { mode: 'small' }); }, dec: function (b) { return L.JSO_OLD.unpack(b); } }; });
  }
  add('JSON', 'text', function () { return { enc: function (v) { return TE.encode(JSON.stringify(v)); }, dec: function (b) { return JSON.parse(TD.decode(b)); } }; });
  if (L.fflate) {
    add('JSON+fflate1', 'text+compress', function () { return { enc: function (v) { return L.fflate.gzipSync(TE.encode(JSON.stringify(v)), { level: 1 }); }, dec: function (b) { return JSON.parse(TD.decode(L.fflate.gunzipSync(b))); } }; });
    add('JSON+fflate6', 'text+compress', function () { return { enc: function (v) { return L.fflate.gzipSync(TE.encode(JSON.stringify(v)), { level: 6 }); }, dec: function (b) { return JSON.parse(TD.decode(L.fflate.gunzipSync(b))); } }; });
  }
  if (L.lz4js) add('JSON+lz4js', 'text+compress', function () { return { enc: function (v) { return L.lz4js.compress(TE.encode(JSON.stringify(v))); }, dec: function (b) { return JSON.parse(TD.decode(L.lz4js.decompress(b))); } }; });
  if (L.msgpackr) {
    add('msgpackr', 'binary', function () { var p = new L.msgpackr.Packr({ useRecords: false }), u = new L.msgpackr.Unpackr({ useRecords: false }); return { enc: function (v) { return p.pack(v); }, dec: function (b) { return u.unpack(b); } }; });
    add('msgpackr-records', 'binary', function () { var p = new L.msgpackr.Packr({ useRecords: true }), u = new L.msgpackr.Unpackr({ useRecords: true }); return { enc: function (v) { return p.pack(v); }, dec: function (b) { return u.unpack(b); } }; }, 'record extension');
    add('msgpackr-bundle', 'binary', function () { var p = new L.msgpackr.Packr({ useRecords: true, bundleStrings: true }), u = new L.msgpackr.Unpackr({ useRecords: true, bundleStrings: true }); return { enc: function (v) { return p.pack(v); }, dec: function (b) { return u.unpack(b); } }; }, 'records + bundled strings');
  }
  if (L.cbor) add('cbor-x', 'binary', function () { var e = new L.cbor.Encoder({ useRecords: false }), d = new L.cbor.Decoder({ useRecords: false }); return { enc: function (v) { return e.encode(v); }, dec: function (b) { return d.decode(b); } }; });
  if (L.cbor) add('cbor-x-records', 'binary', function () { var e = new L.cbor.Encoder({ useRecords: true }), d = new L.cbor.Decoder({ useRecords: true }); return { enc: function (v) { return e.encode(v); }, dec: function (b) { return d.decode(b); } }; }, 'record extension');
  if (L.msgpack) add('@msgpack/msgpack', 'binary', function () { return { enc: function (v) { return L.msgpack.encode(v); }, dec: function (b) { return L.msgpack.decode(b); } }; });
  if (L.notepack) add('notepack.io', 'binary', function () { return { enc: function (v) { return L.notepack.encode(v); }, dec: function (b) { return L.notepack.decode(b); } }; });
  if (L.avsc) {
    add('avsc', 'schema', function (sample) {
      var t0 = L.avsc.Type.forValue(sample), t = L.avsc.Type.forSchema(JSON.parse(JSON.stringify(t0.schema()).replace(/"float"/g, '"double"')));   // forValue picks 32-bit floats for decimals; widened so no digits are lost
      return { enc: function (v) { return t.toBuffer(v); }, dec: function (b) { return t.fromBuffer(b); } };
    }, 'schema inferred from the data (Avro) with floats widened to doubles; hands back its own record class; undefined/Map/Date not supported');
    C[C.length - 1].loose = true;
  }
  if (L.v8) add('v8.serialize', 'engine', function () { return { enc: function (v) { return L.v8.serialize(v); }, dec: function (b) { return L.v8.deserialize(b); } }; }, 'Node only');
  if (L.bson) add('bson', 'binary', function () { return { enc: function (v) { return L.bson.serialize({ v: v }); }, dec: function (b) { return L.bson.deserialize(b).v; } }; });
  if (L.zipson) add('zipson', 'json-compress', function () { return { enc: function (v) { return TE.encode(L.zipson.stringify(v)); }, dec: function (b) { return L.zipson.parse(TD.decode(b)); } }; });
  if (L.cjson) add('compress-json', 'json-compress', function () { return { enc: function (v) { return TE.encode(JSON.stringify(L.cjson.compress(v))); }, dec: function (b) { return L.cjson.decompress(JSON.parse(TD.decode(b))); } }; });
  if (L.lzstring) add('lz-string', 'text+compress', function () { return { enc: function (v) { return L.lzstring.compressToUint8Array(JSON.stringify(v)); }, dec: function (b) { return JSON.parse(L.lzstring.decompressFromUint8Array(b)); } }; });
  if (L.jsonpack) add('jsonpack', 'json-compress', function () { return { enc: function (v) { return TE.encode(L.jsonpack.pack(v)); }, dec: function (b) { return L.jsonpack.unpack(TD.decode(b)); } }; });
  if (L.arrow && L.fl) add('flechette (rows->columns->IPC)', 'columnar', function (sample) {
    var keys = Object.keys(sample[0]);
    return {
      enc: function (rows) { var cols = {}, k, i; for (k = 0; k < keys.length; k++) { var a = new Array(rows.length); for (i = 0; i < rows.length; i++) a[i] = rows[i][keys[k]]; cols[keys[k]] = a; } return L.fl.tableToIPC(L.fl.tableFromArrays(cols), { format: 'stream' }); },
      dec: function (b) { return L.fl.tableFromIPC(b).toArray(); }
    };
  }, 'Arrow IPC of flat columns only (no nested objects); rows rebuilt with toArray()');
  return C;
};
