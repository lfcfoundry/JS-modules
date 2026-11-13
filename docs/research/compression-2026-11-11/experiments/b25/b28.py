D=[('First call on a fresh page',[(1.0,'#eb6834'),(0.92,'#2a78d6'),(1.11,'#8fb8e8')]),('Later calls',[(1.0,'#eb6834'),(0.63,'#2a78d6'),(0.55,'#8fb8e8')])]
W,X0,BW,Y0,RH,H=860,210,440,110,90,22
x=lambda v:X0+v*BW
o=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Y0+len(D)*RH+150}" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>',
'<text x="20" y="30" font-size="19" font-weight="700" fill="#1a1a1a">packRowsParallel: save time compared with packRows (B25 + B26)</text>',
'<text x="20" y="52" font-size="13" fill="#555">200k-row taxi table (real NYC trips). Chromium 156, Firefox 158, WebKitGTK 2.52.6, weighted 60/15/25. Shorter is faster.</text>',
'<rect x="20" y="70" width="12" height="12" rx="2" fill="#eb6834"/><text x="38" y="81" font-size="13">packRows (B25 + B26)</text>',
'<rect x="200" y="70" width="12" height="12" rx="2" fill="#2a78d6"/><text x="218" y="81" font-size="13">Auto start (recommended)</text>',
'<rect x="410" y="70" width="12" height="12" rx="2" fill="#8fb8e8"/><text x="428" y="81" font-size="13">Always use helpers</text>']
for t in (0,0.25,0.5,0.75,1.0,1.25): o.append(f'<line x1="{x(t)}" x2="{x(t)}" y1="{Y0-4}" y2="{Y0+len(D)*RH-12}" stroke="#e5e5e5"/><text x="{x(t)}" y="{Y0+len(D)*RH+4}" font-size="12" fill="#777" text-anchor="middle">{t:.2f}</text>')
for i,(n,bars) in enumerate(D):
  y=Y0+i*RH; o.append(f'<text x="{X0-10}" y="{y+40}" font-size="13" text-anchor="end">{n}</text>')
  for k,(v,c) in enumerate(bars):
    yy=y+k*(H+2); o.append(f'<rect x="{X0}" y="{yy}" width="{v*BW}" height="{H}" rx="3" fill="{c}"/><text x="{x(v)+6}" y="{yy+16}" font-size="12">{v:.2f}</text>')
o.append(f'<ellipse cx="{x(0.92)+18}" cy="{Y0+(H+2)+11}" rx="44" ry="21" fill="none" stroke="#d10000" stroke-width="3"/>')
yb=Y0+len(D)*RH+30
o.append(f'<text x="20" y="{yb}" font-size="14" font-weight="700" fill="#d10000">Look at the circle: with auto start the first save is never slower; later saves are 0.63 here, 0.54 at 300k rows.</text>')
o.append(f'<text x="20" y="{yb+22}" font-size="12" fill="#555">"Always use helpers" is a little faster later (0.55) but a cold first call is 1.11 weighted, up to 1.39x in WebKitGTK, while the helpers start.</text>')
o.append(f'<text x="20" y="{yb+40}" font-size="12" fill="#555">Same file bytes as packRows. Under about 52 MB of row text it just calls packRows. 300k taxi later calls: 224 ms vs parquet-wasm 767 ms (Chromium).</text>')
o.append(f'<text x="20" y="{yb+58}" font-size="12" fill="#555">Measured 9:10 to 9:25 AM Detroit, 4-core cloud box (3 helpers), fresh page per run. Laptop core counts will change the gain.</text></svg>')
open('b28.svg','w').write('\n'.join(o))
