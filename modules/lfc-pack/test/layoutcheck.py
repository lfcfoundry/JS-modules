#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Checks the byte layout of LFC-pack blocks against LAYOUT-SPEC.md (written from the spec, not from the reader code): every frame is a zstd frame with a content size,
the frames come in the specified order with the declared lengths, and no byte of a block is left over. Prints one line per block and the features covered.
usage: python3 test/layoutcheck.py [file.json.lfc ...]   (no arguments: vectors/*.json.lfc and vectors/layout/*.json.lfc; needs the zstandard package)"""
import sys, json, struct, zlib, zstandard
Z = zstandard.ZstdDecompressor()
COV=set(); SHARED=None
def dz(b, n=None):
    fp = zstandard.get_frame_parameters(b)
    assert fp.content_size >= 0, 'zstd frame without content size'
    if n is not None: assert fp.content_size == n, 'frame content size %d != declared %d' % (fp.content_size, n)
    # frames carry their content size; n (when the layout gives it) must agree
    out = Z.decompress(b) if n is None else Z.decompress(b, max_output_size=max(n,1))
    if n is not None and len(out) != n: raise AssertionError('zstd frame size %d != declared %d' % (len(out), n))
    return out
W = [1,2,4,1,2,4,8]
def footer(d):
    assert d[-4:] == b'LFC1'
    flen, crc, maj, mnr = struct.unpack('<IIHH', d[-16:-4])
    f = d[len(d)-16-flen:len(d)-16]; assert zlib.crc32(f) == crc
    body = Z.decompress(f[1:]) if f[0] == 1 else f[1:]
    sec, p = {}, 0
    while p < len(body):
        i, fl, ln = struct.unpack('<HHI', body[p:p+8]); sec[i] = body[p+8:p+8+ln]; p += 8+ln
    assert p == len(body)
    return sec, len(d)-16-flen
def hdr(b):
    hl = struct.unpack('<I', b[:4])[0]; return json.loads(b[4:4+hl]), 4+hl
def flat(b, log):
    h, p = hdr(b); a = {'hdr': p}
    def take(n, name):
        nonlocal p
        a[name] = n; p += n; return b[p-n:p]
    assert h['k'] == 'f'
    meta = json.loads(dz(take(h['m'][1], 'meta'), h['m'][0]))
    dz(take(h['pl'][1], 'planes'), h['pl'][0]); assert h['pl'][0] == len(meta['keys']) * ((h['n'] + 7) // 8)
    if 'ord' in meta:
        o = meta['ord']; dz(take(o[1], 'ord-list'), o[0]); dz(take(o[4], 'ord-ids'), o[3]); assert o[3] == h['n'] * W[o[2]]
    for k, c in zip(meta['keys'], meta['cols']):
        for j, (raw, st, z) in enumerate(c['f']):
            fr = take(st, 'col %s:%s#%d' % (k, c['t'], j))
            if z: assert len(dz(fr, raw)) == raw
            else: assert st == raw
    assert p == len(b), 'flat block: %d bytes unaccounted' % (len(b)-p)
    COV.update('col-'+c['t'] for c in meta['cols']); COV.update('col-%s-raw'%c['t'] for c in meta['cols'] if any(not f[2] for f in c['f']))
    if 'ord' in meta: COV.add('flat-key-order-lists')
    log.append(('f', h['n'], a, meta['keys'], [c['t'] for c in meta['cols']]))
def nested(b, log):
    h, p = hdr(b); a = {'hdr': p}
    def take(n, name):
        nonlocal p
        a[name] = n; p += n; return b[p-n:p]
    cm = json.loads(dz(take(h['cm'][1], 'colmeta'), h['cm'][0]))
    dz(take(h['p'][0], 'dict'), h['len'][0]); dz(take(h['p'][1], 'side'), h['len'][1]); sk = dz(take(h['p'][2], 'skel'), h['len'][2]).decode().split('\n')
    dz(take(h['ids'][2], 'row-shape-ids'), h['ids'][1] * W[h['ids'][0]])
    if h.get('g') == 1:   # shared tables (3.6): string codes as typed bytes instead of flags and repeats
        assert h['cd'][0] in (0, 1, 2), 'string code width'
        dz(take(h['cd'][2], 'string-codes'), h['cd'][1] * W[h['cd'][0]])
        assert (h['kc'] == 0 and sk == ['']) or len(sk) == h['kc'], 'shape count'
        assert SHARED is not None, 'block with g = 1 but no section 16'
        COV.add('nested-shared')
    else:
        dz(take(h['fa'][1], 'first-flags'), h['fa'][0]); assert h['fa'][0] == (h['fa'][5] + 7) // 8
        dz(take(h['fa'][4], 'repeats'), h['fa'][3] * W[h['fa'][2]])
    for ent in cm:
        key, kd, cnt, ln = ent[:4]
        if kd == 7:
            assert len(ent) == 5, 'width 7 needs a raw length'
            dz(take(ln, 'col %d' % key), ent[4])
        else: dz(take(ln, 'col %d' % key), cnt * W[kd])
    assert p == len(b), 'nested block: %d bytes unaccounted' % (len(b)-p)
    COV.add('block-n'); COV.update('nested-width-%d'%c[1] for c in cm)
    if '5' in sk: COV.add('nested-raw-row'); 
    log.append(('n', h['n'], a, sk, [c[1] for c in cm]))
def main():
    import glob, os
    here = os.path.dirname(os.path.abspath(__file__)); bad = 0
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(here, '..', 'vectors', '*.json.lfc')) + glob.glob(os.path.join(here, '..', 'vectors', 'layout', '*.json.lfc')))
    for fn in files:
        d = open(fn, 'rb').read()
        try:
            global SHARED
            sec, end = footer(d); blocks = json.loads(sec[2]); pos = 0
            SHARED = json.loads(sec[16]) if 16 in sec else None
            if SHARED is not None: assert isinstance(SHARED.get('s'), list) and isinstance(SHARED.get('k'), list), 'section 16 needs s and k lists'
            for i, (off, ln, crc, rows, kind, *t) in enumerate(blocks):
                assert off == pos, 'gap before block %d' % i; pos = off+ln
                b = d[off:off+ln]; assert zlib.crc32(b) == crc
                log = []
                if kind == 'f': flat(b, log)
                elif kind == 'n': nested(b, log)
                elif kind == 'r': n = struct.unpack('<I', b[:4])[0]; assert len(dz(b[4:], n)) == n; log.append(('r', rows, {}, [], []))
                print('%-40s block %d kind %s rows %d  %s' % (fn.split('/')[-1], i, log[0][0], log[0][1], json.dumps(log[0][3:])[:150]))
            assert pos == end, 'blocks do not end at footer'
        except Exception as e:
            bad += 1; print('FAIL', fn, repr(e))
    print('coverage:', ' '.join(sorted(COV)))
    sys.exit(1 if bad else 0)
main()
