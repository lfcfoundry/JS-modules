"""
pack.py: turn one big HTML file into a smaller, self-extracting one.
Part of JS-modules, https://github.com/JNFoo/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

The whole page is squeezed with Zopfli (a slower, tighter gzip), stored inside a tiny page as base64 text, and the browser's own
built-in unzipper (DecompressionStream, all browsers since 2023) unpacks it the moment the page opens and rewrites the document.

    pip install zopfli
    python3 pack.py game.html game-small.html "My Game"

Trade-offs: needs JavaScript and a 2023+ browser; the page is decoded before it can paint, so keep the loader tiny (it is);
view-source shows base64. Best for big single-file games full of inline fonts and SVG.
The loader is plain ES5 and tests for the unzipper first: an old browser sees "needs a browser updated since 2023"; a file that is
cut short or changed (the browser checks the gzip checksum itself) sees "could not be unpacked, may be damaged"; a browser too old to
read the loader at all shows a note after 8 seconds. The title is escaped, so any text is safe in it.
"""
import sys, base64, html

OLD_MSG = "This small copy needs a browser updated since 2023. Please use the regular file instead."
DAMAGED_MSG = "This small copy could not be unpacked. It may be damaged or cut short. Please download it again, or use the regular file."
TOO_OLD_NOTE = "If this line stays, this browser is too old for the small copy. Please use the regular file instead."


def build_page(gz, title='Loading'):
    """The self-extracting page (a str) for gzip bytes. The title is HTML-escaped."""
    b64 = base64.b64encode(gz).decode()
    return ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html.escape(title) + '</title>'
            '<style>@keyframes s{to{opacity:1}}</style>'
            '<body style="margin:0;background:#fff;font:16px system-ui,sans-serif"><p id=m style="padding:24px">Opening…</p>'
            '<p id=n style="padding:0 24px;opacity:0;animation:s 0s 8s forwards">' + TOO_OLD_NOTE + '</p>'
            '<script>(function(){var m=document.getElementById("m"),n=document.getElementById("n");'
            'function say(t){m.textContent=t;n.style.display="none"}'
            'try{if(!(window.DecompressionStream&&window.Response&&window.Blob&&Blob.prototype.stream)){say("' + OLD_MSG + '");return}'
            'var a=atob("' + b64 + '"),u=new Uint8Array(a.length),i;for(i=0;i<a.length;i++)u[i]=a.charCodeAt(i);'
            'new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(function(t){document.open();document.write(t);document.close()},'
            'function(){say("' + DAMAGED_MSG + '")})}'
            'catch(e){say("' + DAMAGED_MSG + '")}})()</script>')


def main(argv):
    if len(argv) < 3:
        raise SystemExit('usage: python3 pack.py in.html out.html ["Title"]')
    try:
        import zopfli.gzip
    except ImportError:
        raise SystemExit('pack.py needs the zopfli module: pip install zopfli')
    src, dst = argv[1], argv[2]
    title = argv[3] if len(argv) > 3 else 'Loading'
    raw = open(src, 'rb').read()
    gz = zopfli.gzip.compress(raw, numiterations=60)
    loader = build_page(gz, title)
    open(dst, 'w', encoding='utf-8').write(loader)
    print('packed: %d -> %d bytes (%d%%)' % (len(raw), len(loader), round(100 * len(loader) / max(1, len(raw)))))


if __name__ == '__main__':
    main(sys.argv)
