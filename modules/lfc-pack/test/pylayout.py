# Copyright (c) 2026 LFC Foundry. MIT License.
# Reads every file in vectors/layout/ with python/lfc_pack.py: NAME.json.lfc must equal json.loads over NAME.ndjson; tables.json.lfc must equal tables.expected.json.
import sys, os, json, glob
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(here, '..', 'python'))
import lfc_pack
d = os.path.join(here, '..', 'vectors', 'layout'); bad = 0
for f in sorted(glob.glob(os.path.join(d, '*.json.lfc'))):
    name = os.path.basename(f)[:-len('.json.lfc')]
    if name.endswith('.x'):   # byte-exact twin: read_text must give the source bytes back
        ok = lfc_pack.read_text(f) == open(os.path.join(d, name[:-2] + '.ndjson'), 'rb').read(); print('ok  ' if ok else 'FAIL', name); bad += not ok; continue
    if name == 'tables': ok = lfc_pack.read_tables(f) == json.load(open(os.path.join(d, 'tables.expected.json')))
    else: ok = lfc_pack.read(f) == [json.loads(l) for l in open(os.path.join(d, name + '.ndjson'), encoding='utf-8') if l.strip()]
    print('ok  ' if ok else 'FAIL', name); bad += not ok
sys.exit(1 if bad else 0)
