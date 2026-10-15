"""
pack.py: turn one big HTML file into a smaller, self-extracting one.
Part of JS-modules, https://github.com/JNFoo/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

The whole page is squeezed with Zopfli (a slower, tighter gzip), stored inside a tiny page as base64 text, and the browser's own
built-in unzipper (DecompressionStream, all browsers since 2023) unpacks it the moment the page opens and rewrites the document.

    pip install zopfli
    python3 pack.py game.html game-small.html "My Game"

Trade-offs: needs JavaScript and a 2023+ browser (the loader shows a message otherwise); the page is decoded before it can paint,
so keep the loader tiny (it is); view-source shows base64. Best for big single-file games full of inline fonts and SVG.
"""
import sys, base64
import zopfli.gzip

src, dst = sys.argv[1], sys.argv[2]
title = sys.argv[3] if len(sys.argv) > 3 else 'Loading'
raw = open(src, 'rb').read()
gz = zopfli.gzip.compress(raw, numiterations=60)
b64 = base64.b64encode(gz).decode()
loader = ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>'
          '<body style="margin:0;background:#fff;font:16px system-ui,sans-serif"><p id=m style="padding:24px">Opening…</p>'
          '<script>(async()=>{try{var a=atob("' + b64 + '"),u=new Uint8Array(a.length);for(var i=0;i<a.length;i++)u[i]=a.charCodeAt(i);'
          'var t=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text();document.open();document.write(t);document.close()}'
          'catch(e){document.getElementById("m").textContent="This small copy needs a browser updated since 2023. Please use the regular file instead."}})()</script>')
open(dst, 'w', encoding='utf-8').write(loader)
print('packed: %d -> %d bytes (%d%%)' % (len(raw), len(loader), round(100 * len(loader) / len(raw))))
