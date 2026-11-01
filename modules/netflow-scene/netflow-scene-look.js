/*!
 * netflow-scene-look.js, an optional companion of netflow-scene.js: look settings. One small object says how a map is colored and set in type, and this file turns it into the names the scene module understands.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Cut from Netflow Map. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.4.0 (API 1)
 *
 * No DOM, no storage; runs in the page, in a worker and in Node. A "look" is
 *   { base: 'auto'|'light'|'dark', slots: { bg: '#hex', ... }, groups: ['#hex' or '', ... 12], ramp: ['#hex', ...2..6], font: 'system'|..., nodeScale: 0.4..3 }
 * An empty look (defaults()) changes nothing. resolve() lays a look over a scene theme; register() puts the result into the scene module's
 * (mutable) THEMES / PALETTES / RAMPS tables under a name made from the look's content, so the scene module's kept looks stay valid and no copy of it is needed.
 */
var NetflowSceneLook = (function () {
  'use strict';
  /** [key, short name, what it colors] in the order the chooser shows them. */
  var SLOTS = [
    ['bg', 'Background', 'The empty space behind the map.'],
    ['box', 'Boxes and cards', 'The fill of boxes, the key and the name tags.'],
    ['boxLine', 'Box outlines', 'The thin line around boxes and tags.'],
    ['fg', 'Text', 'Names on the map and in the key.'],
    ['muted', 'Quiet text', 'Smaller notes, link names and numbers.'],
    ['line', 'Links', 'Links that have no color of their own.'],
    ['good', 'Good', 'Positive results, such as a good ending.'],
    ['bad', 'Bad', 'Negative results, such as a bad ending.'],
    ['neutral', 'Neutral', 'Items with no good or bad meaning.'],
    ['accent', 'Highlight', 'The chosen item and the route you light up.'],
    ['gold', 'Loops and warnings', 'Loops back and other things to look at.'],
    ['lane0', 'Band A', 'Every other band in lanes and rows.'],
    ['lane1', 'Band B', 'The bands in between.']
  ];
  var SLOT_KEYS = SLOTS.map(function (s) { return s[0]; });
  /** Type families from the device's own fonts (no downloads). */
  var FONTS = {
    system: ['Standard', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
    humanist: ['Friendly', '"Trebuchet MS", "Segoe UI", Candara, "Gill Sans", sans-serif'],
    serif: ['Serif (books)', 'Georgia, "Times New Roman", Cambria, serif'],
    slab: ['Slab', 'Rockwell, "Roboto Slab", "Courier New", Georgia, serif'],
    mono: ['Typewriter', 'ui-monospace, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'],
    narrow: ['Narrow', '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif'],
    round: ['Rounded', '"Varela Round", "Arial Rounded MT Bold", "Nunito", "Segoe UI", sans-serif']
  };
  var HEX = /^#[0-9a-f]{6}$/i;
  function defaults() { return { base: 'auto', slots: {}, groups: [], ramp: [], font: 'system', nodeScale: 1 }; }
  function isHex(x) { return typeof x === 'string' && HEX.test(x); }
  /** A safe copy of anything (saved text, a shared view, an imported file): only known keys of the right kind survive. */
  function clean(v) {
    var o = defaults();
    if (!v || typeof v !== 'object') return o;
    if (v.base === 'light' || v.base === 'dark' || v.base === 'auto') o.base = v.base;
    if (v.slots && typeof v.slots === 'object') SLOT_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(v.slots, k) && isHex(v.slots[k])) o.slots[k] = v.slots[k].toLowerCase(); });
    if (Array.isArray(v.groups)) o.groups = v.groups.slice(0, 12).map(function (g) { return isHex(g) ? g.toLowerCase() : ''; });
    if (o.groups.every(function (g) { return !g; })) o.groups = [];
    if (Array.isArray(v.ramp) && v.ramp.length >= 2 && v.ramp.every(isHex)) o.ramp = v.ramp.slice(0, 6).map(function (g) { return g.toLowerCase(); });
    if (typeof v.font === 'string' && Object.prototype.hasOwnProperty.call(FONTS, v.font)) o.font = v.font;
    if (typeof v.nodeScale === 'number' && isFinite(v.nodeScale)) o.nodeScale = Math.max(0.4, Math.min(3, v.nodeScale));
    return o;
  }
  /** True when the look changes nothing about the map's colors (type and size are separate). */
  function plainColors(f) { return !Object.keys(f.slots).length && !f.groups.length && !f.ramp.length; }
  function isDefault(f) { return plainColors(f) && f.base === 'auto' && f.font === 'system' && f.nodeScale === 1; }
  function hash(f) {
    var s = JSON.stringify([f.base, f.slots, f.groups, f.ramp]), h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }
  function fontStack(name) { return (FONTS[name] || FONTS.system)[1]; }
  /** The base theme name for a look: its own choice, else the one the app is using. */
  function baseName(f, appTheme) { return f.base === 'light' || f.base === 'dark' ? f.base : (appTheme === 'dark' ? 'dark' : 'light'); }
  /** A full scene theme: the base theme with the look's colors laid over it. */
  function resolve(THEMES, f, appTheme) {
    var b = THEMES[baseName(f, appTheme)] || THEMES.light, t = {};
    Object.keys(b).forEach(function (k) { t[k] = k === 'groups' ? b.groups.slice() : b[k]; });
    SLOT_KEYS.forEach(function (k) { if (f.slots[k]) t[k] = f.slots[k]; });
    f.groups.forEach(function (g, i) { if (g) t.groups[i] = g; });
    return t;
  }
  var made = [];   /* names registered so far, oldest first, so the tables stay small */
  function remember(scene, name) {
    made.push(name);
    while (made.length > 60) { var old = made.shift(); delete scene.THEMES[old]; delete scene.PALETTES[old]; delete scene.RAMPS[old]; }
  }
  /**
   * Puts the look into the scene module's tables and returns what to pass to NetflowScene.make: { theme, palette, ramp } (palette and ramp are '' when the look leaves them alone).
   * The same look always gets the same names, so the scene module's kept looks are reused.
   */
  function register(scene, f, appTheme, wantPalette) {
    var base = baseName(f, appTheme), out = { theme: base, palette: '', ramp: '' };
    if (plainColors(f)) return out;
    var id = 'look:' + base + ':' + hash(f);
    if (!scene.THEMES[id]) { scene.THEMES[id] = resolve(scene.THEMES, f, appTheme); remember(scene, id); }
    out.theme = id;
    /* the person's own twelve group colors beat a named color set only when set in the look */
    if (f.groups.length && !scene.PALETTES[id]) scene.PALETTES[id] = scene.THEMES[id].groups.slice();
    if (f.groups.length) out.palette = id;
    if (f.ramp.length) { if (!scene.RAMPS[id]) scene.RAMPS[id] = f.ramp.slice(); out.ramp = id; }
    return out;
  }
  /* ---- contrast, so the chooser can say when text is hard to read */
  function lum(h) {
    var c = [1, 3, 5].map(function (i) { var v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); }
  /** Plain-words warnings about a resolved theme (hex strings). */
  function warnings(t) {
    var w = [];
    if (contrast(t.fg, t.bg) < 4.5) w.push('Text is hard to read on the background (contrast ' + contrast(t.fg, t.bg).toFixed(1) + ', 4.5 or more is comfortable).');
    if (contrast(t.fg, t.box) < 4.5) w.push('Text is hard to read inside boxes (contrast ' + contrast(t.fg, t.box).toFixed(1) + ').');
    if (contrast(t.line, t.bg) < 2) w.push('Links nearly vanish into the background (contrast ' + contrast(t.line, t.bg).toFixed(1) + ').');
    return w;
  }
  /* ---- ready-made looks */
  function P(name, note, base, slots, groups, ramp, font) { return { name: name, note: note, look: clean({ base: base, slots: slots, groups: groups, ramp: ramp, font: font || 'system' }) }; }
  var PRESETS = [
    P('Normal', 'The app\'s own colors.', 'auto', {}, [], [], 'system'),
    P('Slide white', 'Clean white for slides and print.', 'light', { bg: '#ffffff', box: '#f3f5f9', boxLine: '#c3c9d6', fg: '#111827', muted: '#5b6475', line: '#6b7385' }, [], [], 'system'),
    P('Paper', 'Warm paper with serif type.', 'light', { bg: '#f4ecd8', box: '#fbf6e9', boxLine: '#b9a98a', fg: '#3b2f1e', muted: '#7a6a50', line: '#8a7a5e', accent: '#8c3b1f', gold: '#b8860b', lane0: '#ede3c9', lane1: '#f4ecd8' },
      ['#8c3b1f', '#2f6f6a', '#b8860b', '#5b4a8a', '#a14a63', '#4f6d3a', '#c46a2d', '#4a5d7a', '#7a5c3a', '#6d8f8a', '#9a3d3d', '#7d7a2f'], [], 'serif'),
    P('Blueprint', 'White lines on deep blue.', 'dark', { bg: '#0b2a4a', box: '#123a63', boxLine: '#5aa9e6', fg: '#e6f2ff', muted: '#9cc3e6', line: '#7fb8ea', accent: '#ffd166', gold: '#ffd166', lane0: '#0f3358', lane1: '#0b2a4a' },
      ['#7fd1ff', '#ffd166', '#a0e7a0', '#ff9f9f', '#c6b8ff', '#ffb870', '#8fe3d6', '#f2a6d4', '#d4e57a', '#9ab7ff', '#ffe0a3', '#b0f0f0'], ['#d6efff', '#7fb8ea', '#3a7fc0', '#ffd166'], 'mono'),
    P('Midnight neon', 'Bright colors on near black.', 'dark', { bg: '#0a0a14', box: '#171727', boxLine: '#3a3a5c', fg: '#f2f2ff', muted: '#9a9ac0', line: '#6a6aa0', accent: '#00f5d4', gold: '#fee440' },
      ['#00f5d4', '#f15bb5', '#fee440', '#9b5de5', '#00bbf9', '#ff7b00', '#7bff6a', '#ff5d5d', '#5d7bff', '#e0aaff', '#b8f2e6', '#ffd6a5'], ['#1b1464', '#7a1fa2', '#f15bb5', '#fee440'], 'system'),
    P('Forest', 'Calm greens on dark moss.', 'dark', { bg: '#12201a', box: '#1b3026', boxLine: '#3f6b55', fg: '#e7f3ea', muted: '#93b8a2', line: '#6f9a82', accent: '#f4d35e', gold: '#f4d35e', lane0: '#16281f', lane1: '#12201a' },
      ['#7bc67e', '#f4d35e', '#6fb7c9', '#e58f65', '#b49ad8', '#d8e27a', '#8fd1b5', '#e0a1b5', '#a3c97a', '#d4a373', '#7fa8d6', '#c9d9a0'], ['#e9f5e3', '#a6d49f', '#4f9d69', '#1f5a3b'], 'humanist'),
    P('Sunset', 'Warm light with orange and plum.', 'light', { bg: '#fff3e6', box: '#fffaf4', boxLine: '#e3b99a', fg: '#3a1f2b', muted: '#8a5a63', line: '#b0788a', accent: '#d1495b', gold: '#e08a00', lane0: '#fde6d1', lane1: '#fff3e6' },
      ['#d1495b', '#e08a00', '#7a3b69', '#2a7f8f', '#f28e2b', '#8c4a2f', '#c25b8e', '#4d6fa8', '#d9a441', '#9b5e7d', '#e76f51', '#6a8f5d'], ['#fff1c9', '#f4a259', '#d1495b', '#4a1942'], 'round'),
    P('Colorblind-safe', 'Okabe-Ito colors on white; readable with the common kinds of color blindness.', 'light', { bg: '#ffffff', box: '#f5f6f8', boxLine: '#b8bdc9', fg: '#111111', muted: '#555555', line: '#666666', good: '#009e73', bad: '#d55e00', accent: '#0072b2', gold: '#e69f00' },
      ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#56b4e9', '#cc79a7', '#f0e442', '#999999', '#332288', '#88ccee', '#117733', '#aa4499'], ['#fff7bc', '#fec44f', '#d95f0e', '#993404'], 'system'),
    P('High contrast', 'Black on white with strong colors.', 'light', { bg: '#ffffff', box: '#ffffff', boxLine: '#000000', fg: '#000000', muted: '#333333', line: '#000000', good: '#006b3c', bad: '#b00020', neutral: '#444444', accent: '#0033cc', gold: '#8a5a00', lane0: '#eeeeee', lane1: '#ffffff' },
      ['#0033cc', '#b00020', '#006b3c', '#8a5a00', '#6a1b9a', '#005f73', '#9b2226', '#3a3a3a', '#7b2cbf', '#007f5f', '#bb3e03', '#1d3557'], [], 'system'),
    P('High contrast dark', 'White on black.', 'dark', { bg: '#000000', box: '#000000', boxLine: '#ffffff', fg: '#ffffff', muted: '#d0d0d0', line: '#ffffff', good: '#4dff91', bad: '#ff6b6b', neutral: '#cccccc', accent: '#ffe14d', gold: '#ffe14d', lane0: '#141414', lane1: '#000000' },
      ['#4da3ff', '#ff9f4d', '#4dff91', '#ff6b6b', '#c58bff', '#4dffe0', '#ffe14d', '#ff8bd0', '#a8ff4d', '#8bb8ff', '#ffc27a', '#d0d0d0'], [], 'system'),
    P('Print gray', 'Shades of gray that survive a black-and-white printer.', 'light', { bg: '#ffffff', box: '#f4f4f4', boxLine: '#999999', fg: '#111111', muted: '#555555', line: '#555555', good: '#333333', bad: '#000000', neutral: '#888888', accent: '#000000', gold: '#666666', lane0: '#efefef', lane1: '#ffffff' },
      ['#111111', '#666666', '#999999', '#333333', '#bbbbbb', '#777777', '#444444', '#aaaaaa', '#222222', '#888888', '#555555', '#cccccc'], ['#f2f2f2', '#bdbdbd', '#737373', '#252525'], 'serif'),
    P('Terminal', 'Green type on black.', 'dark', { bg: '#050a05', box: '#0b160b', boxLine: '#1f6f2f', fg: '#7dff8a', muted: '#3fae55', line: '#2f9a45', good: '#7dff8a', bad: '#ff5f5f', neutral: '#4a9a58', accent: '#d6ff5f', gold: '#ffd75f', lane0: '#081108', lane1: '#050a05' },
      ['#7dff8a', '#d6ff5f', '#5fffd7', '#ffd75f', '#5fd7ff', '#ff9f5f', '#a8ff7d', '#7dc8ff', '#ffaf5f', '#5fffa0', '#c8ff7d', '#9fffc0'], ['#0b2a10', '#1f6f2f', '#7dff8a', '#eaffd0'], 'mono')
  ];
  return { SLOTS: SLOTS, FONTS: FONTS, PRESETS: PRESETS, defaults: defaults, clean: clean, isDefault: isDefault, plainColors: plainColors, hash: hash, fontStack: fontStack, resolve: resolve, register: register, contrast: contrast, warnings: warnings, isHex: isHex };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetflowSceneLook;
