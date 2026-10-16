"""
pack.py: turn one big HTML file into a smaller, self-extracting one.
Part of JS-modules, https://github.com/JNFoo/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

The whole page is squeezed with Zopfli (a slower, tighter gzip), stored inside a tiny page as base64 text, and the browser's own
built-in unzipper (DecompressionStream, all browsers since 2023) unpacks it the moment the page opens and rewrites the document.

    pip install zopfli
    python3 pack.py game.html game-small.html "My Game" [--bg "#101018"]

Trade-offs: needs JavaScript and a 2023+ browser; the page is decoded before it can paint, so keep the loader tiny (it is);
view-source shows base64. Best for big single-file games full of inline fonts and SVG.
The loader is plain ES5 and tests for the unzipper first: an old browser sees "needs a browser updated since 2023"; a file that is
cut short or changed (the browser checks the gzip checksum itself) sees "could not be unpacked, may be damaged"; a browser too old to
read the loader at all shows a note after 8 seconds. The title is escaped, so any text is safe in it.
While the page unpacks, a small centered "Loading…" line shows on a dark background (--bg COLOR changes it, default #101018; the
text color follows the background). The real page replaces it the moment it is ready. The color is checked: anything that is not a
plain color falls back to the default, and the command line says so.
"""
import sys, base64, html, re

OLD_MSG = "This small copy needs a browser updated since 2023. Please use the regular file instead."
DAMAGED_MSG = "This small copy could not be unpacked. It may be damaged or cut short. Please download it again, or use the regular file."
TOO_OLD_NOTE = "If this line stays, this browser is too old for the small copy. Please use the regular file instead."


DEFAULT_BG = '#101018'
NAMED = {'black': (0, 0, 0), 'white': (255, 255, 255), 'gray': (128, 128, 128), 'grey': (128, 128, 128), 'navy': (0, 0, 128), 'red': (255, 0, 0),
         'green': (0, 128, 0), 'blue': (0, 0, 255), 'purple': (128, 0, 128), 'teal': (0, 128, 128), 'maroon': (128, 0, 0), 'silver': (192, 192, 192)}
SAFE_COLOR_RE = re.compile(r'^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([0-9.,%\s/]+\)|[a-zA-Z]{3,20})$')


def luminance(color):
    """0 (black) .. 1 (white) for #hex, rgb() and a few names; None when unknown (hsl, other names). Never raises."""
    try:
        c = color.strip().lower()
        if c in NAMED:
            r, g, b = NAMED[c]
        elif c.startswith('#'):
            h = c[1:]
            if len(h) in (3, 4):
                h = ''.join(ch * 2 for ch in h[:3])
            if len(h) not in (6, 8):
                return None
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        elif c.startswith('rgb'):
            parts = re.findall(r'[0-9.]+%?', c)[:3]
            if len(parts) < 3:
                return None
            r, g, b = [float(p[:-1]) * 2.55 if p.endswith('%') else float(p) for p in parts]
        else:
            return None
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
    except (ValueError, TypeError, AttributeError):
        return None


def safe_bg(bg):
    """(color, ok): the color when it is a plain, safe CSS color, else the default and False. Never raises."""
    if isinstance(bg, str) and SAFE_COLOR_RE.match(bg.strip()):
        return bg.strip(), True
    return DEFAULT_BG, False


def build_page(gz, title='Loading', bg=DEFAULT_BG):
    """The self-extracting page (a str) for gzip bytes. The title is HTML-escaped; a bg that is not a plain color becomes the default."""
    bg = safe_bg(bg)[0]
    lum = luminance(bg)
    fg = '#888' if lum is None else ('#ccc' if lum < 0.5 else '#444')
    b64 = base64.b64encode(gz).decode()
    return ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html.escape(title) + '</title>'
            '<style>@keyframes s{to{opacity:1}}</style>'
            '<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;'
            'font:16px system-ui,sans-serif;background:' + bg + ';color:' + fg + '"><p id=m style="margin:0;padding:24px">Loading…</p>'
            '<p id=n style="margin:0;padding:0 24px;opacity:0;animation:s 0s 8s forwards">' + TOO_OLD_NOTE + '</p>'
            '<script>(function(){var m=document.getElementById("m"),n=document.getElementById("n");'
            'function say(t){m.textContent=t;n.style.display="none"}'
            'try{if(!(window.DecompressionStream&&window.Response&&window.Blob&&Blob.prototype.stream)){say("' + OLD_MSG + '");return}'
            'var a=atob("' + b64 + '"),u=new Uint8Array(a.length),i;for(i=0;i<a.length;i++)u[i]=a.charCodeAt(i);'
            'new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(function(t){document.open();document.write(t);document.close()},'
            'function(){say("' + DAMAGED_MSG + '")})}'
            'catch(e){say("' + DAMAGED_MSG + '")}})()</script>')


def main(argv):
    args = [a for a in argv[1:]]
    bg = DEFAULT_BG
    if '--bg' in args:
        i = args.index('--bg')
        if i + 1 >= len(args):
            raise SystemExit('--bg needs a color, for example --bg "#101018"')
        bg, ok = safe_bg(args[i + 1])
        if not ok:
            print('note: "%s" is not a plain color (like #101018, rgb(16,16,24) or black); using %s' % (args[i + 1], DEFAULT_BG), file=sys.stderr)
        del args[i:i + 2]
    argv = [argv[0]] + args
    if len(argv) < 3:
        raise SystemExit('usage: python3 pack.py in.html out.html ["Title"] [--bg COLOR]')
    try:
        import zopfli.gzip
    except ImportError:
        raise SystemExit('pack.py needs the zopfli module: pip install zopfli')
    src, dst = argv[1], argv[2]
    title = argv[3] if len(argv) > 3 else 'Loading'
    raw = open(src, 'rb').read()
    gz = zopfli.gzip.compress(raw, numiterations=60)
    loader = build_page(gz, title, bg)
    open(dst, 'w', encoding='utf-8').write(loader)
    print('packed: %d -> %d bytes (%d%%)' % (len(raw), len(loader), round(100 * len(loader) / max(1, len(raw)))))


if __name__ == '__main__':
    main(sys.argv)
