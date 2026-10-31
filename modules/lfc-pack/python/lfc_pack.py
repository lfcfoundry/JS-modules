#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Reader for LFC-pack files (.json.lfc), the format written by lfc-pack.js.

    import lfc_pack
    rows = lfc_pack.read('events.json.lfc')          # list of dicts, one per input line (value-exact)
    data = lfc_pack.read_text('events.json.lfc')     # bytes of the NDJSON text (byte-exact if the file was packed with exact=true)
    info = lfc_pack.info('events.json.lfc')

Needs the `zstandard` package (pip install zstandard) or Python 3.14's compression.zstd. Reads whole files; blocks are checked with CRC32.
Whole numbers come back as int and numbers with decimals as float. Keys are in the order the writer kept (first seen per block, or the row's own order when packed with exact=true).
"""
import json, re, struct, zlib
from decimal import Decimal

try:
    from compression import zstd as _z
    def _decompress(b): return _z.decompress(b)
except ImportError:
    import zstandard as _zs
    def _decompress(b): return _zs.ZstdDecompressor().decompressobj().decompress(b)

def _dz(b, n):
    # a frame must decode to exactly the length the block layout declares (LAYOUT-SPEC.md 1.1)
    out = _decompress(b)
    if len(out) != n: raise ValueError('zstd frame decodes to %d bytes, layout says %d' % (len(out), n))
    return out


MAGIC = b'LFC1'
_WIDTH = ['<u1', '<u2', '<u4', '<i1', '<i2', '<i4', '<f8']
_ITEM = [1, 2, 4, 1, 2, 4, 8]
_FMT = ['B', 'H', 'I', 'b', 'h', 'i', 'd']
CODES_KEY = 2147483001


def _fnv(s):
    h = 2166136261
    b = s.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h = ((h ^ (b[i] | (b[i + 1] << 8))) * 16777619) & 0xFFFFFFFF
    return h


def _typed(raw, kind, n):
    import array
    a = array.array(_FMT[kind]); a.frombytes(raw[:n * _ITEM[kind]])
    return a


def _num(x):
    return int(x) if isinstance(x, float) and x == x and abs(x) < 9007199254740992 and x == int(x) else x


_LONE = re.compile('[\ud800-\udfff]')


def _jsnum(x):
    # the text JavaScript's JSON.stringify gives for a number (so read_text matches the writer's canonical text)
    if isinstance(x, bool): return 'true' if x else 'false'
    if isinstance(x, int):
        return str(x) if abs(x) < 10 ** 21 else _jsnum(float(x))
    if x != x or x in (float('inf'), float('-inf')): return 'null'
    if x == 0: return '0'   # JSON.stringify(-0) is "0"
    sign = '-' if x < 0 else ''
    d = Decimal(repr(abs(x))).normalize().as_tuple()
    digits = ''.join(map(str, d.digits)).rstrip('0') or '0'; k = len(digits); n = d.exponent + len(d.digits)   # value = 0.DIGITS * 10^n
    if k <= n <= 21: r = digits + '0' * (n - k)
    elif 0 < n <= 21: r = digits[:n] + '.' + digits[n:]
    elif -6 < n <= 0: r = '0.' + '0' * (-n) + digits
    else:
        e = n - 1; es = ('+' if e >= 0 else '-') + str(abs(e))
        r = digits[0] + ('.' + digits[1:] if k > 1 else '') + 'e' + es
    return sign + r


def _jsstr(s):
    t = json.dumps(s, ensure_ascii=False)
    return _LONE.sub(lambda m: '\\u%04x' % ord(m.group()), t) if _LONE.search(t) else t


def _jsdumps(o):
    out, stack = [], [('value', o)]
    while stack:
        kind, value = stack.pop()
        if kind == 'text':
            out.append(value)
        elif value is None:
            out.append('null')
        elif isinstance(value, str):
            out.append(_jsstr(value))
        elif isinstance(value, (bool, int, float)):
            out.append(_jsnum(value))
        elif isinstance(value, list):
            out.append('['); stack.append(('text', ']'))
            for i in range(len(value) - 1, -1, -1):
                stack.append(('value', value[i]))
                if i: stack.append(('text', ','))
        else:
            # JavaScript puts keys that look like array indexes first, in numeric order
            keys = list(value.keys()); indexes = sorted((k for k in keys if k.isascii() and k.isdigit() and (k == '0' or k[0] != '0') and len(k) <= 10 and int(k) < 4294967295), key=int)
            seen = set(indexes); keys = indexes + [k for k in keys if k not in seen]
            out.append('{'); stack.append(('text', '}'))
            for i in range(len(keys) - 1, -1, -1):
                key = keys[i]
                stack.append(('value', value[key])); stack.append(('text', ':')); stack.append(('text', _jsstr(key)))
                if i: stack.append(('text', ','))
    return ''.join(out)


_NUM = re.compile(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?')


def _num_tokens(text):
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


def _respell(canon, spells):
    toks = _num_tokens(canon); rep = dict((k, t) for k, t in spells); out = []; p = 0
    for k, (a, b) in enumerate(toks):
        out.append(canon[p:a]); out.append(rep.get(k, canon[a:b])); p = b
    out.append(canon[p:]); return ''.join(out)



def read_footer(data):
    if len(data) < 17 or data[-4:] != MAGIC: raise ValueError('not an LFC-pack file')
    flen, fcrc, major, minor = struct.unpack('<IIHH', data[-16:-4])
    if major > 1: raise ValueError('unsupported format major %d' % major)
    if flen > len(data) - 16: raise ValueError('footer length out of range')
    f = data[len(data) - 16 - flen:len(data) - 16]
    if zlib.crc32(f) != fcrc: raise ValueError('footer checksum mismatch')
    body = _decompress(f[1:]) if f[0] == 1 else f[1:]
    sec, p = {}, 0
    known = {1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16}   # 15 = number spellings (byte-exact files written with spelling mode), 16 = shared tables of nested blocks
    while p < len(body):
        sid, fl, ln = struct.unpack('<HHI', body[p:p + 8])
        if sid in known: sec[sid] = body[p + 8:p + 8 + ln]
        elif fl & 1: raise ValueError('required section %d not supported by this reader' % sid)
        p += 8 + ln
    return {'major': major, 'minor': minor, 'body_end': len(data) - 16 - flen, 'sec': sec}


def _json(b): return json.loads(b.decode('utf-8')) if b is not None else None


class _Cur:
    def __init__(self, data, pos): self.d, self.p = data, pos
    def take(self, n):
        x = self.d[self.p:self.p + n]; self.p += n; return x


def _block_header(b):
    hl = struct.unpack('<I', b[:4])[0]
    return json.loads(b[4:4 + hl].decode('utf-8')), 4 + hl


# ---------------------------------------------------------------- nested blocks
def _decimals(raw, n):
    # width-7 number column: byte 0 is the decimals d (bits 0-3; bit 7: differences against the value k places back, k - 1 in bits 4-6), then n varints of the zigzag whole numbers; value = whole / 10^d
    if len(raw) < 1 or (raw[0] & 15) > 9: raise ValueError('bad decimal column')
    d, delta, k = raw[0] & 15, raw[0] & 128, ((raw[0] >> 4) & 7) + 1
    u = _varints(raw[1:], n); sc = 10 ** d; out = []; w = []
    for i, x in enumerate(u):
        v = _unzz(x)
        if delta:
            v += w[i - k] if i >= k else 0
            if abs(v) > 2 ** 53: raise ValueError('number column out of range')
        w.append(v); out.append(v / sc)
    return out


def _read_nested(b, shared=None):
    h, p = _block_header(b); c = _Cur(b, p)
    if h.get('g') == 1: return _read_nested_shared(b, h, c, shared)
    cmeta = json.loads(_dz(c.take(h['cm'][1]), h['cm'][0]).decode('utf-8'))
    D = _dz(c.take(h['p'][0]), h['len'][0]).decode('ascii').split('\0')
    sd = json.loads(_dz(c.take(h['p'][1]), h['len'][1]).decode('utf-8'))
    for i, ix in enumerate(sd['idx']):
        if not 0 <= ix < len(D): raise ValueError('side list index out of range')
        D[ix] = sd['str'][i]
    skel = _dz(c.take(h['p'][2]), h['len'][2]).decode('utf-8').split('\n')
    ids = _typed(_dz(c.take(h['ids'][2]), h['ids'][1] * _ITEM[h['ids'][0]]), h['ids'][0], h['ids'][1])
    if h.get('sp') == 1: return _read_nested_paths(h, c, D, skel, ids, cmeta)
    fa = h['fa']
    flags = _dz(c.take(fa[1]), fa[0]); rep = _typed(_dz(c.take(fa[4]), fa[3] * _ITEM[fa[2]]), fa[2], fa[3])
    cols = {}
    for ent in cmeta:
        key, kind, count, plen = ent[:4]
        if kind == 7:
            if len(ent) < 5: raise ValueError('decimal column without raw length')
            cols[key] = _decimals(_dz(c.take(plen), ent[4]), count)
        else: cols[key] = _typed(_dz(c.take(plen), count * _ITEM[kind]), kind, count)
    codes = []; nxt = 0; ri = 0
    for i in range(fa[5]):
        if (flags[i >> 3] >> (i & 7)) & 1: codes.append(nxt); nxt += 1
        else: codes.append(int(rep[ri])); ri += 1
    strs = [D[k] for k in codes]
    return _build_nested(cols, strs, [skel[i] for i in ids[:h['n']]])


def _nested_cols(c, cmeta):
    cols = {}
    for ent in cmeta:
        key, kind, count, plen = ent[:4]
        if kind == 7:
            if len(ent) < 5: raise ValueError('decimal column without raw length')
            cols[key] = _decimals(_dz(c.take(plen), ent[4]), count)
        else: cols[key] = _typed(_dz(c.take(plen), count * _ITEM[kind]), kind, count)
    return cols


def _path_codes(h, c):
    # per-path strings (header sp = 1): a table [hash, entries, cells] per string path; each path has its own flags (starting on a fresh byte) and repeats -> (table, entry number of every cell, path after path: path base + local number)
    sf = h['sf']
    tab = json.loads(_dz(c.take(sf[1]), sf[0]).decode('utf-8'))
    flags = _dz(c.take(sf[3]), sf[2])
    if sf[4] not in (0, 1, 2): raise ValueError('bad repeat width')
    rep = _typed(_dz(c.take(sf[6]), sf[5] * _ITEM[sf[4]]), sf[4], sf[5])
    if not isinstance(tab, list): raise ValueError('string path table')
    for e in tab:
        if not isinstance(e, list) or len(e) < 3 or not all(isinstance(x, int) and not isinstance(x, bool) for x in e[:3]) or not (0 <= e[1] <= e[2]) or (e[1] == 0 and e[2] != 0): raise ValueError('string path table')
    if sum(e[2] - e[1] for e in tab) != sf[5] or sum((e[2] + 7) >> 3 for e in tab) != sf[2]: raise ValueError('string path table')
    if len({e[0] for e in tab}) != len(tab): raise ValueError('string path table')
    out, base, ri, fo = [], 0, 0, 0
    for hh, e, n in (x[:3] for x in tab):
        nxt = 0
        for i in range(n):
            if (flags[fo + (i >> 3)] >> (i & 7)) & 1: out.append(base + nxt); nxt += 1
            else:
                k = int(rep[ri]); ri += 1
                if k >= e: raise ValueError('string code out of range')
                out.append(base + k)
        if nxt != e: raise ValueError('string flags')
        base += e; fo += (n + 7) >> 3
    return tab, out, base


def _path_strings(tab, strs):
    # the strings of the cells (path after path) cut into one list per path: hash -> [strings, next]
    sp, p = {}, 0
    for e in tab:
        sp[e[0]] = [strs[p:p + e[2]], 0]; p += e[2]
    return sp


def _read_nested_paths(h, c, D, skel, ids, cmeta):
    tab, codes, ET = _path_codes(h, c)
    cols = _nested_cols(c, cmeta)
    if ET != h['count']: raise ValueError('string path table')
    if h['count'] and len(D) != h['count']: raise ValueError('dictionary count')
    return _build_nested(cols, None, [skel[i] for i in ids[:h['n']]], _path_strings(tab, [D[k] for k in codes]))


def _build_nested(cols, strs, shapes, sp=None):
    # rows from the column arrays, the strings in walk order (or, with sp, per string path: hash -> [strings, next]) and each row's shape (skeleton JSON text)
    state = {'ti': 0}
    cur = {}

    def col(hh):
        if hh not in cur: cur[hh] = [cols.get(hh, []), 0]
        return cur[hh]

    def scol(hh):
        if hh not in sp: raise ValueError('string path table')
        return sp[hh]

    def desc(s, path):
        if s == 1: return ('S', scol(_fnv(path))) if sp is not None else ('s',)
        if s == 2: return ('n', col(_fnv(path)))
        if s == 3: return ('b', col(_fnv(path + '?')))
        if s == 4: return ('z',)
        if s == 5: return ('J', scol(_fnv(path))) if sp is not None else ('j',)
        if isinstance(s, list): return ('a', [desc(x, path + '[]') for x in s])
        items = []
        for k, v in s.items():
            if v == 1 and sp is not None: items.append((k, 'S', scol(_fnv(path + '.' + k))))
            elif v == 1: items.append((k, 's', None))
            elif v == 2: items.append((k, 'n', col(_fnv(path + '.' + k))))
            elif v == 3: items.append((k, 'b', col(_fnv(path + '.' + k + '?'))))
            elif v == 4: items.append((k, 'z', None))
            else: items.append((k, 'o', desc(v, path + '.' + k)))
        return ('o', items)

    def build(d):
        t = d[0]
        if t == 'o':
            o = {}
            for k, kind, x in d[1]:
                if kind == 's': v = strs[state['ti']]; state['ti'] += 1
                elif kind == 'S': v = x[0][x[1]]; x[1] += 1
                elif kind == 'n': v = _num(x[0][x[1]]); x[1] += 1
                elif kind == 'b': v = x[0][x[1]] == 1; x[1] += 1
                elif kind == 'z': v = None
                else: v = build(x)
                o[k] = v
            return o
        if t == 's': v = strs[state['ti']]; state['ti'] += 1; return v
        if t == 'n': x = d[1]; v = _num(x[0][x[1]]); x[1] += 1; return v
        if t == 'b': x = d[1]; v = x[0][x[1]] == 1; x[1] += 1; return v
        if t == 'z': return None
        if t == 'j': v = json.loads(strs[state['ti']]); state['ti'] += 1; return v
        if t == 'S': x = d[1]; v = x[0][x[1]]; x[1] += 1; return v
        if t == 'J': x = d[1]; v = json.loads(x[0][x[1]]); x[1] += 1; return v
        return [build(x) for x in d[1]]

    plans, out = {}, []
    for sk in shapes:
        d = plans.get(sk)
        if d is None: d = plans[sk] = desc(json.loads(sk), '')
        out.append(build(d))
    if sp is not None:
        for x in sp.values():
            if x[1] != len(x[0]): raise ValueError('string cells left over')
    return out


def _read_nested_shared(b, h, c, shared):
    # a nested block that uses the file's shared tables (header g = 1): no first-appearance flags; codes below count pick the block's own strings, the rest the shared strings (code - count); shape ids below kc the block's own shapes, the rest the shared shapes
    if shared is None: raise ValueError('shared tables missing')
    cmeta = json.loads(_dz(c.take(h['cm'][1]), h['cm'][0]).decode('utf-8'))
    D = _dz(c.take(h['p'][0]), h['len'][0]).decode('ascii').split('\0')
    L, LK = h['count'], h['kc']
    if L and len(D) != L: raise ValueError('dictionary count')
    sd = json.loads(_dz(c.take(h['p'][1]), h['len'][1]).decode('utf-8'))
    for i, ix in enumerate(sd['idx']):
        if not 0 <= ix < len(D): raise ValueError('side list index out of range')
        D[ix] = sd['str'][i]
    skel = _dz(c.take(h['p'][2]), h['len'][2]).decode('utf-8').split('\n')
    if not LK: skel = []
    if len(skel) != LK: raise ValueError('shape count')
    ids = _typed(_dz(c.take(h['ids'][2]), h['ids'][1] * _ITEM[h['ids'][0]]), h['ids'][0], h['ids'][1])
    tab = None
    if h.get('sp') == 1:   # with per-path strings: path entries, each the block's next own string (0) or shared string v - 1
        tab, ecodes, ET = _path_codes(h, c)
        gr = h['gr']
        if gr[0] not in (0, 1, 2) or gr[1] != ET: raise ValueError('bad string entry list')
        gra = _typed(_dz(c.take(gr[2]), gr[1] * _ITEM[gr[0]]), gr[0], gr[1])
        GE, lt = [], 0
        for v in gra:
            v = int(v)
            if v == 0: GE.append(lt); lt += 1
            else: GE.append(L + v - 1)
        if lt != L: raise ValueError('string entry list')
        codes = [GE[k] for k in ecodes]
    else:
        if h['cd'][0] not in (0, 1, 2): raise ValueError('bad string code width')
        codes = _typed(_dz(c.take(h['cd'][2]), h['cd'][1] * _ITEM[h['cd'][0]]), h['cd'][0], h['cd'][1])
    cols = {}
    for ent in cmeta:
        key, kind, count, plen = ent[:4]
        if kind == 7:
            if len(ent) < 5: raise ValueError('decimal column without raw length')
            cols[key] = _decimals(_dz(c.take(plen), ent[4]), count)
        else: cols[key] = _typed(_dz(c.take(plen), count * _ITEM[kind]), kind, count)
    GS, GK = shared['s'], shared['k']
    strs = []
    for k in codes:
        k = int(k)
        if k < L: strs.append(D[k])
        elif k - L < len(GS): strs.append(GS[k - L])
        else: raise ValueError('string code out of range')
    shapes = []
    for i in ids[:h['n']]:
        i = int(i)
        if i < LK: shapes.append(skel[i])
        elif i - LK < len(GK): shapes.append(GK[i - LK])
        else: raise ValueError('shape id out of range')
    if tab is not None: return _build_nested(cols, None, shapes, _path_strings(tab, strs))
    return _build_nested(cols, strs, shapes)


# ---------------------------------------------------------------- flat blocks
def _bitunpack(b, n, w):
    out, mask, bp = [0] * n, (1 << w) - 1, 0
    for i in range(n):
        byte = bp >> 3
        v = int.from_bytes(b[byte:byte + 5].ljust(5, b'\0'), 'little') >> (bp & 7)
        out[i] = v & mask; bp += w
    return out


def _varints(b, n):
    out, p = [0] * n, 0
    for i in range(n):
        c = b[p]; p += 1
        if c < 128: out[i] = c; continue
        u, m = c & 127, 128
        while True:
            c = b[p]; p += 1; u += (c & 127) * m; m *= 128
            if u > 2 ** 53 or m > 2 ** 56: raise ValueError('varint over 2^53')
            if not c & 128: break
        out[i] = u
    return out


def _unzz(x): return x // 2 if x % 2 == 0 else -(x + 1) // 2


def _untemplate(n, fr):
    tl = fr[0].decode('utf-8').split('\0') if n else []
    parts = [t.split('\x01') for t in tl]
    ids = [fr[1][i] | (fr[1][n + i] << 8) for i in range(n)]
    kinds, nb = fr[4], fr[3]
    tx = fr[2].decode('utf-8').split('\0') if len(fr[2]) else []
    cnt = [0] * len(tl); first = [False] * len(tl); order = []
    for i in ids:
        cnt[i] += 1
        if not first[i]:
            first[i] = True
            for k in range(len(parts[i]) - 1): order.append((i, k))
    store, np_, tp = {}, 0, 0
    for j, key in enumerate(order):
        c = cnt[key[0]]
        if kinds[j]:
            vals, a = [], 0
            for _ in range(c):
                b = nb[np_]; np_ += 1; u = b & 127; mul = 128
                while b & 128: b = nb[np_]; np_ += 1; u += (b & 127) * mul; mul *= 128
                a += _unzz(u); vals.append(str(a))
        else:
            vals = tx[tp].split('\n'); tp += 1
        store[key] = vals
    seen = [0] * len(tl); out = []
    for i in ids:
        arr = parts[i]; s = arr[0]; c = seen[i]; seen[i] += 1
        for k in range(1, len(arr)): s += store[(i, k - 1)][c] + arr[k]
        out.append(s)
    return out


def _decode_col(c, fr):
    n, t, p = c['n'], c['t'], c['p']
    if t == 'V':
        u = _varints(fr[0], n)
        if p['mono']:
            s = 0
            for i in range(n): s += u[i]; u[i] = s
            if s > 2 ** 53: raise ValueError('number column out of range')
        elif p.get('delta'):
            s = 0
            for i in range(n):
                s += _unzz(u[i]); u[i] = s
                if abs(s) > 2 ** 53: raise ValueError('number column out of range')
        else: u = [_unzz(x) for x in u]
        return [x / p['scale'] for x in u] if p['scale'] != 1 else u
    if t == 'B':
        u = _bitunpack(fr[0], n, p['w'])
        return [(x + p['mn']) / p['scale'] if p['scale'] != 1 else x + p['mn'] for x in u]
    if t == 'F':
        return [_num(x) for x in _typed(fr[0], 6, n)]
    if t == 'T': return [x == 1 for x in _bitunpack(fr[0], n, 1)]
    if t in ('H', 'U', 'I') and len(fr[0]) < n * {'H': p.get('L', 0) // 2, 'U': 16, 'I': 4}[t]: raise ValueError('%s column cut off' % t)
    if t == 'H':
        bl = p['L'] // 2; r = fr[0]
        return [r[i * bl:(i + 1) * bl].hex() for i in range(n)]
    if t == 'U':
        r = fr[0]; o = []
        for i in range(n):
            h = r[i * 16:(i + 1) * 16].hex(); o.append('%s-%s-%s-%s-%s' % (h[:8], h[8:12], h[12:16], h[16:20], h[20:]))
        return o
    if t == 'I':
        r = fr[0]; return ['%d.%d.%d.%d' % tuple(r[4 * i:4 * i + 4]) for i in range(n)]
    if t == 's': return fr[0].decode('utf-8').split('\0') if n else []
    if t == 'A':
        lens = _varints(fr[0], n); vals = _varints(fr[1], p['m']); out = []; pos = 0
        for ln in lens:
            acc = 0; lst = []
            for _ in range(int(ln)):
                d = int(vals[pos]); pos += 1
                acc += d if p['asc'] else _unzz(d); lst.append(acc)
            out.append(lst)
        return out
    if t == 'L': return _untemplate(n, fr)
    if t == 'D':
        lab = fr[0].decode('utf-8').split('\0')
        if p['w']: cd = _bitunpack(fr[1], n, p['w'])
        elif p['wide']: cd = list(_typed(fr[1], 1, n))
        else: cd = list(fr[1][:n])
        return [lab[x] for x in cd]
    js = fr[0].decode('utf-8').split('\n') if n else []
    return [json.loads(x) for x in js]


def _read_flat(b):
    h, p = _block_header(b); c = _Cur(b, p)
    meta = json.loads(_dz(c.take(h['m'][1]), h['m'][0]).decode('utf-8'))
    n = h['n']; keys = meta['keys']; K = len(keys)
    pl = _dz(c.take(h['pl'][1]), h['pl'][0])
    ordl = ordids = None
    if 'ord' in meta:
        om = meta['ord']
        ordl = json.loads(_dz(c.take(om[1]), om[0]).decode('utf-8'))
        ordids = _typed(_dz(c.take(om[4]), om[3]), om[2], n)
    vals = []
    for cm in meta['cols']:
        fr = []
        for rawlen, slen, z in cm['f']:
            sb = c.take(slen); fr.append(_dz(sb, rawlen) if z else bytes(sb))
        vals.append(_decode_col(cm, fr))
    ptr = [0] * K; out = []
    if ordl is not None:
        for i in range(n):
            o = {}
            for kk in ordl[ordids[i]]: o[keys[kk]] = vals[kk][ptr[kk]]; ptr[kk] += 1
            out.append(o)
        return out
    pb = (n + 7) >> 3
    for i in range(n):
        o = {}
        for j in range(K):
            if (pl[j * pb + (i >> 3)] >> (i & 7)) & 1: o[keys[j]] = vals[j][ptr[j]]; ptr[j] += 1
        out.append(o)
    for j in range(K):
        if ptr[j] != len(vals[j]): raise ValueError('presence bits do not match the column')
    return out


def _read_raw(b):
    return _dz(b[4:], struct.unpack('<I', b[:4])[0])


def _open(data):
    f = read_footer(data)
    blocks = _json(f['sec'].get(2))
    if blocks is None: raise ValueError('damaged file: block table missing')
    return f, blocks


def _shared(f):
    # the shared tables of nested blocks (section 16, written with share: true): {'s': strings, 'k': row shapes}, parsed once per file; None when the file has none
    if '_shared' not in f:
        t = _json(f['sec'].get(16))
        if t is not None and not (isinstance(t.get('s'), list) and isinstance(t.get('k'), list) and all(isinstance(x, str) for x in t['s']) and all(isinstance(x, str) for x in t['k'])):
            raise ValueError('damaged file: shared tables')
        f['_shared'] = t
    return f['_shared']


def _decode(kind, b, i, f):
    # damaged tables that passed the checksums must give one plain error, not a stray IndexError or UnicodeDecodeError
    try: return _read_flat(b) if kind == 'f' else _read_nested(b, _shared(f))
    except ValueError as e:
        if not isinstance(e, UnicodeError): raise
        raise ValueError('damaged block %d: invalid text' % i)
    except Exception as e: raise ValueError('damaged block %d: %s: %s' % (i, type(e).__name__, str(e)[:80]))


def _block(data, f, blocks, i):
    off, ln, crc, rows, kind = blocks[i][:5]
    if off + ln > f['body_end']: raise ValueError('block %d out of range' % i)
    b = data[off:off + ln]
    if zlib.crc32(b) != crc: raise ValueError('block %d checksum mismatch' % i)
    return kind, b


def info(path_or_bytes):
    data = _load(path_or_bytes); f, blocks = _open(data); h = _json(f['sec'].get(1)) or {}
    return {'rows': h.get('rows'), 'blocks': len(blocks), 'size': len(data), 'major': f['major'], 'minor': f['minor']}


def metadata(path_or_bytes):
    """The metadata object the file was packed with (footer section 6), or None. Reads the footer only."""
    data = _load(path_or_bytes); f, _ = _open(data)
    return _json(f['sec'].get(6))


def _load(x):
    if isinstance(x, (bytes, bytearray, memoryview)): return bytes(x)
    with open(x, 'rb') as fh: return fh.read()


def read(path_or_bytes):
    data = _load(path_or_bytes); f, blocks = _open(data); out = []
    for i in range(len(blocks)):
        kind, b = _block(data, f, blocks, i)
        if kind == 'r': out.extend(json.loads(l) for l in _read_raw(b).decode('utf-8').split('\n') if l.strip())
        else: out.extend(_decode(kind, b, i, f))
    return out


def read_tables(path_or_bytes):
    """The object LfcPack.packTables was given: named tables come back as lists of rows, plain values as they were."""
    data = _load(path_or_bytes); f, blocks = _open(data)
    tables = (_json(f['sec'].get(1)) or {}).get('tables') or [['', 'rows']]
    out = {name: [] for name, _ in tables}
    for i in range(len(blocks)):
        kind, b = _block(data, f, blocks, i); ti = blocks[i][5] if len(blocks[i]) > 5 else 0
        rows = [json.loads(l) for l in _read_raw(b).decode('utf-8').split('\n') if l.strip()] if kind == 'r' else _decode(kind, b, i, f)
        out[tables[ti][0]].extend(rows)
    return {name: (out[name][0]['v'] if out[name] else None) if k == 'value' else out[name] for name, k in tables}


def read_text(path_or_bytes):
    data = _load(path_or_bytes); f, blocks = _open(data); flags = _json(f['sec'].get(12)) or {}
    exc = {}
    raw = f['sec'].get(9)
    if raw:
        hl = struct.unpack('<I', raw[:4])[0]; idx = json.loads(raw[4:4 + hl].decode('utf-8')); p = 4 + hl
        for k, lst in idx.items():
            exc[int(k)] = {}
            for row, ln in lst: exc[int(k)][row] = raw[p:p + ln]; p += ln
    spell = json.loads(f['sec'][15].decode('utf-8')) if 15 in f['sec'] else {}
    parts = []
    for i in range(len(blocks)):
        kind, b = _block(data, f, blocks, i)
        if kind == 'r': parts.append(_read_raw(b)); continue
        rows = _decode(kind, b, i, f); ex = exc.get(i, {}); sp = dict((r, s) for r, s in spell.get(str(i), []))
        for j, r in enumerate(rows):
            parts.append(ex[j] if j in ex else (_respell(_jsdumps(r), sp[j]) if j in sp else _jsdumps(r)).encode('utf-8')); parts.append(b'\n')
    out = b''.join(parts)
    if flags.get('tail') is False and out and blocks[-1][4] != 'r': out = out[:-1]
    return out


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2: print('usage: lfc_pack.py file.json.lfc [out.ndjson]'); sys.exit(2)
    if len(sys.argv) > 2:
        open(sys.argv[2], 'wb').write(read_text(sys.argv[1]))
    else:
        print(info(sys.argv[1]))
