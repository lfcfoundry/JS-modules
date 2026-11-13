# B25/B26 card picture: packRows first-save time as a share of B21 (queued for 0.10.2), 3 browsers weighted 60/15/25
D = [('Taxi trips, 300k (real)', 0.70, 0.64), ('Sensors with nulls, 100k', 0.69, 0.66), ('Logs (mostly text), 100k', 0.99, 0.98)]
W, X0, BW, Y0, RH, H = 820, 210, 460, 110, 84, 22
def x(v): return X0 + v * BW
C = ('#eb6834', '#8fb8e8', '#2a78d6')
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Y0 + len(D) * RH + 160}" font-family="Helvetica, Arial, sans-serif">', '<rect width="100%" height="100%" fill="#ffffff"/>',
     '<text x="20" y="30" font-size="19" font-weight="700" fill="#1a1a1a">Saving rows (packRows): time compared with B21, same files</text>',
     '<text x="20" y="52" font-size="13" fill="#555">First save on a fresh page. Chromium 156, Firefox 158, WebKitGTK 2.52.6, weighted 60/15/25. Shorter is faster.</text>',
     f'<rect x="20" y="70" width="12" height="12" rx="2" fill="{C[0]}"/><text x="38" y="81" font-size="13" fill="#1a1a1a">B21 (queued for 0.10.2)</text>',
     f'<rect x="215" y="70" width="12" height="12" rx="2" fill="{C[1]}"/><text x="233" y="81" font-size="13" fill="#1a1a1a">Send B25 only</text>',
     f'<rect x="355" y="70" width="12" height="12" rx="2" fill="{C[2]}"/><text x="373" y="81" font-size="13" fill="#1a1a1a">Send B25 + B26 (recommended)</text>']
for t in (0, 0.25, 0.5, 0.75, 1.0):
    o.append(f'<line x1="{x(t)}" x2="{x(t)}" y1="{Y0 - 4}" y2="{Y0 + len(D) * RH - 12}" stroke="#e5e5e5"/><text x="{x(t)}" y="{Y0 + len(D) * RH + 4}" font-size="12" fill="#777" text-anchor="middle">{t:.2f}</text>')
for i, (name, a, b) in enumerate(D):
    y = Y0 + i * RH
    o.append(f'<text x="{X0 - 10}" y="{y + 40}" font-size="13" fill="#1a1a1a" text-anchor="end">{name}</text>')
    for k, v in enumerate((1.0, a, b)):
        yy = y + k * (H + 2)
        o.append(f'<rect x="{X0}" y="{yy}" width="{v * BW}" height="{H}" rx="3" fill="{C[k]}"/><text x="{x(v) + 6}" y="{yy + 16}" font-size="12" fill="#1a1a1a">{v:.2f}</text>')
o.append(f'<ellipse cx="{x(0.64) + 18}" cy="{Y0 + 2 * (H + 2) + 11}" rx="44" ry="21" fill="none" stroke="#d10000" stroke-width="3"/>')
yb = Y0 + len(D) * RH + 30
o.append(f'<text x="20" y="{yb}" font-size="14" font-weight="700" fill="#d10000">Look at the circle: taxi saves drop to 0.64 of B21 (0.58 on repeat saves), same file bytes.</text>')
o.append(f'<text x="20" y="{yb + 22}" font-size="12" fill="#555">Against parquet-wasm 0.9.0 on the same taxi rows: 0.38 to 0.59 of its save time in all 3 browsers, and a 21% smaller file.</text>')
o.append(f'<text x="20" y="{yb + 40}" font-size="12" fill="#555">Byte-identical on 19 files and 15 odd-row cases; all 40 lfc-pack checks pass. No cell slower beyond noise. Text-heavy tables stay even.</text>')
o.append(f'<text x="20" y="{yb + 58}" font-size="12" fill="#555">Measured 11:30 to 11:55 PM Detroit, 4-core cloud box, fresh page per run.</text></svg>')
open('/tmp/claude-0/-home-user/6c7b7b58-758d-5822-8958-64661f21c7d6/scratchpad/chart/b25.svg', 'w').write('\n'.join(o))
