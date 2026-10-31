#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Fuzz, part 2: compares the JavaScript, Python and Go readers.
  python3 test/fuzz.py same DIR GOBIN        every NAME.lfc made by fuzz-gen.cjs must read to the same rows and (byte-exact files) the same text in all three readers
  python3 test/fuzz.py damage DIR GOBIN [every=8] [seed=1]   damaged copies of every 8th file; a reader must give the rows of another reader or refuse with a message: no crash, no hang, no runaway memory
Needs the zstandard package. GOBIN is the program built from go-reader/ (go build -o lfcp-read .). No timing is done here; only counts, so Node is fine."""
import sys, os, json, glob, struct, zlib, random, hashlib, subprocess, signal, resource, tempfile, shutil, time, collections
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'python'))
import lfc_pack, zstandard
H = lambda b: hashlib.sha1(b).hexdigest()[:16]
TO = 20
def js_run(paths, tmp):
    res = {}; todo = list(paths)
    while todo:
        lst = os.path.join(tmp, 'list.txt'); open(lst, 'w').write('\n'.join(todo) + '\n'); cur = None
        p = subprocess.Popen(['node', '--max-old-space-size=2048', os.path.join(HERE, 'fuzz-read.cjs'), '@' + lst], stdout=subprocess.PIPE, text=True, errors='replace')
        t0 = time.time(); done = set()
        try:
            out, _ = p.communicate(timeout=TO * max(4, len(todo) // 4 + 2))
        except subprocess.TimeoutExpired:
            p.kill(); out = p.stdout.read() if p.stdout else ''
        for line in out.split('\n'):
            f = line.split('\t')
            if len(f) >= 2:
                if f[1] == 'START': cur = f[0]
                else: res[f[0]] = tuple(f[1:]); done.add(f[0])
        names = {os.path.basename(x)[:-4]: x for x in todo}
        rest = [x for n, x in names.items() if n not in done]
        if rest and cur in names and cur not in done: res[cur] = ('CRASH', 'js process died or hung'); rest = [x for x in rest if x != names[cur]]
        elif rest and p.returncode not in (0, None) and not done: res[os.path.basename(rest[0])[:-4]] = ('CRASH', 'js process died'); rest = rest[1:]
        todo = rest
    return res
def lim():
    resource.setrlimit(resource.RLIMIT_AS, (3 << 30, 3 << 30))
def py_run(path):
    class T(Exception): pass
    def al(*a): raise T()
    signal.signal(signal.SIGALRM, al); signal.alarm(TO)
    try:
        rows = lfc_pack.read(path); t = '\n'.join(lfc_pack._jsdumps(r) for r in rows) + '\n'
        try: tx = lfc_pack.read_text(path)
        except Exception as e: tx = None
        return ('OK', H(t.encode('utf-8', 'surrogatepass')), H(tx) if tx is not None else '-')
    except T: return ('HANG', '')
    except MemoryError: return ('CRASH', 'MemoryError')
    except RecursionError: return ('CRASH', 'RecursionError')
    except Exception as e: return ('ERR', (type(e).__name__ + ': ' + str(e))[:100])
    finally: signal.alarm(0)
def go_run(gobin, path):
    out = {}
    for cmd in ('rows', 'text'):
        try: r = subprocess.run([gobin, cmd, path], capture_output=True, timeout=TO, preexec_fn=lim)
        except subprocess.TimeoutExpired: return ('HANG', '')
        err = r.stderr.decode('utf-8', 'replace')
        if r.returncode < 0 or 'panic' in err or 'goroutine ' in err or r.returncode not in (0, 1): return ('CRASH', 'exit %d %s' % (r.returncode, err[:80].replace('\n', ' ')))
        out[cmd] = (r.returncode, r.stdout, err)
    if out['rows'][0] != 0: return ('ERR', out['rows'][2].strip()[:100])
    return ('OK', H(out['rows'][1]), H(out['text'][1]) if out['text'][0] == 0 else '-')
def row_hash_js(r):   # JS hash is over JSON.stringify of JS objects; the same text is what Go prints and Python's _jsdumps builds
    return r
def run_all(paths, gobin):
    tmp = tempfile.mkdtemp(); js = js_run(paths, tmp); res = {}
    for p in paths:
        n = os.path.basename(p)[:-4]
        res[n] = {'js': js.get(n, ('CRASH', 'no result')), 'py': py_run(p), 'go': go_run(gobin, p)}
    shutil.rmtree(tmp); return res
def classify(r):
    ks = [k for k in r if r[k][0] in ('CRASH', 'HANG')]
    if ks: return 'crash/hang: ' + ','.join(ks)
    oks = {k: r[k][1] for k in r if r[k][0] == 'OK'}
    if len(set(oks.values())) > 1: return 'rows differ: ' + ' '.join('%s=%s' % kv for kv in sorted(oks.items()))
    if oks and len(oks) < 3: return 'one refuses, another reads: ' + ','.join(k for k in r if r[k][0] == 'ERR')
    return 'agree-ok' if oks else 'all-refuse'
def same(d, gobin):
    paths = sorted(glob.glob(os.path.join(d, '*.lfc'))); t0 = time.time(); res = run_all(paths, gobin); cnt = collections.Counter(); bad = []
    for n, r in res.items():
        c = classify(r); cnt[c.split(':')[0]] += 1
        if c != 'agree-ok': bad.append((n, c, r))
        else:   # byte-exact files: text must be the source bytes in the readers that offer it
            m = json.load(open(os.path.join(d, n + '.mode'))); src = open(os.path.join(d, n + '.src'), 'rb').read()
            if m.get('exact'):
                for k in r:
                    if r[k][2] != H(src): bad.append((n, 'byte-exact text differs in ' + k, r)); cnt['text differs'] += 1
    print('same: %d files, %s, %.0f s' % (len(paths), dict(cnt), time.time() - t0))
    for b in bad[:15]: print('  ', b[0], b[1])
    return 1 if bad else 0
# ---- damage
def parse(d):
    flen, fcrc, major, minor = struct.unpack('<IIHH', d[-16:-4]); f = d[len(d) - 16 - flen:len(d) - 16]
    body = zstandard.ZstdDecompressor().decompress(f[1:]) if f[0] == 1 else f[1:]; secs = []; p = 0
    while p < len(body):
        i, fl, ln = struct.unpack('<HHI', body[p:p + 8]); secs.append([i, fl, body[p + 8:p + 8 + ln]]); p += 8 + ln
    return secs, len(d) - 16 - flen, (major, minor)
def build(blocks_bytes, secs, ver):
    tbl = json.loads([s for s in secs if s[0] == 2][0][2]); out = b''; off = 0
    for i, b in enumerate(blocks_bytes): tbl[i][0] = off; tbl[i][1] = len(b); tbl[i][2] = zlib.crc32(b); out += b; off += len(b)
    for s in secs:
        if s[0] == 2: s[2] = json.dumps(tbl, separators=(',', ':')).encode()
    body = b''.join(struct.pack('<HHI', s[0], s[1], len(s[2])) + s[2] for s in secs)
    f = b'\x01' + zstandard.ZstdCompressor(level=3).compress(body)
    return out + f + struct.pack('<IIHH', len(f), zlib.crc32(f), ver[0], ver[1]) + b'LFC1'
def mutate(d, rnd):
    kind = rnd.choice(['flip', 'trunc', 'junk', 'flipfix', 'flipfix', 'flipfix', 'headerfix', 'footerflip', 'zerotrail'])
    b = bytearray(d)
    if kind == 'flip':
        for _ in range(rnd.randint(1, 3)): i = rnd.randrange(len(b)); b[i] ^= 1 << rnd.randrange(8)
        return kind, bytes(b)
    if kind == 'trunc': return kind, bytes(b[:rnd.randrange(len(b))])
    if kind == 'junk': return kind, bytes(b) + bytes(rnd.randrange(256) for _ in range(rnd.randint(1, 40)))
    if kind == 'zerotrail': return kind, bytes(b[:-16]) + bytes(16)
    if kind == 'footerflip': i = rnd.randrange(len(b) - 16 - 4, len(b)); b[i] ^= 1 << rnd.randrange(8); return kind, bytes(b)
    try:
        secs, end, ver = parse(d); tbl = json.loads([s for s in secs if s[0] == 2][0][2])
        blocks = [bytearray(d[t[0]:t[0] + t[1]]) for t in tbl]
    except Exception: return 'flip', bytes(b)
    bi = rnd.randrange(len(blocks)); bb = blocks[bi]
    if kind == 'headerfix': span = min(len(bb), 200)
    else: span = len(bb)
    for _ in range(rnd.randint(1, 3)):
        i = rnd.randrange(span); bb[i] = rnd.randrange(256) if rnd.random() < 0.5 else bb[i] ^ (1 << rnd.randrange(8))
    return kind, build([bytes(x) for x in blocks], secs, ver)
def damage(d, gobin, every, seed):
    rnd = random.Random(seed); src = sorted(glob.glob(os.path.join(d, '*.lfc')))[::every]; out = tempfile.mkdtemp(); kinds = {}
    for k, p in enumerate(src):
        data = open(p, 'rb').read()
        for j in range(6):
            kind, m = mutate(data, rnd); n = 'd%04d_%d' % (k, j); open(os.path.join(out, n + '.lfc'), 'wb').write(m); kinds[n] = kind
    paths = sorted(glob.glob(os.path.join(out, '*.lfc'))); t0 = time.time(); res = run_all(paths, gobin); cnt = collections.Counter(); bad = []
    by = collections.defaultdict(collections.Counter); refusals = collections.Counter()
    for n, r in res.items():
        c = classify(r); key = c.split(':')[0]; cnt[key] += 1; by[kinds[n]][key] += 1
        if key in ('crash/hang', 'rows differ', 'one refuses, another reads'): bad.append((n, kinds[n], c, r))
    print('damage: %d files from %d sources, %s, %.0f s' % (len(paths), len(src), dict(cnt), time.time() - t0))
    for k, v in sorted(by.items()): print('  %-10s %s' % (k, dict(v)))
    bad.sort(key=lambda b: (b[2].split(':')[0] != 'rows differ', b[0]))   # real disagreements first, so the 25 shown and kept are the worst ones
    for b in bad[:25]: print('  ', b[0], b[1], b[2], {k: v[:2] for k, v in b[3].items()})
    keep = os.path.join(tempfile.gettempdir(), 'fuzz-damage-kept'); shutil.rmtree(keep, ignore_errors=True); os.makedirs(keep)
    for b in bad[:25]: shutil.copy(os.path.join(out, b[0] + '.lfc'), keep)
    shutil.rmtree(out); return 1 if bad else 0
if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'same': sys.exit(same(sys.argv[2], sys.argv[3]))
    if mode == 'damage': sys.exit(damage(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 8, int(sys.argv[5]) if len(sys.argv) > 5 else 1))
    print(__doc__); sys.exit(2)
