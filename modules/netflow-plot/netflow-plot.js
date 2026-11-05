/* Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules */
/*
 * Version 2.5.0 (API 2)
 * netflow-plot.js: plain charts from a table's columns (bars, lines, areas, dots, donuts, box plots, histograms, density, hexbins, heat maps,
 * parallel lines, scatter matrix, Q-Q, Voronoi cells, word cloud). make(rows, spec, o, NS) returns drawing lists in the same shape as a map
 * picture (rects, dots, curves, polys, labels), so the same renderer, export and themes draw them. No page, no DOM, no dependencies.
 *
 * rows: plain objects (an item or a link); a column is read with get(row, key) (o.get, default row.attrs[key] ?? row[key]).
 * spec: { type, x, y, color, size, agg ('sum' | 'mean' | 'count' | 'min' | 'max' | 'median'), stack ('stack' | 'group' | 'normalize' | 'stream' | 'none'),
 *         horizontal, bins, smooth (moving average window), index (lines from 100), cols (parallel / matrix), sort ('value' | 'name' | 'none') }.
 * Marks: S.marks = [{ x0, y0, x1, y1, row (index) or rows, t (tooltip text) }] for pointing at things.
 */
var NetflowPlot = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  var TYPES = [
    ['bar', 'Bars', 'Totals for each category; stack, group or share by a second column.'],
    ['line', 'Lines', 'A number over time or over another number; one line per color.'],
    ['area', 'Areas', 'Lines filled down, stacked, as shares or as a stream.'],
    ['scatter', 'Scatter', 'Each row a dot at two numbers; size and color from more columns.'],
    ['connected', 'Connected scatter', 'Dots joined in row order, to show a path through two numbers.'],
    ['beeswarm', 'Beeswarm', 'Every row a dot along one number, dots pushed apart so none hide.'],
    ['dotplot', 'Dot plot', 'One dot per category at its value, easy to compare and sort.'],
    ['hist', 'Histogram', 'How a number is spread: rows counted in equal bins.'],
    ['box', 'Box plot', 'Middle half, median and range of a number for each category.'],
    ['density', 'Density', 'A smooth curve of how a number is spread, one per category.'],
    ['ridgeline', 'Ridgeline', 'Density curves stacked one above the other, one per category.'],
    ['hexbin', 'Hexbin', 'Two numbers counted in hexagons: where rows bunch up.'],
    ['heat', 'Heat map', 'A grid of two categories (or days of a date column), colored by value.'],
    ['donut', 'Donut', 'Shares of a whole as a ring, one slice per category; the total sits in the middle.'],
    ['radialbar', 'Radial bars', 'Bars around a circle, stacked by a second column.'],
    ['parallel', 'Parallel lines', 'Every row a line across several number columns.'],
    ['splom', 'Scatter matrix', 'Every pair of number columns as a small scatter.'],
    ['qq', 'Q-Q plot', 'A number against the normal curve: straight means normal.'],
    ['slope', 'Slope chart', 'How each category changed between two values of a column.'],
    ['marimekko', 'Marimekko', 'Bars as wide as their total, split by a second column.'],
    ['voronoi', 'Voronoi', 'Each dot with the area nearer to it than to any other.'],
    ['words', 'Word cloud', 'The words of a text column, bigger when more common.']
  ];
  var AGG = { sum: 1, mean: 1, count: 1, min: 1, max: 1, median: 1 };

  /* ---------------------------------------------------------------- numbers */
  function num(v) {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null || v === '') return NaN;
    if (typeof v === 'string') { var q = Number(v); if (q === q && (q !== 0 || v.trim() !== '')) return q; }   /* a plain number needs no cleaning: the characters taken out below cannot be in one */
    var s = String(v).trim().replace(/[,$\u00a3\u00a5%\s]/g, '');
    var x = s === '' ? NaN : Number(s); return x;
  }
  function dateMs(v) { if (v instanceof Date) return v.getTime(); if (typeof v !== 'string' || !/\d{4}|\d\/\d/.test(v)) return NaN; var t = Date.parse(v); return isNaN(t) ? NaN : t; }
  /** Round tick steps: 1, 2 or 5 times a power of ten, about n of them. */
  function ticks(lo, hi, n) {
    if (!(hi > lo)) { if (hi === lo && isFinite(lo)) { lo -= lo ? Math.abs(lo) * 0.5 : 1; hi += hi ? Math.abs(hi) * 0.5 : 1; } else return { lo: 0, hi: 1, step: 0.2, list: [0, 0.2, 0.4, 0.6, 0.8, 1] }; }
    var raw = (hi - lo) / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, list = [];
    for (var v = a, k = 0; v <= b + step * 1e-9 && k < 200; v += step, k++) list.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { lo: a, hi: b, step: step, list: list };
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** Date ticks on whole days, months or years. */
  function timeTicks(lo, hi, n) {
    var D = 864e5, span = hi - lo, list = [], fmt;
    if (!(span > 0)) return { lo: lo - D, hi: hi + D, list: [lo], fmt: function (t) { return dayText(t); } };
    var steps = [[1, 'd'], [2, 'd'], [7, 'd'], [14, 'd'], [1, 'm'], [3, 'm'], [6, 'm'], [1, 'y'], [2, 'y'], [5, 'y'], [10, 'y'], [25, 'y'], [50, 'y'], [100, 'y']], st = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) { var len = steps[i][0] * (steps[i][1] === 'd' ? D : steps[i][1] === 'm' ? 30.4 * D : 365.25 * D); if (span / len <= n) { st = steps[i]; break; } }
    var d = new Date(lo); d.setUTCHours(0, 0, 0, 0);
    if (st[1] !== 'd') { d.setUTCDate(1); if (st[1] === 'y') d.setUTCMonth(0); }
    while (d.getTime() < lo) adv(d, st);
    for (var k = 0; d.getTime() <= hi && k < 120; k++) { list.push(d.getTime()); adv(d, st); }
    fmt = st[1] === 'y' ? function (t) { return String(new Date(t).getUTCFullYear()); } : st[1] === 'm' ? function (t) { var x = new Date(t); return MONTHS[x.getUTCMonth()] + (x.getUTCMonth() === 0 ? ' ' + x.getUTCFullYear() : ''); } : dayText;
    return { lo: lo, hi: hi, list: list, fmt: fmt };
    function adv(x, s) { if (s[1] === 'd') x.setUTCDate(x.getUTCDate() + s[0]); else if (s[1] === 'm') x.setUTCMonth(x.getUTCMonth() + s[0]); else x.setUTCFullYear(x.getUTCFullYear() + s[0]); }
  }
  function dayText(t) { var x = new Date(t); return MONTHS[x.getUTCMonth()] + ' ' + x.getUTCDate(); }
  function fmtNum(v) {
    if (!isFinite(v)) return '';
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k';
    if (a >= 100 || v === Math.round(v)) { var r = Math.round(v); return r === 0 && 1 / r < 0 ? '-0' : (r < 0 ? '-' : '') + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }   /* the same text as toLocaleString('en-US'), which costs about 25 microseconds a call in Chromium */
    return Number(v.toPrecision(3)).toString();
  }
  function quant(sorted, p) { var n = sorted.length; if (!n) return NaN; var h = (n - 1) * p, i = Math.floor(h); return i + 1 < n ? sorted[i] + (sorted[i + 1] - sorted[i]) * (h - i) : sorted[i]; }
  function aggregate(vals, how) {
    var n = vals.length, i, s = 0, c = 0, mn = Infinity, mx = -Infinity;
    if (how === 'count') return n;
    if (how === 'median') { var a = vals.filter(function (v) { return v === v; }).sort(function (p, q) { return p - q; }); return a.length ? quant(a, 0.5) : NaN; }
    for (i = 0; i < n; i++) { var v = vals[i]; if (v === v) { s += v; c++; if (v < mn) mn = v; if (v > mx) mx = v; } }
    if (!c) return NaN;
    return how === 'mean' ? s / c : how === 'min' ? mn : how === 'max' ? mx : s;
  }
  /** Normal quantile (Acklam's rational approximation, good to about 1e-9). */
  function normInv(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  /** Gaussian kernel density on a grid of m points (binned first, so 1,000,000 rows cost the same as 1,000 bins). */
  function kde(vals, lo, hi, m, bw) {
    var B = 512, cnt = new Float64Array(B), w = (hi - lo) / B || 1, n = 0, i, j;
    for (i = 0; i < vals.length; i++) { var v = vals[i]; if (v === v) { var k = Math.min(B - 1, Math.max(0, Math.floor((v - lo) / w))); cnt[k]++; n++; } }
    var out = new Float64Array(m), step = (hi - lo) / (m - 1 || 1), norm = 1 / (n * bw * Math.sqrt(TAU)), reach = 4 * bw;
    for (j = 0; j < m; j++) {
      var x = lo + j * step, s = 0, k0 = Math.max(0, Math.floor((x - reach - lo) / w)), k1 = Math.min(B - 1, Math.ceil((x + reach - lo) / w));
      for (i = k0; i <= k1; i++) { if (!cnt[i]) continue; var u = (x - (lo + (i + 0.5) * w)) / bw; s += cnt[i] * Math.exp(-0.5 * u * u); }
      out[j] = n ? s * norm : 0;
    }
    return out;
  }
  function silverman(vals) {
    var a = vals.filter(function (v) { return v === v; }).sort(function (p, q) { return p - q; }), n = a.length; if (n < 2) return 1;
    var mean = 0; a.forEach(function (v) { mean += v; }); mean /= n; var sd = 0; a.forEach(function (v) { sd += (v - mean) * (v - mean); }); sd = Math.sqrt(sd / (n - 1));
    var iqr = quant(a, 0.75) - quant(a, 0.25), s = Math.min(sd, iqr / 1.34 || sd) || sd || 1;
    return 0.9 * s * Math.pow(n, -0.2);
  }

  /* ---------------------------------------------------------------- the frame every chart draws into */
  function frame(spec, o, NS) {
    var base = o.theme === 'editorial' ? 'light' : (o.theme || 'light'), T = NS.palette(base, o.palette), alpha = NS.alpha;
    /* an empty picture from the scene module first, so everything the renderer reads (the link store, the pick grid) is there; the chart fills its lists */
    var S = NS.make({ kind: 'network', view: 'network', dir: 'none', nodes: [], edges: [], width: 100, height: 100 }, { theme: base, palette: o.palette, flat: false });
    S.legend.length = 0; S.legendTitle = ''; S.view = 'plot'; S.kind = 'plot'; S.marks = []; S.plot = true; T = S.theme || T;
    var W = o.width || 900, H = o.height || 560;
    var F = { S: S, T: T, NS: NS, alpha: alpha, W: W, H: H, L: 70, R: W - 24, Tp: 24, B: H - 56, groups: T.groups };
    /* clean look: values written on the bars and boxes instead of a number axis and gridlines (where they fit), and a calmer color set */
    F.clean = o.clean !== undefined ? !!o.clean : (o.theme === 'editorial' || CLEAN_DEFAULT);
    F.calm = function () { if (F.clean && !o.palette) { T.groups = (isDark(T) ? CALM.dark : CALM.light).map(function (h) { return NS.hex(h); }); F.groups = T.groups; } };
    F.text = function (x, y, t, size, col, op) { var l = { x: x, y: y, t: String(t), size: size || 12, color: col || T.fg, align: 'c', bold: false, rot: 0, minK: 0, node: -1 }; if (op) for (var k in op) l[k] = op[k]; if (l.rot) l.rot *= 180 / Math.PI; S.labels.push(l); return l; };   /* angles in radians here, the renderer takes degrees */
    F.line = function (pts, w, col, extra) { if (pts.length < 4) return; var P = [], n = pts.length / 2; P.push(pts[0], pts[1]); for (var i = 1; i < n; i++) { var ax = pts[i * 2 - 2], ay = pts[i * 2 - 1], bx = pts[i * 2], by = pts[i * 2 + 1]; P.push(ax + (bx - ax) / 3, ay + (by - ay) / 3, ax + 2 * (bx - ax) / 3, ay + 2 * (by - ay) / 3, bx, by); } var c = { P: P, w: w, color: col, arrow: false, line: n === 2, edge: -1 }; if (extra) for (var k in extra) c[k] = extra[k]; S.curves.push(c); return c; };
    F.rect = function (x, y, w, h, fill, mark) { if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; } S.rects.push({ x: x, y: y, w: w, h: h, r: 0, fill: fill, stroke: [0, 0, 0, 0], sw: 0, layer: 1, node: -1, a: 1 }); if (mark) { mark.x0 = x; mark.y0 = y; mark.x1 = x + w; mark.y1 = y + h; S.marks.push(mark); } };
    F.dot = function (x, y, r, fill, mark, stroke) { S.dots.push({ cx: x, cy: y, r: r, fill: fill, stroke: stroke || [0, 0, 0, 0], sw: stroke ? 1 : 0, kind: 1, node: -1, a: 1 }); if (mark) { mark.x0 = x - r; mark.y0 = y - r; mark.x1 = x + r; mark.y1 = y + r; mark.cx = x; mark.cy = y; S.marks.push(mark); } };
    F.poly = function (pts, fill, stroke, mark) {   /* the renderer fans a shape out from one point: a shape that is not seen whole from its middle goes in as triangles */
      var n = pts.length / 2, mx = 0, my = 0; for (var i = 0; i < n; i++) { mx += pts[i * 2]; my += pts[i * 2 + 1]; } mx /= n; my /= n;
      S.polys.push({ pts: pts, c: [mx, my], fill: fill, stroke: stroke || [0, 0, 0, 0] });
      if (mark) { var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (i = 0; i < n; i++) { x0 = Math.min(x0, pts[i * 2]); x1 = Math.max(x1, pts[i * 2]); y0 = Math.min(y0, pts[i * 2 + 1]); y1 = Math.max(y1, pts[i * 2 + 1]); } mark.x0 = x0; mark.y0 = y0; mark.x1 = x1; mark.y1 = y1; mark.poly = pts; S.marks.push(mark); }
    };
    /** A band under a line (x, y top, y bottom per point) as quads, each one whole from its middle. */
    F.band = function (xs, top, bot, fill) { for (var i = 0; i + 1 < xs.length; i++) { if (!(top[i] === top[i] && top[i + 1] === top[i + 1])) continue; var p = [xs[i], top[i], xs[i + 1], top[i + 1], xs[i + 1], bot[i + 1], xs[i], bot[i]]; S.polys.push({ pts: p, c: [(xs[i] + xs[i + 1]) / 2, (top[i] + top[i + 1] + bot[i] + bot[i + 1]) / 4], fill: fill, stroke: [0, 0, 0, 0] }); } };
    F.wedge = function (cx, cy, r0, r1, a0, a1, fill, mark) {
      var step = 0.45, a = a0;
      while (a < a1 - 1e-9) {
        var b = Math.min(a1, a + step), m = Math.max(2, Math.ceil((b - a) / 0.05)), p = [], i;
        for (i = 0; i <= m; i++) { var t = a + (b - a) * i / m; p.push(cx + Math.cos(t) * r1, cy + Math.sin(t) * r1); }
        for (i = m; i >= 0; i--) { var t2 = a + (b - a) * i / m; p.push(cx + Math.cos(t2) * r0, cy + Math.sin(t2) * r0); }
        var am = (a + b) / 2, rm = (r0 + r1) / 2; S.polys.push({ pts: p, c: [cx + Math.cos(am) * rm, cy + Math.sin(am) * rm], fill: fill, stroke: [0, 0, 0, 0] });
        a = b;
      }
      if (mark) { mark.x0 = cx - r1; mark.y0 = cy - r1; mark.x1 = cx + r1; mark.y1 = cy + r1; mark.wedge = [cx, cy, r0, r1, a0, a1]; S.marks.push(mark); }
    };
    F.color = function (i) { return F.hiCi >= 0 && i !== F.hiCi ? F.gray : T.groups[((i % T.groups.length) + T.groups.length) % T.groups.length]; };
    F.gray = NS.mix ? NS.mix(T.muted, T.bg, 0.45) : T.muted;   /* the other series when one is highlighted */
    /** Axes: x and y are { kind: 'num' | 'time' | 'band', lo, hi, list, fmt, map(v) -> px, cats }. */
    F.axes = function (ax, ay, xName, yName, grid) {
      var c = alpha(T.muted, 0.9), gc = alpha(T.boxLine, 0.35);
      if (ay && F.noY) {   /* values are on the marks: no number axis, no gridlines; the axis name sits small at the top left */
        if (yName && !F.keyRow) F.yName = F.text(F.L, F.Tp - 8, yName, 11, c, { align: 'l' });
      } else if (ay) {
        ay.list.forEach(function (v) { var y = ay.map(v); if (y < F.Tp - 1 || y > F.B + 1) return; if (grid !== false && ay.kind !== 'band') F.line([F.L, y, F.R, y], 1, gc); F.text(F.L - 8, y + 4, ay.fmt ? ay.fmt(v) : fmtNum(v), 11, c, { align: 'r' }); });
        if (yName) F.text(14, (F.Tp + F.B) / 2, yName, 12, T.fg, { rot: -Math.PI / 2, bold: true });
      }
      if (ax) {
        var labs = ax.list, maxN = Math.max(2, Math.floor((F.R - F.L) / 64)), every = ax.kind === 'band' ? Math.max(1, Math.ceil(labs.length / maxN)) : 1, rot = false;
        var labT = function (v) { return String(ax.fmt ? ax.fmt(v) : fmtNum(v)); };
        if (ax.kind === 'band') {   /* flat unless two shown labels would really touch (about 6.05 px a character at 11 px, 9 px gap); every label when they all fit flat; a long flat name wraps onto two lines */
          var wrapAll = false, fits = function (step) { var prevX = null, prevW = 0; for (var li = 0; li < labs.length; li += step) { var lx = ax.map(labs[li]) + ax.bw / 2, lw = wrap2(labT(labs[li]), wrapAll).reduce(function (m, t) { return Math.max(m, Math.min(14, t.length)); }, 0) * 6.05; if (prevX !== null && lx - prevX < (lw + prevW) / 2 + 9) return false; prevX = lx; prevW = lw; } return true; };
          if (every > 1 && fits(1)) every = 1; else if (!fits(every)) { wrapAll = true; if (every > 1 && fits(1)) every = 1; else rot = !fits(every); if (rot) wrapAll = false; }   /* crowded: every two-word name on two lines before anything tilts */
        }
        labs.forEach(function (v, i) {
          if (i % every) return; var x = ax.map(v) + (ax.kind === 'band' ? ax.bw / 2 : 0); if (x < F.L - 1 || x > F.R + 1) return; if (grid !== false && ax.kind !== 'band') F.line([x, F.Tp, x, F.B], 1, gc);
          if (rot) { F.text(x, F.B + 16, clip(labT(v), 18), 11, c, { rot: -Math.PI / 5, align: 'r' }); return; }
          var ls = ax.kind === 'band' ? wrap2(labT(v), wrapAll) : [labT(v)]; var lw0 = ls.reduce(function (m, t) { return Math.max(m, Math.min(14, t.length)); }, 0) * CW, al = null, lx0 = x;
          if (ax.kind === 'band' && x - lw0 / 2 < F.L - 4) { al = { align: 'l' }; lx0 = F.L - 4; } else if (ax.kind === 'band' && x + lw0 / 2 > F.W - 4) { al = { align: 'r' }; lx0 = F.W - 4; }   /* an end name never runs past the number axis or the edge */
          ls.forEach(function (t, k) { F.text(lx0, F.B + 16 + k * 14, clip(t, 14), 11, c, al); });
        });
        /* tilted names reach further down than the axis name sits; the names say what the axis is, so the axis name is left out rather than drawn over them */
        var drop = 0; if (rot) labs.forEach(function (v, i) { if (!(i % every)) drop = Math.max(drop, Math.min(18, labT(v).length) * 6.05 * Math.sin(Math.PI / 5) + 4); });
        if (xName && 16 + drop < F.H - 10 - F.B - 12) F.text((F.L + F.R) / 2, F.H - 10, xName, 12, T.fg, { bold: true });
      }
      F.line([F.L, F.B, F.R, F.B], 1, alpha(T.muted, 0.7));
    };
    F.legend = function (title, names, colorOf) {
      S.legendTitle = title || ''; names.slice(0, 24).forEach(function (n, i) { S.legend.push({ k: 'group', c: colorOf ? colorOf(n, i) : F.color(i), t: n === '' ? '(blank)' : String(n), key: 'p:' + n }); });
      if (!F.keyRow) return;   /* a row of swatches over the plot (room was made for it), so the picture and its SVG carry their own key */
      var x = F.L, y = 14, cw = 6.6, more = 0;
      if (title) { F.text(x, y + 4, clip(title, 24) + ':', 12, T.fg, { align: 'l', bold: true }); x += Math.min(24, String(title).length + 1) * cw * 1.05 + 10; }
      S.legend.forEach(function (l) { var w = 16 + Math.min(18, l.t.length) * cw + 14; if (x + w > F.R) { more++; return; } F.rect(x, y - 5, 11, 11, l.c); F.text(x + 16, y + 4, clip(l.t, 18), 12, T.fg, { align: 'l' }); x += w; });
      if (more) F.text(Math.min(x, F.R - 60), y + 4, '+' + more + ' more', 12, T.muted, { align: 'l' });
    };
    return F;
  }
  /** A name longer than 14 characters splits at the space nearest its middle (two lines under a flat axis); others stay one line. */
  function wrap2(s, all) { if (s.length <= (all ? 0 : 14)) return [s]; var best = -1; for (var i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - s.length / 2) < Math.abs(best - s.length / 2))) best = i; return best > 0 ? [s.slice(0, best), s.slice(best + 1)] : [s]; }
  var CLEAN_DEFAULT = true;
  /* the calm color set of the clean look: blues first (stacked parts read as one family), then teal, ochre and brick; marks read at 3:1 or better on the background */
  var CALM = { light: ['#1f4e79', '#4f8cc9', '#9cc3e6', '#2a8c82', '#c99a2e', '#b4533c', '#6f6aa6', '#7d8792', '#5b7f3a', '#b56f8e', '#3f6f78', '#9a8158'],
    dark: ['#6aa6e6', '#3d73b3', '#a9d0f2', '#45b3a6', '#e0b453', '#e07a62', '#9a95d6', '#a3abb5', '#88ad62', '#d996b3', '#6fa3ad', '#c4ab80'] };
  function isDark(T) { var b = T.bg; return 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2] < 0.4; }
  function relLum(c) { var f = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  /** Dark or white ink for a name written on a fill, whichever reads better. */
  function inkOn(fill) { var L = relLum(fill), d = (L + 0.05) / (relLum([0.11, 0.13, 0.17]) + 0.05), w = 1.05 / (L + 0.05); return d >= w ? [0.11, 0.13, 0.17, 1] : [1, 1, 1, 1]; }
  var CW = 6.05;   /* about the width of one character at 11 px */
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
  function linear(lo, hi, a, b) { var k = hi > lo ? (b - a) / (hi - lo) : 0; return function (v) { return a + (v - lo) * k; }; }
  /** A number or date axis from the values (with room at the ends when zero is not wanted). */
  function axisFor(vals, isTime, a, b, zero, n) {
    var lo = Infinity, hi = -Infinity; for (var i = 0; i < vals.length; i++) { var v = vals[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    if (isTime) { var tt = timeTicks(lo, hi, n || 8); return { kind: 'time', lo: lo, hi: hi, list: tt.list, fmt: tt.fmt, map: linear(lo, hi === lo ? lo + 1 : hi, a, b) }; }
    var t = ticks(lo, hi, n || 6); return { kind: 'num', lo: t.lo, hi: t.hi, list: t.list, map: linear(t.lo, t.hi, a, b) };
  }
  function bandAxis(cats, a, b, pad) { var n = Math.max(1, cats.length), step = (b - a) / n, bw = step * (1 - (pad === undefined ? 0.2 : pad)), pos = new Map(); cats.forEach(function (c, i) { pos.set(c, a + i * step + (step - bw) / 2); }); return { kind: 'band', list: cats, bw: bw, step: step, map: function (c) { return pos.get(c); }, fmt: function (c) { return c === '' ? '(blank)' : String(c); } }; }

  /* ---------------------------------------------------------------- reading the table */
  function reader(rows, o) {
    var get = o.get || function (r, k) { var a = r.attrs; return a && Object.prototype.hasOwnProperty.call(a, k) ? a[k] : r[k]; };
    var cache = new Map();
    var R = {
      n: rows.length,
      raw: function (k) { var key = 'r' + k; if (cache.has(key)) return cache.get(key); var out = new Array(rows.length); for (var i = 0; i < rows.length; i++) out[i] = get(rows[i], k); cache.set(key, out); return out; },
      /** numbers of a column (dates as ms when the column is mostly dates); .time says which */
      num: function (k) {
        var key = 'n' + k; if (cache.has(key)) return cache.get(key);
        var raw = R.raw(k), out = new Float64Array(rows.length), good = 0, dates = 0, i;
        for (i = 0; i < raw.length; i++) { var v = num(raw[i]); out[i] = v; if (v === v) good++; }
        if (good < 0.8 * countFilled(raw)) { var dt = new Float64Array(rows.length), seen = new Map(); for (i = 0; i < raw.length; i++) { var rv = raw[i], d = typeof rv === 'string' ? seen.get(rv) : undefined; if (d === undefined) { d = dateMs(rv); if (typeof rv === 'string') seen.set(rv, d); } dt[i] = d; if (d === d) dates++; }   /* each date text is read once */ if (dates > good) { dt.time = true; out = dt; } }
        cache.set(key, out); return out;
      },
      cat: function (k) { var key = 'c' + k; if (cache.has(key)) return cache.get(key); var raw = R.raw(k), out = new Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw[i] === undefined || raw[i] === null ? '' : String(raw[i]); cache.set(key, out); return out; },
      label: function (i) { var r = rows[i]; return r.label !== undefined ? r.label : r.id !== undefined ? r.id : r.from !== undefined ? r.from + ' \u2192 ' + r.to : 'row ' + (i + 1); }
    };
    return R;
  }
  function countFilled(a) { var c = 0; for (var i = 0; i < a.length; i++) if (a[i] !== undefined && a[i] !== null && a[i] !== '') c++; return c; }
  /** Categories in a stable order: by total (biggest first), by name, or as they come. */
  var HI = null;   /* while make() runs with options.highlight: { name, F, ck: color column, xk: x column } */
  /** Moves the shapes in the highlight color to the end of their lists, so they are drawn over the gray ones. */
  function lift(S, c) {
    var same = function (f) { return f && f[0] === c[0] && f[1] === c[1] && f[2] === c[2]; };
    var up = function (list, key) { var a = [], b = []; for (var i = 0; i < list.length; i++) (same(list[i][key]) ? b : a).push(list[i]); return a.concat(b); };
    S.curves = up(S.curves, 'color'); S.dots = up(S.dots, 'fill'); S.polys = up(S.polys, 'fill');
  }
  function catsOf(keys, vals, sort, cap) {
    var tot = new Map(), first = [];
    for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (!tot.has(k)) { tot.set(k, 0); first.push(k); } var v = vals ? vals[i] : 1; if (v === v) tot.set(k, tot.get(k) + v); }
    var list = first.slice();
    if (sort === 'name') list.sort(function (a, b) { var x = num(a), y = num(b); return x === x && y === y ? x - y : a < b ? -1 : a > b ? 1 : 0; });
    else if (sort !== 'none') list.sort(function (a, b) { return tot.get(b) - tot.get(a); });
    var other = null;
    var hi = HI && (keys === HI.ck || keys === HI.xk) ? HI.name : undefined;   /* the highlighted series (or bar) keeps its own place, never folded into Other */
    if (cap && list.length > cap) { var keep = hi !== undefined && list.indexOf(hi) >= cap - 1; other = list.slice(keep ? cap - 2 : cap - 1); if (keep) other.splice(other.indexOf(hi), 1); list = list.slice(0, keep ? cap - 2 : cap - 1).concat(keep ? [hi, 'Other'] : ['Other']); }
    if (hi !== undefined) { if (keys === HI.ck) HI.F.hiCi = list.indexOf(hi); if (keys === HI.xk) HI.F.hiX = list.indexOf(hi) >= 0 ? hi : undefined; }
    return { list: list, other: other ? new Set(other) : null, tot: tot };
  }
  /** Values grouped by (x category, color category), aggregated. */
  function cross(xk, ck, v, how, xcats, ccats) {
    var map = new Map(), i;
    for (i = 0; i < xk.length; i++) {
      var a = xcats.other && xcats.other.has(xk[i]) ? 'Other' : xk[i], b = ck ? (ccats.other && ccats.other.has(ck[i]) ? 'Other' : ck[i]) : '';
      var key = a + '\u0000' + b, l = map.get(key); if (!l) { l = []; l.rows = []; map.set(key, l); } l.push(v ? v[i] : 1); l.rows.push(i);
    }
    var out = new Map(); map.forEach(function (l, k) { out.set(k, { v: aggregate(l, v ? how : 'count'), rows: l.rows }); });
    return out;
  }

  /* ---------------------------------------------------------------- the charts */
  var CH = {};
  CH.bar = function (F, R, sp) {
    var xk = R.cat(sp.x), v = sp.y ? R.num(sp.y) : null, how = sp.y ? (sp.agg || 'sum') : 'count', ck = sp.color && sp.color !== sp.x ? R.cat(sp.color) : null;
    var xc = catsOf(xk, v, sp.sort || 'value', sp.horizontal ? 60 : 50), cc = ck ? catsOf(ck, v, 'value', 12) : { list: [''], other: null };
    var cell = cross(xk, ck, v, how, xc, cc), mode = ck ? (sp.stack || 'stack') : 'none', horiz = !!sp.horizontal;
    var totals = new Map(), lo = 0, hi = 0;
    xc.list.forEach(function (x) { var pos = 0, neg = 0, t = 0; cc.list.forEach(function (c) { var e = cell.get(x + '\u0000' + c); if (!e || e.v !== e.v) return; if (e.v >= 0) pos += e.v; else neg += e.v; t += Math.abs(e.v); }); totals.set(x, t); if (mode === 'group' || mode === 'none') { cc.list.forEach(function (c) { var e = cell.get(x + '\u0000' + c); if (e && e.v === e.v) { lo = Math.min(lo, e.v); hi = Math.max(hi, e.v); } }); } else { lo = Math.min(lo, neg); hi = Math.max(hi, pos); } });
    if (mode === 'normalize') { lo = 0; hi = 1; }
    if (horiz) { F.L = Math.min(220, 20 + 7 * Math.min(28, Math.max.apply(null, xc.list.map(function (s) { return String(s).length; }).concat([4])))); }
    var band = horiz ? bandAxis(xc.list, F.Tp, F.B, 0.18) : bandAxis(xc.list, F.L, F.R, 0.18), val = horiz ? axisFor([lo, hi], false, F.L, F.R, true) : axisFor([lo, hi], false, F.B, F.Tp, true);
    if (mode === 'normalize') val.fmt = function (p) { return Math.round(p * 100) + '%'; };
    if (!ck) F.hiCi = -1;   /* no color column (or color is x): a highlight picks one bar */
    else F.hiX = undefined;
    var zero = val.map(0), colOf = function (ci) { return ck ? F.color(ci) : F.color(0); }, segs = [], ends = [];
    xc.list.forEach(function (x) {
      var b0 = band.map(x), up = 0, dn = 0, tot = totals.get(x) || 1, nC = cc.list.length, sUp = 0, sDn = 0;
      cc.list.forEach(function (c, ci) {
        var e = cell.get(x + '\u0000' + c); if (!e || e.v !== e.v) return;
        var v0, v1, s0 = b0, sw = band.bw;
        if (mode === 'group') { sw = band.bw / nC; s0 = b0 + ci * sw; v0 = 0; v1 = e.v; }
        else if (mode === 'normalize') { v0 = up; up += Math.abs(e.v) / tot; v1 = up; }
        else if (mode === 'stack') { if (e.v >= 0) { v0 = up; up += e.v; v1 = up; } else { v0 = dn; dn += e.v; v1 = dn; } }
        else { v0 = 0; v1 = e.v; }
        var a = val.map(v0), b = val.map(v1), col = mode === 'none' && !ck && e.v < 0 ? F.T.bad : colOf(ci);
        if (F.hiX !== undefined && x !== F.hiX) col = F.gray;   /* highlight one bar, gray the rest (no color column) */
        var mark = { rows: e.rows, t: (x === '' ? '(blank)' : x) + (ck ? ' \u00b7 ' + (c || '(blank)') : '') + ': ' + fmtNum(e.v) };
        if (horiz) F.rect(a, s0, b - a, sw, col, mark); else F.rect(s0, b, sw, a - b, col, mark);
        var vt = mode === 'normalize' ? Math.round(Math.abs(e.v) / tot * 100) + '%' : fmtNum(e.v);
        if (mode === 'stack' || mode === 'normalize') { segs.push({ s0: s0, sw: sw, a: a, b: b, t: vt, col: col }); if (e.v >= 0) sUp += e.v; else sDn += e.v; }
        else ends.push({ s0: s0, sw: sw, end: b, neg: v1 < v0, t: vt });
      });
      if (mode === 'stack') { if (sUp > 0 || !sDn) ends.push({ s0: b0, sw: band.bw, end: val.map(up), neg: false, t: fmtNum(sUp) }); if (sDn < 0) ends.push({ s0: b0, sw: band.bw, end: val.map(dn), neg: true, t: fmtNum(sDn) }); }
    });
    /* clean look: every bar end gets its value when all of them fit beside their bars; otherwise the number axis stays */
    if (F.clean) F.noY = ends.every(function (q) { return horiz ? q.sw >= 12 : q.t.length * CW <= q.sw + Math.max(4, band.step - band.bw - 4); }) && (ends.length || segs.length);
    if (horiz) { F.axes(null, null); var vy = val; if (!F.noY) vy.list.forEach(function (t) { var x = vy.map(t); F.line([x, F.Tp, x, F.B], 1, F.alpha(F.T.boxLine, 0.35)); F.text(x, F.B + 16, mode === 'normalize' ? Math.round(t * 100) + '%' : fmtNum(t), 11, F.alpha(F.T.muted, 0.9)); }); xc.list.forEach(function (x) { F.text(F.L - 8, band.map(x) + band.bw / 2 + 4, clip(x === '' ? '(blank)' : x, 28), 11, F.T.fg, { align: 'r' }); }); F.line([zero, F.Tp, zero, F.B], 1, F.alpha(F.T.muted, 0.8)); }
    else { F.axes(band, val, sp.x, sp.y ? (how === 'sum' ? '' : how + ' of ') + sp.y : 'Rows'); F.line([F.L, zero, F.R, zero], 1, F.alpha(F.T.muted, 0.8)); }
    if (F.noY) {
      ends.forEach(function (q) {
        if (horiz) { var room = F.R - q.end; F.text(q.neg ? q.end - 5 : (room > q.t.length * CW + 6 ? q.end + 5 : q.end - 5), q.s0 + q.sw / 2 + 4, q.t, 11, room > q.t.length * CW + 6 || q.neg ? F.T.fg : inkOn(F.color(0)), { align: q.neg || room <= q.t.length * CW + 6 ? 'r' : 'l' }); }
        else F.text(q.s0 + q.sw / 2, q.neg ? q.end + 14 : q.end - 5, q.t, 11, F.T.fg, null);
      });
      /* a stacked part is named inside itself when the number fits there */
      segs.forEach(function (q) {
        var len = Math.abs(q.b - q.a), across = q.sw, tw = q.t.length * CW;
        if (horiz ? (len >= tw + 6 && across >= 13) : (len >= 15 && across >= tw + 4)) F.text(horiz ? (q.a + q.b) / 2 : q.s0 + q.sw / 2, horiz ? q.s0 + q.sw / 2 + 4 : (q.a + q.b) / 2 + 4, q.t, 11, inkOn(q.col), null);
      });
    }
    if (ck) F.legend(sp.color, cc.list, function (n, i) { return F.color(i); });
  };
  CH.dotplot = function (F, R, sp) {
    var xk = R.cat(sp.x), v = sp.y ? R.num(sp.y) : null, how = sp.y ? (sp.agg || 'sum') : 'count', ck = sp.color ? R.cat(sp.color) : null;
    var xc = catsOf(xk, v, sp.sort || 'value', 60), cc = ck ? catsOf(ck, v, 'value', 8) : { list: [''], other: null }, cell = cross(xk, ck, v, how, xc, cc), all = [];
    cell.forEach(function (e) { all.push(e.v); });
    F.L = Math.min(220, 20 + 7 * Math.min(28, Math.max.apply(null, xc.list.map(function (s) { return String(s).length; }).concat([4]))));
    var band = bandAxis(xc.list, F.Tp, F.B, 0), val = axisFor(all, false, F.L, F.R, false);
    val.list.forEach(function (t) { var x = val.map(t); F.line([x, F.Tp, x, F.B], 1, F.alpha(F.T.boxLine, 0.35)); F.text(x, F.B + 16, fmtNum(t), 11, F.alpha(F.T.muted, 0.9)); });
    xc.list.forEach(function (x) {
      var y = band.map(x) + band.bw / 2, xs = [];
      F.line([F.L, y, F.R, y], 1, F.alpha(F.T.boxLine, 0.25));
      cc.list.forEach(function (c, ci) { var e = cell.get(x + '\u0000' + c); if (e && e.v === e.v) xs.push(val.map(e.v)); });
      if (xs.length > 1) F.line([Math.min.apply(null, xs), y, Math.max.apply(null, xs), y], 2, F.alpha(F.T.muted, 0.8));
      cc.list.forEach(function (c, ci) { var e = cell.get(x + '\u0000' + c); if (e && e.v === e.v) F.dot(val.map(e.v), y, 5, F.color(ci), { rows: e.rows, t: x + (ck ? ' \u00b7 ' + c : '') + ': ' + fmtNum(e.v) }); });
      F.text(F.L - 8, y + 4, clip(x === '' ? '(blank)' : x, 28), 11, F.T.fg, { align: 'r' });
    });
    if (ck) F.legend(sp.color, cc.list);
  };
  /** Rows sorted along x, one line per color category; smooth = moving average, index = each line from 100 at its first value. */
  function series(F, R, sp) {
    var x = R.num(sp.x), y = sp.y ? R.num(sp.y) : null, ck = sp.color ? R.cat(sp.color) : null, how = sp.agg || 'sum';
    var cc = ck ? catsOf(ck, y, 'value', 12) : { list: [''], other: null }, by = new Map();
    for (var i = 0; i < x.length; i++) {
      if (x[i] !== x[i]) continue;
      var c = ck ? (cc.other && cc.other.has(ck[i]) ? 'Other' : ck[i]) : '', m = by.get(c); if (!m) { m = new Map(); by.set(c, m); }
      var l = m.get(x[i]); if (!l) { l = []; l.rows = []; m.set(x[i], l); } l.push(y ? y[i] : 1); l.rows.push(i);
    }
    var out = [];
    cc.list.forEach(function (c, ci) {
      var m = by.get(c); if (!m) return;
      var xs = Array.from(m.keys()).sort(function (a, b) { return a - b; }), ys = xs.map(function (k) { return aggregate(m.get(k), y ? how : 'count'); }), rows = xs.map(function (k) { return m.get(k).rows; });
      if (sp.smooth > 1) { var w = Math.floor(sp.smooth), sm = new Array(ys.length), s = 0, q = []; for (var j = 0; j < ys.length; j++) { q.push(ys[j]); s += ys[j]; if (q.length > w) s -= q.shift(); sm[j] = s / q.length; } ys = sm; }
      if (sp.index) { var base = ys.find(function (v) { return v === v && v !== 0; }) || 1; ys = ys.map(function (v) { return v / base * 100; }); }
      out.push({ name: c, ci: ci, xs: xs, ys: ys, rows: rows });
    });
    return { list: out, time: !!x.time, cats: cc.list };
  }
  CH.line = function (F, R, sp) {
    var s = series(F, R, sp), allX = [], allY = [];
    s.list.forEach(function (l) { allX = allX.concat(l.xs); allY = allY.concat(l.ys); });
    var ax = axisFor(allX, s.time, F.L, F.R, false, 8), ay = axisFor(allY, false, F.B, F.Tp, !!sp.zero);
    F.axes(ax, ay, sp.x, sp.index ? sp.y + ' (first value = 100)' : sp.y || 'Rows');
    var many = s.list.reduce(function (a, l) { return a + l.xs.length; }, 0);
    s.list.forEach(function (l) {
      var pts = [], col = F.color(l.ci);
      for (var j = 0; j < l.xs.length; j++) { if (l.ys[j] !== l.ys[j]) continue; pts.push(ax.map(l.xs[j]), ay.map(l.ys[j])); }
      F.line(pts, 2, col);
      if (many <= 400) for (var k = 0; k < l.xs.length; k++) if (l.ys[k] === l.ys[k]) F.dot(ax.map(l.xs[k]), ay.map(l.ys[k]), 2.5, col, { rows: l.rows[k], t: (l.name ? l.name + ' \u00b7 ' : '') + (s.time ? dayText(l.xs[k]) : fmtNum(l.xs[k])) + ': ' + fmtNum(l.ys[k]) });
      if (s.list.length > 1 && pts.length && !F.keyRow) F.text(pts[pts.length - 2] + 6, pts[pts.length - 1] + 4, clip(l.name || '(blank)', 16), 11, col, { align: 'l' });
    });
    if (s.list.length > 1) { F.R -= 0; F.legend(sp.color, s.cats); }
  };
  CH.area = function (F, R, sp) {
    var s = series(F, R, sp), mode = sp.stack || 'stack', xsAll = new Set(); s.list.forEach(function (l) { l.xs.forEach(function (x) { xsAll.add(x); }); });
    var X = Array.from(xsAll).sort(function (a, b) { return a - b; }), K = s.list.length, M = X.length, at = new Map(); X.forEach(function (x, i) { at.set(x, i); });
    var Y = s.list.map(function (l) { var a = new Float64Array(M); for (var j = 0; j < l.xs.length; j++) { var v = l.ys[j]; a[at.get(l.xs[j])] = v === v ? Math.max(0, v) : 0; } return a; });
    var lo = [], hi = [], k, j;
    for (k = 0; k < K; k++) { lo.push(new Float64Array(M)); hi.push(new Float64Array(M)); }
    for (j = 0; j < M; j++) {
      var tot = 0; for (k = 0; k < K; k++) tot += Y[k][j];
      var base = mode === 'stream' ? -tot / 2 : 0;   /* a stream sits around the middle line (the "silhouette" offset) */
      for (k = 0; k < K; k++) { var v2 = mode === 'normalize' ? (tot ? Y[k][j] / tot : 0) : Y[k][j]; if (mode === 'none') { lo[k][j] = 0; hi[k][j] = v2; } else { lo[k][j] = base; base += v2; hi[k][j] = base; } }
    }
    var all = []; for (k = 0; k < K; k++) for (j = 0; j < M; j++) { all.push(lo[k][j], hi[k][j]); }
    var ax = axisFor(X, s.time, F.L, F.R, false, 8), ay = axisFor(all, false, F.B, F.Tp, mode !== 'stream');
    if (mode === 'normalize') ay.fmt = function (p) { return Math.round(p * 100) + '%'; };
    F.axes(ax, mode === 'stream' ? null : ay, sp.x, mode === 'stream' ? '' : sp.y || 'Rows');
    var px = X.map(function (x) { return ax.map(x); });
    for (k = 0; k < K; k++) {
      var col = F.color(s.list[k].ci), top = Array.from(hi[k], function (v) { return ay.map(v); }), bot = Array.from(lo[k], function (v) { return ay.map(v); });
      F.band(px, top, bot, F.alpha(col, mode === 'none' ? 0.35 : 0.85));
      var pts = []; for (j = 0; j < M; j++) pts.push(px[j], top[j]); F.line(pts, 1.2, col);
    }
    for (j = 0; j < M; j++) { var parts = []; for (k = 0; k < K; k++) if (Y[k][j]) parts.push((s.list[k].name || 'value') + ' ' + fmtNum(Y[k][j])); F.S.marks.push({ x0: px[j] - 3, x1: px[j] + 3, y0: F.Tp, y1: F.B, t: (s.time ? dayText(X[j]) : fmtNum(X[j])) + ': ' + parts.join(', ') }); }
    if (K > 1) F.legend(sp.color, s.cats);
  };
  function scatterCore(F, R, sp, join) {
    var x = R.num(sp.x), y = R.num(sp.y), sz = sp.size ? R.num(sp.size) : null, ck = sp.color ? R.cat(sp.color) : null, n = x.length;
    var ax = axisFor(x, !!x.time, F.L, F.R, false), ay = axisFor(y, !!y.time, F.B, F.Tp, false);
    F.axes(ax, ay, sp.x, sp.y);
    var cc = ck ? catsOf(ck, null, 'value', 12) : null, ci = cc ? new Map(cc.list.map(function (c, i) { return [c, i]; })) : null;
    var smax = 0; if (sz) for (var i = 0; i < n; i++) if (sz[i] > smax) smax = sz[i];
    var base = n > 20000 ? 1.6 : n > 2000 ? 2.4 : 3.6, op = n > 20000 ? 0.45 : n > 2000 ? 0.65 : 0.85, pts = [];
    for (i = 0; i < n; i++) {
      if (x[i] !== x[i] || y[i] !== y[i]) continue;
      var r = sz ? 2 + 22 * Math.sqrt(Math.max(0, sz[i]) / (smax || 1)) : base, c = ck ? (cc.other && cc.other.has(ck[i]) ? ci.get('Other') : ci.get(ck[i])) : 0;
      var px = ax.map(x[i]), py = ay.map(y[i]); pts.push(px, py);
      F.dot(px, py, r, F.alpha(F.color(c || 0), sz ? 0.6 : op), n <= 5000 ? { rows: i, t: R.label(i) + ': ' + fmtNum(x[i]) + ', ' + fmtNum(y[i]) } : null, sz ? F.alpha(F.color(c || 0), 1) : null);
    }
    if (join) F.line(pts, 1.4, F.alpha(F.T.line, 0.8));
    if (n > 5000) F.S.plotGrid = { x: x, y: y, ax: ax, ay: ay, label: R.label };   /* big scatters: pointing uses a grid, not one mark a dot */
    if (ck) F.legend(sp.color, cc.list);
    return { ax: ax, ay: ay, x: x, y: y };
  }
  CH.scatter = function (F, R, sp) { scatterCore(F, R, sp, false); };
  CH.connected = function (F, R, sp) { scatterCore(F, R, sp, true); };
  CH.voronoi = function (F, R, sp) {
    var res = scatterCore(F, R, sp, false), pts = [], idx = [];
    for (var i = 0; i < res.x.length && pts.length < 6000; i++) if (res.x[i] === res.x[i] && res.y[i] === res.y[i]) { pts.push(res.ax.map(res.x[i]), res.ay.map(res.y[i])); idx.push(i); }
    var cells = voronoiCells(pts, F.L, F.Tp, F.R, F.B);
    cells.forEach(function (poly) { if (!poly || poly.length < 6) return; for (var q = 0; q < poly.length; q += 2) F.line([poly[q], poly[q + 1], poly[(q + 2) % poly.length], poly[(q + 3) % poly.length]], 0.8, F.alpha(F.T.muted, 0.6)); });
  };
  CH.beeswarm = function (F, R, sp) {
    var x = R.num(sp.x), ck = sp.color ? R.cat(sp.color) : null, cc = ck ? catsOf(ck, null, 'value', 12) : null, ax = axisFor(x, !!x.time, F.L, F.R, false), n = x.length;
    F.axes(ax, null, sp.x, ''); var r = n > 3000 ? 2 : n > 800 ? 3 : 4.5, mid = (F.Tp + F.B) / 2;
    var ord = []; for (var i = 0; i < n; i++) if (x[i] === x[i]) ord.push(i);
    ord.sort(function (a, b) { return x[a] - x[b]; });
    /* each dot goes as near the middle line as it can without touching a dot already placed (only dots within 2r along x can touch) */
    var placed = [], pos = new Float64Array(n), d2 = 4 * r * r, head = 0;
    ord.forEach(function (i) {
      var px = ax.map(x[i]); while (head < placed.length && px - placed[head].x > 2 * r) head++;
      var near = placed.slice(head), best = 0;
      for (var k = 0; k < 400; k++) {
        var y = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * r * 0.5, ok = true;
        for (var q = 0; q < near.length; q++) { var dx = px - near[q].x, dy = y - near[q].y; if (dx * dx + dy * dy < d2 - 1e-6) { ok = false; break; } }
        if (ok) { best = y; break; }
      }
      placed.push({ x: px, y: best }); pos[i] = best;
      var c = ck ? (cc.other && cc.other.has(ck[i]) ? cc.list.length - 1 : cc.list.indexOf(ck[i])) : 0;
      F.dot(px, mid + best, r, F.color(c), n <= 5000 ? { rows: i, t: R.label(i) + ': ' + fmtNum(x[i]) } : null);
    });
    if (ck) F.legend(sp.color, cc.list);
  };
  CH.hist = function (F, R, sp) {
    var x = R.num(sp.x), ck = sp.color ? R.cat(sp.color) : null, cc = ck ? catsOf(ck, null, 'value', 8) : { list: [''], other: null };
    var t = axisFor(x, !!x.time, F.L, F.R, false, Math.min(60, sp.bins || Math.max(8, Math.round(Math.sqrt(x.length))))), lo = t.lo, hi = t.hi, nb = Math.max(1, Math.min(200, sp.bins || Math.ceil(Math.log2(Math.max(2, x.length)) + 1) * 2)), w = (hi - lo) / nb || 1;
    var cnt = cc.list.map(function () { return new Float64Array(nb); }), rows = [];
    for (var b = 0; b < nb; b++) rows.push([]);
    for (var i = 0; i < x.length; i++) { if (x[i] !== x[i]) continue; var k = Math.min(nb - 1, Math.max(0, Math.floor((x[i] - lo) / w))), c = ck ? (cc.other && cc.other.has(ck[i]) ? cc.list.length - 1 : cc.list.indexOf(ck[i])) : 0; cnt[c][k]++; rows[k].push(i); }
    var top = 0; for (b = 0; b < nb; b++) { var s = 0; cnt.forEach(function (a) { s += a[b]; }); top = Math.max(top, s); }
    var ay = axisFor([0, top], false, F.B, F.Tp, true); F.axes(t, ay, sp.x, 'Rows');
    for (b = 0; b < nb; b++) {
      var y0 = 0, xa = t.map(lo + b * w) + 0.5, xb = t.map(lo + (b + 1) * w) - 0.5;
      cnt.forEach(function (a, ci) { if (!a[b]) return; F.rect(xa, ay.map(y0 + a[b]), xb - xa, ay.map(y0) - ay.map(y0 + a[b]), F.color(ci), { rows: rows[b], t: fmtNum(lo + b * w) + ' to ' + fmtNum(lo + (b + 1) * w) + ': ' + a[b] + ' rows' + (ck ? ' (' + cc.list[ci] + ')' : '') }); y0 += a[b]; });
    }
    if (ck) F.legend(sp.color, cc.list);
  };
  CH.box = function (F, R, sp) {
    var xk = sp.x ? R.cat(sp.x) : null, y = R.num(sp.y || sp.x), cats = xk ? catsOf(xk, null, sp.sort || 'name', 40) : { list: [''], other: null }, by = new Map();
    for (var i = 0; i < y.length; i++) { if (y[i] !== y[i]) continue; var c = xk ? (cats.other && cats.other.has(xk[i]) ? 'Other' : xk[i]) : ''; var l = by.get(c); if (!l) { l = []; by.set(c, l); } l.push(y[i]); }
    var all = []; by.forEach(function (l) { for (var q = 0; q < l.length; q++) all.push(l[q]); });
    var band = bandAxis(cats.list, F.L, F.R, 0.4), ay = axisFor(all, false, F.B, F.Tp, false), st = [];
    cats.list.forEach(function (c, ci) {
      var l = by.get(c); if (!l || !l.length) return; l.sort(function (a, b) { return a - b; });
      var q1 = quant(l, 0.25), md = quant(l, 0.5), q3 = quant(l, 0.75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr, wl = l[0], wh = l[l.length - 1];
      for (var k = 0; k < l.length; k++) if (l[k] >= lo) { wl = l[k]; break; } for (k = l.length - 1; k >= 0; k--) if (l[k] <= hi) { wh = l[k]; break; }
      st.push({ c: c, ci: ci, l: l, q1: q1, md: md, q3: q3, lo: lo, hi: hi, wl: wl, wh: wh });
    });
    /* clean look: the median is written over each box (and the middle half's ends beside it when there is room); the number axis stays only when the medians do not fit */
    var gap = band.step - band.bw;
    if (F.clean) F.noY = st.length > 0 && st.every(function (b) { return fmtNum(b.md).length * CW <= band.step - 4; });
    var side = F.noY && st.every(function (b) { return Math.max(fmtNum(b.q1).length, fmtNum(b.q3).length, fmtNum(b.md).length) * CW + 6 <= gap - 2; });
    F.axes(band, ay, sp.x || '', sp.y || sp.x);
    st.forEach(function (b) {
      var c = b.c, l = b.l, x0 = band.map(c), w = band.bw, xm = x0 + w / 2, col = F.clean ? F.color(0) : F.color(b.ci), k;   /* clean look: one calm color, the names already tell the boxes apart */
      F.line([xm, ay.map(b.wl), xm, ay.map(b.q1)], 1.2, F.T.muted); F.line([xm, ay.map(b.q3), xm, ay.map(b.wh)], 1.2, F.T.muted);
      F.line([x0 + w * 0.3, ay.map(b.wl), x0 + w * 0.7, ay.map(b.wl)], 1.2, F.T.muted); F.line([x0 + w * 0.3, ay.map(b.wh), x0 + w * 0.7, ay.map(b.wh)], 1.2, F.T.muted);
      F.rect(x0, ay.map(b.q3), w, ay.map(b.q1) - ay.map(b.q3), F.alpha(col, 0.75), { t: (c || sp.y) + ': median ' + fmtNum(b.md) + ', middle half ' + fmtNum(b.q1) + ' to ' + fmtNum(b.q3) + ', ' + l.length + ' rows' });
      F.line([x0, ay.map(b.md), x0 + w, ay.map(b.md)], 2.4, F.T.fg);
      var outl = 0, top = ay.map(b.wh); for (k = 0; k < l.length && outl < 500; k++) if (l[k] < b.lo || l[k] > b.hi) { F.dot(xm, ay.map(l[k]), 2.2, F.alpha(F.T.muted, 0.8)); outl++; if (l[k] > b.hi) top = Math.min(top, ay.map(l[k]) - 3); }
      if (!F.noY) return;
      if (side) {   /* median beside its line; the middle half's ends beside the box's top and bottom when they do not crowd it */
        var yq3 = ay.map(b.q3), yq1 = ay.map(b.q1), ym = ay.map(b.md), tx = x0 + w + 4;
        F.text(tx, ym + 4, fmtNum(b.md), 11, F.T.fg, { align: 'l', bold: true });
        if (ym - yq3 >= 13) F.text(tx, yq3 + 4, fmtNum(b.q3), 10, F.T.muted, { align: 'l' });
        if (yq1 - ym >= 13) F.text(tx, yq1 + 4, fmtNum(b.q1), 10, F.T.muted, { align: 'l' });
      } else F.text(xm, top - 6, fmtNum(b.md), 11, F.T.fg, { bold: true });
    });
  };
  function densityLines(F, R, sp, ridge) {
    var x = R.num(sp.x), ck = sp.color ? R.cat(sp.color) : null, cc = ck ? catsOf(ck, null, ridge ? 'name' : 'value', ridge ? 30 : 8) : { list: [''], other: null }, by = new Map();
    for (var i = 0; i < x.length; i++) { if (x[i] !== x[i]) continue; var c = ck ? (cc.other && cc.other.has(ck[i]) ? 'Other' : ck[i]) : ''; var l = by.get(c); if (!l) { l = []; by.set(c, l); } l.push(x[i]); }
    var ax = axisFor(x, !!x.time, F.L, F.R, false, 8), m = 160, curves = [], top = 0;
    cc.list.forEach(function (c, ci) { var l = by.get(c); if (!l || l.length < 2) return; var bw = silverman(l), d = kde(l, ax.lo, ax.hi, m, bw); for (var j = 0; j < m; j++) top = Math.max(top, d[j]); curves.push({ c: c, ci: ci, d: d, n: l.length }); });
    var xs = []; for (var j = 0; j < m; j++) xs.push(ax.map(ax.lo + (ax.hi - ax.lo) * j / (m - 1)));
    if (ridge) {
      var rows = curves.length, span = F.B - F.Tp, hgt = Math.min(span * 0.6, span / Math.max(1, rows + 1) * 2.2), step = rows > 1 ? (span - hgt) / (rows - 1) : 0;   /* the tallest peak of the top curve reaches the top edge, the last curve sits on the bottom */
      F.L = Math.max(F.L, 110); ax = axisFor(x, !!x.time, F.L, F.R, false, 8); xs = []; for (j = 0; j < m; j++) xs.push(ax.map(ax.lo + (ax.hi - ax.lo) * j / (m - 1)));
      F.axes(ax, null, sp.x, '', false);
      curves.forEach(function (cv, k) {
        var base = F.Tp + hgt + step * k, tp = Array.from(cv.d, function (v) { return base - v / (top || 1) * hgt; }), bt = xs.map(function () { return base; });
        F.band(xs, tp, bt, F.alpha(F.color(cv.ci), 0.75)); var pts = []; for (var q = 0; q < m; q++) pts.push(xs[q], tp[q]); F.line(pts, 1.2, F.T.fg);
        F.text(F.L - 8, base, clip(cv.c || '(blank)', 16), 11, F.T.fg, { align: 'r' });
      });
      return;
    }
    var ay = axisFor([0, top], false, F.B, F.Tp, true); ay.fmt = function () { return ''; }; F.axes(ax, null, sp.x, 'Density');
    curves.forEach(function (cv) { var tp = Array.from(cv.d, function (v) { return ay.map(v); }), bt = xs.map(function () { return F.B; }); F.band(xs, tp, bt, F.alpha(F.color(cv.ci), 0.25)); var pts = []; for (var q = 0; q < m; q++) pts.push(xs[q], tp[q]); F.line(pts, 2, F.color(cv.ci)); });
    if (ck) F.legend(sp.color, cc.list);
  }
  CH.density = function (F, R, sp) { densityLines(F, R, sp, false); };
  CH.ridgeline = function (F, R, sp) { densityLines(F, R, sp, true); };
  CH.hexbin = function (F, R, sp) {
    var x = R.num(sp.x), y = R.num(sp.y), ax = axisFor(x, !!x.time, F.L, F.R, false), ay = axisFor(y, !!y.time, F.B, F.Tp, false); F.axes(ax, ay, sp.x, sp.y);
    var r = sp.radius || 10, dx = r * Math.sqrt(3), dy = r * 1.5, bins = new Map(), mx = 0;
    for (var i = 0; i < x.length; i++) {
      if (x[i] !== x[i] || y[i] !== y[i]) continue;
      var px = ax.map(x[i]) - F.L, py = ay.map(y[i]) - F.Tp, pj = Math.round(py / dy), pi = Math.round(px / dx - (pj & 1) / 2), py1 = py / dy - pj;
      if (Math.abs(py1) * 3 > 1) {   /* near a row border: the nearer of the two candidate centers */
        var px1 = px / dx - pi - (pj & 1) / 2, pi2 = pi + (px1 < 0 ? -1 : 1) / 2, pj2 = pj + (py1 < 0 ? -1 : 1), px2 = px / dx - pi2 - (pj2 & 1) / 2, py2 = py / dy - pj2;
        if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) { pi = pi2 + ((pj & 1) ? 1 : -1) / 2; pj = pj2; }
      }
      pi = Math.round(pi);
      var key = pi * 4194304 + pj, b = bins.get(key);   /* one number per cell (pj stays far inside +-2^21) */ if (!b) { b = { i: pi, j: pj, n: 0 }; bins.set(key, b); } b.n++; if (b.n > mx) mx = b.n;
    }
    var ramp = function (t) { return F.NS.rampAt ? F.NS.rampAt('warm', t) : F.color(0); };
    bins.forEach(function (b) {
      var cx = F.L + (b.i + (b.j & 1) / 2) * dx, cy = F.Tp + b.j * dy, p = [];
      for (var k = 0; k < 6; k++) { var an = Math.PI / 6 + k * Math.PI / 3; p.push(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
      F.poly(p, ramp(Math.sqrt(b.n / mx)), null, { t: b.n + ' rows' });
    });
    F.S.legend.push({ k: 'ramp', ramp: 'warm', a: ramp(0), b: ramp(1), lo: '1', hi: fmtNum(mx), t: 'Rows in a hexagon' });
  };
  CH.heat = function (F, R, sp) {
    var v = sp.y ? R.num(sp.y) : null, how = sp.y ? (sp.agg || 'sum') : 'count', xr = R.num(sp.x), ramp = function (t) { return F.NS.rampAt('warm', t); };
    if (xr.time && !sp.color) {   /* a calendar: weeks across, days of the week down, one block per year */
      var byDay = new Map(), lo = Infinity, hi = -Infinity, D = 864e5;
      for (var i = 0; i < xr.length; i++) { if (xr[i] !== xr[i]) continue; var d = Math.floor(xr[i] / D); var l = byDay.get(d); if (!l) { l = []; byDay.set(d, l); } l.push(v ? v[i] : 1); if (d < lo) lo = d; if (d > hi) hi = d; }
      var vals = new Map(), mx = -Infinity, mn = Infinity; byDay.forEach(function (l, d) { var a = aggregate(l, how); vals.set(d, a); if (a > mx) mx = a; if (a < mn) mn = a; });
      var y0 = new Date(lo * D).getUTCFullYear(), y1 = new Date(hi * D).getUTCFullYear(), cs = Math.max(6, Math.min(16, (F.R - F.L - 30) / 54)), row = cs * 8.5;
      for (var yr = y0; yr <= y1 && yr < y0 + 12; yr++) {
        var top = F.Tp + (yr - y0) * row, jan1 = Date.UTC(yr, 0, 1) / D, off = new Date(jan1 * D).getUTCDay();
        F.text(F.L - 10, top + cs * 3.5, String(yr), 12, F.T.fg, { align: 'r', bold: true });
        for (var dd = jan1; dd < Date.UTC(yr + 1, 0, 1) / D; dd++) {
          var wk = Math.floor((dd - jan1 + off) / 7), wd = new Date(dd * D).getUTCDay(), a = vals.get(dd);
          F.rect(F.L + wk * cs, top + wd * cs, cs - 1, cs - 1, a === undefined ? F.alpha(F.T.boxLine, 0.25) : ramp(mx > mn ? (a - mn) / (mx - mn) : 1), a === undefined ? null : { t: dayText(dd * D) + ' ' + yr + ': ' + fmtNum(a) });
        }
      }
      F.S.legend.push({ k: 'ramp', ramp: 'warm', a: ramp(0), b: ramp(1), lo: fmtNum(mn), hi: fmtNum(mx), t: sp.y || 'Rows' });
      return;
    }
    var xk = R.cat(sp.x), yk = R.cat(sp.color || sp.x), xc = catsOf(xk, null, 'name', 60), yc = catsOf(yk, null, 'name', 40), cell = cross(xk, yk, v, how, xc, yc), mn2 = Infinity, mx2 = -Infinity;
    cell.forEach(function (e) { if (e.v === e.v) { mn2 = Math.min(mn2, e.v); mx2 = Math.max(mx2, e.v); } });
    F.L = Math.min(200, 20 + 7 * Math.min(24, Math.max.apply(null, yc.list.map(function (s) { return String(s).length; }).concat([4]))));
    var bx = bandAxis(xc.list, F.L, F.R, 0.06), by = bandAxis(yc.list, F.Tp, F.B, 0.06); F.axes(bx, null, sp.x, '', false);
    yc.list.forEach(function (yv) { F.text(F.L - 8, by.map(yv) + by.bw / 2 + 4, clip(yv || '(blank)', 24), 11, F.T.fg, { align: 'r' }); xc.list.forEach(function (xv) { var e = cell.get(xv + '\u0000' + yv); if (!e || e.v !== e.v) return; F.rect(bx.map(xv), by.map(yv), bx.bw, by.bw, ramp(mx2 > mn2 ? (e.v - mn2) / (mx2 - mn2) : 1), { rows: e.rows, t: xv + ' \u00b7 ' + yv + ': ' + fmtNum(e.v) }); }); });
    F.S.legend.push({ k: 'ramp', ramp: 'warm', a: ramp(0), b: ramp(1), lo: fmtNum(mn2), hi: fmtNum(mx2), t: sp.y || 'Rows' });
  };
  function donutCore(F, R, sp, hole) {
    var xk = R.cat(sp.x), v = sp.y ? R.num(sp.y) : null, how = sp.y ? (sp.agg || 'sum') : 'count', xc = catsOf(xk, v, 'value', 12), cell = cross(xk, null, v, how, xc, { other: null }), tot = 0, parts = [];
    xc.list.forEach(function (x) { var e = cell.get(x + '\u0000'); if (e && e.v > 0) { parts.push({ x: x, v: e.v, rows: e.rows }); tot += e.v; } });
    var cx = (F.W) / 2, cy = (F.Tp + F.B) / 2 + 10, r1 = Math.min(F.W, F.B - F.Tp) / 2 - 30, r0 = hole ? r1 * 0.58 : 0, a = -Math.PI / 2, pad = parts.length > 1 ? 0.006 : 0;
    parts.forEach(function (p, i) {
      var span = p.v / tot * TAU; F.wedge(cx, cy, r0, r1, a + pad / 2, a + span - pad / 2, F.color(i), { rows: p.rows, t: (p.x || '(blank)') + ': ' + fmtNum(p.v) + ' (' + (p.v / tot * 100).toFixed(1) + '%)' });
      var m = a + span / 2, lr = r1 + 14, right = Math.cos(m) >= 0;
      if (span > 0.08) F.text(cx + Math.cos(m) * lr, cy + Math.sin(m) * lr + 4, clip(p.x || '(blank)', 18) + ' ' + Math.round(p.v / tot * 100) + '%', 11, F.T.fg, { align: right ? 'l' : 'r' });
      a += span;
    });
    if (hole) { F.text(cx, cy + 2, fmtNum(tot), 22, F.T.fg, { bold: true }); F.text(cx, cy + 22, sp.y ? (how === 'sum' ? 'total ' : how + ' ') + sp.y : 'rows', 11, F.T.muted); }
    F.legend(sp.x, parts.map(function (p) { return p.x; }));
  }
  CH.donut = function (F, R, sp) { donutCore(F, R, sp, true); };
  CH.radialbar = function (F, R, sp) {
    var xk = R.cat(sp.x), v = sp.y ? R.num(sp.y) : null, how = sp.y ? (sp.agg || 'sum') : 'count', ck = sp.color ? R.cat(sp.color) : null;
    var xc = catsOf(xk, v, sp.sort || 'none', 60), cc = ck ? catsOf(ck, v, 'value', 10) : { list: [''], other: null }, cell = cross(xk, ck, v, how, xc, cc), top = 0;
    xc.list.forEach(function (x) { var s = 0; cc.list.forEach(function (c) { var e = cell.get(x + '\u0000' + c); if (e && e.v > 0) s += e.v; }); top = Math.max(top, s); });
    var cx = F.W / 2, cy = (F.Tp + F.B) / 2 + 8, R1 = Math.min(F.W, F.B - F.Tp) / 2 - 40, R0 = R1 * 0.3, n = xc.list.length, step = TAU / Math.max(1, n), rs = function (t) { return Math.sqrt(R0 * R0 + (R1 * R1 - R0 * R0) * t / (top || 1)); };
    xc.list.forEach(function (x, i) {
      var a0 = -Math.PI / 2 + i * step + step * 0.08, a1 = a0 + step * 0.84, acc = 0;
      cc.list.forEach(function (c, ci) { var e = cell.get(x + '\u0000' + c); if (!e || !(e.v > 0)) return; F.wedge(cx, cy, rs(acc), rs(acc + e.v), a0, a1, F.color(ci), { rows: e.rows, t: x + (ck ? ' \u00b7 ' + c : '') + ': ' + fmtNum(e.v) }); acc += e.v; });
      var m = (a0 + a1) / 2, right = Math.cos(m) >= 0; F.text(cx + Math.cos(m) * (R1 + 8), cy + Math.sin(m) * (R1 + 8), clip(x || '(blank)', 14), 10, F.T.muted, { align: right ? 'l' : 'r', rot: right ? m : m + Math.PI });
    });
    if (ck) F.legend(sp.color, cc.list);
  };
  CH.parallel = function (F, R, sp) {
    var cols = (sp.cols || []).slice(0, 12); if (cols.length < 2) { F.text(F.W / 2, F.H / 2, 'Pick two or more number columns.', 14, F.T.muted); return; }
    var data = cols.map(function (k) { return R.num(k); }), axes = cols.map(function (k, j) { return axisFor(data[j], !!data[j].time, F.B, F.Tp, false, 5); }), step = (F.R - F.L) / (cols.length - 1);
    var ck = sp.color ? R.cat(sp.color) : null, cc = ck ? catsOf(ck, null, 'value', 10) : null, n = R.n, op = n > 5000 ? 0.08 : n > 500 ? 0.25 : 0.6;
    for (var i = 0; i < n && i < 50000; i++) {
      var pts = []; for (var j = 0; j < cols.length; j++) { var v = data[j][i]; if (v !== v) { pts = null; break; } pts.push(F.L + j * step, axes[j].map(v)); }
      if (pts) F.line(pts, 1, F.alpha(F.color(ck ? Math.max(0, cc.list.indexOf(cc.other && cc.other.has(ck[i]) ? 'Other' : ck[i])) : 0), op));
    }
    cols.forEach(function (k, j) { var x = F.L + j * step; F.line([x, F.Tp, x, F.B], 1.2, F.T.fg); axes[j].list.forEach(function (t) { F.text(x - 5, axes[j].map(t) + 4, axes[j].fmt ? axes[j].fmt(t) : fmtNum(t), 10, F.T.muted, { align: 'r' }); }); F.text(x, F.B + 18, clip(k, 18), 12, F.T.fg, { bold: true }); });
    if (ck) F.legend(sp.color, cc.list);
  };
  CH.splom = function (F, R, sp) {
    var cols = (sp.cols || []).slice(0, 6); if (cols.length < 2) { F.text(F.W / 2, F.H / 2, 'Pick two or more number columns.', 14, F.T.muted); return; }
    var k = cols.length, size = Math.min((F.R - F.L) / k, (F.B - F.Tp) / k), data = cols.map(function (c) { return R.num(c); }), ck = sp.color ? R.cat(sp.color) : null, cc = ck ? catsOf(ck, null, 'value', 10) : null;
    var n = R.n, r = n > 5000 ? 1 : n > 500 ? 1.6 : 2.4;
    for (var a = 0; a < k; a++) for (var b = 0; b < k; b++) {
      var x0 = F.L + b * size, y0 = F.Tp + a * size, pad = 6, ax = axisFor(data[b], false, x0 + pad, x0 + size - pad, false, 3), ay = axisFor(data[a], false, y0 + size - pad, y0 + pad, false, 3);
      F.rect(x0 + 1, y0 + 1, size - 2, size - 2, F.alpha(F.T.box, 0.6));
      if (a === b) { F.text(x0 + size / 2, y0 + size / 2 + 4, clip(cols[a], 16), 12, F.T.fg, { bold: true }); continue; }
      for (var i = 0; i < n && i < 20000; i++) { var vx = data[b][i], vy = data[a][i]; if (vx !== vx || vy !== vy) continue; F.dot(ax.map(vx), ay.map(vy), r, F.alpha(F.color(ck ? Math.max(0, cc.list.indexOf(ck[i])) : 0), 0.7)); }
    }
    if (ck) F.legend(sp.color, cc.list);
  };
  CH.qq = function (F, R, sp) {
    var y = R.num(sp.x || sp.y), a = []; for (var i = 0; i < y.length; i++) if (y[i] === y[i]) a.push(y[i]); a.sort(function (p, q) { return p - q; });
    var n = a.length, xs = new Float64Array(n); for (i = 0; i < n; i++) xs[i] = normInv((i + 0.5) / n);
    var ax = axisFor(xs, false, F.L, F.R, false), ay = axisFor(a, false, F.B, F.Tp, false); F.axes(ax, ay, 'Normal quantiles', sp.x || sp.y);
    if (n < 2) { F.text(F.W / 2, F.H / 2, 'Needs two or more numbers.', 13, F.T.muted); return; }
    var q1 = quant(a, 0.25), q3 = quant(a, 0.75), z1 = normInv(0.25), z3 = normInv(0.75), sl = (q3 - q1) / (z3 - z1), ic = q1 - sl * z1;
    var qa = ax.lo, qb = ax.hi; if (sl > 0) { qa = Math.max(qa, (ay.lo - ic) / sl); qb = Math.min(qb, (ay.hi - ic) / sl); } else if (sl < 0) { qa = Math.max(qa, (ay.hi - ic) / sl); qb = Math.min(qb, (ay.lo - ic) / sl); }   /* the reference line stays inside the plot */
    if (qb > qa) F.line([ax.map(qa), ay.map(ic + sl * qa), ax.map(qb), ay.map(ic + sl * qb)], 1.5, F.T.bad);
    for (i = 0; i < n; i++) F.dot(ax.map(xs[i]), ay.map(a[i]), n > 3000 ? 1.5 : 2.6, F.alpha(F.color(0), 0.8));
  };
  CH.slope = function (F, R, sp) {
    var xk = R.cat(sp.x), v = sp.y ? R.num(sp.y) : null, how = sp.y ? (sp.agg || 'sum') : 'count', ck = R.cat(sp.color || sp.x);
    var xc = catsOf(xk, null, 'name', 0); if (xc.list.length < 2) { F.text(F.W / 2, F.H / 2, 'The x column needs two or more values.', 14, F.T.muted); return; }
    var A = xc.list[0], B = xc.list[xc.list.length - 1], cc = catsOf(ck, v, 'value', 20), cell = cross(xk, ck, v, how, { list: xc.list, other: null }, cc), all = [];
    cc.list.forEach(function (c) { [A, B].forEach(function (x) { var e = cell.get(x + '\u0000' + c); if (e) all.push(e.v); }); });
    F.L = 200; F.R = F.W - 200; var ay = axisFor(all, false, F.B, F.Tp, false);
    F.line([F.L, F.Tp, F.L, F.B], 1.2, F.T.muted); F.line([F.R, F.Tp, F.R, F.B], 1.2, F.T.muted); F.text(F.L, F.B + 18, A, 12, F.T.fg, { bold: true }); F.text(F.R, F.B + 18, B, 12, F.T.fg, { bold: true });
    cc.list.forEach(function (c, ci) {
      var a = cell.get(A + '\u0000' + c), b = cell.get(B + '\u0000' + c); if (!a || !b) return;
      var col = b.v >= a.v ? F.color(0) : F.T.bad; F.line([F.L, ay.map(a.v), F.R, ay.map(b.v)], 2, col);
      F.dot(F.L, ay.map(a.v), 3.5, col, { rows: a.rows, t: c + ' ' + A + ': ' + fmtNum(a.v) }); F.dot(F.R, ay.map(b.v), 3.5, col, { rows: b.rows, t: c + ' ' + B + ': ' + fmtNum(b.v) });
      F.text(F.L - 8, ay.map(a.v) + 4, clip(c, 20) + ' ' + fmtNum(a.v), 11, F.T.fg, { align: 'r' }); F.text(F.R + 8, ay.map(b.v) + 4, fmtNum(b.v) + ' ' + clip(c, 20), 11, F.T.fg, { align: 'l' });
    });
  };
  CH.marimekko = function (F, R, sp) {
    var xk = R.cat(sp.x), ck = R.cat(sp.color || sp.x), v = sp.y ? R.num(sp.y) : null, how = sp.y ? 'sum' : 'count';
    var xc = catsOf(xk, v, 'value', 20), cc = catsOf(ck, v, 'value', 10), cell = cross(xk, ck, v, how, xc, cc), tot = 0, colT = new Map();
    xc.list.forEach(function (x) { var s = 0; cc.list.forEach(function (c) { var e = cell.get(x + '\u0000' + c); if (e && e.v > 0) s += e.v; }); colT.set(x, s); tot += s; });
    var at = F.L, W = F.R - F.L, Hh = F.B - F.Tp;
    xc.list.forEach(function (x) {
      var w = colT.get(x) / (tot || 1) * W, y = F.B;
      cc.list.forEach(function (c, ci) { var e = cell.get(x + '\u0000' + c); if (!e || !(e.v > 0)) return; var h = e.v / colT.get(x) * Hh; F.rect(at + 0.5, y - h + 0.5, w - 1, h - 1, F.color(ci), { rows: e.rows, t: x + ' \u00b7 ' + c + ': ' + fmtNum(e.v) + ' (' + Math.round(e.v / colT.get(x) * 100) + '% of ' + x + ')' }); y -= h; });
      if (w > 30) F.text(at + w / 2, F.B + 16, clip(x || '(blank)', Math.floor(w / 7)), 11, F.T.fg);
      at += w;
    });
    F.legend(sp.color || sp.x, cc.list);
  };
  CH.words = function (F, R, sp) {
    var raw = R.raw(sp.x), counts = new Map();
    var STOP = { the: 1, and: 1, of: 1, to: 1, a: 1, in: 1, is: 1, it: 1, for: 1, on: 1, that: 1, with: 1, as: 1, was: 1, at: 1, by: 1, an: 1, be: 1, this: 1, are: 1, or: 1, from: 1, but: 1, not: 1, you: 1, your: 1, i: 1 };
    for (var i = 0; i < raw.length; i++) { var s = raw[i]; if (s === undefined || s === null) continue; String(s).toLowerCase().split(/[^a-z0-9\u00c0-\u00ff']+/).forEach(function (w) { if (w.length < 2 || STOP[w]) return; counts.set(w, (counts.get(w) || 0) + 1); }); }
    var list = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 180); if (!list.length) return;
    var top = list[0][1], cx = F.W / 2, cy = (F.Tp + F.B) / 2, placed = [];
    /* each word on an outward spiral until its box touches no word placed before (a grid of boxes keeps the test short) */
    list.forEach(function (wc, k) {
      var size = 11 + 37 * Math.sqrt(wc[1] / top), w = wc[0].length * size * 0.56, h = size * 1.05;
      for (var t = 0; t < 2400; t++) {
        var an = t * 0.35, rr = 2.2 * an, x = cx + Math.cos(an) * rr * 1.5 - w / 2, y = cy + Math.sin(an) * rr - h / 2, hit = false;
        if (x < 4 || x + w > F.W - 4 || y < 4 || y + h > F.H - 4) continue;
        for (var q = 0; q < placed.length; q++) { var p = placed[q]; if (x < p[0] + p[2] && p[0] < x + w && y < p[1] + p[3] && p[1] < y + h) { hit = true; break; } }
        if (hit) continue;
        placed.push([x, y, w, h]); F.text(x + w / 2, y + h * 0.8, wc[0], size, F.color(k), { bold: k < 12 }); F.S.marks.push({ x0: x, y0: y, x1: x + w, y1: y + h, t: wc[0] + ': ' + wc[1] }); break;
      }
    });
  };

  /** Voronoi cells of points clipped to a box: each cell is the box cut by the half-planes of its nearer neighbors (found on a grid). */
  function voronoiCells(pts, x0, y0, x1, y1) {
    var n = pts.length / 2, cells = new Array(n), cs = Math.max(8, Math.sqrt((x1 - x0) * (y1 - y0) / Math.max(1, n)) * 1.5), cols = Math.ceil((x1 - x0) / cs) + 1, rows = Math.ceil((y1 - y0) / cs) + 1, grid = new Array(cols * rows), i;
    for (i = 0; i < n; i++) { var c = Math.min(cols - 1, Math.max(0, Math.floor((pts[i * 2] - x0) / cs))), r = Math.min(rows - 1, Math.max(0, Math.floor((pts[i * 2 + 1] - y0) / cs))), k = r * cols + c; (grid[k] || (grid[k] = [])).push(i); }
    for (i = 0; i < n; i++) {
      var px = pts[i * 2], py = pts[i * 2 + 1], poly = [x0, y0, x1, y0, x1, y1, x0, y1], ci = Math.floor((px - x0) / cs), ri = Math.floor((py - y0) / cs);
      for (var ring = 0; ring < Math.max(cols, rows); ring++) {
        var far2 = 0; for (var q = 0; q < poly.length; q += 2) { var dx = poly[q] - px, dy = poly[q + 1] - py; far2 = Math.max(far2, dx * dx + dy * dy); }
        if (ring > 1 && (ring - 1) * cs > 2 * Math.sqrt(far2)) break;   /* no point farther out can cut the cell any more */
        for (var rr = ri - ring; rr <= ri + ring; rr++) for (var cc = ci - ring; cc <= ci + ring; cc++) {
          if (Math.max(Math.abs(rr - ri), Math.abs(cc - ci)) !== ring || rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          var l = grid[rr * cols + cc]; if (!l) continue;
          for (var j = 0; j < l.length; j++) { var o = l[j]; if (o === i) continue; poly = clipHalf(poly, px, py, pts[o * 2], pts[o * 2 + 1]); if (poly.length < 6) break; }
        }
      }
      cells[i] = poly;
    }
    return cells;
  }
  /** Keeps the part of a polygon nearer to (ax, ay) than to (bx, by). */
  function clipHalf(poly, ax, ay, bx, by) {
    var mx = (ax + bx) / 2, my = (ay + by) / 2, nx = bx - ax, ny = by - ay, out = [], n = poly.length / 2;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, px = poly[i * 2], py = poly[i * 2 + 1], qx = poly[j * 2], qy = poly[j * 2 + 1], sp = (px - mx) * nx + (py - my) * ny, sq = (qx - mx) * nx + (qy - my) * ny;
      if (sp <= 0) out.push(px, py);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) { var t = sp / (sp - sq); out.push(px + (qx - px) * t, py + (qy - py) * t); }
    }
    return out;
  }

  /** What a chart needs: which settings mean something for each type. */
  var NEEDS = {
    bar: { x: 'cat', y: 'num?', color: 'cat?', agg: 1, stack: 1, horizontal: 1, sort: 1 }, dotplot: { x: 'cat', y: 'num?', color: 'cat?', agg: 1, sort: 1 },
    line: { x: 'num', y: 'num?', color: 'cat?', agg: 1, smooth: 1, index: 1 }, area: { x: 'num', y: 'num?', color: 'cat?', agg: 1, stack: 1, smooth: 1 },
    scatter: { x: 'num', y: 'num', color: 'cat?', size: 'num?' }, connected: { x: 'num', y: 'num', color: 'cat?' }, voronoi: { x: 'num', y: 'num', color: 'cat?' },
    beeswarm: { x: 'num', color: 'cat?' }, hist: { x: 'num', color: 'cat?', bins: 1 }, box: { x: 'cat?', y: 'num' }, density: { x: 'num', color: 'cat?' }, ridgeline: { x: 'num', color: 'cat' },
    hexbin: { x: 'num', y: 'num' }, heat: { x: 'any', color: 'cat?', y: 'num?', agg: 1 }, donut: { x: 'cat', y: 'num?', agg: 1 }, radialbar: { x: 'cat', y: 'num?', color: 'cat?', agg: 1 },
    parallel: { cols: 'num+', color: 'cat?' }, splom: { cols: 'num+', color: 'cat?' }, qq: { x: 'num' }, slope: { x: 'cat', color: 'cat', y: 'num?', agg: 1 }, marimekko: { x: 'cat', color: 'cat', y: 'num?' }, words: { x: 'text' }
  };
  var NOKEYROW = { donut: 1, heat: 1, slope: 1, ridgeline: 1, splom: 1 };   /* these name their parts on the picture */
  function make(rows, spec, o, NS) {
    o = o || {}; spec = spec || {};
    var F = frame(spec, o, NS), R = reader(rows, o), type = CH[spec.type] ? spec.type : 'bar', t0 = Date.now();
    var hl = o.highlight !== undefined && o.highlight !== null && o.highlight !== '' ? String(o.highlight) : undefined;
    HI = hl !== undefined && rows.length ? { name: hl, F: F, ck: spec.color ? R.cat(spec.color) : null, xk: spec.x ? R.cat(spec.x) : null } : null;
    try {
      if (!rows.length) F.text(F.W / 2, F.H / 2, 'No rows to draw.', 14, F.T.muted);
      else { if (spec.color && !NOKEYROW[type]) { F.keyRow = true; F.Tp = 44; } if (type === 'bar' || type === 'box') F.calm(); CH[type](F, R, spec); }   /* the clean look's calm colors go with its value labels (bars and boxes) */
    } finally { HI = null; }
    if (F.yName) {   /* the small axis name is left out when a value written on a mark would touch it */
      var yl = F.yName, x1 = yl.x + yl.t.length * CW + 4;
      if (F.S.labels.some(function (l) { if (l === yl) return false; var w = l.t.length * CW, lx = l.align === 'l' ? l.x : l.align === 'r' ? l.x - w : l.x - w / 2; return lx < x1 && lx + w > yl.x - 4 && l.y - l.size < yl.y + 4 && l.y + 3 > yl.y - yl.size; })) F.S.labels.splice(F.S.labels.indexOf(yl), 1);
    }
    if (F.hiCi >= 0) lift(F.S, F.color(F.hiCi));   /* the highlighted series is drawn last, over the gray ones */
    var S = F.S;
    S.x0 = -10; S.y0 = -10; S.w = F.W + 20; S.h = F.H + 20; S.gridStale = true; S.eidx = null;
    S.ms = Date.now() - t0;
    if (NS.addTitles) NS.addTitles(S, o);   /* opt-in o.title, o.subtitle, o.source */
    return S;
  }
  /** NetflowScene from the page (or, in Node, from the folder next door), with a plain error when it is missing. */
  function sceneLib(who) {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : {};
    if (g.NetflowScene) return g.NetflowScene;
    if (typeof require === 'function') { try { return require('../netflow-scene/netflow-scene.js'); } catch (e) { /* not there */ } }
    throw new Error(who + ': NetflowScene was not found. Load netflow-scene.js before ' + who + '.js.');
  }
  var SPEC_KEYS = ['type', 'x', 'y', 'color', 'size', 'agg', 'stack', 'horizontal', 'bins', 'smooth', 'index', 'cols', 'sort'];
  /**
   * One call to a picture: toSvg(rows, options) returns SVG text. options holds the chart words (type, x, y, color, ...) and the drawing words
   * (theme, width, height, title, subtitle, source, highlight) together. With no type, x or y: a bar chart of the first text column by the first number column.
   */
  function toSvg(rows, o) {
    o = o || {}; rows = rows || [];
    var spec = {}; SPEC_KEYS.forEach(function (k) { if (o[k] !== undefined) spec[k] = o[k]; });
    if (!spec.x || (!spec.y && !spec.type)) {
      var first = rows[0] ? (rows[0].attrs || rows[0]) : {}, keys = Object.keys(first), txt = null, numk = null;
      keys.forEach(function (k) { var v = first[k]; if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && isFinite(+v))) { if (numk === null && k !== spec.x) numk = k; } else if (txt === null && typeof v === 'string') txt = k; });
      if (!spec.x) spec.x = txt || numk; if (!spec.y && numk !== spec.x) spec.y = numk;
    }
    if (!spec.type) spec.type = 'bar';
    var NS = sceneLib('netflow-plot');
    return NS.toSvg(make(rows, spec, o, NS), o.title);
  }
  /** The mark under a point (in drawing units), or null. */
  function markAt(S, x, y) {
    for (var i = S.marks.length - 1; i >= 0; i--) {
      var m = S.marks[i]; if (x < m.x0 || x > m.x1 || y < m.y0 || y > m.y1) continue;
      if (m.wedge) { var w = m.wedge, dx = x - w[0], dy = y - w[1], r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); while (a < w[4]) a += TAU; if (r < w[2] || r > w[3] || a > w[5]) continue; }
      if (m.cx !== undefined && Math.hypot(x - m.cx, y - m.cy) > (m.x1 - m.x0) / 2 + 3) continue;
      return m;
    }
    if (S.plotGrid) {   /* a big scatter: the nearest dot within 8 units */
      var G = S.plotGrid, best = -1, bd = 64; for (var k = 0; k < G.x.length; k++) { var px = G.ax.map(G.x[k]) - x, py = G.ay.map(G.y[k]) - y, d = px * px + py * py; if (d < bd) { bd = d; best = k; } }
      if (best >= 0) return { rows: best, t: G.label(best) + ': ' + fmtNum(G.x[best]) + ', ' + fmtNum(G.y[best]) };
    }
    return null;
  }

  return { TYPES: TYPES, NEEDS: NEEDS, AGG: AGG, make: make, toSvg: toSvg, markAt: markAt, ticks: ticks, timeTicks: timeTicks, kde: kde, normInv: normInv, voronoiCells: voronoiCells, quant: quant, fmtNum: fmtNum };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetflowPlot;
