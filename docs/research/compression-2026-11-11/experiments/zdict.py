# Copyright (c) 2026 LFC Foundry. MIT License.
# real zstd dictionary sizes for LFC-pack frames, using the system libzstd (1.5.5) through ctypes. Frames come from dumpfr.cjs.
# usage: python3 zdict.py FRAMEDIR test[=train] ...   modes: static (format frames of other families: raw content / trained), app (trained on the
# same app's disjoint rows: raw content / trained 16 KB), prev (previous save as a prefix, like zstd --patch-from)
import ctypes, json, os, re, sys
z = ctypes.CDLL('libzstd.so.1'); z.ZSTD_compressBound.restype = ctypes.c_size_t; z.ZSTD_isError.restype = ctypes.c_uint; z.ZDICT_isError.restype = ctypes.c_uint
for f in ('ZSTD_compress', 'ZSTD_compress_usingDict', 'ZSTD_compress2', 'ZDICT_trainFromBuffer'): getattr(z, f).restype = ctypes.c_size_t
z.ZSTD_createCCtx.restype = ctypes.c_void_p
cc = ctypes.c_void_p(z.ZSTD_createCCtx())
def comp(b, d=None, prefix=None):
    cap = z.ZSTD_compressBound(ctypes.c_size_t(len(b))); out = ctypes.create_string_buffer(cap)
    if prefix is not None:
        z.ZSTD_CCtx_reset(cc, 3); z.ZSTD_CCtx_setParameter(cc, 100, 3); z.ZSTD_CCtx_setParameter(cc, 101, 27)
        z.ZSTD_CCtx_refPrefix(cc, prefix, ctypes.c_size_t(len(prefix))); r = z.ZSTD_compress2(cc, out, ctypes.c_size_t(cap), b, ctypes.c_size_t(len(b)))
    elif d is not None: r = z.ZSTD_compress_usingDict(cc, out, ctypes.c_size_t(cap), b, ctypes.c_size_t(len(b)), d, ctypes.c_size_t(len(d)), 3)
    else: r = z.ZSTD_compress(out, ctypes.c_size_t(cap), b, ctypes.c_size_t(len(b)), 3)
    assert not z.ZSTD_isError(ctypes.c_size_t(r)), r
    return r
def train(samples, size=16384):
    samples = [s for s in samples if s]; buf = b''.join(samples); arr = (ctypes.c_size_t * len(samples))(*[len(s) for s in samples]); out = ctypes.create_string_buffer(size)
    r = z.ZDICT_trainFromBuffer(out, ctypes.c_size_t(size), buf, arr, len(samples))
    return None if z.ZDICT_isError(ctypes.c_size_t(r)) else out.raw[:r]
def chunks(b, n=2048): return [b[i:i + n] for i in range(0, len(b), n)]
D = sys.argv[1]; specs = [a.split('=') for a in sys.argv[2:]]
def load(f):
    m = json.load(open(os.path.join(D, f, 'meta.json'))); fr = [open(os.path.join(D, f, '%d.bin' % i), 'rb').read() for i in range(len(m['stored']))]
    return m['size'], m['stored'], fr
fam = lambda f: re.sub(r'\.(nd)?json$', '', re.sub(r'-(\d+|\d+e)\.(nd)?json$', '', re.sub(r'^tr-', '', f)))
isfmt = lambda i, x: i == 0 or x[:7] == b'{"keys"'
F = {f: load(f) for s in specs for f in s}
print('%-18s %6s %6s | %-7s %-7s | %-7s %-7s | %-7s   (bytes for the whole file; %% of today)' % ('file', 'today', 'lvl3', 'stRaw', 'stTrain', 'appRaw', 'appTr', 'prev'))
for s in specs:
    f, tr = s[0], (s[1] if len(s) > 1 else None); size, st, fr = F[f]; other = size - sum(st)
    tot = lambda est: other + sum(min(a, e) for a, e in zip(st, est))
    oth = [g for g in F if fam(g) != fam(f) and g.startswith('tr-')]
    fmt = [x for g in oth for i, x in enumerate(F[g][2]) if isfmt(i, x)]
    sraw = b''.join(fmt)[-16384:]; stt = train(fmt * 4) if fmt else None
    r = {'lvl3': tot([comp(x) for x in fr]), 'stRaw': tot([comp(x, sraw) for x in fr])}
    r['stTrain'] = tot([comp(x, stt) for x in fr]) if stt else None
    if tr and tr.startswith('tr-'):
        tf = F[tr][2]; araw = b''.join(x[:max(64, 65536 // len(tf))] for x in tf)[:65536]; at = train([c for x in tf for c in chunks(x)])
        r['appRaw'] = tot([comp(x, araw) for x in fr]); r['appTr'] = tot([comp(x, at) for x in fr]) if at else None
    elif tr: r['prev'] = tot([comp(x, prefix=b''.join(F[tr][2])) for x in fr])
    c = lambda k: ('%d %d%%' % (r[k], round(100 * r[k] / size))) if r.get(k) else '-'
    print('%-18s %6d %6d | %-7s %-7s | %-7s %-7s | %-7s' % (f, size, r['lvl3'], c('stRaw'), c('stTrain'), c('appRaw'), c('appTr'), c('prev')))
