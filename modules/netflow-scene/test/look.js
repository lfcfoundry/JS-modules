/* Copyright (c) 2026 LFC Foundry. MIT License. The look settings: cleaning, themes, names, presets, contrast. */
'use strict';
const L = require('../netflow-scene-look.js'), Scene = require('../netflow-scene.js');
let fails = 0; const ok = (c, t) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t); };

ok(L.isDefault(L.defaults()), 'the empty look changes nothing');
const bad = L.clean({ base: 'purple', slots: { bg: 'red', fg: '#ABCDEF', nope: '#000000', __proto__: { x: 1 } }, groups: ['#112233', 5, null], ramp: ['#000000'], font: 'comic', nodeScale: 99 });
ok(bad.base === 'auto' && !('bg' in bad.slots) && bad.slots.fg === '#abcdef' && !('nope' in bad.slots), 'unknown or malformed settings are dropped, hex is lower-cased');
ok(bad.groups.length === 3 && bad.groups[0] === '#112233' && bad.groups[1] === '', 'groups keep valid colors, blanks for the rest');
ok(bad.ramp.length === 0 && bad.font === 'system' && bad.nodeScale === 3, 'a one-color scale, an unknown font and a huge size are fixed');
ok(L.clean(null).font === 'system' && L.clean('x').base === 'auto', 'non-objects give the empty look');
ok(L.clean({ groups: ['', '', ''] }).groups.length === 0, 'all-blank groups become none');

const T = Scene.THEMES, f = L.clean({ base: 'dark', slots: { bg: '#010203' }, groups: ['#ff0000'], ramp: ['#000000', '#ffffff'] });
const t = L.resolve(T, f, 'light');
ok(t.bg === '#010203' && t.fg === T.dark.fg && t.groups[0] === '#ff0000' && t.groups[1] === T.dark.groups[1], 'resolve lays the look over the chosen base');
ok(T.dark.bg !== '#010203' && T.dark.groups[0] !== '#ff0000', 'resolve does not change the base theme');
const n1 = L.register(Scene, f, 'light'), n2 = L.register(Scene, L.clean(JSON.parse(JSON.stringify(f))), 'light');
ok(n1.theme === n2.theme && n1.theme.indexOf('look:dark:') === 0, 'the same look always gets the same name');
ok(n1.palette === n1.theme && n1.ramp === n1.theme && Scene.RAMPS[n1.ramp].length === 2 && Scene.PALETTES[n1.palette][0] === '#ff0000', 'palette and scale are registered under it');
ok(L.register(Scene, L.defaults(), 'dark').theme === 'dark', 'a plain look uses the app theme name');
ok(L.register(Scene, L.clean({ font: 'mono', nodeScale: 2 }), 'light').theme === 'light', 'type and size alone do not make a new theme');

/* the scene module draws with the registered theme */
const sc = Scene.make({ view: 'network', nodes: [], edges: [], n: 0 }, { theme: n1.theme, palette: n1.palette });
ok(sc && sc.theme && sc.theme.hex.bg === '#010203', 'the scene module uses the look\'s background');
for (let i = 0; i < 100; i++) L.register(Scene, L.clean({ slots: { bg: '#' + (0x100000 + i).toString(16) } }), 'light');
ok(Object.keys(Scene.THEMES).length < 70, 'registered themes stay bounded (' + Object.keys(Scene.THEMES).length + ')');

ok(Math.abs(L.contrast('#000000', '#ffffff') - 21) < 0.01 && L.contrast('#777777', '#777777') === 1, 'contrast ratio');
ok(L.warnings(T.light).length === 0 && L.warnings(T.dark).length === 0, 'the normal themes raise no warnings');
ok(L.warnings(L.resolve(T, L.clean({ slots: { fg: '#f0f0f0', bg: '#ffffff' } }), 'light')).length >= 1, 'pale text on white is flagged');
L.PRESETS.forEach((p) => { const r = L.resolve(T, p.look, 'light'), w = L.warnings(r); ok(w.length === 0 && L.isHex(r.bg) && r.groups.length === 12, 'preset "' + p.name + '" is complete and readable'); });
ok(new Set(L.PRESETS.map((p) => p.name)).size === L.PRESETS.length && L.isDefault(L.PRESETS[0].look), 'preset names are unique; the first is the normal look');
ok(L.fontStack('nope') === L.fontStack('system'), 'an unknown font gives the standard stack');
process.exit(fails ? 1 : 0);
