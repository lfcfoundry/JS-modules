#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Writer for LFC-pack files (.json.lfc), the layout lfc-pack.js 0.1.1 writes and reads (nested blocks, value-exact).

    import lfc_pack_write
    lfc_pack_write.write('events.ndjson', 'events.json.lfc')            # NDJSON file -> .json.lfc
    data = lfc_pack_write.pack_rows([{'id': 1}, {'id': 2, 'name': 'a'}]) # list of JSON values -> bytes
    data = lfc_pack_write.pack(open('x.ndjson', 'rb').read())            # NDJSON bytes -> bytes

The file opens in lfc-pack.js (LfcPack.unpack) and in python/lfc_pack.py with the same values JSON.parse gives.
Value-exact only: numbers are doubles (12345678901234567890 comes back as 1.2345678901234567e19), 1.0 comes back as 1, duplicate keys keep the last value. No byte-exact switch, no flat layout, no log templates, no link-list columns (those are writer choices; any reader opens the result).
Size guard: a block whose nested form is not smaller than plain zstd of its lines is written as a raw block instead, so a file is never larger than plain zstd (plus 4 bytes and the footer per block).
Needs the `zstandard` package (pip install zstandard) or Python 3.14's compression.zstd.
"""
import json, math, struct, zlib
from array import array

try:
    from compression import zstd as _z
    def _compress(b, level=3): return _z.compress(bytes(b), level=level)
except ImportError:
    import zstandard as _zs
    def _compress(b, level=3): return _zs.ZstdCompressor(level=level).compress(bytes(b))

CODES_KEY = 2147483001
_FMT = ['B', 'H', 'I', 'b', 'h', 'i', 'd']
BLOCK_BYTES = 21 << 20
BLOCK_ROWS = 200000
USE_FLAT = True     # tests set this False to force nested blocks
SIZE_GUARD = True   # tests set this False to force nested blocks


def _fnv(s):
    h = 2166136261
    b = s.encode('utf-16-le', 'surrogatepass')
    for i in range(0, len(b), 2):
        h = ((h ^ (b[i] | (b[i + 1] << 8))) * 16777619) & 0xFFFFFFFF
    return h


def _kind(vals):
    """Smallest width code that holds every value: 0 u8, 1 u16, 2 u32, 3 i8, 4 i16, 5 i32, 6 float64."""
    mn = mx = None
    for x in vals:
        if x != x or abs(x) == float('inf') or x != int(x) or (x == 0 and math.copysign(1.0, x) < 0): return 6
        if mn is None or x < mn: mn = x
        if mx is None or x > mx: mx = x
    if mn is None: return 0
    if mn >= 0: return 0 if mx < 256 else 1 if mx < 65536 else 2 if mx < 4294967296 else 6
    if mn >= -128 and mx < 128: return 3
    if mn >= -32768 and mx < 32768: return 4
    return 5 if mn >= -2147483648 and mx < 2147483648 else 6


def _typed(vals):
    k = _kind(vals)
    a = array(_FMT[k], [int(x) for x in vals] if k != 6 else [float(x) for x in vals])
    if struct.pack('=I', 1) != struct.pack('<I', 1): a.byteswap()
    return k, a.tobytes()


def _parse_int(s): return -0.0 if s == '-0' else int(s)


def _is_index(k):
    return k.isascii() and k.isdigit() and (k == '0' or k[0] != '0') and int(k) < 4294967295


def _canonical(d):
    # JavaScript puts keys that look like array indexes first, in numeric order; both readers walk the shape in that order
    ik = [k for k in d if _is_index(k)]
    if not ik: return d.items()
    ik.sort(key=int); s = set(ik)
    return [(k, d[k]) for k in ik] + [(k, v) for k, v in d.items() if k not in s]


def _is_plain(s):
    return s.isascii() and '\0' not in s


class _Block:
    def __init__(self):
        self.shapes = {}; self.skel = []; self.ids = []; self.cols = {}; self.strs = []; self.lines = []; self.vals = []

    def row(self, v):
        sk = self._shape(v, '')
        key = json.dumps(sk, separators=(',', ':'), ensure_ascii=True)
        i = self.shapes.get(key)
        if i is None: i = self.shapes[key] = len(self.skel); self.skel.append(key)
        self.ids.append(i)

    def _num(self, path, x):
        h = _fnv(path); c = self.cols.get(h)
        if c is None: c = self.cols[h] = []
        c.append(x)

    def _shape(self, v, path):
        # appends the row's values to the columns and string stream in the order the reader consumes them; returns the shape
        if isinstance(v, bool): self._num(path + '?', 1 if v else 0); return 3
        if isinstance(v, (int, float)):
            try: self._num(path, float(v))
            except OverflowError: raise ValueError('number out of range: ' + str(v)[:40])
            return 2
        if v is None: return 4
        if isinstance(v, str): self.strs.append(v); return 1
        if isinstance(v, list): return [self._shape(x, path + '[]') for x in v]
        return {k: self._shape(x, path + '.' + k) for k, x in _canonical(v)}

    def finish(self, level):
        # string stream -> dictionary in order of first use, flags for first appearances, codes for repeats; non-ASCII strings go to a side list
        dic = {}; order = []; side = {}; sidel = []; plan = []
        for s in self.strs:
            if _is_plain(s):
                if s in dic: plan.append(dic[s])
                else: dic[s] = len(order); order.append(s); plan.append(-1 - dic[s])
            else:
                k = side.get(s)
                if k is None: k = side[s] = len(sidel); sidel.append(s)
                plan.append(-1000000000 - k)
        nu, ns = len(order), len(sidel); N = len(plan)
        flags = bytearray((N + 7) >> 3); rep = []
        for i, c in enumerate(plan):
            if c >= 0: rep.append(c)
            elif c > -1000000000: flags[i >> 3] |= 1 << (i & 7)
            else: rep.append(nu + (-c - 1000000000))
        E = nu + ns
        text = '\0'.join(order + [''] * ns).encode('ascii') if E else b''
        sideb = json.dumps({'idx': [nu + i for i in range(ns)], 'str': sidel}, separators=(',', ':')).encode('ascii')
        skb = '\n'.join(self.skel).encode('utf-8')
        repk, repb = _typed(rep); idk, idb = _typed(self.ids)
        zc = []; zone = []
        for h, c in self.cols.items():
            k, b = _typed(c); zc.append((h, k, len(c), _compress(b, level)))
            zone.append([h, min(c), max(c), len(c)])
        cmb = json.dumps([[h, k, n, len(z)] for h, k, n, z in zc], separators=(',', ':')).encode('ascii'); zcm = _compress(cmb, level)
        ztext, zside, zskel, zflags, zrep, zids = (_compress(x, level) for x in (text, sideb, skb, bytes(flags), repb, idb))
        hdr = json.dumps({'k': 'n', 'n': len(self.ids), 'count': E, 'fa': [len(flags), len(zflags), repk, len(rep), len(zrep), N],
                          'len': [len(text), len(sideb), len(skb)], 'p': [len(ztext), len(zside), len(zskel)],
                          'ids': [idk, len(self.ids), len(zids)], 'cm': [len(cmb), len(zcm)]}, separators=(',', ':')).encode('ascii')
        out = b''.join([struct.pack('<I', len(hdr)), hdr, zcm, ztext, zside, zskel, zids, zflags, zrep] + [z for _, _, _, z in zc])
        return out, len(self.ids), zone


# ---------------------------------------------------------------- flat blocks (every row an object): one column per key + presence bits
import re
_HEX = re.compile(r'[0-9a-f]+\Z'); _UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')
_IP = re.compile(r'(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}\Z')


def _varint_bytes(vals):
    out = bytearray()
    for u in vals:
        while u >= 128: out.append((u & 127) | 128); u >>= 7
        out.append(u)
    return bytes(out)


def _bitpack(vals, w):
    acc = 0; nb = 0; out = bytearray()
    for v in vals:
        acc |= v << nb; nb += w
        while nb >= 8: out.append(acc & 255); acc >>= 8; nb -= 8
    if nb: out.append(acc & 255)
    return bytes(out)


def _is_num(x): return isinstance(x, (int, float)) and not isinstance(x, bool)


def _numeric_candidates(vals):
    """[(type, params, [raw frames])] for a column of numbers."""
    c = []
    scale = None
    for s in (1, 10, 100, 1000, 10000):
        ok = True
        for x in vals:
            y = x * s
            if y != y or abs(y) >= 2 ** 52 or round(y) / s != x or (x == 0 and math.copysign(1.0, x) < 0): ok = False; break
        if ok: scale = s; break
    if scale is not None:
        ints = [round(x * scale) for x in vals]
        mn, mx = min(ints), max(ints)
        if all(a <= b for a, b in zip(ints, ints[1:])) and ints[0] >= 0:
            d = [ints[0]] + [b - a for a, b in zip(ints, ints[1:])]
            c.append(('V', {'mono': True, 'scale': scale}, [_varint_bytes(d)]))
        c.append(('V', {'mono': False, 'scale': scale}, [_varint_bytes([2 * x if x >= 0 else -2 * x - 1 for x in ints])]))
        w = max(1, (mx - mn).bit_length())
        if w <= 32: c.append(('B', {'mn': mn, 'w': w, 'scale': scale}, [_bitpack([x - mn for x in ints], w)]))
    f = array('d', [float(x) for x in vals])
    if struct.pack('=I', 1) != struct.pack('<I', 1): f.byteswap()
    c.append(('F', {}, [f.tobytes()]))
    return c


def _string_candidates(vals):
    c = []
    if any('\0' in s for s in vals) or any(s != s.encode('utf-8', 'surrogatepass').decode('utf-8', 'replace') for s in vals if not s.isascii()): return None
    enc = lambda s: s.encode('utf-8')
    c.append(('s', {}, [b'\0'.join(enc(s) for s in vals)]))
    lab = {}; order = []
    for s in vals:
        if s not in lab: lab[s] = len(order); order.append(s)
    nd = len(order)
    if nd <= 65536:
        labb = b'\0'.join(enc(s) for s in order); codes = [lab[s] for s in vals]
        if nd <= 256 and nd > 0:
            w = max(1, (nd - 1).bit_length()); c.append(('D', {'w': w, 'wide': False}, [labb, _bitpack(codes, w)]))
        elif nd > 256:
            a = array('H', codes)
            if struct.pack('=I', 1) != struct.pack('<I', 1): a.byteswap()
            c.append(('D', {'w': 0, 'wide': True}, [labb, a.tobytes()]))
    L = len(vals[0]) if vals else 0
    if vals and L % 2 == 0 and L > 0 and all(len(s) == L and _HEX.match(s) for s in vals):
        c.append(('H', {'L': L}, [b''.join(bytes.fromhex(s) for s in vals)]))
    if vals and all(_UUID.match(s) for s in vals):
        c.append(('U', {}, [b''.join(bytes.fromhex(s.replace('-', '')) for s in vals)]))
    if vals and all(_IP.match(s) and all(int(o) < 256 for o in s.split('.')) for s in vals):
        c.append(('I', {}, [b''.join(bytes(int(o) for o in s.split('.')) for s in vals)]))
    return c


def _list_candidates(vals):
    """Link-list column (type A): lists of whole numbers as lengths plus deltas inside each list."""
    for x in vals:
        if not isinstance(x, list) or any(isinstance(e, bool) or not isinstance(e, int) or abs(e) >= 2 ** 52 for e in x): return None
    lens = [len(x) for x in vals]; m = sum(lens)
    asc = all(not x or (x[0] >= 0 and all(a <= b for a, b in zip(x, x[1:]))) for x in vals)
    d = []
    for x in vals:
        prev = 0
        for e in x:
            dv = e - prev; prev = e
            d.append(dv if asc else (2 * dv if dv >= 0 else -2 * dv - 1))
    return [('A', {'m': m, 'asc': asc}, [_varint_bytes(lens), _varint_bytes(d)])]


def _encode_column(vals, level):
    if vals and all(isinstance(x, bool) for x in vals):
        cand = [('T', {}, [_bitpack([1 if x else 0 for x in vals], 1)])]
    elif vals and all(_is_num(x) for x in vals):
        cand = _numeric_candidates(vals)
    elif vals and all(isinstance(x, str) for x in vals):
        cand = _string_candidates(vals)
    elif vals and all(isinstance(x, list) for x in vals):
        cand = _list_candidates(vals)
    else:
        cand = None
    js = [('j', {}, ['\n'.join(json.dumps(x, separators=(',', ':'), ensure_ascii=True) for x in vals).encode('ascii')])]
    best = None
    for t, p, frames in (cand or []) + js:
        z = []
        for fr in frames:
            zf = _compress(fr, level)
            z.append([len(fr), zf, 1] if len(zf) < len(fr) else [len(fr), fr, 0])
        total = sum(len(x[1]) for x in z)
        if best is None or total < best[0]: best = (total, t, p, z)
    return best[1], best[2], best[3]


def _flat_block(rows, level, ordered=False):
    """Returns (bytes, n, zone) or None if some row is not a plain object."""
    for r in rows:
        if not isinstance(r, dict): return None
    n = len(rows); keys = []; seen = {}
    for r in rows:
        for k in r:
            if k not in seen: seen[k] = len(keys); keys.append(k)
    cols = [[] for _ in keys]; pb = (n + 7) >> 3; planes = bytearray(pb * len(keys)); ordmap = {}; ordlist = []; ordids = []
    for i, r in enumerate(rows):
        sq = []
        for k, v in r.items():
            j = seen[k]; planes[j * pb + (i >> 3)] |= 1 << (i & 7); cols[j].append(v); sq.append(j)
        if ordered:   # byte-exact files keep each row's own key order: the distinct orders are listed once, each row names one
            t = tuple(sq); oid = ordmap.get(t)
            if oid is None: oid = ordmap[t] = len(ordlist); ordlist.append(sq)
            ordids.append(oid)
    meta = {'keys': keys, 'cols': []}; frames = []; zone = []
    for j, vals in enumerate(cols):
        try: t, p, z = _encode_column(vals, level)
        except (OverflowError, ValueError): return None
        meta['cols'].append({'t': t, 'p': p, 'n': len(vals), 'f': [[a, len(b), c] for a, b, c in z]})
        frames.extend(b for _, b, _ in z)
        if t in ('V', 'B', 'F') and vals: zone.append([_fnv('.' + keys[j]), min(vals), max(vals), len(vals)])
    if ordered:
        ob = json.dumps(ordlist, separators=(',', ':')).encode('ascii'); oz = _compress(ob, level); ok, odb = _typed(ordids); odz = _compress(odb, level)
        meta['ord'] = [len(ob), len(oz), ok, len(odb), len(odz)]; frames = [oz, odz] + frames
    mb = json.dumps(meta, separators=(',', ':'), ensure_ascii=True).encode('ascii'); zm = _compress(mb, level); zp = _compress(bytes(planes), level)
    hdr = json.dumps({'k': 'f', 'n': n, 'm': [len(mb), len(zm)], 'pl': [len(planes), len(zp)]}, separators=(',', ':')).encode('ascii')
    return b''.join([struct.pack('<I', len(hdr)), hdr, zm, zp] + frames), n, zone


def _footer(sections, level):
    body = b''.join(struct.pack('<HHI', i, fl, len(p)) + p for i, fl, p in sections)
    f = b'\x01' + _compress(body, 3)
    return f + struct.pack('<IIHH', len(f), zlib.crc32(f), 1, 0) + b'LFC1'


def pack_rows(rows, level=3):
    rows = list(rows)
    lines = [json.dumps(r, separators=(',', ':'), ensure_ascii=True, allow_nan=False) for r in rows]   # NaN and Infinity are not JSON: ValueError
    return _pack_values(zip(rows, lines), level)


def pack(ndjson, level=3):
    if isinstance(ndjson, (bytes, bytearray, memoryview)): ndjson = bytes(ndjson).decode('utf-8')
    tail = ndjson == '' or ndjson.endswith('\n')
    vals = ((json.loads(l, parse_int=_parse_int), l) for l in ndjson.split('\n') if l.strip())
    return _pack_values(vals, level, tail=tail)


def _finish_block(blk, level, exact=False):
    """Nested block, flat block when every row is an object, or a raw block when neither beats plain zstd of the lines -> (bytes, rows, zone, kind)."""
    b, n, zone = blk.finish(level); kind = 'n'
    if USE_FLAT:
        fb = _flat_block(blk.vals, level, exact)   # tried for every block of plain objects; the smaller layout is kept
        if fb is not None and len(fb[0]) < len(b): b, n, zone = fb; kind = 'f'
    # size guard: never larger than plain zstd of the same lines (a raw block)
    raw = ('\n'.join(blk.lines) + '\n').encode('utf-8', 'surrogatepass'); rb = struct.pack('<I', len(raw)) + _compress(raw, level)
    if SIZE_GUARD and len(rb) <= len(b): b, kind, zone = rb, 'r', []
    return b, n, zone, kind


def _sections(rows, blocks, zones, tail, exact, extra):
    sec = [(1, 1, json.dumps({'rows': rows, 'blocks': len(blocks), 'writer': 'lfc_pack_write.py'}, separators=(',', ':')).encode()),
           (2, 1, json.dumps(blocks, separators=(',', ':')).encode()),
           (5, 0, json.dumps(zones, separators=(',', ':')).encode()),
           (12, 1, json.dumps({'exact': exact, 'tail': tail}, separators=(',', ':')).encode())]
    return sec + extra


def _pack_values(vals, level, tail=True):
    parts = []; blocks = []; zones = []; off = 0; rows = 0; blk = _Block()
    def flush():
        nonlocal blk, off, rows
        if not blk.ids: return
        b, n, zone, kind = _finish_block(blk, level)
        blocks.append([off, len(b), zlib.crc32(b), n, kind, 0]); zones.append(zone); parts.append(b); off += len(b); rows += n
        blk = _Block()
    for v, line in vals:
        blk.row(v); blk.lines.append(line); blk.vals.append(v)
        if len(blk.ids) >= BLOCK_ROWS or len(blk.strs) * 24 + len(blk.ids) * 16 > BLOCK_BYTES: flush()
    flush()
    parts.append(_footer(_sections(rows, blocks, zones, tail, False, []), level))
    return b''.join(parts)


# ---------------------------------------------------------------- byte-exact switch
_NUM = re.compile(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?')


def _num_tokens(text):
    """[(start, end)] of the number tokens of one JSON text, outside strings, in order."""
    out = []; i = 0; n = len(text)
    while i < n:
        c = text[i]
        if c == '"':
            i += 1
            while i < n and text[i] != '"': i += 2 if text[i] == '\\' else 1
            i += 1
        elif c == '-' or c.isdigit():
            m = _NUM.match(text, i); out.append((m.start(), m.end())); i = m.end()
        else: i += 1
    return out


def _mask(text, toks):
    out = []; p = 0
    for a, b in toks: out.append(text[p:a]); p = b
    out.append(text[p:]); return '\x00'.join(out)


def _spelling(line, canon):
    """[(token index, spelled text)] if the line differs from its canonical text only in how numbers are written, else None."""
    tl, tc = _num_tokens(line), _num_tokens(canon)
    if len(tl) != len(tc) or _mask(line, tl) != _mask(canon, tc): return None
    return [(k, line[a:b]) for k, ((a, b), (c, d)) in enumerate(zip(tl, tc)) if line[a:b] != canon[c:d]]


def _canon_text(row):
    from lfc_pack import _jsdumps
    def norm(o):
        if isinstance(o, bool) or o is None or isinstance(o, str): return o
        if isinstance(o, float) and o == 0: return 0   # JSON.stringify(-0) is "0"
        if isinstance(o, int): return float(o) if abs(o) >= 2 ** 53 else o
        if isinstance(o, list): return [norm(x) for x in o]
        if isinstance(o, dict): return {k: norm(v) for k, v in o.items()}
        return o
    return _jsdumps(norm(row))


def _read_back(b, kind):
    import lfc_pack as R
    return R._read_flat(b) if kind == 'f' else R._read_nested(b)


def _exact_safe(chunk):
    if b'\r' in chunk or chunk.startswith(b'\n') or b'\n\n' in chunk: return False
    try: chunk.decode('utf-8')
    except UnicodeDecodeError: return False
    return True


def _pack_exact(data, level, mode):
    """Byte-exact: rows whose canonical text differs from their input line are listed. mode 'lines' keeps the whole line (section 9, JS lfc-pack 0.1.1 reads this);
    mode 'spelling' lists only the differently written numbers (section 15, a new required section: JS 0.1.1 refuses such a file) and whole lines for other differences."""
    tail = len(data) == 0 or data.endswith(b'\n')
    parts = []; blocks = []; zones = []; off = 0; rows = 0; lines_exc = {}; spell_exc = {}
    p = 0; n = len(data)
    while p < n:
        e = p; cnt = 0
        while e < n and cnt < BLOCK_ROWS and e - p < BLOCK_BYTES:
            j = data.find(b'\n', e); e = n if j < 0 else j + 1; cnt += 1
        chunk = data[p:e]; p = e
        if not _exact_safe(chunk):
            b = struct.pack('<I', len(chunk)) + _compress(chunk, level); nl = chunk.count(b'\n') + (1 if not chunk.endswith(b'\n') else 0)
            blocks.append([off, len(b), zlib.crc32(b), nl, 'r', 0]); zones.append([]); parts.append(b); off += len(b); rows += nl; continue
        text = chunk.decode('utf-8'); lines = text[:-1].split('\n') if text.endswith('\n') else text.split('\n')
        blk = _Block()
        for l in lines:
            blk.row(json.loads(l, parse_int=_parse_int)); blk.lines.append(l); blk.vals.append(json.loads(l, parse_int=_parse_int))
        b, nrows, zone, kind = _finish_block(blk, level, True)
        if kind == 'r': b = struct.pack('<I', len(chunk)) + _compress(chunk, level)   # a raw block must hold the input bytes exactly (including a missing final newline)
        else:
            back = _read_back(b, kind); bi = len(blocks)
            if len(back) != len(lines): raise ValueError('row count mismatch while checking exactness')
            for i, (row, l) in enumerate(zip(back, lines)):
                c = _canon_text(row)
                if c == l: continue
                sp = _spelling(l, c) if mode == 'spelling' else None
                if sp is not None: spell_exc.setdefault(bi, []).append([i, sp])
                else: lines_exc.setdefault(bi, []).append((i, l.encode('utf-8')))
        blocks.append([off, len(b), zlib.crc32(b), nrows, kind, 0]); zones.append(zone); parts.append(b); off += len(b); rows += nrows
    extra = []
    if lines_exc:
        idx = {k: [[i, len(x)] for i, x in v] for k, v in lines_exc.items()}
        hb = json.dumps(idx, separators=(',', ':')).encode()
        extra.append((9, 1, struct.pack('<I', len(hb)) + hb + b''.join(x for v in lines_exc.values() for _, x in v)))
    if spell_exc: extra.append((15, 1, json.dumps(spell_exc, separators=(',', ':')).encode()))
    parts.append(_footer(_sections(rows, blocks, zones, tail, True, extra), level))
    return b''.join(parts)


def pack_exact(ndjson, level=3, mode='lines'):
    """Like pack, plus the byte-exact switch: read_text / LfcPack.unpackText give back the input bytes unchanged. mode 'lines' or 'spelling' (see _pack_exact)."""
    return _pack_exact(bytes(ndjson), level, mode)


def write(src_path, dst_path, level=3, exact=False):
    with open(src_path, 'rb') as f: raw = f.read()
    data = _pack_exact(raw, level, 'spelling' if exact == 'spelling' else 'lines') if exact else pack(raw, level)
    with open(dst_path, 'wb') as f: f.write(data)
    return len(data)


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 3: print('usage: lfc_pack_write.py in.ndjson out.json.lfc [level] [exact|spelling]'); sys.exit(2)
    ex = sys.argv[4] if len(sys.argv) > 4 else False
    print(write(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 3, 'spelling' if ex == 'spelling' else bool(ex)))
