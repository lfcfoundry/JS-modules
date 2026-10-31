# Copyright (c) 2026 LFC Foundry. MIT License.
# Numbers are IEEE doubles (JSON.parse meaning): an integer above 2**53 reads back as the nearest double unless the file is byte-exact.
# Reads every vector with python/lfc_pack.py: value-exact files equal json.loads of the source lines, .x files give the source bytes back.
import sys, os, json, glob
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(here, '..', 'python'))
import lfc_pack
bad = 0
for src in sorted(glob.glob(os.path.join(here, '..', 'vectors', '*.ndjson'))):
    base = src[:-len('.ndjson')]; raw = open(src, 'rb').read()
    want = [json.loads(l, parse_int=lambda s: float(s) if abs(int(s)) > 2**53 else int(s)) for l in raw.decode('utf-8').split('\n') if l.strip()]
    ok1 = lfc_pack.read(base + '.json.lfc') == want
    ok2 = lfc_pack.read(base + '.x.json.lfc') == want and lfc_pack.read_text(base + '.x.json.lfc') == raw
    print('ok  ' if ok1 and ok2 else 'FAIL', os.path.basename(base), '' if ok1 else 'value', '' if ok2 else 'exact'); bad += not (ok1 and ok2)
sys.exit(1 if bad else 0)
