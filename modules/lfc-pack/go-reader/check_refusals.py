# Copyright (c) 2026 LFC Foundry. MIT License.
# Damaged files must be refused with a plain error message (exit 1), never a crash or wrong rows.
# usage: python3 -I check_refusals.py /path/to/lfcp-read [vectors-dir]
import sys, os, struct, subprocess, tempfile, zlib
exe = sys.argv[1]
vec = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'vectors')
src = open(os.path.join(vec, 'flat-mixed.json.lfc'), 'rb').read()
flen = struct.unpack('<I', src[-16:-12])[0]
def mut(b, i, v=None): b = bytearray(b); b[i] = (b[i] ^ 0xFF) if v is None else v; return bytes(b)
def fixcrc(b):  # recompute footer CRC after editing the footer
    b = bytearray(b); fl = struct.unpack('<I', b[-16:-12])[0]; b[-12:-8] = struct.pack('<I', zlib.crc32(bytes(b[-16 - fl:-16]))); return bytes(b)
cases = {
    'bad magic': mut(src, len(src) - 1),
    'major 2': mut(src, len(src) - 8, 2),
    'flen too big': src[:-16] + struct.pack('<I', len(src)) + src[-12:],
    'footer byte flipped (crc)': mut(src, len(src) - 16 - flen + 3),
    'block byte flipped (crc)': mut(src, 10),
    'truncated': src[:len(src) // 2],
    'tiny': b'LFC1',
    'empty': b'',
    'footer encoding 9': fixcrc(mut(src, len(src) - 16 - flen, 9)),
}
bad = 0
for name, data in cases.items():
    with tempfile.NamedTemporaryFile(suffix='.json.lfc') as t:
        t.write(data); t.flush()
        for cmd in ('rows', 'text') + (() if name.startswith('block') else ('info',)):  # info reads only the footer, so it does not see block damage
            r = subprocess.run([exe, cmd, t.name], capture_output=True)
            err = r.stderr.decode()
            ok = r.returncode == 1 and err.startswith('lfcp-read:') and 'goroutine' not in err and 'panic' not in err
            if not ok: bad += 1; print('FAIL', name, cmd, r.returncode, err[:120])
    print('ok  ', name)
sys.exit(1 if bad else 0)
