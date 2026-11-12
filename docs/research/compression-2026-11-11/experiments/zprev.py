# Copyright (c) 2026 LFC Foundry. MIT License.
# B17: size and native time of saving a document as a zstd delta of an earlier save (system libzstd 1.5.5 via ctypes; native timing is a proxy, not a browser number)
# usage: python3 zprev.py FRAMEDIR base new [new ...]. "whole" = every frame of new uses all of base as prefix; "match" = frame i uses frame i of base (same structure)
import ctypes, json, os, sys, time
z = ctypes.CDLL('libzstd.so.1')
for f in ('ZSTD_compress2', 'ZSTD_decompressDCtx', 'ZSTD_compressBound'): getattr(z, f).restype = ctypes.c_size_t
z.ZSTD_createCCtx.restype = z.ZSTD_createDCtx.restype = ctypes.c_void_p; z.ZSTD_isError.restype = ctypes.c_uint
cc, dc = ctypes.c_void_p(z.ZSTD_createCCtx()), ctypes.c_void_p(z.ZSTD_createDCtx())
def comp(b, prefix=None):
    cap = z.ZSTD_compressBound(ctypes.c_size_t(len(b))); out = ctypes.create_string_buffer(cap)
    z.ZSTD_CCtx_reset(cc, 3); z.ZSTD_CCtx_setParameter(cc, 100, 3)
    if prefix: z.ZSTD_CCtx_setParameter(cc, 101, 23); z.ZSTD_CCtx_refPrefix(cc, prefix, ctypes.c_size_t(len(prefix)))
    r = z.ZSTD_compress2(cc, out, ctypes.c_size_t(cap), b, ctypes.c_size_t(len(b))); assert not z.ZSTD_isError(ctypes.c_size_t(r)); return out.raw[:r]
def dec(c, n, prefix=None):
    out = ctypes.create_string_buffer(max(1, n)); z.ZSTD_DCtx_reset(dc, 3)
    if prefix: z.ZSTD_DCtx_setParameter(dc, 100, 23); z.ZSTD_DCtx_refPrefix(dc, prefix, ctypes.c_size_t(len(prefix)))
    r = z.ZSTD_decompressDCtx(dc, out, ctypes.c_size_t(n), c, ctypes.c_size_t(len(c))); assert not z.ZSTD_isError(ctypes.c_size_t(r)), r; return out.raw[:r]
D = sys.argv[1]
def load(f):
    m = json.load(open(os.path.join(D, f, 'meta.json'))); return m['size'], m['stored'], [open(os.path.join(D, f, '%d.bin' % i), 'rb').read() for i in range(len(m['stored']))]
def tm(fn, reps=60):
    best = []; 
    for _ in range(5):
        t = time.perf_counter(); [fn() for _ in range(reps)]; best.append((time.perf_counter() - t) / reps * 1000)
    return sorted(best)[2]
bs, bst, bfr = load(sys.argv[2]); whole = b''.join(bfr)
print('%-16s %6s | %-13s %-13s | compress ms: full  whole  match | decompress ms: full  whole  match   (native libzstd 1.5.5)' % ('file', 'today', 'whole', 'match'))
for f in sys.argv[3:]:
    s, st, fr = load(f); other = s - sum(st); same = len(fr) == len(bfr)
    pick = lambda i: bfr[i] if same else whole
    cw = [comp(x, whole) for x in fr]; cm = [comp(x, pick(i)) for i, x in enumerate(fr)]; cf = [comp(x) for x in fr]
    for i, x in enumerate(fr): assert dec(cw[i], len(x), whole) == x and dec(cm[i], len(x), pick(i)) == x
    tot = lambda cs: other + sum(min(a, len(c)) for a, c in zip(st, cs))
    t = [tm(lambda: [comp(x) for x in fr]), tm(lambda: [comp(x, whole) for x in fr]), tm(lambda: [comp(x, pick(i)) for i, x in enumerate(fr)]),
         tm(lambda: [dec(c, len(x)) for c, x in zip(cf, fr)]), tm(lambda: [dec(c, len(x), whole) for c, x in zip(cw, fr)]), tm(lambda: [dec(c, len(fr[i]), pick(i)) for i, c in enumerate(cm)])]
    print('%-16s %6d | %6d %4.0f%% | %6d %4.0f%% | %.3f %.3f %.3f | %.3f %.3f %.3f' % (f, s, tot(cw), 100 * tot(cw) / s, tot(cm), 100 * tot(cm) / s, *t))
