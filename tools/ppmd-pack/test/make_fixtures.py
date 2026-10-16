"""Rebuild test/fixtures/*.ppmd from the public-domain 7-Zip C encoder.  Copyright (c) 2026 LFC Foundry. MIT License.
Usage: python3 tools/ppmd-pack/test/make_fixtures.py PATH_TO_COMPILED_ENCODER
The encoder is a tiny C program built from Ppmd7.c, Ppmd7Enc.c and Ppmd.h of the 7-Zip / LZMA SDK (public domain, Igor Pavlov): it reads INFILE, runs
Ppmd7_Init(order), Ppmd7_EncodeSymbol for every byte and Ppmd7z_RangeEnc_FlushData, and writes OUTFILE. A copy of such a program sits next to the decoder's own
fixtures (modules/ppmd-decode/test/fixtures/encode.c). Command line: ENCODER INFILE OUTFILE ORDER MEMBYTES.
The fixtures are committed, so test/run.py checks the Python encoder against them without needing the C program."""
import json, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
FIX = HERE / "fixtures"
manifest = json.loads((FIX / "manifest.json").read_text())
if len(sys.argv) != 2:
    sys.exit(__doc__)
for case in manifest:
    out = FIX / case["expected"]
    subprocess.run([sys.argv[1], str(FIX / case["input"]), str(out), str(case["order"]), str(case["mem"])], check=True, stdout=subprocess.DEVNULL)
    print("%-22s order %2d mem %8d -> %5d bytes" % (case["input"], case["order"], case["mem"], out.stat().st_size))
