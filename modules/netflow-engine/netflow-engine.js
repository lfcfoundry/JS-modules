/*!
 * netflow-engine.js: the engine of Netflow Map as a module you can adapt: reads links, lays the map out (layered rows, arcs, matrix, shapes, force, distances), and scores it. No page, no DOM; runs on the main thread or in a worker.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var L = NetflowEngine.build({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] }, { view: 'network', colorBy: 'group' });   // L.nodes, L.edges: positions and sizes, ready to draw
 *   NetflowEngine.use('layers', NetflowLayers);      // optional: hand over the add-ons (they are also found on their own)
 *   NetflowEngine.use('sankey', NetflowSankey);
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(function (n) { return require(n); });
  else root.NetflowEngine = factory(null);
}(typeof self !== 'undefined' ? self : this, function (REQ) {
  'use strict';
  var VERSION = '1.0.0';
  var NFMColumns = (function () {
    'use strict';

    /* ---------------------------------------------------------------- reading numbers and dates */
    var NUM_PLAIN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i, SPACE_GROUPED = /^[+-]?\d{1,3}([   ]\d{3})+([.,]\d+)?$/;
    /**
     * A number as people write it: 1234.5  1,234.5  1.234,5  1 234,5  12,5  $12  (300)  12%  -4. Anything else gives NaN (0x10 and 0b11 are not numbers).
     * A comma or dot alone is a decimal mark unless it is exactly a thousands group (1,234); then `dec` (',' or '.', default '.') decides.
     * The importers read the weight column with the same rules (NFMImport has its own copy; test/import-fixes.test.js checks they agree).
     */
    function num(v, dec) {
      if (typeof v === 'number') return isFinite(v) ? v : NaN;
      if (v === undefined || v === null || typeof v === 'boolean') return NaN;
      var s = String(v).trim();
      if (!s || s.length > 40) return NaN;
      var neg = false; dec = dec || '.';
      if (s.charAt(0) === '(' && s.charAt(s.length - 1) === ')') { neg = true; s = s.slice(1, -1).trim(); }
      s = s.replace(/[$€£¥]/g, '').replace(/\s*%$/, '').trim();
      if (SPACE_GROUPED.test(s)) s = s.replace(/[   ]/g, '');
      if (s.indexOf(',') >= 0 || s.indexOf('.') >= 0) {
        var sign = '';
        if (s.charAt(0) === '+' || s.charAt(0) === '-') { sign = s.charAt(0); s = s.slice(1); }
        var mm = /^([\d.,]+)([eE][+-]?\d+)?$/.exec(s);
        if (!mm) return NaN;
        var body = mm[1], lc = body.lastIndexOf(','), ld = body.lastIndexOf('.'), dm;
        if (lc >= 0 && ld >= 0) dm = lc > ld ? ',' : '.';
        else {
          var ch = lc >= 0 ? ',' : '.', at = body.indexOf(ch), many = body.indexOf(ch, at + 1) >= 0;
          if (many) dm = '';
          else if (body.length - at - 1 === 3 && at >= 1 && at <= 3 && body.charAt(0) !== '0') dm = dec === ch ? ch : '';
          else dm = ch;
        }
        var thou = dm === ',' ? '.' : dm === '.' ? ',' : (lc >= 0 ? ',' : '.');
        var ip = body, fp = '';
        if (dm) { var cut = body.lastIndexOf(dm); ip = body.slice(0, cut); fp = body.slice(cut + 1); if (fp.indexOf(thou) >= 0 || fp.indexOf(dm) >= 0) return NaN; }
        if (ip !== '' && ip.indexOf(thou) >= 0) { if (!(thou === ',' ? /^\d{1,3}(,\d{3})+$/ : /^\d{1,3}(\.\d{3})+$/).test(ip)) return NaN; ip = ip.split(thou).join(''); }
        else if (ip.indexOf(dm === '' ? thou : dm) >= 0) return NaN;
        s = sign + ip + (dm ? '.' + fp : '') + (mm[2] || '');
      }
      if (!NUM_PLAIN.test(s)) return NaN;
      var x = parseFloat(s);
      return isFinite(x) ? (neg ? -x : x) : NaN;
    }
    var DATE_RE = /^\d{4}-\d{1,2}(-\d{1,2})?([ T]\d{1,2}:\d{2}(:\d{2})?)?(Z|[+-]\d{2}:?\d{2})?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    function dateMs(v) {
      if (typeof v !== 'string') return NaN;
      var s = v.trim();
      if (!DATE_RE.test(s)) return NaN;
      var t = Date.parse(/^\d{4}-\d{1,2}$/.test(s) ? s + '-01' : s);
      return isFinite(t) ? t : NaN;
    }
    function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function isEmpty(v) { return v === undefined || v === null || v === ''; }

    /* ---------------------------------------------------------------- number formats */
    function fmt(v) {
      if (v === undefined || v === null || !isFinite(v)) return '';
      var a = Math.abs(v), s;
      if (a >= 1e9) s = (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
      else if (a >= 1e6) s = (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      else if (a >= 1e4) s = (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
      else if (a >= 1000) s = Math.round(v).toLocaleString('en-US');
      else if (a >= 100) s = String(Math.round(v * 10) / 10);
      else if (a >= 1) s = String(Math.round(v * 100) / 100);
      else if (a === 0) s = '0';
      else if (a >= 0.01) s = String(Math.round(v * 1000) / 1000);
      else s = v.toExponential(1);
      return s.replace(/\.0(?=[kMB]|$)/, '');
    }
    function fmtFull(v) {
      if (v === undefined || v === null || !isFinite(v)) return '';
      return Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
    }

    /* ---------------------------------------------------------------- profile: what is in each column */
    var NODE_BUILTIN = [['label', 'Label'], ['group', 'Group'], ['valence', 'Outcome mark']];
    var EDGE_BUILTIN = [['weight', 'Weight'], ['label', 'Label'], ['kind', 'Kind']];
    function makeCol(scope, key, name, builtin) {
      return { scope: scope, key: key, name: name, builtin: !!builtin, n: 0, numN: 0, dateN: 0, min: Infinity, max: -Infinity, sum: 0, distinct: 0, cats: null, sample: [], kind: 'empty', _d: new Map() };
    }
    function feed(c, v) {
      if (isEmpty(v)) return;
      c.n++;
      var x = num(v);
      if (x === x) { c.numN++; if (x < c.min) c.min = x; if (x > c.max) c.max = x; c.sum += x; }
      else if (!isNaN(dateMs(v))) c.dateN++;
      if (c._d.size < 400 || c._d.has(v)) c._d.set(v, (c._d.get(v) || 0) + 1);
      if (c.sample.length < 3 && c.sample.indexOf(v) < 0) c.sample.push(v);
    }
    function finish(c) {
      c.distinct = c._d.size;
      var capped = c._d.size >= 400;
      if (c.n === 0) c.kind = 'empty';
      else if (c.numN >= 0.9 * c.n) c.kind = 'number';
      else if (c.dateN >= 0.9 * c.n) c.kind = 'date';
      else if (!capped && c.distinct <= 40 && (c.distinct <= c.n * 0.6 || c.distinct <= 4)) c.kind = 'category';
      else c.kind = 'text';
      if (c.kind === 'category') c.cats = Array.from(c._d.entries()).sort(function (a, b) { return b[1] - a[1] || (String(a[0]) < String(b[0]) ? -1 : 1); }).slice(0, 40).map(function (e) { return [String(e[0]), e[1]]; });
      if (c.numN === 0) { c.min = c.max = c.sum = 0; }
      c.mean = c.numN ? c.sum / c.numN : 0;
      delete c._d;
      return c;
    }
    /** { nodes: [column], edges: [column] } for a graph. Cheap enough to run on every change. */
    function profile(g) {
      var out = { nodes: [], edges: [] }, nc = new Map(), ec = new Map(), i, k, c;
      NODE_BUILTIN.forEach(function (b) { nc.set(b[0], makeCol('nodes', b[0], b[1], true)); });
      EDGE_BUILTIN.forEach(function (b) { ec.set(b[0], makeCol('edges', b[0], b[1], true)); });
      for (i = 0; i < g.nodes.length; i++) {
        var n = g.nodes[i];
        feed(nc.get('label'), n.label === n.id ? '' : n.label); feed(nc.get('group'), n.group); feed(nc.get('valence'), n.valence);
        var at = n.attrs;
        if (at) for (k in at) { c = nc.get(k); if (!c) { c = makeCol('nodes', k, k, false); nc.set(k, c); } feed(c, at[k]); }
      }
      for (i = 0; i < g.edges.length; i++) {
        var e = g.edges[i];
        feed(ec.get('weight'), e.weight); feed(ec.get('label'), e.label); feed(ec.get('kind'), e.kind);
        var ea = e.attrs;
        if (ea) for (k in ea) { c = ec.get(k); if (!c) { c = makeCol('edges', k, k, false); ec.set(k, c); } feed(c, ea[k]); }
      }
      nc.forEach(function (col) { finish(col); if (col.kind !== 'empty') out.nodes.push(col); });
      ec.forEach(function (col) { finish(col); if (col.kind !== 'empty') out.edges.push(col); });
      // the label column is only interesting when it differs from the name; the weight is a number even when sparse
      out.edges.forEach(function (col) { if (col.key === 'weight' && col.numN) col.kind = 'number'; });
      return out;
    }
    function findCol(list, key) { for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i]; return null; }

    /* ---------------------------------------------------------------- reading a channel from an item or link */
    function split(ch) {
      if (!ch) return null;
      if (ch === 'weight') return { t: 'weight' };
      var i = ch.indexOf(':');
      return i < 0 ? { t: ch } : { t: ch.slice(0, i), key: ch.slice(i + 1) };
    }
    /** Number from a channel for one item or link (NaN when missing). */
    function numOf(obj, ch) {
      var c = typeof ch === 'string' ? split(ch) : ch;
      if (!c) return NaN;
      if (c.t === 'weight') return num(obj.weight);
      if (c.t !== 'col') return NaN;
      var at = obj.attrs;
      if (at && own(at, c.key)) return num(at[c.key]);
      return num(obj[c.key]);
    }
    function catOf(obj, ch) {
      var c = typeof ch === 'string' ? split(ch) : ch;
      if (!c || c.t !== 'col') return c && c.t === 'weight' ? '' : '';
      var at = obj.attrs, v = at && own(at, c.key) ? at[c.key] : obj[c.key];
      return isEmpty(v) ? '' : String(v);
    }

    /* ---------------------------------------------------------------- guessing what each column is for */
    var SIZE_NAMES = /(^|[^a-z])(size|value|amount|revenue|sales|total|population|count|volume|spend|budget|mass|score|rank|qty|quantity)([^a-z]|$)/i;
    var WIDTH_NAMES = /(^|[^a-z])(amount|flow|value|volume|count|qty|quantity|cost|spend|revenue|total|traffic|trips|transfers?|calls?|messages?|strength|weight)([^a-z]|$)/i;
    /** Sensible starting choices for the map from what the data holds. */
    function guessRoles(prof, g) {
      var r = { colorBy: 'group', sizeBy: '', widthBy: '', edgeColorBy: '', linkLabels: '' };
      var w = findCol(prof.edges, 'weight'), best = null;
      if (w && w.kind === 'number' && w.numN >= 1) r.widthBy = 'weight';
      else {
        prof.edges.forEach(function (c) { if (!best && !c.builtin && c.kind === 'number' && WIDTH_NAMES.test(c.name)) best = c; });
        if (!best) prof.edges.forEach(function (c) { if (!best && !c.builtin && c.kind === 'number') best = c; });
        if (best) r.widthBy = 'col:' + best.key;
      }
      var grp = findCol(prof.nodes, 'group'), sz = null;
      prof.nodes.forEach(function (c) { if (!sz && !c.builtin && c.kind === 'number' && SIZE_NAMES.test(c.name)) sz = c; });
      if (sz) r.sizeBy = 'col:' + sz.key;
      if (!grp || grp.kind === 'empty') {
        var cat = null; prof.nodes.forEach(function (c) { if (!cat && !c.builtin && c.kind === 'category' && c.distinct >= 2 && c.distinct <= 12) cat = c; });
        r.colorBy = cat ? 'col:' + cat.key : 'found';
      }
      var kind = findCol(prof.edges, 'kind');
      if (kind && kind.kind === 'category' && kind.distinct >= 2 && kind.distinct <= 8) r.edgeColorBy = 'col:kind';
      return r;
    }
    /** True when the data is a story (a choose-your-own-adventure) and the story wording makes sense. */
    function isStory(g) {
      if (!g) return false;
      if (g.flavor === 'story') return true;
      if (g.flavor === 'data') return false;
      for (var i = 0; i < g.nodes.length; i++) if (g.nodes[i].valence === 'good' || g.nodes[i].valence === 'bad') return true;
      return false;
    }

    /* ---------------------------------------------------------------- formulas for calculated columns */
    var FUNCS = {
      abs: Math.abs, sqrt: Math.sqrt, ln: Math.log, log10: Math.log10, log2: Math.log2, log: Math.log10, exp: Math.exp,
      floor: Math.floor, ceil: Math.ceil, sign: Math.sign, pow: Math.pow, sin: Math.sin, cos: Math.cos,
      round: function (x, d) {
        d = d || 0;
        if (!isFinite(x) || !isFinite(d) || Math.abs(d) > 15) return x;
        var t = String(x);   // 1.005 is 1.00499999999999989... in binary, so shift the decimal point in the text, not by multiplying
        if (t.indexOf('e') < 0) return Number(Math.round(Number(t + 'e' + d)) + 'e' + -d);
        var f = Math.pow(10, d); return Math.round(x * f) / f;
      },
      min: function () { var m = Infinity, a = arguments; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; },
      max: function () { var m = -Infinity, a = arguments; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; },
      clamp: function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
    };
    var ARITY = { abs: 1, sqrt: 1, ln: 1, log10: 1, log2: 1, log: 1, exp: 1, floor: 1, ceil: 1, sign: 1, pow: 2, sin: 1, cos: 1, clamp: 3 };
    function tokenize(src) {
      var t = [], i = 0, n = src.length, m;
      while (i < n) {
        var ch = src.charAt(i);
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '[') {
          var j = src.indexOf(']', i + 1);
          if (j < 0) throw new Error('A [ is not closed with ]');
          t.push({ k: 'id', v: src.slice(i + 1, j).trim(), at: i }); i = j + 1; continue;
        }
        if (/[0-9.]/.test(ch)) {
          m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
          if (!m) throw new Error('A number looks wrong near "' + src.slice(i, i + 6) + '"');
          t.push({ k: 'num', v: parseFloat(m[0]), at: i }); i += m[0].length; continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
          m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
          var w = m[0], lw = w.toLowerCase();
          if (lw === 'and' || lw === 'or' || lw === 'not') t.push({ k: 'op', v: lw, at: i });
          else t.push({ k: 'id', v: w, at: i });
          i += w.length; continue;
        }
        m = /^(<=|>=|==|!=|<>|&&|\|\||[-+*\/%^(),<>=!])/.exec(src.slice(i));
        if (!m) throw new Error('I do not understand "' + ch + '"');
        var op = m[0]; if (op === '=') op = '=='; if (op === '<>') op = '!='; if (op === '&&') op = 'and'; if (op === '||') op = 'or';
        t.push({ k: 'op', v: op, at: i }); i += m[0].length;
      }
      return t;
    }
    /** Parses a formula. Returns { fn(get), vars }, where get(name) gives the number for a column name. Throws a plain-words error. */
    function compile(src) {
      var t = tokenize(String(src || '')), p = 0, vars = [];
      if (!t.length) throw new Error('The formula is empty');
      var peek = function () { return t[p]; }, isOp = function (v) { return t[p] && t[p].k === 'op' && t[p].v === v; };
      var expect = function (v) { if (!isOp(v)) throw new Error('Expected "' + v + '"' + (t[p] ? ' near "' + (t[p].v) + '"' : ' at the end')); p++; };
      var orE = function () { var a = andE(); while (isOp('or')) { p++; var b = andE(); a = (function (x, y) { return function (g) { return (x(g) && 1) || (y(g) && 1) ? 1 : 0; }; })(a, b); } return a; };
      var andE = function () { var a = cmpE(); while (isOp('and')) { p++; var b = cmpE(); a = (function (x, y) { return function (g) { return x(g) && y(g) ? 1 : 0; }; })(a, b); } return a; };
      var cmpE = function () {
        var a = addE();
        while (t[p] && t[p].k === 'op' && ['<', '<=', '>', '>=', '==', '!='].indexOf(t[p].v) >= 0) {
          var op = t[p++].v, b = addE();
          a = (function (x, y, o) { return function (g) { var u = x(g), v = y(g); return (o === '<' ? u < v : o === '<=' ? u <= v : o === '>' ? u > v : o === '>=' ? u >= v : o === '==' ? u === v : u !== v) ? 1 : 0; }; })(a, b, op);
        }
        return a;
      };
      var addE = function () {
        var a = mulE();
        while (isOp('+') || isOp('-')) { var op = t[p++].v, b = mulE(); a = (function (x, y, o) { return o === '+' ? function (g) { return x(g) + y(g); } : function (g) { return x(g) - y(g); }; })(a, b, op); }
        return a;
      };
      var mulE = function () {
        var a = powE();
        while (isOp('*') || isOp('/') || isOp('%')) { var op = t[p++].v, b = powE(); a = (function (x, y, o) { return o === '*' ? function (g) { return x(g) * y(g); } : o === '/' ? function (g) { var d = y(g); return d === 0 ? NaN : x(g) / d; } : function (g) { return x(g) % y(g); }; })(a, b, op); }
        return a;
      };
      var powE = function () { var a = unE(); if (isOp('^')) { p++; var b = powE(); return function (g) { return Math.pow(a(g), b(g)); }; } return a; };
      var unE = function () {
        if (isOp('-')) { p++; var a = unE(); return function (g) { return -a(g); }; }
        if (isOp('+')) { p++; return unE(); }
        if (isOp('not')) { p++; var b = unE(); return function (g) { return b(g) ? 0 : 1; }; }
        return prim();
      };
      var prim = function () {
        var k = peek();
        if (!k) throw new Error('The formula ends too early');
        if (k.k === 'num') { p++; var v = k.v; return function () { return v; }; }
        if (k.k === 'op' && k.v === '(') { p++; var e = orE(); expect(')'); return e; }
        if (k.k === 'id') {
          p++;
          if (isOp('(')) {
            p++;
            var name = k.v.toLowerCase(), args = [];
            if (!isOp(')')) { do { args.push(orE()); if (isOp(',')) p++; else break; } while (true); }
            expect(')');
            if (name === 'if') {
              if (args.length !== 3) throw new Error('if needs three parts: if(test, then, else)');
              return function (g) { return args[0](g) ? args[1](g) : args[2](g); };
            }
            var f = FUNCS[name];
            if (!f) throw new Error('I do not know the function "' + k.v + '"');
            if (ARITY[name] && args.length !== ARITY[name]) throw new Error(name + ' needs ' + ARITY[name] + ' value' + (ARITY[name] === 1 ? '' : 's'));
            return function (g) { var a = new Array(args.length); for (var i = 0; i < args.length; i++) a[i] = args[i](g); return f.apply(null, a); };
          }
          if (k.v.toLowerCase() === 'pi') return function () { return Math.PI; };
          var id = k.v; if (vars.indexOf(id) < 0) vars.push(id);
          return function (g) { return g(id); };
        }
        throw new Error('Unexpected "' + k.v + '"');
      };
      var fn = orE();
      if (p < t.length) throw new Error('Unexpected "' + t[p].v + '"');
      return { fn: fn, vars: vars };
    }

    /* ---------------------------------------------------------------- derived graph: calculated columns written into the attributes */
    var memo = { g: null, key: '', out: null };
    function round6(x) { return isFinite(x) ? Math.round(x * 1e6) / 1e6 : ''; }
    function nodeSys(g) {
      var n = g.nodes.length, idx = new Map(), deg = new Float64Array(n), ins = new Float64Array(n), outs = new Float64Array(n), inW = new Float64Array(n), outW = new Float64Array(n), i;
      for (i = 0; i < n; i++) idx.set(g.nodes[i].id, i);
      for (i = 0; i < g.edges.length; i++) {
        var e = g.edges[i], a = idx.get(e.from), b = idx.get(e.to);
        if (a === undefined || b === undefined) continue;
        var w = num(e.weight); if (w !== w) w = 1;
        outs[a]++; ins[b]++; deg[a]++; deg[b]++; outW[a] += w; inW[b] += w;
      }
      return { idx: idx, degree: deg, 'in': ins, out: outs, inW: inW, outW: outW };
    }
    function nodeGetter(node, i, sys, calcVals) {
      return function (name) {
        var k = name.toLowerCase();
        if (k === 'degree') return sys.degree[i]; if (k === 'in') return sys['in'][i]; if (k === 'out') return sys.out[i]; if (k === 'inw') return sys.inW[i]; if (k === 'outw') return sys.outW[i];
        if (calcVals && Object.prototype.hasOwnProperty.call(calcVals, name)) return calcVals[name];
        var at = node.attrs, key = name;
        if (at && !Object.prototype.hasOwnProperty.call(at, key)) { var lk = key.toLowerCase(); for (var q in at) if (q.toLowerCase() === lk) { key = q; break; } }
        if (at && Object.prototype.hasOwnProperty.call(at, key)) return num(at[key]);
        if (key === 'group' || key === 'label') return num(node[key]);
        return NaN;
      };
    }
    /** The graph with calculated columns filled in (new objects only where something was added). Same graph back when there are none. */
    function derive(g) {
      if (!g || !g.calc || !g.calc.length) return g;
      var key = JSON.stringify(g.calc);
      if (memo.g === g && memo.key === key) return memo.out;
      var out = { name: g.name, start: g.start, flavor: g.flavor, states: g.states, calc: g.calc, roles: g.roles, nodes: g.nodes.slice(), edges: g.edges.slice(), errors: [] };
      var sys = nodeSys(g), nodeCalcs = [], edgeCalcs = [];
      g.calc.forEach(function (c) {
        try { var cc = compile(c.formula); (c.scope === 'edges' ? edgeCalcs : nodeCalcs).push({ name: c.name, fn: cc.fn }); } catch (err) { out.errors.push(c.name + ': ' + err.message); }
      });
      var i;
      if (nodeCalcs.length) {
        for (i = 0; i < out.nodes.length; i++) {
          var nd = out.nodes[i], vals = {}, attrs = Object.assign({}, nd.attrs), get = nodeGetter(nd, i, sys, vals);
          nodeCalcs.forEach(function (c) { var v; try { v = c.fn(get); } catch (e) { v = NaN; } vals[c.name] = v; attrs[c.name] = round6(v); });
          out.nodes[i] = Object.assign({}, nd, { attrs: attrs });
        }
      }
      if (edgeCalcs.length) {
        var byId = new Map(); out.nodes.forEach(function (n, k) { byId.set(n.id, k); });
        for (i = 0; i < out.edges.length; i++) {
          var ed = out.edges[i], ev = {}, eattrs = Object.assign({}, ed.attrs), fi = byId.get(ed.from), ti = byId.get(ed.to);
          var fg = fi === undefined ? function () { return NaN; } : nodeGetter(out.nodes[fi], fi, sys, null), tg = ti === undefined ? function () { return NaN; } : nodeGetter(out.nodes[ti], ti, sys, null);
          var eget = function (name) {
            if (Object.prototype.hasOwnProperty.call(ev, name)) return ev[name];
            var dot = name.indexOf('.');
            if (dot > 0) { var pre = name.slice(0, dot).toLowerCase(), rest = name.slice(dot + 1); if (pre === 'from') return fg(rest); if (pre === 'to') return tg(rest); }
            var k = name.toLowerCase();
            if (k === 'weight') { var w = num(ed.weight); return w; }
            var at = eattrs, kk = name;
            if (!Object.prototype.hasOwnProperty.call(at, kk)) for (var q in at) if (q.toLowerCase() === k) { kk = q; break; }
            return Object.prototype.hasOwnProperty.call(at, kk) ? num(at[kk]) : NaN;
          };
          edgeCalcs.forEach(function (c) { var v; try { v = c.fn(eget); } catch (e) { v = NaN; } ev[c.name] = v; eattrs[c.name] = round6(v); });
          out.edges[i] = Object.assign({}, ed, { attrs: eattrs });
        }
      }
      memo = { g: g, key: key, out: out };
      return out;
    }

    /* ---------------------------------------------------------------- states: ways to split data into baseline / year 1 / year 2 ... */
    /**
     * Looks for ways the data could hold several states.
     * Returns { rows: [{key, name, values}], cols: [{keys, names}] }:
     *   rows  = a column on the links whose few distinct values repeat the same from-to pairs (one row per state)
     *   cols  = number columns on the links that look like one column per state (years, "Year 1", "Baseline"...)
     */
    function suggestStates(g, prof) {
      var out = { rows: [], cols: [] };
      prof = prof || profile(g);
      var pairs = new Map();
      for (var i = 0; i < g.edges.length && i < 50000; i++) { var k = g.edges[i].from + '\u0001' + g.edges[i].to; pairs.set(k, (pairs.get(k) || 0) + 1); }
      var repeated = 0; pairs.forEach(function (c) { if (c > 1) repeated++; });
      if (pairs.size && repeated / pairs.size > 0.3) {
        prof.edges.forEach(function (c) {
          if (c.key === 'weight' || c.kind === 'number' && c.distinct > 12) return;
          if ((c.kind === 'category' || c.kind === 'date' || c.kind === 'number') && c.distinct >= 2 && c.distinct <= 24) out.rows.push({ key: c.key, name: c.name, values: c.kind === 'category' && c.cats ? c.cats.map(function (x) { return x[0]; }) : null });
        });
      }
      var nums = prof.edges.filter(function (c) { return c.kind === 'number' && !c.builtin; });
      var STATE_NAME = /(19|20)\d\d|year\s*\d|^y\d+$|baseline|base|end|final|start|phase\s*\d|q[1-4]|scenario|period|t\d+|^t[-_ ]?\d+$|month|week/i;
      var likely = nums.filter(function (c) { return STATE_NAME.test(c.name); });
      if (likely.length >= 2) out.cols.push({ keys: likely.map(function (c) { return c.key; }), names: likely.map(function (c) { return c.name; }) });
      else if (nums.length >= 2 && !out.rows.length) out.cols.push({ keys: nums.map(function (c) { return c.key; }), names: nums.map(function (c) { return c.name; }) });
      return out;
    }

    /**
     * Turns a table into states. spec: { mode: 'cols', keys: [edge column keys], names: [state names] }
     *   or { mode: 'rows', key: edge column key, order?: [values in the order wanted] }.
     * Returns a new graph with g.states = { names } and every link carrying vals (one number per state, or null when absent).
     */
    function buildStates(g, spec) {
      var out = Object.assign({}, g), ns, i, e;
      var attr = function (ed, k) { var v = ed.attrs && own(ed.attrs, k) ? ed.attrs[k] : ed[k]; return v; };
      if (spec.mode === 'cols') {
        var keys = spec.keys.slice(0, 60); ns = keys.length;
        if (ns < 2) throw new Error('Pick at least two columns.');
        out.states = { names: keys.map(function (k, j) { var nm = spec.names && spec.names[j]; return String(nm === undefined || nm === '' ? k : nm).slice(0, 60); }) };
        var flat = g.edges.every(function (ed) { return !(Number(ed.weight) !== 1); });
        out.edges = g.edges.map(function (ed) {
          var vals = keys.map(function (k) { var v = num(attr(ed, k)); return v === v ? v : null; }), c = Object.assign({}, ed, { vals: vals });
          if (flat) { var sum = 0, cnt = 0; vals.forEach(function (v) { if (v !== null) { sum += v; cnt++; } }); if (cnt) c.weight = sum / cnt; }
          return c;
        });
        return out;
      }
      if (spec.mode === 'rows') {
        var key = spec.key, seen = [], vset = new Set();
        g.edges.forEach(function (ed) { var v = String(attr(ed, key) === undefined || attr(ed, key) === null ? '' : attr(ed, key)); if (!vset.has(v)) { vset.add(v); seen.push(v); } });
        var order = spec.order && spec.order.length ? spec.order.map(String) : seen.slice();
        if (!spec.order) {
          var allNum = seen.every(function (v) { return v !== '' && num(v) === num(v); }), allDate = !allNum && seen.every(function (v) { return v !== '' && dateMs(v) === dateMs(v); });
          if (allNum) order.sort(function (a, b) { return num(a) - num(b); }); else if (allDate) order.sort(function (a, b) { return dateMs(a) - dateMs(b); });
        }
        order = order.slice(0, 60); ns = order.length;
        if (ns < 2) throw new Error('That column has only one value, so there is nothing to compare.');
        out.states = { names: order.map(function (v) { return v === '' ? '(none)' : v.slice(0, 60); }) };
        var byPair = new Map(), list = [];
        g.edges.forEach(function (ed) {
          var si = order.indexOf(String(attr(ed, key) === undefined || attr(ed, key) === null ? '' : attr(ed, key)));
          if (si < 0) return;
          var pk = ed.from + '\u0001' + ed.to + '\u0001' + (ed.kind || ''), t = byPair.get(pk);
          if (!t) { t = Object.assign({}, ed, { vals: new Array(ns).fill(null), attrs: Object.assign({}, ed.attrs || {}) }); if (t.attrs) delete t.attrs[key]; byPair.set(pk, t); list.push(t); }
          var w = num(ed.weight); if (!(w === w)) w = 1;
          t.vals[si] = (t.vals[si] || 0) + w;
        });
        list.forEach(function (t) { var sum = 0, cnt = 0; t.vals.forEach(function (v) { if (v !== null) { sum += v; cnt++; } }); t.weight = cnt ? sum / cnt : 1; });
        out.edges = list;
        return out;
      }
      throw new Error('Unknown way of making states.');
    }
    function clearStates(g) {
      var out = Object.assign({}, g); delete out.states;
      out.edges = g.edges.map(function (e) { if (!e.vals) return e; var c = Object.assign({}, e); delete c.vals; return c; });
      return out;
    }

    return { buildStates: buildStates, clearStates: clearStates, num: num, dateMs: dateMs, fmt: fmt, fmtFull: fmtFull, profile: profile, findCol: findCol, numOf: numOf, catOf: catOf, split: split, guessRoles: guessRoles, isStory: isStory, compile: compile, derive: derive, suggestStates: suggestStates, nodeSys: nodeSys, FUNCS: Object.keys(FUNCS).concat(['if']) };
  })();

  var NFMEngine = (function () {
    'use strict';
    var C = NFMColumns;
    var SK = null;   // the Sankey add-on (netflow-sankey): handed over with use('sankey', impl); without it the River view keeps the plain layered picture
    var MAP_W = 176, MAP_H = 56;
    var LN10 = Math.LN10;

    /* ---------------------------------------------------------------- small tools */
    function mulberry32(seed) {
      var s = seed | 0;
      var f = function () {
        s = (s + 0x6d2b79f5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      f.state = function (v) { if (v !== undefined) s = v | 0; return s; };   // read or set where the random run stands (the early preview resumes from it)
      return f;
    }
    function lse(a, b) {
      if (a === -Infinity) return b;
      if (b === -Infinity) return a;
      return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
    }
    function now() {
      return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    }

    /* ---------------------------------------------------------------- 1. the graph in flat arrays */
    /**
     * graph: { nodes: [{id, label, group, valence, attrs}], edges: [{from, to, label, weight, kind}], start }
     * opts:  block (ids taken out: "what if this page were gone"), hideKinds (edge kinds taken out), start, weights (bool)
     */
    function prepare(graph, opts) {
      opts = opts || {};
      var block = new Set(opts.block || []), hide = new Set(opts.hideKinds || []), keep = opts.keep ? new Set(opts.keep) : null, efs = (opts.edgeFacets && opts.edgeFacets.length ? opts.edgeFacets : opts.edgeFacet ? [opts.edgeFacet] : []).filter(function (x) { return x && x.col; });   /* the panel offers two link filters: an edge stays only when it passes every one */
      var nodes = [], index = new Map(), no = [];
      for (var i = 0; i < graph.nodes.length; i++) {
        var nd = graph.nodes[i];
        if (block.has(nd.id) || (keep && !keep.has(nd.id))) continue;
        index.set(nd.id, nodes.length);
        nodes.push(nd); no.push(i);
      }
      var n = nodes.length;
      var f = [], t = [], w = [], eo = [], rw = [], me = opts.minEdge && opts.minEdge.ch ? opts.minEdge : null, st = opts.state, stEdges = null;
      for (var k = 0; k < graph.edges.length; k++) {
        var e = graph.edges[k];
        if (hide.has(e.kind || '')) continue;
        var efOut = false; for (var fi = 0; fi < efs.length; fi++) if (efs[fi].values.indexOf(C.catOf(e, 'col:' + efs[fi].col)) < 0) { efOut = true; break; }
        if (efOut) continue;
        var a = index.get(e.from), b = index.get(e.to);
        if (a === undefined || b === undefined) continue;
        if (me) { var mv = C.numOf(e, me.ch); if (mv === mv && mv < me.min) continue; }
        var wt = Number(e.weight), gone = false;
        if (st !== undefined && st !== null && e.vals) {
          var sv = e.vals[st];
          if (sv === null || sv === undefined || !(sv > 0)) { if (opts.onlyPresent) continue; sv = 0; gone = true; }
          wt = sv;
          if (!stEdges) stEdges = graph.edges.slice();
          stEdges[k] = Object.assign({}, e, { weight: sv, absent: gone });
        }
        f.push(a); t.push(b); eo.push(k);
        rw.push(isFinite(wt) ? wt : 1);
        w.push(opts.weights && isFinite(wt) && wt > 0 ? wt : 1);
      }
      var m = f.length;
      var P = {
        n: n, m: m, nodes: nodes, index: index, norig: Int32Array.from(no), rw: Float64Array.from(rw),
        from: Int32Array.from(f), to: Int32Array.from(t), w: Float64Array.from(w), eorig: Int32Array.from(eo),
        outStart: new Int32Array(n + 1), outEdge: new Int32Array(m), inStart: new Int32Array(n + 1), inEdge: new Int32Array(m),
        valence: new Int8Array(n), edges: stEdges || graph.edges, stated: !!stEdges
      };
      var i2;
      for (i2 = 0; i2 < m; i2++) { P.outStart[P.from[i2] + 1]++; P.inStart[P.to[i2] + 1]++; }
      for (i2 = 0; i2 < n; i2++) { P.outStart[i2 + 1] += P.outStart[i2]; P.inStart[i2 + 1] += P.inStart[i2]; }
      var oc = P.outStart.slice(0, n), ic = P.inStart.slice(0, n);
      for (i2 = 0; i2 < m; i2++) { P.outEdge[oc[P.from[i2]]++] = i2; P.inEdge[ic[P.to[i2]]++] = i2; }
      for (i2 = 0; i2 < n; i2++) {
        var v = nodes[i2].valence;
        P.valence[i2] = v === 'good' ? 1 : v === 'bad' ? 2 : v === 'neutral' ? 3 : 0;
      }
      var want = opts.start !== undefined && opts.start !== null ? opts.start : graph.start;
      P.start = index.has(want) ? index.get(want) : autoStart(P);
      P.autoStart = !index.has(want);
      return P;
    }
    function outdeg(P, v) { return P.outStart[v + 1] - P.outStart[v]; }
    function indeg(P, v) { return P.inStart[v + 1] - P.inStart[v]; }

    /** Breadth-first distances from `root` (never entering `skip`); -1 where not reached. */
    function bfs(P, root, skip) {
      var d = new Int32Array(P.n).fill(-1);
      if (root < 0 || root === skip || P.n === 0) return d;
      var q = new Int32Array(P.n), h = 0, tl = 0;
      q[tl++] = root; d[root] = 0;
      while (h < tl) {
        var v = q[h++];
        for (var k = P.outStart[v]; k < P.outStart[v + 1]; k++) {
          var w = P.to[P.outEdge[k]];
          if (w !== skip && d[w] < 0) { d[w] = d[v] + 1; q[tl++] = w; }
        }
      }
      return d;
    }
    /** The best place to start when the data does not say: a node nothing points to that reaches the most, else the busiest node. */
    function autoStart(P) {
      if (!P.n) return -1;
      var cands = [], i;
      for (i = 0; i < P.n; i++) {
        var inn = 0;
        for (var k = P.inStart[i]; k < P.inStart[i + 1]; k++) if (P.from[P.inEdge[k]] !== i) inn++;
        if (!inn && outdeg(P, i)) cands.push(i);
      }
      if (!cands.length) for (i = 0; i < P.n; i++) cands.push(i);
      cands.sort(function (a, b) { return outdeg(P, b) - outdeg(P, a) || a - b; });
      var best = cands[0], bestN = -1;
      for (i = 0; i < Math.min(cands.length, 40); i++) {
        var d = bfs(P, cands[i], -1), c = 0;
        for (var j = 0; j < P.n; j++) if (d[j] >= 0) c++;
        if (c > bestN) { bestN = c; best = cands[i]; }
      }
      return best;
    }

    /* ---------------------------------------------------------------- 2. choke points and traffic */
    /**
     * Goal: the nodes marked good; else terminals not marked bad; else every terminal; else the farthest nodes.
     * A choke point is a node every route from the start to the goal must pass: a strict dominator of a virtual sink that
     * every goal points to (Cooper, Harvey, Kennedy 2001). The start always counts.
     * Traffic: the share of all routes (loops dropped) through a node, kept as logs so it never overflows.
     */
    function importance(P) {
      var n = P.n, start = P.start, depth = bfs(P, start, -1);
      var res = { choke: new Uint8Array(n), traffic: new Float64Array(n), depth: depth, goal: [], goalKind: '', spine: [], routesLog10: 0, reached: 0 };
      if (start < 0) return res;
      var i, reached = [];
      for (i = 0; i < n; i++) if (depth[i] >= 0) reached.push(i);
      res.reached = reached.length;
      var term = function (v) { return outdeg(P, v) === 0; };
      var goal = reached.filter(function (v) { return P.valence[v] === 1; });
      res.goalKind = 'marked good';
      if (!goal.length) { goal = reached.filter(function (v) { return term(v) && P.valence[v] !== 2; }); res.goalKind = 'ends'; }
      if (!goal.length) { goal = reached.filter(term); res.goalKind = 'all ends'; }
      if (!goal.length) {
        var md = 0;
        reached.forEach(function (v) { if (depth[v] > md) md = depth[v]; });
        goal = reached.filter(function (v) { return depth[v] === md; });
        res.goalKind = 'farthest nodes';
      }
      res.goal = goal;
      res.choke[start] = 1;
      /* --- dominators of the sink S (index n), iterative, no recursion --- */
      var S = n, isGoal = new Uint8Array(n + 1);
      goal.forEach(function (v) { isGoal[v] = 1; });
      var seen = new Uint8Array(n + 1), stack = new Int32Array(n + 2), it = new Int32Array(n + 1), po = new Int32Array(n + 1).fill(-1), order = [];
      var sp = 0; stack[sp++] = start; seen[start] = 1;
      while (sp) {
        var v = stack[sp - 1], od = v === S ? 0 : outdeg(P, v), deg = od + (v !== S && isGoal[v] ? 1 : 0), kk = it[v];
        if (kk < deg) {
          it[v]++;
          var w = kk < od ? P.to[P.outEdge[P.outStart[v] + kk]] : S;
          if (!seen[w]) { seen[w] = 1; stack[sp++] = w; }
        } else { po[v] = order.length; order.push(v); sp--; }
      }
      var idom = new Int32Array(n + 1).fill(-1);
      idom[start] = start;
      var preds = function (b, cb) {
        if (b === S) { for (var q = 0; q < goal.length; q++) cb(goal[q]); return; }
        for (var q2 = P.inStart[b]; q2 < P.inStart[b + 1]; q2++) cb(P.from[P.inEdge[q2]]);
      };
      var changed = true, guard = 0;
      while (changed && guard++ < 60) {
        changed = false;
        for (var oi = order.length - 1; oi >= 0; oi--) {
          var b = order[oi];
          if (b === start) continue;
          var ni = -1;
          preds(b, function (p) {
            if (!seen[p] || idom[p] < 0) return;
            if (ni < 0) { ni = p; return; }
            var x = p, y = ni;
            while (x !== y) {
              while (po[x] < po[y]) x = idom[x];
              while (po[y] < po[x]) y = idom[y];
            }
            ni = x;
          });
          if (ni !== idom[b]) { idom[b] = ni; changed = true; }
        }
      }
      if (seen[S] && idom[S] >= 0) {
        var x2 = idom[S], hops = 0;
        while (x2 !== start && x2 >= 0 && x2 < n && hops++ <= n) { res.choke[x2] = 1; x2 = idom[x2]; }
      }
      res.spine = reached.filter(function (v) { return res.choke[v]; }).sort(function (a, b) { return depth[a] - depth[b] || a - b; });
      res.idom = idom; res.rpo = order.filter(function (v) { return v < n; }).reverse();   /* the dominator tree, parents before children (the shape view reads it) */
      /* --- traffic: drop arrows that loop back (iterative depth-first), then count routes in log space --- */
      var state = new Uint8Array(n), keep = new Uint8Array(P.m), post = [];
      sp = 0; it = new Int32Array(n); stack = new Int32Array(n + 1);
      stack[sp++] = start; state[start] = 1;
      while (sp) {
        var v2 = stack[sp - 1], k2 = it[v2];
        if (k2 < outdeg(P, v2)) {
          it[v2]++;
          var e = P.outEdge[P.outStart[v2] + k2], w2 = P.to[e];
          if (state[w2] === 1) continue;
          keep[e] = 1;
          if (!state[w2]) { state[w2] = 1; stack[sp++] = w2; }
        } else { state[v2] = 2; post.push(v2); sp--; }
      }
      var lin = new Float64Array(n).fill(-Infinity), lout = new Float64Array(n).fill(-Infinity), pi, pv, pk;
      lin[start] = 0;
      for (pi = post.length - 1; pi >= 0; pi--) {
        pv = post[pi];
        for (pk = P.outStart[pv]; pk < P.outStart[pv + 1]; pk++) {
          var ee = P.outEdge[pk];
          if (keep[ee]) lin[P.to[ee]] = lse(lin[P.to[ee]], lin[pv]);
        }
      }
      for (pi = 0; pi < post.length; pi++) {
        pv = post[pi];
        var acc = -Infinity, any = false;
        for (pk = P.outStart[pv]; pk < P.outStart[pv + 1]; pk++) {
          var e3 = P.outEdge[pk];
          if (keep[e3]) { any = true; acc = lse(acc, lout[P.to[e3]]); }
        }
        lout[pv] = any ? acc : 0;
      }
      var mx = -Infinity;
      post.forEach(function (v3) { var s = lin[v3] + lout[v3]; if (s > mx) mx = s; });
      post.forEach(function (v3) { res.traffic[v3] = isFinite(mx) ? Math.exp(lin[v3] + lout[v3] - mx) : 0; });
      res.routesLog10 = isFinite(lout[start]) ? lout[start] / LN10 : 0;
      return res;
    }

    /* ---------------------------------------------------------------- 3. simulated players */
    /**
     * Exact: a random walker who picks among a node's arrows equally (or by weight) is an absorbing Markov chain, so the odds of each
     * ending and the expected visits are computed, not sampled. Same 400-step cap as the editor's simulated players.
     * Returns per node: pGood/pBad/pNeutral (chance of that ending from here), visits (expected visits per player), and per arrow: moves.
     */
    function flowExact(P, imp, o) {
      var r = absorb(P, imp, o, function (i) { return P.valence[i] === 1 ? 0 : P.valence[i] === 2 ? 1 : 2; }, 3);
      var n = P.n, pg = new Float64Array(n), pb = new Float64Array(n), pn = new Float64Array(n);
      for (var i = 0; i < n; i++) { pg[i] = r.c[i * 3]; pb[i] = r.c[i * 3 + 1]; pn[i] = r.c[i * 3 + 2]; }
      var oc = { good: r.start[0], bad: r.start[1], neutral: r.start[2], stuck: 0 };
      oc.stuck = Math.max(0, 1 - oc.good - oc.bad - oc.neutral);
      return { exact: r.converged, converged: r.converged, residual: r.residual, note: r.converged ? '' : NOT_SETTLED, runs: 1, visits: r.visits, moves: r.moves, pGood: pg, pBad: pb, pNeutral: pn, outcome: oc, mode: 'random' };
    }
    /** The seeds of a flow: [{v, mass}] from o.sources (ids with relative masses), else the start with mass 1. */
    function seedsOf(P, o) {
      var out = [];
      if (o && o.sources && o.sources.length) {
        var tot = 0;
        o.sources.forEach(function (s) { var v = P.index.get(s.id); if (v !== undefined) { var m = s.mass > 0 ? s.mass : 1; out.push({ v: v, mass: m }); tot += m; } });
        out.forEach(function (s) { s.mass /= tot || 1; });
      }
      if (!out.length && P.start >= 0) out.push({ v: P.start, mass: 1 });
      return out;
    }
    /** How the flow spreads forward from the seeds: expected visits per item and moves per link, with the same step cap as before. */
    function spread(P, p, seeds, cap) {
      var n = P.n, m = P.m, visits = new Float64Array(n), moves = new Float64Array(m), x = new Float64Array(n), y = new Float64Array(n), act = [], k, e;
      seeds.forEach(function (s) { if (x[s.v] === 0) act.push(s.v); x[s.v] += s.mass; });
      for (var step = 0; step < cap && act.length; step++) {
        var nxt = [], mass = 0;
        for (var ai = 0; ai < act.length; ai++) {
          var u = act[ai], xu = x[u];
          x[u] = 0;
          visits[u] += xu;
          if (!outdeg(P, u)) continue;
          for (k = P.outStart[u]; k < P.outStart[u + 1]; k++) {
            e = P.outEdge[k];
            var w = P.to[e], flow = xu * p[e];
            moves[e] += flow;
            if (y[w] === 0) nxt.push(w);
            y[w] += flow; mass += flow;
          }
        }
        var tmp = x; x = y; y = tmp;
        act = nxt;
        if (mass < 1e-13) break;
      }
      return { visits: visits, moves: moves };
    }
    /**
     * Absorbing chain with K end classes: classOf(item with no way on) gives its class 0..K-1. Returns c (n * K: the chance of
     * finishing in each class from each item), start (the mix over the seeds), visits and moves.
     */
    function absorb(P, imp, o, classOf, K) {
      o = o || {};
      var n = P.n, m = P.m, cap = o.cap || 400;
      var sumw = new Float64Array(n), p = new Float64Array(m), i, k, e;
      for (e = 0; e < m; e++) sumw[P.from[e]] += P.w[e];
      for (e = 0; e < m; e++) p[e] = sumw[P.from[e]] > 0 ? P.w[e] / sumw[P.from[e]] : 0;
      var c = new Float64Array(n * K);
      for (i = 0; i < n; i++) if (!outdeg(P, i)) { var ci = classOf(i); if (ci >= 0 && ci < K) c[i * K + ci] = 1; }
      var ord = [];
      for (i = 0; i < n; i++) if (outdeg(P, i)) ord.push(i);
      ord.sort(function (a, b) { return imp.depth[b] - imp.depth[a] || a - b; });
      var acc = new Float64Array(K), converged = false;
      for (var sweep = 0; sweep < 500; sweep++) {
        var delta = 0;
        for (var oi = 0; oi < ord.length; oi++) {
          var v = ord[oi], q;
          for (q = 0; q < K; q++) acc[q] = 0;
          for (k = P.outStart[v]; k < P.outStart[v + 1]; k++) {
            e = P.outEdge[k];
            var tK = P.to[e] * K, pe = p[e];
            for (q = 0; q < K; q++) acc[q] += pe * c[tK + q];
          }
          var d = 0;
          for (q = 0; q < K; q++) { d += Math.abs(acc[q] - c[v * K + q]); c[v * K + q] = acc[q]; }
          if (d > delta) delta = d;
        }
        if (delta < 1e-12) { converged = true; break; }
      }
      var residual = 0;
      if (!converged) {   /* the sweeps ran out (heavy self-links, long back-and-forth paths): solve each loop of items as a block instead */
        var sv = solveLoops(P, p, c, K, ord);
        converged = sv.converged; residual = sv.residual;
      }
      var seeds = seedsOf(P, o), sp = spread(P, p, seeds, cap), start = new Float64Array(K);
      seeds.forEach(function (s) { for (var q = 0; q < K; q++) start[q] += s.mass * c[s.v * K + q]; });
      return { c: c, K: K, start: start, visits: sp.visits, moves: sp.moves, p: p, converged: converged, residual: residual };
    }
    var NOT_SETTLED = 'These odds did not fully settle: a loop of items is too big to solve in the work allowed, so the numbers are close but not exact.';
    /**
     * For chains the plain sweeps cannot finish (a heavy link back to itself, a long back-and-forth path): solves the end odds loop by loop.
     * Items are grouped into loops (strongly connected parts of the links that can really be taken) and solved from the ends backward.
     * A small loop is solved directly (Gaussian elimination), a big one by sweeping inside it up to a work limit.
     * Overwrites c for the items in `ord` (items with a way on). Returns { converged, residual: the biggest change one more sweep would still make }.
     */
    function solveLoops(P, p, c, K, ord) {
      var n = P.n, active = new Uint8Array(n), i, k, e, q;
      for (i = 0; i < ord.length; i++) { active[ord[i]] = 1; for (q = 0; q < K; q++) c[ord[i] * K + q] = 0; }
      /* Tarjan, without recursion, over items with a way on and links with a real chance */
      var idx = new Int32Array(n).fill(-1), low = new Int32Array(n), onS = new Uint8Array(n), stack = [], cs = [], cp = [], counter = 0, comps = [];
      for (var r = 0; r < ord.length; r++) {
        var root = ord[r]; if (idx[root] >= 0) continue;
        cs.push(root); cp.push(P.outStart[root]); idx[root] = low[root] = counter++; stack.push(root); onS[root] = 1;
        while (cs.length) {
          var v = cs[cs.length - 1], at = cp[cp.length - 1];
          if (at < P.outStart[v + 1]) {
            cp[cp.length - 1] = at + 1; e = P.outEdge[at];
            var w = P.to[e]; if (!(p[e] > 0) || !active[w]) continue;
            if (idx[w] < 0) { idx[w] = low[w] = counter++; stack.push(w); onS[w] = 1; cs.push(w); cp.push(P.outStart[w]); }
            else if (onS[w] && idx[w] < low[v]) low[v] = idx[w];
          } else {
            cs.pop(); cp.pop();
            if (cs.length) { var par = cs[cs.length - 1]; if (low[v] < low[par]) low[par] = low[v]; }
            if (low[v] === idx[v]) {
              var members = [], x;
              do { x = stack.pop(); onS[x] = 0; members.push(x); } while (x !== v);
              comps.push(members);
            }
          }
        }
      }
      var denseLeft = 6e8, sweepLeft = 1.2e8;
      for (var ci = 0; ci < comps.length; ci++) {   /* Tarjan lists a loop only after everything it leads to */
        var mem = comps[ci], s = mem.length, out = new Float64Array(s * K), leaves = false, j, local = new Map();
        for (j = 0; j < s; j++) local.set(mem[j], j);
        for (j = 0; j < s; j++) {
          var u = mem[j];
          for (k = P.outStart[u]; k < P.outStart[u + 1]; k++) {
            e = P.outEdge[k]; if (!(p[e] > 0)) continue;
            var t2 = P.to[e];
            if (local.has(t2)) continue;
            leaves = true;
            for (q = 0; q < K; q++) out[j * K + q] += p[e] * c[t2 * K + q];
          }
        }
        if (!leaves) continue;   /* a closed loop never finishes: its odds stay 0 */
        if (s === 1) {
          var u1 = mem[0], self = 0;
          for (k = P.outStart[u1]; k < P.outStart[u1 + 1]; k++) { e = P.outEdge[k]; if (P.to[e] === u1 && p[e] > 0) self += p[e]; }
          for (q = 0; q < K; q++) c[u1 * K + q] = out[q] / (1 - self);
          continue;
        }
        var cost = s * s * s / 3 + s * s * K;
        if (cost <= denseLeft) {
          denseLeft -= cost;
          var A = new Float64Array(s * s), B = out;
          for (j = 0; j < s; j++) {
            A[j * s + j] += 1;
            var u2 = mem[j];
            for (k = P.outStart[u2]; k < P.outStart[u2 + 1]; k++) { e = P.outEdge[k]; if (p[e] > 0 && local.has(P.to[e])) A[j * s + local.get(P.to[e])] -= p[e]; }
          }
          for (var col = 0; col < s; col++) {   /* Gaussian elimination, biggest pivot first */
            var piv = col, best = Math.abs(A[col * s + col]);
            for (j = col + 1; j < s; j++) if (Math.abs(A[j * s + col]) > best) { best = Math.abs(A[j * s + col]); piv = j; }
            if (piv !== col) {
              for (k = 0; k < s; k++) { var tA = A[col * s + k]; A[col * s + k] = A[piv * s + k]; A[piv * s + k] = tA; }
              for (q = 0; q < K; q++) { var tB = B[col * K + q]; B[col * K + q] = B[piv * K + q]; B[piv * K + q] = tB; }
            }
            var d = A[col * s + col]; if (!(Math.abs(d) > 1e-300)) continue;
            for (j = col + 1; j < s; j++) {
              var f = A[j * s + col] / d; if (f === 0) continue;
              for (k = col; k < s; k++) A[j * s + k] -= f * A[col * s + k];
              for (q = 0; q < K; q++) B[j * K + q] -= f * B[col * K + q];
            }
          }
          for (j = s - 1; j >= 0; j--) {
            for (q = 0; q < K; q++) {
              var sum = B[j * K + q];
              for (k = j + 1; k < s; k++) sum -= A[j * s + k] * B[k * K + q];
              B[j * K + q] = sum / A[j * s + j];
            }
          }
          for (j = 0; j < s; j++) for (q = 0; q < K; q++) c[mem[j] * K + q] = Math.max(0, B[j * K + q]);
        } else {   /* too big to solve directly: sweep inside the loop until it settles or the work limit is used */
          var edgesIn = 0; for (j = 0; j < s; j++) edgesIn += P.outStart[mem[j] + 1] - P.outStart[mem[j]];
          var perSweep = (edgesIn + s) * K, maxSw = Math.max(1, Math.floor(sweepLeft / perSweep)), dl = 1, sw;
          for (sw = 0; sw < maxSw && dl >= 1e-13; sw++) {
            dl = 0;
            for (j = 0; j < s; j++) {
              var u3 = mem[j];
              for (q = 0; q < K; q++) {
                var a3 = 0;
                for (k = P.outStart[u3]; k < P.outStart[u3 + 1]; k++) { e = P.outEdge[k]; if (p[e] > 0) a3 += p[e] * c[P.to[e] * K + q]; }
                dl += Math.abs(a3 - c[u3 * K + q]); c[u3 * K + q] = a3;
              }
            }
          }
          sweepLeft = Math.max(0, sweepLeft - sw * perSweep);
        }
      }
      /* the leftover: how much would one more sweep still change anything */
      var residual = 0;
      for (i = 0; i < ord.length; i++) {
        var v2 = ord[i], dd = 0;
        for (q = 0; q < K; q++) {
          var ac = 0;
          for (k = P.outStart[v2]; k < P.outStart[v2 + 1]; k++) { e = P.outEdge[k]; ac += p[e] * c[P.to[e] * K + q]; }
          dd += Math.abs(ac - c[v2 * K + q]);
        }
        if (dd > residual) residual = dd;
      }
      return { converged: residual < 1e-9, residual: residual };
    }
    /**
     * The end classes for any data. A story with good/bad marks gets good / bad / other. Everything else gets its busiest
     * ends (up to 8), one class each, and one class for all the rest. Returns { K, classOf, list: [{id, label, kind}] }.
     */
    function endClasses(P, imp, o) {
      var story = false, i;
      for (i = 0; i < P.n; i++) if (!outdeg(P, i) && (P.valence[i] === 1 || P.valence[i] === 2)) { story = true; break; }
      if (story) return { story: true, K: 3, classOf: function (v) { return P.valence[v] === 1 ? 0 : P.valence[v] === 2 ? 1 : 2; }, list: [{ id: null, label: 'good ends', kind: 'good' }, { id: null, label: 'bad ends', kind: 'bad' }, { id: null, label: 'other ends', kind: 'neutral' }] };
      var ends = [];
      for (i = 0; i < P.n; i++) if (!outdeg(P, i) && imp.depth[i] >= 0) ends.push(i);
      if (!ends.length) return { story: false, K: 1, classOf: function () { return 0; }, list: [{ id: null, label: 'no end', kind: 'neutral' }] };
      var mass = null;
      if (ends.length > 8) {
        var sw = new Float64Array(P.n), pp = new Float64Array(P.m), e;
        for (e = 0; e < P.m; e++) sw[P.from[e]] += P.w[e];
        for (e = 0; e < P.m; e++) pp[e] = P.w[e] / sw[P.from[e]];
        mass = spread(P, pp, seedsOf(P, o), o.cap || 400).visits;
        ends.sort(function (a, b) { return mass[b] - mass[a] || a - b; });
      } else ends.sort(function (a, b) { return a - b; });
      var top = ends.slice(0, 8), cls = new Map(), list = [];
      top.forEach(function (v, k) { cls.set(v, k); list.push({ id: P.nodes[v].id, label: P.nodes[v].label || P.nodes[v].id, kind: 'end' }); });
      var other = ends.length > 8;
      if (other) list.push({ id: null, label: ends.length - 8 + ' other ends', kind: 'other' });
      return { story: false, K: list.length, classOf: function (v) { return cls.has(v) ? cls.get(v) : other ? 8 : 0; }, list: list };
    }
    /** Seeded simulated players for the "first" (always the first arrow) and "curious" (prefers somewhere new) styles. */
    function flowSim(P, imp, o) {
      var runs = o.runs || 1000, mode = o.mode || 'random', cap = o.cap || 400, rnd = mulberry32(0x9e3779b9);
      var n = P.n, m = P.m, visits = new Float64Array(n), moves = new Float64Array(m), thr = new Float64Array(n * 3);
      var oc = { good: 0, bad: 0, neutral: 0, stuck: 0 }, seenAt = new Int32Array(n).fill(-1), seenCur = new Int32Array(n).fill(-1);
      if (P.start < 0) return { exact: false, runs: 0, visits: visits, moves: moves, pGood: thr.slice(0, n), pBad: thr.slice(0, n), pNeutral: thr.slice(0, n), outcome: oc, mode: mode };
      for (var r = 0; r < runs; r++) {
        var v = P.start, path = [v], step;
        seenCur[v] = r;
        var edgesTaken = [], kind = 3;
        for (step = 0; step < cap; step++) {
          var od = outdeg(P, v);
          if (!od) break;
          var pick;
          if (mode === 'first') pick = 0;
          else if (mode === 'curious') {
            var fresh = [];
            for (var q = 0; q < od; q++) if (seenCur[P.to[P.outEdge[P.outStart[v] + q]]] !== r) fresh.push(q);
            pick = fresh.length ? fresh[Math.floor(rnd() * fresh.length)] : Math.floor(rnd() * od);
          } else pick = Math.floor(rnd() * od);
          var e = P.outEdge[P.outStart[v] + pick];
          edgesTaken.push(e);
          v = P.to[e]; seenCur[v] = r;
          path.push(v);
        }
        kind = outdeg(P, v) ? 3 : P.valence[v] === 1 ? 0 : P.valence[v] === 2 ? 1 : 2;
        oc[kind === 0 ? 'good' : kind === 1 ? 'bad' : kind === 2 ? 'neutral' : 'stuck']++;
        for (var pi = 0; pi < path.length; pi++) {
          var u = path[pi];
          if (seenAt[u] !== r + runs) { seenAt[u] = r + runs; visits[u] += 1; thr[u * 3 + (kind === 3 ? 2 : kind)] += kind === 3 ? 0 : 1; }
        }
        for (var ei = 0; ei < edgesTaken.length; ei++) moves[edgesTaken[ei]] += 1;
      }
      var pg = new Float64Array(n), pb = new Float64Array(n), pn = new Float64Array(n);
      for (var i = 0; i < n; i++) {
        var tot = visits[i] || 1;
        pg[i] = thr[i * 3] / tot; pb[i] = thr[i * 3 + 1] / tot; pn[i] = thr[i * 3 + 2] / tot;
        visits[i] = visits[i] / runs;
      }
      for (var e2 = 0; e2 < m; e2++) moves[e2] /= runs;
      oc.good /= runs; oc.bad /= runs; oc.neutral /= runs; oc.stuck /= runs;
      return { exact: false, runs: runs, visits: visits, moves: moves, pGood: pg, pBad: pb, pNeutral: pn, outcome: oc, mode: mode };
    }

    /** The second line of a folded chapter or part box: its first page's name and the share of all routes that go through it ("under 1%" when small). */
    function chapterSub(n, pg) {
      var name = String(pg.label || pg.id); if (name.length > 26) name = name.slice(0, 25) + '…';
      var t = n.traffic, pct = !(t > 0) ? '' : t < 0.01 ? ' · under 1% of routes' : t > 0.995 ? ' · every route' : ' · ' + Math.round(t * 100) + '% of routes';
      return name + pct;
    }
    /**
     * Chapters and parts: pieces of a big story that can be drawn as one box each (for the Flow, Top-down, Spine and Lanes views).
     * A chapter is the set of pages that can only be reached through one gate (a choke page, or any page the start has to pass first)
     * and are not choke pages themselves. Gates with fewer than `min` pages behind them stay open; a gate with more than `cap` pages
     * behind it stays open and is looked into one level deeper. When the map is still big after that (more than `partsAbove` boxes),
     * stretches of the must-pass chain are grouped into parts of about `part` pages; both ends of a part stay visible as joints.
     * Needs the dominator tree (imp.idom); without it nothing is folded.
     * Returns { list: [{ key, kind, pages (sorted), folded }], of: { page number: [keys, outermost first] } }. Keys: 'c:' + first page's id
     * for a chapter, 'p:' + the id of the part's opening joint for a part. `c.open` maps keys to true for boxes shown open.
     */
    function findChapters(P, imp, c) {
      var n = P.n, i, list = [], res = { list: list, of: {} };
      if (!imp.idom || !imp.rpo) return res;
      var size = new Int32Array(n), kids = new Array(n), q, v;
      for (q = imp.rpo.length - 1; q >= 0; q--) {
        v = imp.rpo[q];
        if (imp.choke[v] || imp.depth[v] < 0) continue;
        size[v] += 1;
        var d = imp.idom[v];
        if (d >= 0 && d !== v && !imp.choke[d]) size[d] += size[v];
        if (d >= 0 && d !== v) (kids[d] || (kids[d] = [])).push(v);
      }
      var min = c.min || 8, cap = c.cap || Math.max(60, Math.ceil(n / 12)), open = c.open || {};
      var subtree = function (roots) {
        var pages = [];
        roots.forEach(function (r) { var st = [r]; while (st.length) { var x = st.pop(); pages.push(x); var k = kids[x]; if (k) for (var j = 0; j < k.length; j++) if (!imp.choke[k[j]]) st.push(k[j]); } });
        return pages.sort(function (a, b) { return a - b; });
      };
      var chapters = [];
      var take = function (roots) { var pages = subtree(roots); chapters.push({ key: 'c:' + P.nodes[pages[0]].id, kind: 'chapter', pages: pages }); };
      var visit = function (gate) {
        var ks = (kids[gate] || []).filter(function (k) { return !imp.choke[k]; }), total = 0, j;
        if (!ks.length) return;
        for (j = 0; j < ks.length; j++) total += size[ks[j]];
        if (total < min) return;
        if (total <= cap && ks.every(function (k) { return size[k] <= cap; })) { take(ks); return; }
        ks.forEach(function (k) { if (size[k] <= cap) { if (size[k] >= min) take([k]); } else visit(k); });
      };
      for (q = 0; q < imp.rpo.length; q++) { v = imp.rpo[q]; if (imp.choke[v] && imp.depth[v] >= 0) visit(v); }
      var parts = [], hidden = 0;
      chapters.forEach(function (ch) { hidden += ch.pages.length; });
      if (c.partsAbove && n - hidden > c.partsAbove) {
        var chain = imp.spine.filter(function (x) { return x !== P.start; }), target = c.part || Math.max(80, Math.ceil(n / 40));
        var own = new Int32Array(n).fill(-1), spineAt = new Int32Array(n).fill(-1);
        imp.spine.forEach(function (x, si) { spineAt[x] = si; });
        imp.spine.forEach(function (x, si) { own[x] = si; });
        imp.rpo.forEach(function (x) { if (x === P.start || imp.depth[x] < 0) return; var dd = imp.idom[x]; if (imp.choke[x]) return; if (dd >= 0) own[x] = spineAt[dd] >= 0 ? spineAt[dd] : own[dd]; });
        var byStretch = new Array(imp.spine.length); for (i = 0; i < imp.spine.length; i++) byStretch[i] = [];
        for (i = 0; i < n; i++) if (own[i] >= 0 && i !== P.start && imp.depth[i] >= 0) byStretch[own[i]].push(i);
        /* stretch si = the choke page spine[si] (a joint, not folded) and everything it alone leads to, up to the next choke page */
        var si0 = 0, acc = [], from = 0;
        var close = function (upTo) {
          if (acc.length >= min && upTo > from) parts.push({ key: 'p:' + P.nodes[imp.spine[from]].id, kind: 'part', pages: acc.sort(function (a, b) { return a - b; }) });
          acc = []; from = upTo;
        };
        for (si0 = 0; si0 < imp.spine.length; si0++) {
          if (si0 > from) acc.push(imp.spine[si0]);
          byStretch[si0].forEach(function (pg) { if (!imp.choke[pg]) acc.push(pg); });
          if (acc.length >= target && si0 + 1 < imp.spine.length) close(si0 + 1);
        }
        /* the last stretch (everything after the last joint) is left open: it is where the story ends */
        acc = [];
      }
      parts.forEach(function (pt) { list.push(pt); });
      chapters.forEach(function (ch) { list.push(ch); });
      /* which keys cover each page (outermost first), and which boxes are folded now */
      var partOf = new Map();
      parts.forEach(function (pt) { pt.pages.forEach(function (pg) { partOf.set(pg, pt); }); });
      list.forEach(function (box) {
        box.folded = !open[box.key];
        if (box.kind !== 'chapter') return;
        var pt = partOf.get(box.pages[0]);
        var inside = box.pages.filter(function (pg) { return partOf.has(pg); }).length;
        if (pt && inside === box.pages.length && box.pages.every(function (pg) { return partOf.get(pg) === pt; })) { box.inPart = pt.key; if (!open[pt.key]) box.folded = false; }
        else if (inside) box.folded = false;   /* a chapter that straddles the edge of a part is not drawn as a chapter at all */
      });
      list.forEach(function (box) { box.pages.forEach(function (pg) { var arr = res.of[pg] || (res.of[pg] = []); if (box.kind === 'part') arr.unshift(box.key); else arr.push(box.key); }); });
      return res;
    }

    /* ---------------------------------------------------------------- 4. what to draw: runs folded, arrows merged */
    function mapGraph(P, imp, opts) {
      opts = opts || {};
      var n = P.n, i, k, e;
      var onlyNext = new Int32Array(n).fill(-1), onlyPrev = new Int32Array(n).fill(-1);
      for (i = 0; i < n; i++) {
        var first = -1, one = true;
        for (k = P.outStart[i]; k < P.outStart[i + 1]; k++) { var w = P.to[P.outEdge[k]]; if (first < 0) first = w; else if (w !== first) { one = false; break; } }
        if (one && first >= 0) onlyNext[i] = first;
        var f2 = -1, one2 = true;
        for (k = P.inStart[i]; k < P.inStart[i + 1]; k++) { var u = P.from[P.inEdge[k]]; if (f2 < 0) f2 = u; else if (u !== f2) { one2 = false; break; } }
        if (one2 && f2 >= 0) onlyPrev[i] = f2;
      }
      var chainNext = function (u) {
        var v = onlyNext[u];
        if (v < 0 || v === u || v === P.start || !outdeg(P, v) || !outdeg(P, u) || P.valence[v]) return -1;
        return onlyPrev[v] === u ? v : -1;
      };
      var hasPrev = new Uint8Array(n);
      for (i = 0; i < n; i++) { var cn = chainNext(i); if (cn >= 0) hasPrev[cn] = 1; }
      var runs = [], inRun = new Int32Array(n).fill(-1);   /* inRun[v] = the run (by start item) that already took v, so a long run is never searched item by item */
      for (i = 0; i < n; i++) {
        if (hasPrev[i] || i === P.start || imp.depth[i] < 0) continue;
        var run = [i], v2 = chainNext(i); inRun[i] = i;
        while (v2 >= 0 && inRun[v2] !== i && run.length < 100000) { inRun[v2] = i; run.push(v2); v2 = chainNext(v2); }
        if (run.length >= 2) runs.push(run);
      }
      var runOf = new Int32Array(n).fill(-1);
      var chOf = new Int32Array(n).fill(-1), found = opts.chapters ? findChapters(P, imp, opts.chapters) : null;
      var chapters = found ? found.list.filter(function (ch) { return ch.folded; }) : [];
      chapters.forEach(function (ch, ci) { ch.pages.forEach(function (id) { chOf[id] = ci; }); });
      if (opts.fold) runs.forEach(function (run, ri) { if (!(opts.open && opts.open[run[0]]) && !run.some(function (id) { return chOf[id] >= 0; })) run.forEach(function (id) { runOf[id] = ri; }); });
      var nodes = [], groupOf = new Array(n);
      for (i = 0; i < n; i++) {
        var ri2 = runOf[i], ci2 = chOf[i];
        if (ci2 >= 0 && chapters[ci2].pages[0] !== i) continue;
        if (ri2 >= 0 && runs[ri2][0] !== i) continue;
        var node = ci2 >= 0 ? { id: 'ch:' + i, pages: chapters[ci2].pages.slice(), run: false, chapter: true, chKey: chapters[ci2].key, part: chapters[ci2].kind === 'part' } : ri2 >= 0 ? { id: 'run:' + i, pages: runs[ri2].slice(), run: true } : { id: 'n' + i, pages: [i], run: false };
        node.pages.forEach(function (pg) { groupOf[pg] = node.id; });
        nodes.push(node);
      }
      var edges = [], seen = new Map();
      for (e = 0; e < P.m; e++) {
        var a = groupOf[P.from[e]], b = groupOf[P.to[e]];
        if (a === b && P.from[e] !== P.to[e]) continue;
        var key = a + '>' + b;
        if ((opts.merge || (opts.mergeIfFolded && chapters.length)) && seen.has(key)) { seen.get(key).srcs.push(e); continue; }
        var ed = { from: a, to: b, srcs: [e] };
        seen.set(key, ed);
        edges.push(ed);
      }
      return { nodes: nodes, edges: edges, groupOf: groupOf, runs: runs, imp: imp, chapters: chapters, chapterInfo: found };
    }

    /* ---------------------------------------------------------------- 5. the layered engine (Sugiyama-style): the shared module netflow-layers (vendor/netflow-layers.js) */
    var NL = null;   // the layered-drawing add-on (netflow-layers): found on first use, or handed over with use('layers', impl)
    function layersOf() {
      if (NL) return NL;
      if (typeof NetflowLayers !== 'undefined') NL = NetflowLayers;
      else if (REQ) { try { NL = REQ('../netflow-layers/netflow-layers.js'); } catch (e) { NL = null; } }
      if (!NL) throw new Error('netflow-engine: the layered views need netflow-layers 1.2.0 or newer (load it first, or call NetflowEngine.use("layers", NetflowLayers))');
      return NL;
    }
    function mapPlaceLine() { return layersOf().mapPlaceLine.apply(null, arguments); }
    function mapCrossPairs() { return layersOf().mapCrossPairs.apply(null, arguments); }
    function layered() { return layersOf().layered.apply(null, arguments); }

    /* ---------------------------------------------------------------- 6. the other views */
    function arcLayout(G, base) {
      var nodes = G.nodes.slice().sort(function (a, b) { return a.layer - b.layer || (base.order[a.id] || 0) - (base.order[b.id] || 0); });
      var step = 34, pad = 40, maxSpan = 1, pos = {};
      nodes.forEach(function (n, i) { n.ai = i; pos[n.id] = n; });
      G.edges.forEach(function (e) { maxSpan = Math.max(maxSpan, Math.abs(pos[e.to].ai - pos[e.from].ai)); });
      var lift = Math.min((maxSpan * step) / 2, 520), y0 = pad + lift;
      nodes.forEach(function (n) { n.cx = pad + n.ai * step; n.cy = y0; });
      return { kind: 'arc', dir: 'LR', nodes: nodes, edges: G.edges, pos: pos, baseline: y0, width: pad * 2 + nodes.length * step, height: y0 + 190 };
    }
    function matrixLayout(G, base) {
      var nodes = G.nodes.slice().sort(function (a, b) { return a.layer - b.layer || (base.order[a.id] || 0) - (base.order[b.id] || 0); });
      var pos = {};
      nodes.forEach(function (n, i) { n.mi = i; pos[n.id] = n; });
      var cell = 18, head = 150;
      return { kind: 'matrix', dir: 'LR', nodes: nodes, edges: G.edges, pos: pos, cell: cell, head: head, width: head + nodes.length * cell + 150, height: head + nodes.length * cell + 30 };
    }
    /** Story shape: the stretches between choke points, each named by its pattern. */
    function shapeLayout(P, G) {
      var imp = G.imp, spine = imp.spine.slice(), n = P.n, i;
      var owner = new Int32Array(n).fill(-1);
      /* The stretch an item belongs to is the nearest choke point that every route to it passes: its closest spine ancestor in the dominator tree (no search per choke point). */
      var isSpine = new Uint8Array(n), spineAt = new Int32Array(n).fill(-1);
      spine.forEach(function (c, si) { isSpine[c] = 1; spineAt[c] = si; });
      if (imp.idom) imp.rpo.forEach(function (v) {
        if (v === P.start) return;
        var d = imp.idom[v];
        if (d >= 0) owner[v] = spineAt[d] >= 0 ? spineAt[d] : owner[d];
      });
      spine.forEach(function (c, si) { owner[c] = si; });
      var segs = spine.map(function (c, si) { return { i: si, from: c, to: spine[si + 1] !== undefined ? spine[si + 1] : -1, pages: [], endings: { good: 0, bad: 0, neutral: 0 } }; });
      for (i = 0; i < n; i++) {
        if (imp.depth[i] < 0 || isSpine[i]) continue;
        var s = segs[owner[i] >= 0 ? owner[i] : 0];
        if (!s) continue;
        s.pages.push(i);
        if (!outdeg(P, i)) s.endings[P.valence[i] === 1 ? 'good' : P.valence[i] === 2 ? 'bad' : 'neutral']++;
      }
      /* a stretch has a loop when one of its links goes back (or sideways) in depth without leaving it: every item sits in one stretch, so one pass over the links finds them all */
      var segOf = new Int32Array(n).fill(-1);
      segs.forEach(function (sg, si) { segOf[sg.from] = si; sg.pages.forEach(function (pi) { segOf[pi] = si; }); });
      for (var e0 = 0; e0 < P.m; e0++) {
        var a0 = P.from[e0], b0 = P.to[e0], sa = segOf[a0];
        if (sa >= 0 && sa === segOf[b0] && imp.depth[b0] <= imp.depth[a0] && b0 !== segs[sa].to) segs[sa].loops = true;
      }
      segs.forEach(function (s) {
        var inside = new Set(s.pages.concat([s.from])), end = s.to, memo = new Map(), onPath = new Set();
        /* routes from this choke point to the next, loops ignored; iterative, counts kept as plain numbers capped at 1e15 */
        var count = function (root) {
          var stack = [[root, 0]], result = 0;
          var local = new Map();
          onPath.clear();
          onPath.add(root);
          var acc = new Map([[root, 0]]);
          while (stack.length) {
            var top = stack[stack.length - 1], v = top[0], lo = P.outStart[v], hi = P.outStart[v + 1];
            if (top[1] < hi - lo) {
              var w = P.to[P.outEdge[lo + top[1]++]];
              if (w === end) { acc.set(v, Math.min(1e15, acc.get(v) + 1)); continue; }
              if (!(inside.has(w) && w !== s.from)) continue;
              if (local.has(w)) { acc.set(v, Math.min(1e15, acc.get(v) + local.get(w))); continue; }
              if (onPath.has(w)) continue;
              onPath.add(w); acc.set(w, 0); stack.push([w, 0]);
            } else {
              stack.pop(); onPath.delete(v); local.set(v, acc.get(v));
              if (stack.length) { var pv = stack[stack.length - 1][0]; acc.set(pv, Math.min(1e15, acc.get(pv) + acc.get(v))); }
              else result = acc.get(v);
            }
          }
          return result;
        };
        s.routes = end >= 0 ? count(s.from) : 0;
        var loops = s.loops === true;
        s.loops = loops;
        var ends = s.endings.good + s.endings.bad + s.endings.neutral;
        var rest = s.pages.filter(function (id) { return outdeg(P, id) > 0; }).length;
        s.pattern = end < 0 ? (ends ? 'The finale' : 'Still open') : !rest ? 'Straight on' : s.routes <= 1 ? 'A straight road' : 'Branch and rejoin';
        if (end >= 0 && ends) s.pattern += ', with ' + ends + ' end' + (ends === 1 ? '' : 's') + ' off it';
        if (loops) s.pattern += ', with a loop';
        s.pages = s.pages.map(function (id) { return id; });
      });
      return { kind: 'shape', segs: segs, spine: spine, width: 0, height: 0 };
    }

    /* ---------------------------------------------------------------- 7. network layout (stress SGD) */
    /* ---- arrangements for the network view: force (Barnes-Hut), circle, rings, groups, radial tree, grid, and three 3D ones ---- */
    /** Push overlapping circles apart (grid buckets, a few passes). X has `dim` numbers per item; only the first two count. */
    /** Same job as separate, for a few big things (every pair is checked, so large radii work). */
    function separateBig(X, k, dim, rad, passes) {
      for (var pass = 0; pass < (passes || 60); pass++) {
        var moved = false;
        for (var i = 0; i < k; i++) for (var o = i + 1; o < k; o++) {
          var dx = X[o * dim] - X[i * dim], dy = X[o * dim + 1] - X[i * dim + 1], dd = Math.sqrt(dx * dx + dy * dy) || 0.01, need = rad(i) + rad(o);
          if (dd < need) { var push = (need - dd) / 2 + 0.5, ux = dx / dd || 1, uy = dy / dd; X[i * dim] -= ux * push; X[i * dim + 1] -= uy * push; X[o * dim] += ux * push; X[o * dim + 1] += uy * push; moved = true; }
        }
        if (!moved) break;
      }
    }
    /** Pushes the group circles of the "Group clusters" arrangement apart. Every pair is checked only while there are few groups (as before); thousands of groups use the grid, which stays fast. */
    function separateGroups(X, k, rad) {
      if (k <= 600) separateBig(X, k, 2, rad, 200); else clearOverlaps(X, k, 2, rad, 60, 4, 1.1);
    }
    /** separate's passes in WebAssembly. Returns 0 (settled) or 1 (still moving), or -(pass+1) when the grid grew over 4,000,000 cells at that pass (X is as the earlier passes left it). X is written only at the end. */
    function separateWasm(mod, X, k, rads, rmax, passes) {
      var ex = new WebAssembly.Instance(mod, {}).exports, mem = ex.memory, n = X.length, startCap = Math.min(4000004, Math.max(65536, 8 * k)), done = 0, r, ptr;
      for (;;) {
        ptr = wasmLayout(ex, [n * 8, k * 8, k * 4, k * 4, startCap * 4]);
        if (done === 0) { new Float64Array(mem.buffer, ptr[0], n).set(X); new Float64Array(mem.buffer, ptr[1], k).set(rads); }
        r = ex.separate(ptr[0], k, ptr[1], rmax, passes - done, ptr[2], ptr[3], ptr[4], startCap);
        if (r > -100000) break;
        done += -r - 100000; startCap = 4000004;   // the start table was too small for this pass: the biggest allowed grid always fits
      }
      X.set(new Float64Array(mem.buffer, ptr[0], n));
      return r >= 0 ? r : -(done - r);   // a sparse hand-over reports the pass counted from the first call
    }
    function separate(X, k, dim, rad, passes) {
      var rads = new Float64Array(k), cellOf = new Int32Array(k), sorted = new Int32Array(k), start = null, i, o, pass, rmax = 0;
      for (i = 0; i < k; i++) { rads[i] = rad(i); if (rads[i] > rmax) rmax = rads[i]; }
      var wm = dim === 2 && STRESS_WASM.on && k >= STRESS_WASM.minItems ? wasmLoad(STRESS_WASM) : null;
      if (wm) {   // the WebAssembly build of the passes below (wasm/stress.c): the same positions to the last digit; any trouble falls through to JavaScript with X untouched
        try {
          var wr = separateWasm(wm, X, k, rads, rmax, passes || 30);
          STRESS_WASM.sepCalls++;
          if (wr >= 0) return !!wr;
          return separateSparse(X, k, dim, rad, (passes || 30) - (-wr - 1));   // the grid got too big, as in the JavaScript: the rest of the passes use the sparse version
        } catch (err) { STRESS_WASM.error = String(err && err.message || err); }
      }
      var cell = Math.max(2 * rmax, 20);   // a cell as wide as the longest reach of two touching items: only the 3 x 3 cells around an item matter
      for (pass = 0; pass < (passes || 30); pass++) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (i = 0; i < k; i++) { var px = X[i * dim], py = X[i * dim + 1]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
        var GW = Math.floor((x1 - x0) / cell) + 3, GH = Math.floor((y1 - y0) / cell) + 3;
        if (!(GW * GH <= 4000000)) { return separateSparse(X, k, dim, rad, (passes || 30) - pass); }
        if (!start || start.length < GW * GH + 1) start = new Int32Array(GW * GH + 1); else start.fill(0, 0, GW * GH + 1);
        // counting sort of the items into grid cells: items of one cell sit next to each other in `sorted`
        for (i = 0; i < k; i++) { var c = (Math.floor((X[i * dim + 1] - y0) / cell) + 1) * GW + Math.floor((X[i * dim] - x0) / cell) + 1; cellOf[i] = c; start[c + 1]++; }
        for (c = 0; c < GW * GH; c++) start[c + 1] += start[c];
        for (i = 0; i < k; i++) sorted[start[cellOf[i]]++] = i;
        for (c = GW * GH; c > 0; c--) start[c] = start[c - 1];
        start[0] = 0;
        var moved = false;
        for (i = 0; i < k; i++) {
          var ci = cellOf[i], ra = rads[i];
          for (var row = -1; row <= 1; row++) {
            var from = start[ci + row * GW - 1], to = start[ci + row * GW + 2];   // three neighboring cells in a row are one slice
            for (var q = from; q < to; q++) {
              o = sorted[q];
              if (o <= i) continue;
              var dx = X[o * dim] - X[i * dim], dy = X[o * dim + 1] - X[i * dim + 1], dd = Math.sqrt(dx * dx + dy * dy) || 0.01, need = ra + rads[o];
              if (dd < need) { var push = (need - dd) / 2, ux = dx / dd || 1, uy = dy / dd; X[i * dim] -= ux * push; X[i * dim + 1] -= uy * push; X[o * dim] += ux * push; X[o * dim + 1] += uy * push; moved = true; }
            }
          }
        }
        if (!moved) break;
      }
      return !!moved;   // true when the last pass still had to move something
    }
    /** How many touching pairs there are for every item (a grid with cells as wide as the longest reach of two items, 2D). */
    function overlapsPerItem(X, k, rad) {
      var rads = new Float64Array(k), rmax = 0, i, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (i = 0; i < k; i++) { rads[i] = rad(i); if (rads[i] > rmax) rmax = rads[i]; if (X[2 * i] < x0) x0 = X[2 * i]; if (X[2 * i] > x1) x1 = X[2 * i]; if (X[2 * i + 1] < y0) y0 = X[2 * i + 1]; if (X[2 * i + 1] > y1) y1 = X[2 * i + 1]; }
      var cell = Math.max(2 * rmax, 20), GW = Math.floor((x1 - x0) / cell) + 3, GH = Math.floor((y1 - y0) / cell) + 3;
      if (!(GW * GH <= 4000000)) return 0;
      var start = new Int32Array(GW * GH + 2), cellOf = new Int32Array(k), sorted = new Int32Array(k), c, n = 0, o, q;
      for (i = 0; i < k; i++) { c = (Math.floor((X[2 * i + 1] - y0) / cell) + 1) * GW + Math.floor((X[2 * i] - x0) / cell) + 1; cellOf[i] = c; start[c + 1]++; }
      for (c = 0; c < GW * GH; c++) start[c + 1] += start[c];
      for (i = 0; i < k; i++) sorted[start[cellOf[i]]++] = i;
      for (c = GW * GH; c > 0; c--) start[c] = start[c - 1];
      start[0] = 0;
      for (i = 0; i < k; i++) {
        var ci = cellOf[i];
        for (var row = -1; row <= 1; row++) {
          var from = start[ci + row * GW - 1], to = start[ci + row * GW + 2];
          for (q = from; q < to; q++) {
            o = sorted[q]; if (o <= i) continue;
            var dx = X[2 * o] - X[2 * i], dy = X[2 * o + 1] - X[2 * i + 1], need = rads[i] + rads[o];
            if (dx * dx + dy * dy < need * need) n++;
          }
        }
      }
      return n / k;
    }
    /**
     * Overlap removal that cannot end with touching items. Push-apart passes first; if some pairs still touch, the whole picture is
     * stretched a little (the truth score ignores the overall scale, so this costs nothing in truth, only page area) and the passes run
     * again; the few that remain are placed by settleOverlaps. `margin` is the gap kept between items.
     */
    function clearOverlaps(X, k, dim, rad, passes, rounds, grow) {
      var i, r, dirty = separate(X, k, dim, rad, passes);
      if (dirty && dim === 2 && k >= STRESS.jumpMin) {   // very crowded (about 2 or more touching pairs per item): one bigger stretch first instead of ten small ones; it stays well under what the small ones would reach
        var ov = overlapsPerItem(X, k, rad);
        if (ov > 2) {
          var jump = Math.min(STRESS.jumpMax, 1 + STRESS.jumpPer * ov), cx0 = 0, cy0 = 0;
          for (i = 0; i < k; i++) { cx0 += X[i * 2]; cy0 += X[i * 2 + 1]; }
          cx0 /= k; cy0 /= k;
          for (i = 0; i < k; i++) { X[i * 2] = cx0 + (X[i * 2] - cx0) * jump; X[i * 2 + 1] = cy0 + (X[i * 2 + 1] - cy0) * jump; }
          dirty = separate(X, k, dim, rad, Math.max(6, passes >> 1));
        }
      }
      for (r = 0; r < rounds && dirty; r++) {
        var cx = 0, cy = 0;
        for (i = 0; i < k; i++) { cx += X[i * dim]; cy += X[i * dim + 1]; }
        cx /= k; cy /= k;
        for (i = 0; i < k; i++) { X[i * dim] = cx + (X[i * dim] - cx) * grow; X[i * dim + 1] = cy + (X[i * dim + 1] - cy) * grow; }
        dirty = separate(X, k, dim, rad, Math.max(6, passes >> 1));
      }
    }

    /**
     * The last word on overlaps. The push-apart passes above get close but, in crowded cores, can stop with a few touching items. This walks
     * the items once; an item that touches another is lifted out and put at the nearest free place on an outward spiral. A moved item only
     * lands where nothing is, so when the walk ends nothing touches anything (by construction, not by hope). `rad(i)` is the item's radius.
     */
    function settleOverlaps(X, k, dim, rad) {
      var rads = new Float64Array(k), rmax = 1, i, j, c;
      for (i = 0; i < k; i++) { rads[i] = rad(i); if (rads[i] > rmax) rmax = rads[i]; }
      var cell = 2 * rmax + 1, tsize = 16; while (tsize < 2 * k) tsize <<= 1;
      var mask = tsize - 1, head = new Int32Array(tsize).fill(-1), next = new Int32Array(k).fill(-1), bucket = new Int32Array(k);
      var hashOf = function (cx, cy) { return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & mask; };
      var link = function (a) { var b = hashOf(Math.floor(X[a * dim] / cell), Math.floor(X[a * dim + 1] / cell)); bucket[a] = b; next[a] = head[b]; head[b] = a; };
      var unlink = function (a) { var b = bucket[a], o = head[b], prev = -1; while (o !== a && o >= 0) { prev = o; o = next[o]; } if (o === a) { if (prev < 0) head[b] = next[a]; else next[prev] = next[a]; } };
      var clash = function (a, x, y, ra) {   // does a disc of radius ra at (x, y) touch any item other than a?
        var cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        for (var gx = cx - 1; gx <= cx + 1; gx++) for (var gy = cy - 1; gy <= cy + 1; gy++) {
          for (var o = head[hashOf(gx, gy)]; o >= 0; o = next[o]) {
            if (o === a) continue;
            var dx = X[o * dim] - x, dy = X[o * dim + 1] - y, need = ra + rads[o];
            if (dx * dx + dy * dy < need * need) return true;
          }
        }
        return false;
      };
      for (i = 0; i < k; i++) link(i);
      var maxX = -Infinity, far = 0;
      for (i = 0; i < k; i++) if (X[i * dim] > maxX) maxX = X[i * dim];
      for (i = 0; i < k; i++) {
        var ra = rads[i], x0 = X[i * dim], y0 = X[i * dim + 1];
        if (!clash(i, x0, y0, ra)) continue;
        unlink(i);
        var placed = false, step = Math.max(2, ra * 0.6);
        for (c = 1; c < 6000; c++) {
          var rho = step * Math.sqrt(c), th = c * 2.399963, nx = x0 + rho * Math.cos(th), ny = y0 + rho * Math.sin(th);
          if (!clash(i, nx, ny, ra)) { X[i * dim] = nx; X[i * dim + 1] = ny; placed = true; break; }
        }
        if (!placed) { far++; X[i * dim] = maxX + cell * far; X[i * dim + 1] = y0; }
        link(i);
      }
    }

    function separateSparse(X, k, dim, rad, passes) {   // the same job on a hash grid, for pictures too spread out for a plain grid
      var cell = 90, next = new Int32Array(k), head = new Map(), rads = new Float64Array(k), i;
      for (i = 0; i < k; i++) rads[i] = rad(i);
      for (var pass = 0; pass < (passes || 30); pass++) {
        head.clear(); var moved = false;
        for (i = 0; i < k; i++) { var key = (Math.floor(X[i * dim] / cell) + 4096) * 8192 + Math.floor(X[i * dim + 1] / cell) + 4096; var h0 = head.get(key); next[i] = h0 === undefined ? -1 : h0; head.set(key, i); }
        for (i = 0; i < k; i++) {
          var cx = Math.floor(X[i * dim] / cell) + 4096, cy = Math.floor(X[i * dim + 1] / cell) + 4096, ra = rads[i];
          for (var gx = cx - 1; gx <= cx + 1; gx++) for (var gy = cy - 1; gy <= cy + 1; gy++) {
            var o = head.get(gx * 8192 + gy); if (o === undefined) continue;
            for (; o >= 0; o = next[o]) {
              if (o <= i) continue;
              var dx = X[o * dim] - X[i * dim], dy = X[o * dim + 1] - X[i * dim + 1], dd = Math.sqrt(dx * dx + dy * dy) || 0.01, need = ra + rads[o];
              if (dd < need) { var push = (need - dd) / 2, ux = dx / dd || 1, uy = dy / dd; X[i * dim] -= ux * push; X[i * dim + 1] -= uy * push; X[o * dim] += ux * push; X[o * dim + 1] += uy * push; moved = true; }
            }
          }
        }
        if (!moved) break;
      }
      return !!moved;
    }
    /**
     * Force-directed placement with Barnes-Hut repulsion (quadtree in 2D, octree in 3D). Edges pull like springs, every item pushes
     * every other, heavier (better connected) items push harder, a weak gravity keeps pieces together. X is changed in place.
     * pairs: flat [a, b, a, b, ...]. dim: 2 or 3. hiT, loT: starting and ending step size in units of K (default 2 and 0.02; a gentle clean-up uses less).
     */
    function forceSim(X, k, dim, pairs, mass, iters, K, rnd, hiT, loT) {
      var i, msum = 0;
      for (i = 0; i < k; i++) msum += mass[i];
      var mnorm = msum > 0 ? k / msum : 1; for (i = 0; i < k; i++) mass[i] *= mnorm;
      var wm = FORCE_WASM.on && k >= FORCE_WASM.minItems ? forceModule() : null;
      if (wm) {   // the WebAssembly build of the same rounds (wasm/force.c): same positions to the last digit, about twice as fast; any trouble falls through to the JavaScript below
        try { forceSimWasm(wm, X, k, dim, pairs, mass, iters, K, rnd, hiT, loT); FORCE_WASM.calls++; return; } catch (err) { FORCE_WASM.error = String(err && err.message || err); }
      }
      forceSimJs(X, k, dim, pairs, mass, iters, K, rnd, hiT, loT);
    }
    /* The Force rounds in WebAssembly. Source: wasm/force.c; build: sh wasm/build.sh; embed: python3 wasm/embed.py (puts the bytes between the markers below). The page may carry no
     * WebAssembly rule at all (this page has none); if it does, only 'wasm-unsafe-eval' is needed. `on = false` turns it off, `used()` says whether it ran. */
    var FORCE_WASM = { b64: /*WASM:force:BEGIN*/'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'/*WASM:force:END*/, mod: null, tried: false, on: true, minItems: 150, calls: 0, error: '', rnd: null };
    /* The stress layout's pair building, shuffle and sweeps, and the overlap push-apart, in WebAssembly (wasm/stress.c, same rules as the Force module above). Pairs are kept as a Uint16 hop code
     * (10 bytes a pair instead of 16, the same numbers). `on = false` turns it off; `calls` and `sepCalls` count the runs; `error` says why the last try stayed on JavaScript. */
    var STRESS_WASM = { b64: /*WASM:stress:BEGIN*/'AGFzbQEAAAABOARgEn9/f39/f39/f39/f39/f39/fwF/YAV/f39/fwBgCX9/f39/f39/fwBgCX9/f3x/f39/fwF/AwUEAAECAwQFAXABAQEFBgEBEICAAgYPAn8BQYDIAAt/AEGAyAALBz4GBm1lbW9yeQIABWJ1aWxkAAAHc2h1ZmZsZQABBnN3ZWVwcwACCHNlcGFyYXRlAAMLX19oZWFwX2Jhc2UDAQrEKgTBEgEMfwJAAkACQAJAAkAgB0UNAEEBIRICQCAAQQFIDQBBACETAkAgAEEESQ0AIABB/P///wdxIhMhFCAOIQcDQCAH/QwAypo7AMqaOwDKmjsAypo7/QsCACAHQRBqIQcgFEF8aiIUDQALIBMgAEYNAQsgACATayEUIA4gE0ECdGohBwNAIAdBgJTr3AM2AgAgB0EEaiEHIBRBf2oiFA0ACwsgCEEBTg0BQQAhFQwCC0EBIRICQCAAQQFODQBBACEWDAMLIAxBBGohCiAAQfz///8HcSEXQQAhGEEBIRJBACEWA0AgGCEVQQAhBwJAAkAgAEEESQ0AIBchFCAMIQcDQCAH/Qz//////////////////////QsCACAHQRBqIQcgFEF8aiIUDQALIBchByAXIABGDQELIAAgB2shFCAMIAdBAnRqIQcDQCAHQX82AgAgB0EEaiEHIBRBf2oiFA0ACwtBACEZIAwgFUECdGpBADYCACANIBU2AgBBASEUA0ACQCABIA0gGUECdGooAgBBAnQiE2oiB0EEaigCACILIAcoAgAiB0wNACAMIBNqKAIAQQFqIRogB0EBaiETAkAgCyAHa0EBcUUNAAJAIAwgAiAHQQJ0aigCACIHQQJ0aiIYKAIAQX9KDQAgGCAaNgIAIA0gFEECdGogBzYCACAUQQFqIRQLIBMhBwsgCyATRg0AIAsgB2shCyACIAdBAnRqIQcDQAJAIAwgBygCACITQQJ0aiIYKAIAQX9KDQAgGCAaNgIAIA0gFEECdGogEzYCACAUQQFqIRQLAkAgDCAHQQRqKAIAIhNBAnRqIhgoAgBBf0oNACAYIBo2AgAgDSAUQQJ0aiATNgIAIBRBAWohFAsgB0EIaiEHIAtBfmoiCw0ACwsgGUEBaiIZIBRIDQALAkAgFUEBaiIYIABODQAgCiEUIBghCwNAAkAgFCgCACIHQQFIDQACQCAWIAZIDQBBfw8LAkAgB0H/A00NAEF+DwsgAyAWQQJ0IhNqIBU2AgAgBSAWQQF0aiAHOwEAIAQgE2ogCzYCACASIAcgEiAHShshEiAWQQFqIRYLIBRBBGohFCAAIAtBAWoiC0cNAAsLIApBBGohCiAYIABGDQMMAAsLIABB/P///wdxIRtBACEcIAtBAEdBCXQhF0EBIR1BASESQQAhFQNAAkAgAEEBSCIWDQBBACEHAkAgAEEESQ0AIBshFCAMIQcDQCAH/Qz//////////////////////QsCACAHQRBqIQcgFEF8aiIUDQALIBshByAbIABGDQELIAAgB2shFCAMIAdBAnRqIQcDQCAHQX82AgAgB0EEaiEHIBRBf2oiFA0ACwtBACEZIAwgCkECdGpBADYCACANIAo2AgBBASEUA0ACQCABIA0gGUECdGooAgBBAnQiE2oiB0EEaigCACILIAcoAgAiB0wNACAMIBNqKAIAQQFqIRogB0EBaiETAkAgCyAHa0EBcUUNAAJAIAwgAiAHQQJ0aigCACIHQQJ0aiIYKAIAQX9KDQAgGCAaNgIAIA0gFEECdGogBzYCACAUQQFqIRQLIBMhBwsgCyATRg0AIAsgB2shCyACIAdBAnRqIQcDQAJAIAwgBygCACITQQJ0aiIYKAIAQX9KDQAgGCAaNgIAIA0gFEECdGogEzYCACAUQQFqIRQLAkAgDCAHQQRqKAIAIhNBAnRqIhgoAgBBf0oNACAYIBo2AgAgDSAUQQJ0aiATNgIAIBRBAWohFAsgB0EIaiEHIAtBfmoiCw0ACwsgGUEBaiIZIBRIDQALAkACQAJAIBZFDQBBfyEZDAELQX8hGkEAIRQgDCEYIA4hC0F/IRkDQAJAIBgoAgAiByALKAIAIhNODQAgCyAHNgIAIAchEwsCQCAKIBRGDQAgB0EBSA0AAkAgFSAGSA0AQX8hFgwECwJAIAdB/wNNDQBBfiEWDAQLIAMgFUECdCIWaiAKNgIAIAUgFUEBdGogByAXcjsBACAEIBZqIBQ2AgAgEiAHIBIgB0obIRIgFUEBaiEVCyATIBogEyAaSiIHGyEaIBQgGSAHGyEZIBhBBGohGCALQQRqIQsgACAUQQFqIhRHDQALCyAcQQFqIhwgCEghHSAZIQogHCAIRw0BCwsgHUEBcQ0CCwJAIABBAU4NACAVIRYMAQsgASgCACEUQQAhGgNAAkAgFCIMIAEgGiILQQFqIhpBAnRqIhgoAgAiFE4NACACIAxBAnRqIQcDQAJAIAcoAgAiEyALTA0AAkAgFSAGSA0AQX8PCyADIBVBAnQiFGogCzYCACAEIBRqIBM2AgAgBSAVQQF0akEBOwEAIBJBASASQQFKGyESIBVBAWohFSAYKAIAIRQLIAdBBGohByAMQQFqIgwgFEgNAAsLIBogAEcNAAsCQCAJQQFODQAgFSEWDAELAkAgAEEBTg0AIBUhFgwBC0EAIRQCQAJAIABBBEkNACAAQfz///8HcSIUIQwgDyEHA0AgB/0M//////////////////////0LAgAgB0EQaiEHIAxBfGoiDA0ACyAUIABGDQELIAAgFGshDCAPIBRBAnRqIQcDQCAHQX82AgAgB0EEaiEHIAxBf2oiDA0ACwsCQCAAQQFODQAgFSEWDAELQQAhFCAVIRYDQCANIBQ2AgAgDyAUQQJ0IgdqIBQ2AgAgECAHakEANgIAQQEhE0EAIRhBACEXA0ACQCABIA0gF0ECdGooAgBBAnQiGmoiBygCACILIAdBBGooAgAiFU4NACALQQFqIQwgAiALQQJ0aiEHIBAgGmohCgNAAkAgDyAHKAIAIgtBAnQiGmoiGSgCACAURg0AIBkgFDYCACAQIBpqIhogCigCAEEBajYCACANIBNBAnRqIAs2AgAgE0EBaiETIAsgFEwNACAaKAIAIhpBAkgNAAJAIBYgBkgNAEF/DwsCQCAaQf8DTQ0AQX4PCyADIBZBAnQiGWogFDYCACAFIBZBAXRqIBo7AQAgBCAZaiALNgIAIBIgGiASIBpKGyESIBhBAWohGCAWQQFqIRYLIAwgFU4NASAHQQRqIQcgDEEBaiEMIBggCUgNAAsLAkAgF0EBaiIXIBNODQAgGCAJSA0BCwsgFEEBaiIUIABHDQALCyARIBI2AgALIBYLjAIDA38BfAR/AkAgA0ECSA0AIAAgA0ECdEF8aiIFaiEGIAEgBWohBSADQQF0IAJqQX5qIQcDQAJAAkAgBEENdCAEcyIEQRF2IARzIgRBBXQgBHMiBLhEAAAAAAAA8D2iIAO3oiIImUQAAAAAAADgQWNFDQAgCKohCQwBC0GAgICAeCEJCyAGKAIAIQogBiAAIAlBAnQiC2oiDCgCADYCACAMIAo2AgAgBy8BACEKIAcgAiAJQQF0aiIJLwEAOwEAIAUoAgAhDCAFIAEgC2oiCygCADYCACAJIAo7AQAgCyAMNgIAIAZBfGohBiAFQXxqIQUgB0F+aiEHIANBAkshCSADQX9qIQMgCQ0ACwsL9AIGB38BfAF/AXsBfwF8AkAgCEEBSA0AIAZBAUgNACAGQX9qIQlBACEKA0BBf0EBIApBAXEiCxsiDEEBdCENIAxBAnQhDkEAIAtrIAlxIgxBAnQhCyADIAxBAXRqIQ8gByAKQQN0aisDACEQIAYhEQNAIAAgASALaigCAEEEdGoiDCAM/QADACISIBIgACACIAtqKAIAQQR0aiIM/QADAP3xASISRAAAAAAAAPA/IBAgBSAPLwEAQQJ0IhNqKgIAu6IiFCAURAAAAAAAAPA/ZBsgEiAS/fIBIhL9IQAgEv0hAaCfIhREje21oPfGsD4gFEQAAAAAAAAAAGQgFEQAAAAAAAAAAGNyGyIUIAQgE2oqAgC7oaIgFCAUoKP9FP3yASIS/fEB/QsDACAMQQhqIhMgEysDACAS/SEBoDkDACAMIAwrAwAgEv0hAKA5AwAgDyANaiEPIAsgDmohCyARQX9qIhENAAsgCkEBaiIKIAhHDQALCwv6EgwHfwF8AXsBfwJ7A38CewF8BH8BfAV/BHwCQCAEQQFODQBBAA8LIAdBcGohCSAHQQRqIQogB0EQaiELIAFB/v///wdxIQwgAUEBcSENIAFBf2ohDiAHQQhqIQ8gAyADoCIDRAAAAAAAADRAIANEAAAAAAAANEBkGyIQ/RQhEUEAIRIDQP0MoMjrhfPM4X+gyOuF88zhfyET/QygyOuF88zh/6DI64XzzOH/IRQCQCABQQFIIhUNAEEAIRYCQCAORQ0AIAAhFwNAIBQgF/0AAwAiGP33ASAXQRBq/QADACIZ/fcBIRQgEyAY/fYBIBn99gEhEyAXQSBqIRcgDCAWQQJqIhZHDQALCyANRQ0AIBQgACAWQQR0av0AAwAiGP33ASEUIBMgGP32ASETCwJAIBQgE/3xASAR/fMB/XX9DAAAAAAAAAhAAAAAAAAACED98AEiFP0hASIDIBT9IQAiGqJEAAAAAICETkFlDQAgEkF/cw8LAkACQCADmUQAAAAAAADgQWNFDQAgA6ohFwwBC0GAgICAeCEXCwJAAkAgGplEAAAAAAAA4EFjRQ0AIBqqIRsMAQtBgICAgHghGwsCQAJAIBsgF2wiHCAITg0AAkAgHEEASA0AQQAhHQJAIBxBA0kNACAcQQFqIh5BfHEiHSEWIAchFwNAIBf9DAAAAAAAAAAAAAAAAAAAAAD9CwIAIBdBEGohFyAWQXxqIhYNAAsgHiAdRg0BCyAHIB1BAnRqIRcgHCAda0EBaiEWA0AgF0EANgIAIBdBBGohFyAWQX9qIhYNAAsLIBUNASAT/SEAIRogE/0hASEfIAAhFyAFIRYgASEdA0ACQAJAIBdBCGorAwAgH6EgEKOcIgOZRAAAAAAAAOBBY0UNACADqiEeDAELQYCAgIB4IR4LIB5BAWogG2whHgJAAkAgFysDACAaoSAQo5wiA5lEAAAAAAAA4EFjRQ0AIAOqISAMAQtBgICAgHghIAsgFiAeICBqIh5BAWo2AgAgDyAeQQJ0aiIeIB4oAgBBAWo2AgAgF0EQaiEXIBZBBGohFiAdQX9qIh0NAAwCCwtB4PJ5IBJrDwsCQCAcQQFIIiENACAcQQNxIR0gBygCACEWQQAhHgJAIBxBBEkNACAcQfz///8HcSEiQQAhHiALIRcDQCAXQXRqIiAgICgCACAWaiIWNgIAIBdBeGoiICAgKAIAIBZqIhY2AgAgF0F8aiIgICAoAgAgFmoiFjYCACAXIBcoAgAgFmoiFjYCACAXQRBqIRcgIiAeQQRqIh5HDQALCyAdRQ0AIAogHkECdGohFwNAIBcgFygCACAWaiIWNgIAIBdBBGohFyAdQX9qIh0NAAsLAkAgFQ0AQQAhFwJAIA5FDQAgBSEWA0AgByAWKAIAQQJ0aiIdIB0oAgAiHUEBajYCACAGIB1BAnRqIBc2AgAgByAWQQRqKAIAQQJ0aiIdIB0oAgAiHUEBajYCACAGIB1BAnRqIBdBAWo2AgAgFkEIaiEWIBdBAmoiFyAMRw0ACwsgDUUNACAHIAUgF0ECdGooAgBBAnRqIhYgFigCACIWQQFqNgIAIAYgFkECdGogFzYCAAsCQCAhDQACQAJAIBxBBE8NACAcIR0MAQsgHEEDcSEdIAkgHEECdGohFyAcQfz///8HcSIeIRYDQCAXQQRqIBf9AAIA/QsCACAXQXBqIRcgFkF8aiIWDQALIBwgHkYNAQsgByAdQQJ0aiIXIBdBfGooAgA2AgAgHUECSQ0AIAcgHUF/aiIWQQJ0aiIdIB1BfGooAgA2AgAgFkECSQ0AIBdBeGogF0F0aigCADYCAAtBACEXIAdBADYCAAJAIBUNAEEAISFBACAba0ECdCEjQQAhFwNAIAAgF0EEdGoiHUEIaiEeIAIgF0EDdGorAwAhAwJAIAcgBSAXQQJ0aigCAEECdGoiJCAjaiIWQQhqKAIAIiAgFkF8aigCACIWTA0AICAgFmshICAGIBZBAnRqIRYDQAJAIBYoAgAiIiAXTA0AIAAgIkEEdGoiHCsDACAdKwMAIiWhIh8gH6IgHEEIaiIVKwMAIB4rAwAiJqEiJyAnoqCfIhpEexSuR+F6hD8gGkQAAAAAAAAAAGQgGkQAAAAAAAAAAGNyGyIaIAMgAiAiQQN0aisDAKAiKGNFDQAgHiAmICcgGqMgKCAaoUQAAAAAAADgP6IiJ6IiKKE5AwAgHSAlICcgHyAaoyIaRAAAAAAAAPA/IBpEAAAAAAAAAABkIBpEAAAAAAAAAABjchuiIhqhOQMAIBUgKCAVKwMAoDkDACAcIBogHCsDAKA5AwBBASEhCyAWQQRqIRYgIEF/aiIgDQALCwJAICRBCGooAgAiICAkQXxqKAIAIhZMDQAgICAWayEgIAYgFkECdGohFgNAAkAgFigCACIiIBdMDQAgACAiQQR0aiIcKwMAIB0rAwAiJaEiHyAfoiAcQQhqIhUrAwAgHisDACImoSInICeioJ8iGkR7FK5H4XqEPyAaRAAAAAAAAAAAZCAaRAAAAAAAAAAAY3IbIhogAyACICJBA3RqKwMAoCIoY0UNACAeICYgJyAaoyAoIBqhRAAAAAAAAOA/oiInoiIooTkDACAdICUgJyAfIBqjIhpEAAAAAAAA8D8gGkQAAAAAAAAAAGQgGkQAAAAAAAAAAGNyG6IiGqE5AwAgFSAoIBUrAwCgOQMAIBwgGiAcKwMAoDkDAEEBISELIBZBBGohFiAgQX9qIiANAAsLAkAgJCAbQQJ0aiIWQQhqKAIAIiAgFkF8aigCACIWTA0AICAgFmshICAGIBZBAnRqIRYDQAJAIBYoAgAiIiAXTA0AIAAgIkEEdGoiHCsDACAdKwMAIiWhIh8gH6IgHEEIaiIVKwMAIB4rAwAiJqEiJyAnoqCfIhpEexSuR+F6hD8gGkQAAAAAAAAAAGQgGkQAAAAAAAAAAGNyGyIaIAMgAiAiQQN0aisDAKAiKGNFDQAgHiAmICcgGqMgKCAaoUQAAAAAAADgP6IiJ6IiKKE5AwAgHSAlICcgHyAaoyIaRAAAAAAAAPA/IBpEAAAAAAAAAABkIBpEAAAAAAAAAABjchuiIhqhOQMAIBUgKCAVKwMAoDkDACAcIBogHCsDAKA5AwBBASEhCyAWQQRqIRYgIEF/aiIgDQALCyAXQQFqIhcgAUcNAAsCQCAhDQBBAA8LQQEhFyASQQFqIhIgBEcNAQsLIBcL'/*WASM:stress:END*/, mod: null, tried: false, on: true, minItems: 150, calls: 0, sepCalls: 0, pairs: 0, error: '' };
    /* Compiles a module's embedded bytes once. Null (and `error` filled in) when WebAssembly is missing, blocked by the page rule, too big to compile on the main thread in some browsers, or broken: callers then stay on JavaScript. */
    function wasmLoad(W) {
      if (!W.tried) {
        W.tried = true;
        try {
          if (typeof WebAssembly === 'object' && W.b64) {
            var b;
            if (typeof Uint8Array.fromBase64 === 'function') b = Uint8Array.fromBase64(W.b64);
            else { var raw = typeof atob === 'function' ? atob(W.b64) : Buffer.from(W.b64, 'base64').toString('binary'); b = new Uint8Array(raw.length); for (var q = 0; q < raw.length; q++) b[q] = raw.charCodeAt(q); }
            W.mod = new WebAssembly.Module(b);
          }
        } catch (err) { W.mod = null; W.error = String(err && err.message || err); }
      }
      return W.mod;
    }
    function forceModule() { return wasmLoad(FORCE_WASM); }
    function forceSimWasm(mod, X, k, dim, pairs, mass, iters, K, rnd, hiT, loT) {
      FORCE_WASM.rnd = rnd;
      var ex = new WebAssembly.Instance(mod, { env: { rnd: function () { return FORCE_WASM.rnd(); } } }).exports, mem = ex.memory;
      var NC = 1 << dim, cap = 6 * k + 64, np = pairs.length;
      var sizes = [k * dim * 8, k * 8, k * dim * 8, cap * 8, cap * dim * 8, cap * dim * 8, cap * 8, cap * 4, cap * 4, cap * NC * 4, 256 * 4, np * 4];
      var off = (ex.__heap_base.value + 15) & ~15, ptr = sizes.map(function (sz) { var p = off; off = (off + sz + 15) & ~15; return p; });
      var need = off + 65536; if (mem.buffer.byteLength < need) mem.grow(Math.ceil((need - mem.buffer.byteLength) / 65536));
      new Float64Array(mem.buffer, ptr[0], k * dim).set(X); new Float64Array(mem.buffer, ptr[1], k).set(mass); new Int32Array(mem.buffer, ptr[11], np).set(pairs);
      var temp0 = K * (hiT || 2), tempN = K * (loT || 0.02);
      for (var it = 0; it < iters; it++) {
        var temp = temp0 * Math.pow(tempN / temp0, it / Math.max(1, iters - 1));
        ex.force_round(ptr[0], ptr[1], ptr[2], ptr[3], ptr[4], ptr[5], ptr[6], ptr[7], ptr[8], ptr[9], ptr[10], ptr[11], k, dim, np, cap, K, temp);
      }
      X.set(new Float64Array(mem.buffer, ptr[0], k * dim));   // only now: if anything above threw, X is untouched and the JavaScript starts from the same picture
      FORCE_WASM.rnd = null;
    }
    function forceSimJs(X, k, dim, pairs, mass, iters, K, rnd, hiT, loT) {
      var NC = 1 << dim, cap = 6 * k + 64, FX = new Float64Array(k * dim), i, j, d, it;
      var tm = new Float64Array(cap), tcx = new Float64Array(cap * dim), tc = new Float64Array(cap * dim), th = new Float64Array(cap), tn = new Int32Array(cap), tb = new Int32Array(cap), tch = new Int32Array(cap * NC);
      var cnt, stack = new Int32Array(256), K2 = K * K, theta2 = 0.81;
      function newNode(parent, q) {
        var id = cnt++, h = th[parent] / 2;
        th[id] = h; tm[id] = 0; tn[id] = 0; tb[id] = -1; for (var c = 0; c < NC; c++) tch[id * NC + c] = -1;
        for (var a = 0; a < dim; a++) { tcx[id * dim + a] = 0; tc[id * dim + a] = tc[parent * dim + a] + ((q >> a) & 1 ? h : -h); }
        return id;
      }
      function quad(nd, i) { var q = 0; for (var a = 0; a < dim; a++) if (X[i * dim + a] >= tc[nd * dim + a]) q |= 1 << a; return q; }
      function ins(nd, i, depth) {
        var m = mass[i];
        tm[nd] += m; for (var a = 0; a < dim; a++) tcx[nd * dim + a] += X[i * dim + a] * m;
        if (tn[nd] === 0) { tb[nd] = i; tn[nd] = 1; return; }
        if (tn[nd] === 1 && tb[nd] >= 0) {
          var b = tb[nd];
          if (depth >= 24 || cnt + NC >= cap) { tb[nd] = -2; tn[nd] = 2; return; }
          tb[nd] = -1; tn[nd] = 2;
          var qb = quad(nd, b), cb = tch[nd * NC + qb]; if (cb < 0) cb = tch[nd * NC + qb] = newNode(nd, qb);
          ins(cb, b, depth + 1);
        } else if (tb[nd] === -2) { tn[nd]++; return; } else tn[nd]++;
        var qi = quad(nd, i), ci = tch[nd * NC + qi]; if (ci < 0) { if (cnt >= cap) { tb[nd] = -2; return; } ci = tch[nd * NC + qi] = newNode(nd, qi); }
        ins(ci, i, depth + 1);
      }
      var temp0 = K * (hiT || 2), tempN = K * (loT || 0.02);
      for (it = 0; it < iters; it++) {
        var temp = temp0 * Math.pow(tempN / temp0, it / Math.max(1, iters - 1));
        // bounds and tree
        var lo = new Array(dim).fill(Infinity), hi = new Array(dim).fill(-Infinity);
        for (i = 0; i < k; i++) for (d = 0; d < dim; d++) { var v = X[i * dim + d]; if (v < lo[d]) lo[d] = v; if (v > hi[d]) hi[d] = v; }
        var half = 1; for (d = 0; d < dim; d++) half = Math.max(half, (hi[d] - lo[d]) / 2 + 1);
        cnt = 1; th[0] = half; tm[0] = 0; tn[0] = 0; tb[0] = -1; for (var c0 = 0; c0 < NC; c0++) tch[c0] = -1;
        for (d = 0; d < dim; d++) { tc[d] = (lo[d] + hi[d]) / 2; tcx[d] = 0; }
        for (i = 0; i < k; i++) ins(0, i, 0);
        FX.fill(0);
        // repulsion
        for (i = 0; i < k; i++) {
          var sp = 0; stack[sp++] = 0;
          while (sp) {
            var nd = stack[--sp]; if (!tn[nd]) continue;
            var dv0 = X[i * dim] - tcx[nd * dim] / tm[nd], dv1 = X[i * dim + 1] - tcx[nd * dim + 1] / tm[nd], dv2 = dim === 3 ? X[i * dim + 2] - tcx[nd * dim + 2] / tm[nd] : 0;   // plain numbers, not a small array per visit (Firefox pays for those)
            var r2 = dv0 * dv0 + dv1 * dv1 + dv2 * dv2;
            if (tn[nd] === 1 && tb[nd] === i) continue;
            var leaf = tn[nd] === 1 || tb[nd] === -2 || (4 * th[nd] * th[nd]) / (r2 || 1e-9) < theta2;
            if (leaf) {
              if (r2 < 1e-6) { dv0 = (rnd() - 0.5) * 0.1; dv1 = (rnd() - 0.5) * 0.1; if (dim === 3) dv2 = (rnd() - 0.5) * 0.1; r2 = 0.01; }
              var f = K2 * mass[i] * tm[nd] / r2;
              FX[i * dim] += dv0 * f; FX[i * dim + 1] += dv1 * f; if (dim === 3) FX[i * dim + 2] += dv2 * f;
            } else for (var cc = 0; cc < NC; cc++) { var ch = tch[nd * NC + cc]; if (ch >= 0 && sp < 250) stack[sp++] = ch; }
          }
        }
        // springs
        for (j = 0; j < pairs.length; j += 2) {
          var a2 = pairs[j], b2 = pairs[j + 1], e0 = X[a2 * dim] - X[b2 * dim], e1 = X[a2 * dim + 1] - X[b2 * dim + 1], e2 = dim === 3 ? X[a2 * dim + 2] - X[b2 * dim + 2] : 0;
          var dist = Math.sqrt(e0 * e0 + e1 * e1 + e2 * e2) || 1e-6, fa = dist / K;
          FX[a2 * dim] -= e0 * fa; FX[b2 * dim] += e0 * fa; FX[a2 * dim + 1] -= e1 * fa; FX[b2 * dim + 1] += e1 * fa;
          if (dim === 3) { FX[a2 * dim + 2] -= e2 * fa; FX[b2 * dim + 2] += e2 * fa; }
        }
        // gravity and move
        for (i = 0; i < k; i++) {
          var mag2 = 0;
          for (d = 0; d < dim; d++) { FX[i * dim + d] -= X[i * dim + d] * 0.02 * mass[i]; mag2 += FX[i * dim + d] * FX[i * dim + d]; }
          var mag = Math.sqrt(mag2) || 1e-9, step = Math.min(mag, temp) / mag;
          for (d = 0; d < dim; d++) X[i * dim + d] += FX[i * dim + d] * step;
        }
      }
    }
    /** Where each arrangement puts things. All return centers (dim numbers per item) around the origin. */

    /**
     * Plain-words advice about the network arrangements for a network of n items: what the chosen one is best at and, where it matters,
     * what a different choice would give. Returns { text, offer, secs }; offer is the arrangement worth suggesting (or ''), secs the rough
     * time of best quality here (browsers, a typical laptop).
     */
    function arrangeAdvice(arr, n, card, est) {
      var cardOk = !!(card && card.max >= n && n >= (card.min || 0) && n > STRESS.fullMax), secs = Math.max(1, Math.round(cardOk ? (est && est.card ? est.card(n) : 0.07 * n / 1000 + 0.3) : (est && est.cpu ? est.cpu(n) : 3.5e-8 * n * n))), big = n > STRESS.fullMax && (n <= STRESS.exactMax || cardOk), since = ' (about ' + secs + (secs === 1 ? ' second' : ' seconds') + ' for ' + n.toLocaleString('en-US') + ' items' + (cardOk ? ', with your graphics card' : '') + ')';
      if (arr === 'stress') return n > STRESS.exactMax && !cardOk ? { text: 'Page distances follow the number of links between items. At this size a quick sample of pairs is used.', offer: '', secs: 0 }
        : big ? { text: 'Page distances follow the number of links between items. At this size a quick sample of pairs is used; "Distances, best quality" uses every pair and is truer' + since + '.', offer: 'stressBest', secs: secs }
        : { text: 'Page distances follow the number of links between items. At this size every pair is used.', offer: '', secs: 0 };
      if (arr === 'stressBest') return big ? { text: 'Uses every pair of items for the truest distances' + since + '.', offer: '', secs: secs }
        : { text: n <= STRESS.fullMax ? 'At this size "Distances" already uses every pair, so this gives the same picture.' : 'Above ' + STRESS.exactMax.toLocaleString('en-US') + ' items this falls back to the quick sample of pairs.', offer: '', secs: 0 };
      if (arr === 'closeness') return { text: 'Linked items sit nearest each other. Best for "who is next to whom?"; distances across the picture are less true than with Distances.', offer: '', secs: 0 };
      if (arr === 'force') return { text: 'Springs pull linked items together while everything pushes apart: the classic network picture.', offer: '', secs: 0 };
      return { text: '', offer: '', secs: 0 };
    }
    var ARRANGE_NAMES = { stress: 'Distances (stress)', closeness: 'Closeness (nearest are linked)', stressBest: 'Distances, best quality (slower)', force: 'Force (springs)', circle: 'Circle', rings: 'Rings by importance', groups: 'Group clusters', radial: 'Radial tree', grid: 'Grid', force3d: '3D force', sphere: 'Sphere', stack: 'Stacked group planes' };
    function arrangeAll(kind, nodes, adj, size, rnd, EDGE) {
      var k = nodes.length, i, dim = /3d|sphere|stack/.test(kind) ? 3 : 2, X = new Float64Array(k * dim);
      var deg = nodes.map(function (n, ix) { return adj[ix].length; });
      var byImp = nodes.map(function (n, ix) { return ix; }).sort(function (a, b) { return deg[b] - deg[a] || a - b; });
      var gOrder = function () {
        var gs = new Map(); nodes.forEach(function (n, ix) { var g = n.group || ''; if (!gs.has(g)) gs.set(g, []); gs.get(g).push(ix); });
        var keys = Array.from(gs.keys()).sort(function (a, b) { return gs.get(b).length - gs.get(a).length || (a < b ? -1 : 1); });
        keys.forEach(function (g) { gs.get(g).sort(function (a, b) { return deg[b] - deg[a] || a - b; }); });
        return { keys: keys, map: gs };
      };
      var avgSize = nodes.reduce(function (a, n) { return a + size(n); }, 0) / Math.max(1, k) + 14;
      if (kind === 'circle') {
        var gg = gOrder(), ord = []; gg.keys.forEach(function (g) { gg.map.get(g).forEach(function (ix) { ord.push(ix); }); });
        var R = Math.max(120, ord.length * avgSize * 0.8 / (2 * Math.PI));
        ord.forEach(function (ix, r) { var a = (r / ord.length) * 2 * Math.PI - Math.PI / 2; X[ix * 2] = R * Math.cos(a); X[ix * 2 + 1] = R * Math.sin(a); });
      } else if (kind === 'rings') {
        var left = byImp.slice(), ring = 0, placed = 0;
        while (left.length) {
          var R2 = ring === 0 ? 0 : ring * avgSize * 1.7, cap = ring === 0 ? 1 : Math.max(6, Math.floor(2 * Math.PI * R2 / (avgSize * 1.15)));
          var take = left.splice(0, cap), gm = new Map(); take.forEach(function (ix) { var g = nodes[ix].group || ''; if (!gm.has(g)) gm.set(g, []); gm.get(g).push(ix); });
          var seq = []; Array.from(gm.keys()).sort().forEach(function (g) { gm.get(g).forEach(function (ix) { seq.push(ix); }); });
          seq.forEach(function (ix, r) { var a = (r / seq.length) * 2 * Math.PI + ring * 0.5; X[ix * 2] = R2 * Math.cos(a); X[ix * 2 + 1] = R2 * Math.sin(a); });
          ring++; placed += take.length;
        }
      } else if (kind === 'grid') {
        var g2 = gOrder(), ord2 = []; g2.keys.forEach(function (g) { g2.map.get(g).forEach(function (ix) { ord2.push(ix); }); });
        var cols = Math.max(1, Math.ceil(Math.sqrt(ord2.length * 1.5))), cw = avgSize * 1.5;
        ord2.forEach(function (ix, r) { X[ix * 2] = (r % cols) * cw; X[ix * 2 + 1] = Math.floor(r / cols) * cw; });
      } else if (kind === 'groups') {
        var g3 = gOrder(), gi = g3.keys.length, gc = new Float64Array(gi * 2), grad = new Float64Array(gi), gidx = new Map();
        g3.keys.forEach(function (g, q) { gidx.set(g, q); grad[q] = Math.sqrt(g3.map.get(g).length + 0.5) * avgSize * 0.62 * 1.35 + avgSize * 1.1; });
        var between = new Map();
        nodes.forEach(function (n, ix) { adj[ix].forEach(function (o) { if (o > ix) { var a = gidx.get(nodes[ix].group || ''), b = gidx.get(nodes[o].group || ''); if (a !== b) { var kk = a < b ? a * 100003 + b : b * 100003 + a; between.set(kk, (between.get(kk) || 0) + 1); } } }); });
        var gp = []; between.forEach(function (c, kk) { gp.push(Math.floor(kk / 100003), kk % 100003); });
        g3.keys.forEach(function (g, q) { var a = q * 2.399963, r = Math.sqrt(q + 1) * 160; gc[q * 2] = r * Math.cos(a); gc[q * 2 + 1] = r * Math.sin(a); });
        var gm2 = new Float64Array(gi).fill(1); for (i = 0; i < gi; i++) gm2[i] = grad[i] / 40;
        if (gi > 1) { forceSim(gc, gi, 2, gp, gm2, 160, 220, rnd);
          separateGroups(gc, gi, function (q) { return grad[q] + 10; });
        }
        g3.keys.forEach(function (g, q) { g3.map.get(g).forEach(function (ix, r) { var a = r * 2.399963, rad = avgSize * 0.62 * Math.sqrt(r + 0.5) * 1.35; X[ix * 2] = gc[q * 2] + rad * Math.cos(a); X[ix * 2 + 1] = gc[q * 2 + 1] + rad * Math.sin(a); }); });
      } else if (kind === 'sphere') {
        var g4 = gOrder(), ord4 = []; g4.keys.forEach(function (g) { g4.map.get(g).forEach(function (ix) { ord4.push(ix); }); });
        var Rs = Math.max(150, Math.sqrt(ord4.length) * avgSize * 0.8), ga = Math.PI * (3 - Math.sqrt(5));
        ord4.forEach(function (ix, r) { var y = ord4.length > 1 ? 1 - 2 * r / (ord4.length - 1) : 0, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = r * ga; X[ix * 3] = Rs * rr * Math.cos(th); X[ix * 3 + 1] = Rs * y; X[ix * 3 + 2] = Rs * rr * Math.sin(th); });
      } else if (kind === 'stack') {
        var g5 = gOrder(), nL = g5.keys.length, gapZ = Math.max(120, avgSize * 3);
        g5.keys.forEach(function (g, q) { g5.map.get(g).forEach(function (ix, r) { var a = r * 2.399963, rad = avgSize * 0.62 * Math.sqrt(r + 0.5) * 1.5; X[ix * 3] = rad * Math.cos(a); X[ix * 3 + 1] = rad * Math.sin(a); X[ix * 3 + 2] = (q - (nL - 1) / 2) * gapZ; }); });
      }
      return { X: X, dim: dim };
    }

    /** One sweep of stochastic gradient descent over the pairs, in the order given (a small function on purpose: engines compile small hot loops best). */
    function sgdPass(X, pa, pb, pd, pw, ord, cnt, eta) {
      for (var q = 0; q < cnt; q++) {
        var p = ord[q], mu = pw[p] * eta; if (mu > 1) mu = 1;
        var a2 = pa[p] * 2, b2 = pb[p] * 2, dx = X[a2] - X[b2], dy = X[a2 + 1] - X[b2 + 1], mag = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        var r = (mu * (mag - pd[p])) / (2 * mag), rx = r * dx, ry = r * dy;
        X[a2] -= rx; X[a2 + 1] -= ry; X[b2] += rx; X[b2 + 1] += ry;
      }
    }

    /** The same sweep over the pairs as they lie in memory (forward or backward): no index lookups, so the memory is read in a straight line. */
    function sgdSweep(X, pa, pb, pd, pw, cnt, eta, back) {
      var q = back ? cnt - 1 : 0, step = back ? -1 : 1;
      for (var n = 0; n < cnt; n++, q += step) {
        var mu = pw[q] * eta; if (mu > 1) mu = 1;
        var a2 = pa[q] * 2, b2 = pb[q] * 2, dx = X[a2] - X[b2], dy = X[a2 + 1] - X[b2 + 1], mag = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        var r = (mu * (mag - pd[q])) / (2 * mag), rx = r * dx, ry = r * dy;
        X[a2] -= rx; X[a2 + 1] -= ry; X[b2] += rx; X[b2 + 1] += ry;
      }
    }

    /* Tuning knobs for the closeness arrangement. */
    var CLOSE = { epochs: 150, neg: 10, a: 1, b: 1, clip: 4, fromStress: 1, alpha0: 0.25 };

    /**
     * Closeness arrangement for one connected piece: starts from the Stress picture (so the overall shape is right), then linked items are pulled together and random other items are pushed away, with a force
     * that falls off slowly with distance (the kernel of t-SNE and UMAP; sampled repulsion as in LargeVis). It asks "are my links my nearest
     * items?", where Stress asks "is the distance right?".
     */
    function closenessComponent(X, k, members, adj, locArr, root, EDGE, rnd) {
      if (CLOSE.fromStress) stressComponent(X, k, members, adj, locArr, root, EDGE, rnd);
      var C = CLOSE, i, j, e, ep, r, nE = 0, sc = 1 / EDGE, U = new Float64Array(2 * k);
      for (i = 0; i < 2 * k; i++) U[i] = X[i] * sc;
      var ea = [], eb = [];
      for (i = 0; i < k; i++) { var lst = adj[members[i]]; for (j = 0; j < lst.length; j++) { var w = locArr[lst[j]]; if (w > i) { ea.push(i); eb.push(w); } } }
      nE = ea.length;
      var s = (rnd() * 4294967296) | 0 || 1;
      function nextInt(n) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296 * n) | 0; }
      var a = C.a, b = C.b, bOne = b === 1, clip = C.clip, epochs = k <= 20000 ? C.epochs : k <= 100000 ? 60 : 20, neg = k <= 20000 ? C.neg : 5;   // big pieces: fewer rounds and fewer pushes
      for (ep = 0; ep < epochs; ep++) {
        var alpha = C.alpha0 * (1 - ep / epochs);
        for (e = 0; e < nE; e++) {
          var p = ea[e], q = eb[e], dx = U[2 * p] - U[2 * q], dy = U[2 * p + 1] - U[2 * q + 1], d2 = dx * dx + dy * dy;
          var g = d2 > 0 ? (bOne ? -2 * a / (1 + a * d2) : -2 * a * b * Math.pow(d2, b - 1) / (1 + a * Math.pow(d2, b))) : 0;   // with b = 1 (always, in the app) the powers are 1 and d2 exactly: no pow() calls
          var mx = g * dx, my = g * dy; if (mx > clip) mx = clip; else if (mx < -clip) mx = -clip; if (my > clip) my = clip; else if (my < -clip) my = -clip;
          U[2 * p] += alpha * mx; U[2 * p + 1] += alpha * my; U[2 * q] -= alpha * mx; U[2 * q + 1] -= alpha * my;
          for (r = 0; r < neg; r++) {
            var c = nextInt(k); if (c === p) continue;
            var rx = U[2 * p] - U[2 * c], ry = U[2 * p + 1] - U[2 * c + 1], r2 = rx * rx + ry * ry;
            var gr = 2 * b / ((0.001 + r2) * (1 + a * (bOne ? r2 : Math.pow(r2, b))));
            var qx = gr * rx, qy = gr * ry; if (qx > clip) qx = clip; else if (qx < -clip) qx = -clip; if (qy > clip) qy = clip; else if (qy < -clip) qy = -clip;
            U[2 * p] += alpha * qx; U[2 * p + 1] += alpha * qy;
          }
        }
      }
      // scale so that the middle link is EDGE long
      var ls = new Float64Array(nE); for (e = 0; e < nE; e++) ls[e] = Math.hypot(U[2 * ea[e]] - U[2 * eb[e]], U[2 * ea[e] + 1] - U[2 * eb[e] + 1]);
      ls.sort(); var med = nE ? ls[nE >> 1] : 1; if (!(med > 1e-9)) med = 1;
      var f = EDGE / med; for (i = 0; i < 2 * k; i++) X[i] = U[i] * f;
    }

    /* Tuning knobs for the stress layout (the benchmark page changes them to compare settings; the app never does). */
    var exactNow = false;
    var previewCache = null;   // the grown-back picture of the biggest piece, kept by an early-preview build so the final build skips the work that made it
    var STRESS = { fullMax: 4000, pivMin: 30, pivMax: 120, pivBudget: 300000, iters: 36, fullIters: 30, near: 100, nearBig: 60, pivW: 0.3, settle: 1, growRounds: 12, grow: 1.1, reshuffle: false, sepPasses: 30, spread: 0.35, exactMax: 20000, exactIters: 0, multi: 1, multiMin: 4000, multiCoarse: 2000, multiEta: 0.12, multiIters: 3, multiJitter: 0.3, multiPiv: 6, multiNear: 6, jumpMin: 20000, jumpMax: 1.7, jumpPer: 0.2, previewMin: 40000, previewStop: false, previewHit: false };   // exactIters 0 = by size

    /**
     * "Best quality" stress for one connected piece: every pair of items is used, with the hop counts kept in one byte each (k*k bytes,
     * 100 MB for 10,000 items) instead of 16 bytes per pair. Items are numbered in a random order first, so sweeping each item against
     * the next items in that numbering is a random pair order, and the memory is read in straight lines.
     */
    function stressExact(X, k, off, nbr, EDGE, rnd, iters) {
      var T = STRESS, nm = k >> 1, D = new Uint8Array(nm * k), rp = new Int32Array(k), i, j, t, m, r, c;
      for (i = 0; i < k; i++) rp[i] = i;
      for (i = k - 1; i > 0; i--) { j = (rnd() * (i + 1)) | 0; r = rp[i]; rp[i] = rp[j]; rp[j] = r; }
      var ri = new Int32Array(k), off2 = new Int32Array(k + 1), nbr2 = new Int32Array(nbr.length), dist = new Int32Array(k), queue = new Int32Array(k), maxD = 1;
      for (r = 0; r < k; r++) ri[rp[r]] = r;
      for (r = 0; r < k; r++) { off2[r + 1] = off2[r] + off[rp[r] + 1] - off[rp[r]]; for (j = off[rp[r]], c = off2[r]; j < off[rp[r] + 1]; j++, c++) nbr2[c] = ri[nbr[j]]; }   // the same links, in the new numbering
      // D[(m-1)*k + i] = hops between numbered items i and (i+m) mod k, for offsets m = 1..k/2: each pair once, and one offset lies in a straight line.
      // 32 searches run side by side: every item holds a 32-bit mask of the searches that have reached it, so one pass over a link moves 32 searches
      // one step. Rows of a block are kept in a small table and written across in pieces (writing one byte at a time down a column is slow).
      var BL = 64, tmp = new Uint8Array(BL * nm), rL = new Int32Array(k), rH = new Int32Array(k), fL = new Int32Array(k), fH = new Int32Array(k), aL = new Int32Array(k), aH = new Int32Array(k);
      var list = new Int32Array(k), list2 = new Int32Array(k), touched = new Int32Array(k), seenT = new Uint8Array(k);
      for (var r0 = 0; r0 < k; r0 += BL) {
        var nb = Math.min(BL, k - r0), nl = nb, level = 0, bb;
        rL.fill(0); rH.fill(0); tmp.fill(0);
        for (bb = 0; bb < nb; bb++) { if (bb < 32) rL[r0 + bb] = fL[r0 + bb] = 1 << bb; else rH[r0 + bb] = fH[r0 + bb] = 1 << (bb - 32); list[bb] = r0 + bb; }
        while (nl > 0) {
          level++; var nt = 0, u, e, e1, v;
          if (level > 254) return false;   // hop counts are kept in one byte; a piece this stretched out is left to the pivot version
          for (var li = 0; li < nl; li++) {   // push: every item that just got reached hands its masks to its neighbors
            u = list[li]; var fl = fL[u], fh = fH[u];
            for (e = off2[u], e1 = off2[u + 1]; e < e1; e++) { v = nbr2[e]; if (!seenT[v]) { seenT[v] = 1; touched[nt++] = v; } aL[v] |= fl; aH[v] |= fh; }
          }
          for (li = 0; li < nl; li++) { fL[list[li]] = 0; fH[list[li]] = 0; }
          var nl2 = 0, dv = level > 255 ? 255 : level;
          for (var ti = 0; ti < nt; ti++) {
            v = touched[ti]; seenT[v] = 0;
            var nxL = aL[v] & ~rL[v], nxH = aH[v] & ~rH[v]; aL[v] = 0; aH[v] = 0;
            if (!(nxL | nxH)) continue;
            rL[v] |= nxL; rH[v] |= nxH; fL[v] = nxL; fH[v] = nxH; list2[nl2++] = v;
            if (dv > maxD) maxD = dv;
            var base = v - r0; if (base < 0) base += k;
            if (base - (nb - 1) > nm) continue;   // all of this item's pairs are the second half of their pair (offset above k/2): nothing to write
            for (var wd = 0; wd < 2; wd++) {
              var nx = wd ? nxH : nxL;
              while (nx) {
                var low = nx & -nx; nx ^= low; bb = 31 - Math.clz32(low) + wd * 32;
                m = v - (r0 + bb); if (m < 0) m += k;
                if (m > nm || (m + m === k && r0 + bb >= nm)) continue;
                tmp[bb * nm + m - 1] = dv;
              }
            }
          }
          var sw = list; list = list2; list2 = sw; nl = nl2;
        }
        for (m = 0; m < nm; m++) { var ob = m * k + r0; for (var b2 = 0; b2 < nb; b2++) D[ob + b2] = tmp[b2 * nm + m]; }
      }
      var Yx = new Float64Array(k), Yy = new Float64Array(k);   // x and y in separate arrays: faster to read in a straight line
      for (r = 0; r < k; r++) { Yx[r] = X[2 * rp[r]]; Yy[r] = X[2 * rp[r] + 1]; }
      var pdT = new Float64Array(256), wT = new Float64Array(256), ord = new Int32Array(nm);
      for (i = 1; i < 256; i++) { pdT[i] = i * EDGE; wT[i] = 1 / (i * i); }
      for (m = 0; m < nm; m++) ord[m] = m + 1;
      var sched = iters <= 2 ? [0.1, 0.5] : iters === 3 ? [0.3, 0.3] : [1, 0.1], etaMax = maxD * maxD * (STRESS.exHi || sched[0]), etaMin = STRESS.exLo || sched[1], lambda = Math.log(etaMax / etaMin) / Math.max(1, iters - 1);   // fewer sweeps start from a smaller first step
      for (t = 0; t < iters; t++) {
        var eta = etaMax * Math.exp(-lambda * t);
        for (m = nm - 1; m > 0; m--) { j = (rnd() * (m + 1)) | 0; c = ord[m]; ord[m] = ord[j]; ord[j] = c; }
        for (var q = 0; q < nm; q++) {   // one offset at a time, in a random order: successive pairs are far apart in the picture's history
          m = ord[q];
          var row = (m - 1) * k, lim = m + m === k ? nm : k;
          for (var seg = 0; seg < 2; seg++) {   // items i with i+m inside the list, then the ones that wrap round to the start
            var i0 = seg ? k - m : 0, i1 = seg ? lim : Math.min(lim, k - m), sh = seg ? m - k : m;
            for (i = i0; i < i1; i++) {
              var dd = D[row + i]; if (dd === 0) continue;
              j = i + sh;
              var mu = wT[dd] * eta; if (mu > 1) mu = 1;
              var dx = Yx[i] - Yx[j], dy = Yy[i] - Yy[j], mag = Math.sqrt(dx * dx + dy * dy) + 1e-9, f = 0.5 * mu * (1 - pdT[dd] / mag), rx = f * dx, ry = f * dy;
              Yx[i] -= rx; Yy[i] -= ry; Yx[j] += rx; Yy[j] += ry;
            }
          }
        }
      }
      for (r = 0; r < k; r++) { X[2 * rp[r]] = Yx[r]; X[2 * rp[r] + 1] = Yy[r]; }
    }

    /** Shrinks a piece by about half: each item is paired with an unpaired neighbor (the neighbor with the fewest links first, items taken in a random order); pairs become one item. Returns the map from items to merged items and the merged piece's links (compressed rows). */
    function coarsenCsr(k, off, nbr, rnd) {
      var map = new Int32Array(k).fill(-1), ord = new Int32Array(k), i, j, kc = 0;
      for (i = 0; i < k; i++) ord[i] = i;
      for (i = k - 1; i > 0; i--) { j = (rnd() * (i + 1)) | 0; var t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
      for (i = 0; i < k; i++) {
        var u = ord[i]; if (map[u] >= 0) continue;
        var best = -1, bd = 1e9;
        for (j = off[u]; j < off[u + 1]; j++) { var w = nbr[j]; if (map[w] < 0 && w !== u) { var dw = off[w + 1] - off[w]; if (dw < bd) { bd = dw; best = w; } } }
        map[u] = kc; if (best >= 0) map[best] = kc; kc++;
      }
      var cnt = new Int32Array(kc + 1), stamp = new Int32Array(kc).fill(-1), members = new Int32Array(k), mo = new Int32Array(kc + 1);
      for (i = 0; i < k; i++) cnt[map[i] + 1]++;
      for (i = 0; i < kc; i++) cnt[i + 1] += cnt[i];
      var fill = cnt.slice(0, kc);
      for (i = 0; i < k; i++) members[fill[map[i]]++] = i;
      var off2 = new Int32Array(kc + 1), nb2 = new Int32Array(nbr.length), m = 0;
      for (var c = 0; c < kc; c++) {
        for (var q = cnt[c]; q < cnt[c + 1]; q++) {
          var v = members[q];
          for (j = off[v]; j < off[v + 1]; j++) { var d = map[nbr[j]]; if (d !== c && stamp[d] !== c) { stamp[d] = c; nb2[m++] = d; } }
        }
        off2[c + 1] = m;
      }
      return { kc: kc, map: map, off: off2, nbr: nb2.slice(0, m) };
    }
    /** The scale (positions times it) at which the page's distances best fit the hop counts times EDGE, from a few breadth-first searches. */
    function fitScale(X, k, off, nbr, EDGE) {
      var dist = new Int32Array(k), queue = new Int32Array(k), num = 0, den = 0, ns = Math.min(8, k), s, t;
      for (s = 0; s < ns; s++) {
        var src = Math.floor(s * k / ns); dist.fill(-1); dist[src] = 0; queue[0] = src;
        var h = 0, tl = 1;
        while (h < tl) { var u = queue[h++]; for (var e = off[u]; e < off[u + 1]; e++) { var w = nbr[e]; if (dist[w] < 0) { dist[w] = dist[u] + 1; queue[tl++] = w; } } }
        for (t = 0; t < k; t += 3) if (t !== src && dist[t] > 0) { var ex = Math.hypot(X[2 * src] - X[2 * t], X[2 * src + 1] - X[2 * t + 1]) / (dist[t] * EDGE); num += ex; den += ex * ex; }
      }
      return den > 0 && num > 0 ? num / den : 1;
    }

    /**
     * Stress layout of one connected piece: X (x,y per item) is moved so that the distance on the page follows the hop count.
     * Hop counts come from every item (small pieces) or from far-apart "pivot" items plus the links and a few near neighbors (big pieces).
     * Pairs live in typed arrays (two Int32 index lists, two Float32 lists), not one small array per pair: about a fifth of the memory and
     * no garbage for the collector.
     */
    function stressComponent(X, k, members, adj, locArr, root, EDGE, rnd, deep) {
      var T = STRESS, full = k <= T.fullMax, i, j, h, u, w;
      var off = new Int32Array(k + 1), m2 = 0;
      for (i = 0; i < k; i++) { m2 += adj[members[i]].length; off[i + 1] = m2; }
      var nbr = new Int32Array(m2);
      for (i = 0; i < k; i++) { var lst = adj[members[i]], o0 = off[i]; for (j = 0; j < lst.length; j++) nbr[o0 + j] = locArr[lst[j]]; }
      if (exactNow && T.external && k > T.fullMax && T.external(X, k, off, nbr, EDGE) === true) return;   // a picture computed elsewhere (the graphics card): the page's own clean-up below still runs on it
      if (exactNow && k > T.fullMax && k <= T.exactMax) {   // 'best quality': every pair; if the device cannot give the memory (k*k/2 bytes), fall through to the pivot version
        var X0 = X.slice();
        try { if (stressExact(X, k, off, nbr, EDGE, rnd, T.exactIters || (k <= 12000 ? 3 : 2)) !== false) return; } catch (err) { if (!(err instanceof RangeError)) throw err; }
        X.set(X0);
      }
      var eta0 = 0, tIters = 0, pkey = '';
      if (T.multi && !deep && !full && k > T.multiMin && (T.previewStop || previewCache)) {   // early preview: same piece, same settings -> same key
        var hh = 2166136261 | 0;
        for (i = 0; i < m2; i++) hh = Math.imul(hh ^ nbr[i], 16777619);
        pkey = k + ':' + m2 + ':' + hh + ':' + EDGE + ':' + [T.multiMin, T.multiCoarse, T.multiJitter, T.multiEta, T.multiIters].join(',');
      }
      if (pkey && !T.previewStop && previewCache && previewCache.key === pkey) {   // the preview already did the start: continue from its picture and its random run
        X.set(previewCache.X); rnd.state(previewCache.rs); previewCache = null;
        eta0 = T.multiEta; tIters = T.multiIters; full = false;
      } else if (T.multi && (deep ? k > T.multiCoarse : !full && k > T.multiMin)) {   // multilevel start: lay out a half-size copy first (itself multilevel when still big), grow it back, then polish with gentle sweeps
        var cs = coarsenCsr(k, off, nbr, rnd), Xc = new Float64Array(cs.kc * 2), ci;
        if (cs.kc < k * 0.95) {
          var cadj = [], cmem = new Int32Array(cs.kc), cloc = new Int32Array(cs.kc), croot = 0, cbd = -1;
          for (ci = 0; ci < cs.kc; ci++) { var row = []; for (var cj = cs.off[ci]; cj < cs.off[ci + 1]; cj++) row.push(cs.nbr[cj]); cadj.push(row); cmem[ci] = ci; cloc[ci] = ci; if (row.length > cbd) { cbd = row.length; croot = ci; } }
          var cseen = new Uint8Array(cs.kc), cord = [croot]; cseen[croot] = 1;
          for (var co = 0; co < cord.length; co++) cadj[cord[co]].forEach(function (w) { if (!cseen[w]) { cseen[w] = 1; cord.push(w); } });
          cord.forEach(function (g, r) { var a = r * 2.399963, rad = EDGE * 0.6 * Math.sqrt(r + 1); Xc[g * 2] = rad * Math.cos(a); Xc[g * 2 + 1] = rad * Math.sin(a); });
          stressComponent(Xc, cs.kc, cmem, cadj, cloc, croot, EDGE, rnd, true);
          var jit = EDGE * T.multiJitter;
          for (i = 0; i < k; i++) { var pc2 = cs.map[i]; X[2 * i] = Xc[2 * pc2] + (rnd() - 0.5) * jit; X[2 * i + 1] = Xc[2 * pc2 + 1] + (rnd() - 0.5) * jit; }
          var sc = fitScale(X, k, off, nbr, EDGE); for (i = 0; i < 2 * k; i++) X[i] *= sc;
          eta0 = T.multiEta; tIters = T.multiIters; full = false;
          if (pkey && T.previewStop) { previewCache = { key: pkey, X: X.slice(), rs: rnd.state() }; T.previewHit = true; return; }   // a rough picture is enough for now
        }
      }
      // Huge pieces: keep the pairs to a memory budget (about 12 million pairs, 120 MB) by using fewer pivots and fewer near neighbors.
      var near = Math.min(k > 20000 ? T.nearBig : T.near, Math.max(2, Math.floor(4e6 / k)));
      var rootL = locArr[root], nPiv = full ? k : Math.min(k, Math.max(4, Math.min(Math.max(T.pivMin, Math.min(T.pivMax, Math.round(T.pivBudget / k))), Math.floor(8e6 / k))));
      if (eta0) { if (T.multiPiv) nPiv = Math.min(nPiv, T.multiPiv); if (T.multiNear) near = Math.min(near, T.multiNear); }   // polishing a grown-back picture needs far fewer pairs than building one from scratch
      var cap = full ? (k * (k - 1)) / 2 : nPiv * k + m2 / 2 + k * near;
      var tmax = full ? (k <= 700 ? T.fullIters : k <= 1500 ? 20 : 12) : (tIters || T.iters);
      var seed = (rnd() * 4294967296) | 0 || 1;   // drawn once, before any try, so a try that gives up leaves the next one the same random order
      var wm = STRESS_WASM.on && !T.reshuffle && k >= STRESS_WASM.minItems ? wasmLoad(STRESS_WASM) : null;
      if (wm) {   // the WebAssembly build of everything below (wasm/stress.c): the same picture to the last digit; any trouble falls through to JavaScript with X untouched
        try { if (stressWasm(wm, X, k, off, nbr, EDGE, seed, full, nPiv, near, rootL, cap, tmax, T, eta0)) { STRESS_WASM.calls++; return; } } catch (err) { STRESS_WASM.error = String(err && err.message || err); }
      }
      var OVER = {};
      if (T.reshuffle) return stressJs(false);
      try { return stressJs(true); } catch (err) { if (err !== OVER) throw err; }   // a hop count over 511 does not fit the code: this piece keeps Float32 distances and weights
      stressJs(false);

      function stressJs(code) {
        var dist = new Int32Array(k), queue = new Int32Array(k);
        function bfs(src) {
          dist.fill(-1); dist[src] = 0; queue[0] = src;
          var head = 0, tail = 1;
          while (head < tail) { u = queue[head++]; var du = dist[u] + 1; for (var e = off[u], e1 = off[u + 1]; e < e1; e++) { w = nbr[e]; if (dist[w] < 0) { dist[w] = du; queue[tail++] = w; } } }
        }
        /* Two item numbers per pair plus either one Uint16 hop code (the hop count, +512 for a pivot pair; distance and weight come from two 1,024-entry tables rounded to float32 like the old lists) or, when a hop count is over 511 or the tuning option reshuffles, two Float32 lists. */
        var pa = new Int32Array(cap), pb = new Int32Array(cap), pc = code ? new Uint16Array(cap) : null, pd = code ? null : new Float32Array(cap), pw = code ? null : new Float32Array(cap), cnt = 0, maxD = 1;
        function add(a, b, d, wm2) {
          if (cnt >= cap) throw new Error('internal: stress pair list overflow');
          pa[cnt] = a; pb[cnt] = b;
          if (code) { if (d > 511) throw OVER; pc[cnt] = d + (wm2 && wm2 !== 1 ? 512 : 0); } else { pd[cnt] = d * EDGE; pw[cnt] = (wm2 || 1) / (d * d); }
          cnt++; if (d > maxD) maxD = d;
        }
        if (full) {
          for (i = 0; i < k; i++) { bfs(i); for (j = i + 1; j < k; j++) if (dist[j] > 0) add(i, j, dist[j]); }
        } else {
          var minD = new Int32Array(k).fill(1e9), piv = rootL;
          for (h = 0; h < nPiv; h++) {
            bfs(piv);
            var far = -1, fd = -1;
            for (j = 0; j < k; j++) { var dj = dist[j]; if (dj < minD[j]) minD[j] = dj; if (minD[j] > fd) { fd = minD[j]; far = j; } if (j !== piv && dj > 0) add(piv, j, dj, T.pivW); }
            piv = far;
          }
          for (i = 0; i < k; i++) for (j = off[i]; j < off[i + 1]; j++) if (nbr[j] > i) add(i, nbr[j], 1);
          if (near > 0) {   // a few more near neighbors per item (two or three hops away), found by a short breadth-first walk
            var stamp = new Int32Array(k).fill(-1), dl = new Int32Array(k);
            for (i = 0; i < k; i++) {
              var tail2 = 1, head2 = 0, got = 0; queue[0] = i; stamp[i] = i; dl[i] = 0;
              while (head2 < tail2 && got < near) {
                u = queue[head2++];
                for (var e2 = off[u], e3 = off[u + 1]; e2 < e3 && got < near; e2++) {
                  w = nbr[e2];
                  if (stamp[w] !== i) { stamp[w] = i; dl[w] = dl[u] + 1; queue[tail2++] = w; if (dl[w] >= 2 && w > i) { add(i, w, dl[w]); got++; } }
                }
              }
            }
          }
        }
        STRESS_WASM.pairs = cnt;
        var wMin = 1 / (maxD * maxD), etaMax = eta0 || 1 / wMin, etaMin = 0.1, lambda = Math.log(etaMax / etaMin) / Math.max(1, tmax - 1);
        var s = seed, t, p, q;
        function nextInt(n) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296 * n) | 0; }
        if (T.reshuffle) {   // a fresh random order every sweep (an index list is shuffled; the pairs stay where they are)
          var ord = new Int32Array(cnt);
          for (q = 0; q < cnt; q++) ord[q] = q;
          for (t = 0; t < tmax; t++) {
            for (q = cnt - 1; q > 0; q--) { j = nextInt(q + 1); p = ord[q]; ord[q] = ord[j]; ord[j] = p; }
            sgdPass(X, pa, pb, pd, pw, ord, cnt, etaMax * Math.exp(-lambda * t));
          }
        } else {   // one random order, made once in memory; sweeps then go forward and backward through it
          for (q = cnt - 1; q > 0; q--) {
            j = nextInt(q + 1);
            p = pa[q]; pa[q] = pa[j]; pa[j] = p; p = pb[q]; pb[q] = pb[j]; pb[j] = p;
            if (code) { var cc = pc[q]; pc[q] = pc[j]; pc[j] = cc; } else { var f = pd[q]; pd[q] = pd[j]; pd[j] = f; f = pw[q]; pw[q] = pw[j]; pw[j] = f; }
          }
          if (code) { var tb = hopTables(EDGE, T.pivW, new Float64Array(1024), new Float64Array(1024)); for (t = 0; t < tmax; t++) sgdSweepCode(X, pa, pb, pc, tb[0], tb[1], cnt, etaMax * Math.exp(-lambda * t), t & 1); }
          else for (t = 0; t < tmax; t++) sgdSweep(X, pa, pb, pd, pw, cnt, etaMax * Math.exp(-lambda * t), t & 1);
        }
      }
    }

    /** The two 1,024-entry tables behind a hop code c (1 to 511 hops, +512 for a pivot pair): distance hops * EDGE and weight 1 / hops^2 (pivot pairs: pivW / hops^2), rounded to float32 like the old per-pair lists. Fills and returns [dist, weight]. */
    function hopTables(EDGE, pivW, dT, wT) {
      for (var c = 1; c < 512; c++) { dT[c] = dT[c + 512] = c * EDGE; wT[c] = 1 / (c * c); wT[c + 512] = (pivW && pivW !== 1 ? pivW : 1) / (c * c); }
      if (dT instanceof Float64Array) for (var q = 0; q < 1024; q++) { dT[q] = Math.fround(dT[q]); wT[q] = Math.fround(wT[q]); }   // (a Float32Array table rounds on its own)
      return [dT, wT];
    }
    /** The sweep over pairs that carry a hop code. Same arithmetic as sgdSweep, so the same picture. */
    function sgdSweepCode(X, pa, pb, pc, dT, wT, cnt, eta, back) {
      var q = back ? cnt - 1 : 0, step = back ? -1 : 1;
      for (var n = 0; n < cnt; n++, q += step) {
        var c = pc[q], mu = wT[c] * eta; if (mu > 1) mu = 1;
        var a2 = pa[q] * 2, b2 = pb[q] * 2, dx = X[a2] - X[b2], dy = X[a2 + 1] - X[b2 + 1], mag = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        var r = (mu * (mag - dT[c])) / (2 * mag), rx = r * dx, ry = r * dy;
        X[a2] -= rx; X[a2 + 1] -= ry; X[b2] += rx; X[b2 + 1] += ry;
      }
    }
    /** Reserves aligned pieces of a module's memory (growing it when needed); returns the offsets in the order of `sizes`. */
    function wasmLayout(ex, sizes) {
      var off = (ex.__heap_base.value + 15) & ~15, ptr = sizes.map(function (sz) { var p = off; off = (off + sz + 15) & ~15; return p; });
      var need = off + 65536, mem = ex.memory; if (mem.buffer.byteLength < need) mem.grow(Math.ceil((need - mem.buffer.byteLength) / 65536));
      return ptr;
    }
    /** stressComponent's pair building, shuffle and sweeps in WebAssembly. Returns true when X holds the finished picture, false when this piece needs the JavaScript (a hop count over 511, a full pair list); X is written only at the end. */
    function stressWasm(mod, X, k, off, nbr, EDGE, seed, full, nPiv, near, rootL, cap, tmax, T, eta0) {
      var ex = new WebAssembly.Instance(mod, {}).exports, mem = ex.memory, n = X.length;
      var ptr = wasmLayout(ex, [n * 8, (k + 1) * 4, nbr.length * 4 + 4, cap * 4, cap * 4, cap * 2, k * 4, k * 4 + 4, k * 4, k * 4, k * 4, 8, tmax * 8, 4096, 4096]);
      new Float64Array(mem.buffer, ptr[0], n).set(X); new Int32Array(mem.buffer, ptr[1], k + 1).set(off); new Int32Array(mem.buffer, ptr[2], nbr.length).set(nbr);
      hopTables(EDGE, T.pivW, new Float32Array(mem.buffer, ptr[13], 1024), new Float32Array(mem.buffer, ptr[14], 1024));
      var cnt = ex.build(k, ptr[1], ptr[2], ptr[3], ptr[4], ptr[5], cap, full ? 0 : 1, nPiv, near, rootL, T.pivW && T.pivW !== 1 ? 1 : 0, ptr[6], ptr[7], ptr[8], ptr[9], ptr[10], ptr[11]);
      if (cnt < 0) return false;
      STRESS_WASM.pairs = cnt;
      var maxD = new Int32Array(mem.buffer, ptr[11], 1)[0], wMin = 1 / (maxD * maxD), etaMax = eta0 || 1 / wMin, etaMin = 0.1, lambda = Math.log(etaMax / etaMin) / Math.max(1, tmax - 1);
      ex.shuffle(ptr[3], ptr[4], ptr[5], cnt, seed >>> 0);
      var et = new Float64Array(mem.buffer, ptr[12], tmax); for (var t = 0; t < tmax; t++) et[t] = etaMax * Math.exp(-lambda * t);
      ex.sweeps(ptr[0], ptr[3], ptr[4], ptr[5], ptr[13], ptr[14], cnt, ptr[12], tmax);
      X.set(new Float64Array(mem.buffer, ptr[0], n));
      return true;
    }

    /**
     * For data that is not a story: places nodes so that the distance on the page is close to the number of hops between them
     * (stress, minimized by stochastic gradient descent, Zheng, Pawar and Goodman 2018). Small graphs use every pair, large ones
     * use pivots. Components are laid out one by one and packed in rows. Seeded: same data, same picture.
     */
    function networkLayout(P, G, opts) {
      opts = opts || {};
      var nodes = G.nodes, nb = nodes.length, i, e;
      var idxOf = {};
      nodes.forEach(function (nd, k) { idxOf[nd.id] = k; });
      var adj = nodes.map(function () { return []; });
      G.edges.forEach(function (ed) {
        var a = idxOf[ed.from], b = idxOf[ed.to];
        if (a !== b) { adj[a].push(b); adj[b].push(a); }
      });
      var comp = new Int32Array(nb).fill(-1), comps = [];
      for (i = 0; i < nb; i++) {
        if (comp[i] >= 0) continue;
        var cid = comps.length, q = [i];
        comp[i] = cid;
        for (var h = 0; h < q.length; h++) adj[q[h]].forEach(function (w) { if (comp[w] < 0) { comp[w] = cid; q.push(w); } });
        comps.push(q);
      }
      var rnd = mulberry32(12345), EDGE = 130, locArr = new Int32Array(nb);
      var size = function (nd) { if (nd.sizeK !== undefined) return 20 + 52 * nd.sizeK; return 26 + Math.min(26, 8 * Math.sqrt((nd.traffic || 0))) + Math.min(14, Math.sqrt(adj[idxOf[nd.id]].length) * 3); };
      var arr = opts.arrange || 'stress';
      exactNow = arr === 'stressBest' || !!opts.exact;
      if (arr === 'stressBest') arr = 'stress';
      if (arr !== 'stress' && arr !== 'force' && arr !== 'radial' && arr !== 'closeness') return globalNetwork(arr, nodes, G, adj, size, rnd, EDGE, idxOf);
      var packs = [], roughAny = false;
      comps.forEach(function (members) {
        var k = members.length, loc = new Map();
        members.forEach(function (g, li) { loc.set(g, li); locArr[g] = li; });
        var X = new Float64Array(k * 2);
        if (k === 1) { packs.push({ members: members, X: X, w: size(nodes[members[0]]) + 20, h: size(nodes[members[0]]) + 20 }); return; }
        /* start: a spiral in breadth-first order from the best-connected node, so neighbors begin close */
        var root = members.slice().sort(function (a, b) { return adj[b].length - adj[a].length || a - b; })[0];
        var seen = new Set([root]), order = [root];
        for (var oi = 0; oi < order.length; oi++) adj[order[oi]].forEach(function (w) { if (!seen.has(w)) { seen.add(w); order.push(w); } });
        order.forEach(function (g, r) { var a = r * 2.399963, rad = EDGE * 0.6 * Math.sqrt(r + 1); X[loc.get(g) * 2] = rad * Math.cos(a); X[loc.get(g) * 2 + 1] = rad * Math.sin(a); });
        if (arr === 'force' || arr === 'radial') {
          if (arr === 'force') {
            var lpairs = [], lmass = new Float64Array(k);
            members.forEach(function (g, li) { lmass[li] = 1 + Math.sqrt(adj[g].length); adj[g].forEach(function (w) { var lw = loc.get(w); if (lw > li) lpairs.push(li, lw); }); });
            forceSim(X, k, 2, lpairs, lmass, k <= 1000 ? 220 : k <= 5000 ? 240 : k <= 12000 ? 120 : 60, EDGE * 0.55, rnd);
          } else {
            var rpar = new Map([[root, -1]]), rkids = new Map(), rdep = new Map([[root, 0]]), rq = [root], rleaf = new Map(), rcount = [];
            for (var rh = 0; rh < rq.length; rh++) { var ru = rq[rh]; rkids.set(ru, []); adj[ru].forEach(function (w) { if (!rpar.has(w)) { rpar.set(w, ru); rdep.set(w, rdep.get(ru) + 1); rkids.get(ru).push(w); rq.push(w); } }); }
            for (var rr = rq.length - 1; rr >= 0; rr--) { var rn = rq[rr], kd = rkids.get(rn); rleaf.set(rn, kd.length ? kd.reduce(function (a, c) { return a + rleaf.get(c); }, 0) : 1); var dd0 = rdep.get(rn); rcount[dd0] = (rcount[dd0] || 0) + 1; }
            var rrad = [0]; for (var rd = 1; rd < rcount.length; rd++) rrad[rd] = Math.max(rrad[rd - 1] + EDGE, rcount[rd] * 56 / (2 * Math.PI));
            var span = new Map([[root, [0, 2 * Math.PI]]]);
            rq.forEach(function (rn2) {
              var sp = span.get(rn2), a0 = sp[0], tot = rleaf.get(rn2), kd2 = rkids.get(rn2), mid = (sp[0] + sp[1]) / 2, R = rrad[rdep.get(rn2)] || 0;
              X[loc.get(rn2) * 2] = R * Math.cos(mid); X[loc.get(rn2) * 2 + 1] = R * Math.sin(mid);
              kd2.forEach(function (c) { var w = (sp[1] - sp[0]) * rleaf.get(c) / tot; span.set(c, [a0, a0 + w]); a0 += w; });
            });
          }
        } else if (arr === 'closeness') {
          closenessComponent(X, k, members, adj, locArr, root, EDGE, rnd);
        } else {
        STRESS.previewHit = false;
        stressComponent(X, k, members, adj, locArr, root, EDGE, rnd);
        }
        var rough = STRESS.previewHit; STRESS.previewHit = false;   // this piece stopped at the early-preview stage: no clean-up, the final build does it
        /* push overlapping nodes apart (grid buckets, a few passes) */
        if ((arr === 'stress' || arr === 'closeness') && STRESS.spread) {   // crowded pictures are first stretched so the items cover about a third of the page; then little is left to push apart
          var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, discs = 0, rr0;
          for (var si = 0; si < k; si++) { rr0 = size(nodes[members[si]]) / 2 + 8; discs += Math.PI * rr0 * rr0; if (X[si * 2] < bx0) bx0 = X[si * 2]; if (X[si * 2] > bx1) bx1 = X[si * 2]; if (X[si * 2 + 1] < by0) by0 = X[si * 2 + 1]; if (X[si * 2 + 1] > by1) by1 = X[si * 2 + 1]; }
          var f0 = Math.sqrt((discs / STRESS.spread) / (Math.max(1, bx1 - bx0) * Math.max(1, by1 - by0)));
          if (f0 > 1) { f0 = Math.min(f0, 8); for (var sj = 0; sj < k * 2; sj++) X[sj] *= f0; }
        }
        if (!rough && ((arr !== 'stress' && arr !== 'closeness') || STRESS.sepPasses > 0)) clearOverlaps(X, k, 2, function (li) { return size(nodes[members[li]]) / 2 + 8; }, arr === 'stress' || arr === 'closeness' ? STRESS.sepPasses : 30, STRESS.growRounds, STRESS.grow);
        if (STRESS.settle && !rough) settleOverlaps(X, k, 2, function (li) { return size(nodes[members[li]]) / 2 + 2; });
        if (rough) roughAny = true;
        var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (var li4 = 0; li4 < k; li4++) { var rr = size(nodes[members[li4]]) / 2; x0 = Math.min(x0, X[li4 * 2] - rr); x1 = Math.max(x1, X[li4 * 2] + rr); y0 = Math.min(y0, X[li4 * 2 + 1] - rr); y1 = Math.max(y1, X[li4 * 2 + 1] + rr); }
        for (var li5 = 0; li5 < k; li5++) { X[li5 * 2] -= x0; X[li5 * 2 + 1] -= y0; }
        packs.push({ members: members, X: X, w: x1 - x0 + 40, h: y1 - y0 + 40 });
      });
      /* pack the components in rows, biggest first, aiming at a wide picture */
      var sorted = packs.slice().sort(function (a, b) { return b.members.length - a.members.length; });
      var area = 0;
      sorted.forEach(function (p) { area += p.w * p.h; });
      var rowW = Math.max(sorted.length ? sorted[0].w : 0, Math.sqrt(area * 1.6)), cx2 = 0, cy2 = 0, rowH = 0, W = 0, H = 0;
      sorted.forEach(function (p) {
        if (cx2 > 0 && cx2 + p.w > rowW) { cx2 = 0; cy2 += rowH; rowH = 0; }
        for (var li = 0; li < p.members.length; li++) {
          var nd = nodes[p.members[li]], sz = size(nd);
          nd.w = nd.h = sz;
          nd.x = 20 + cx2 + p.X[li * 2] - sz / 2 + 20;
          nd.y = 20 + cy2 + p.X[li * 2 + 1] - sz / 2 + 20;
          nd.shape = 'dot';
          nd.layer = 0;
          nd.cx = nd.x + sz / 2; nd.cy = nd.y + sz / 2;
          W = Math.max(W, nd.x + sz); H = Math.max(H, nd.y + sz);
        }
        cx2 += p.w; rowH = Math.max(rowH, p.h);
      });
      var pos = {};
      nodes.forEach(function (nd) { pos[nd.id] = nd; });
      G.edges.forEach(function (ed) { ed.kind = ed.from === ed.to ? 'self' : 'fwd'; ed.pts = []; });
      return { kind: 'network', dir: 'none', nodes: nodes, edges: G.edges, pos: pos, order: {}, width: W + 60, height: H + 60, crossings: 0, arrange: arr, is3d: false, rough: roughAny };
    }

    /* Tuning knobs for the 3D force arrangement (the benchmark may change them; the app never does). */
    var FORCE3 = { fullMax: 700, pivMin: 24, pivMax: 150, pivBudget: 250000, pivW: 1, near: 40, nearBig: 24, iters: 20, old: false, polish: null, polishHi: 3, polishLo: 0.05 };   // polish: force steps after the stress start (null = by size)

    /** One sweep of stress gradient descent in 3D over the pairs as they lie in memory (forward or backward). */
    function sgdSweep3(X, pa, pb, pd, pw, cnt, eta, back) {
      var q = back ? cnt - 1 : 0, step = back ? -1 : 1;
      for (var n = 0; n < cnt; n++, q += step) {
        var mu = pw[q] * eta; if (mu > 1) mu = 1;
        var a3 = pa[q] * 3, b3 = pb[q] * 3, dx = X[a3] - X[b3], dy = X[a3 + 1] - X[b3 + 1], dz = X[a3 + 2] - X[b3 + 2], mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        var r = (mu * (mag - pd[q])) / (2 * mag), rx = r * dx, ry = r * dy, rz = r * dz;
        X[a3] -= rx; X[a3 + 1] -= ry; X[a3 + 2] -= rz; X[b3] += rx; X[b3 + 1] += ry; X[b3 + 2] += rz;
      }
    }

    /**
     * Stress layout in 3D for one connected piece (local numbering, links as off/nbr): distance in space follows the hop count.
     * Same method as the flat Distances layout (pivot items far apart + links + a few near neighbors, weights 1/hops^2, stochastic
     * gradient descent that cools), carried to three dimensions. X holds 3 numbers per item and is changed in place.
     */
    function stress3d(X, k, off, nbr, EDGE, rnd) {
      var T = FORCE3, full = k <= T.fullMax, i, j, h, u, w, m2 = off[k];
      var dist = new Int32Array(k), queue = new Int32Array(k);
      function bfs(src) {
        dist.fill(-1); dist[src] = 0; queue[0] = src;
        var head = 0, tail = 1;
        while (head < tail) { u = queue[head++]; var du = dist[u] + 1; for (var e = off[u], e1 = off[u + 1]; e < e1; e++) { w = nbr[e]; if (dist[w] < 0) { dist[w] = du; queue[tail++] = w; } } }
      }
      var near = Math.min(k > 20000 ? T.nearBig : T.near, Math.max(2, Math.floor(4e6 / k)));
      var nPiv = full ? k : Math.min(k, Math.max(4, Math.min(Math.max(T.pivMin, Math.min(T.pivMax, Math.round(T.pivBudget / k))), Math.floor(8e6 / k))));
      var cap = full ? (k * (k - 1)) / 2 : nPiv * k + m2 / 2 + k * near;
      var pa = new Int32Array(cap), pb = new Int32Array(cap), pd = new Float32Array(cap), pw = new Float32Array(cap), cnt = 0, maxD = 1, root = 0;
      for (i = 1; i < k; i++) if (off[i + 1] - off[i] > off[root + 1] - off[root]) root = i;
      function add(a, b, d, wm) { if (cnt >= cap) return; pa[cnt] = a; pb[cnt] = b; pd[cnt] = d * EDGE; pw[cnt] = (wm || 1) / (d * d); cnt++; if (d > maxD) maxD = d; }
      bfs(root);   // start: items in breadth-first order from the best-connected one along a spiral over a sphere, so neighbors begin close
      var ga = Math.PI * (3 - Math.sqrt(5)), R0 = EDGE * Math.cbrt(k) * 0.9;
      for (i = 0; i < k; i++) { var yy = k > 1 ? 1 - 2 * i / (k - 1) : 0, rr0 = Math.sqrt(Math.max(0, 1 - yy * yy)), th0 = i * ga, q0 = queue[i] * 3; X[q0] = R0 * rr0 * Math.cos(th0); X[q0 + 1] = R0 * yy; X[q0 + 2] = R0 * rr0 * Math.sin(th0); }
      if (full) {
        for (i = 0; i < k; i++) { bfs(i); for (j = i + 1; j < k; j++) if (dist[j] > 0) add(i, j, dist[j]); }
      } else {
        var minD = new Int32Array(k).fill(1e9), piv = root;
        for (h = 0; h < nPiv; h++) {
          bfs(piv);
          var far = -1, fd = -1;
          for (j = 0; j < k; j++) { var dj = dist[j]; if (dj < minD[j]) minD[j] = dj; if (minD[j] > fd) { fd = minD[j]; far = j; } if (j !== piv && dj > 0) add(piv, j, dj, T.pivW); }
          piv = far;
        }
        for (i = 0; i < k; i++) for (j = off[i]; j < off[i + 1]; j++) if (nbr[j] > i) add(i, nbr[j], 1);
        if (near > 0) {
          var stamp = new Int32Array(k).fill(-1), dl = new Int32Array(k);
          for (i = 0; i < k; i++) {
            var tail2 = 1, head2 = 0, got = 0; queue[0] = i; stamp[i] = i; dl[i] = 0;
            while (head2 < tail2 && got < near) {
              u = queue[head2++];
              for (var e2 = off[u], e3 = off[u + 1]; e2 < e3 && got < near; e2++) {
                w = nbr[e2];
                if (stamp[w] !== i) { stamp[w] = i; dl[w] = dl[u] + 1; queue[tail2++] = w; if (dl[w] >= 2 && w > i) { add(i, w, dl[w]); got++; } }
              }
            }
          }
        }
      }
      var tmax = full ? (k <= 300 ? 30 : 20) : T.iters, etaMax = maxD * maxD, etaMin = 0.1, lambda = Math.log(etaMax / etaMin) / Math.max(1, tmax - 1);
      var s = (rnd() * 4294967296) | 0 || 1, t, p, q;
      function nextInt(n) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296 * n) | 0; }
      for (q = cnt - 1; q > 0; q--) {
        j = nextInt(q + 1);
        p = pa[q]; pa[q] = pa[j]; pa[j] = p; p = pb[q]; pb[q] = pb[j]; pb[j] = p;
        var f = pd[q]; pd[q] = pd[j]; pd[j] = f; f = pw[q]; pw[q] = pw[j]; pw[j] = f;
      }
      for (t = 0; t < tmax; t++) sgdSweep3(X, pa, pb, pd, pw, cnt, etaMax * Math.exp(-lambda * t), t & 1);
    }

    /**
     * Start picture for the 3D force arrangement: every connected piece gets its own 3D stress layout (so far-apart items start far apart
     * and the whole is already unfolded), then the pieces are set on a sphere around the biggest one. Returns the 3D positions.
     */
    function stressStart3d(nb, adj, rnd, EDGE) {
      var X = new Float64Array(nb * 3), comp = new Int32Array(nb).fill(-1), comps = [], i, j, c;
      for (i = 0; i < nb; i++) {
        if (comp[i] >= 0) continue;
        var q = [i]; comp[i] = comps.length;
        for (var h = 0; h < q.length; h++) { var l = adj[q[h]]; for (j = 0; j < l.length; j++) if (comp[l[j]] < 0) { comp[l[j]] = comps.length; q.push(l[j]); } }
        comps.push(q);
      }
      comps.sort(function (a, b) { return b.length - a.length || a[0] - b[0]; });
      var rad = new Float64Array(comps.length), loc = new Int32Array(nb), ctr = new Float64Array(comps.length * 3);
      comps.forEach(function (mem, ci) {
        var k = mem.length, a, b;
        if (k === 1) { rad[ci] = EDGE * 0.5; return; }
        var off = new Int32Array(k + 1), tot = 0;
        for (a = 0; a < k; a++) { loc[mem[a]] = a; tot += adj[mem[a]].length; off[a + 1] = tot; }
        var nbr = new Int32Array(tot), Y = new Float64Array(3 * k);
        for (a = 0; a < k; a++) { var ls = adj[mem[a]]; for (b = 0; b < ls.length; b++) nbr[off[a] + b] = loc[ls[b]]; }
        stress3d(Y, k, off, nbr, EDGE, rnd);
        var mx = 0, my = 0, mz = 0, r2 = 0;
        for (a = 0; a < k; a++) { mx += Y[3 * a]; my += Y[3 * a + 1]; mz += Y[3 * a + 2]; }
        mx /= k; my /= k; mz /= k;
        for (a = 0; a < k; a++) { Y[3 * a] -= mx; Y[3 * a + 1] -= my; Y[3 * a + 2] -= mz; r2 = Math.max(r2, Y[3 * a] * Y[3 * a] + Y[3 * a + 1] * Y[3 * a + 1] + Y[3 * a + 2] * Y[3 * a + 2]); X.set(Y.subarray(3 * a, 3 * a + 3), 3 * mem[a]); }
        rad[ci] = Math.sqrt(r2) + EDGE * 0.5;
      });
      if (comps.length > 1) {   // the other pieces sit on a shell around the biggest, in order of size
        var area = 0; for (c = 1; c < comps.length; c++) area += rad[c] * rad[c] * 4;
        var Rsh = Math.max(rad[0] + rad[1] + EDGE, Math.sqrt(area / (4 * Math.PI) * 1.5)), ga2 = Math.PI * (3 - Math.sqrt(5)), m = comps.length - 1;
        for (c = 1; c < comps.length; c++) {
          var yy = m > 1 ? 1 - 2 * (c - 1) / (m - 1) : 0, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = (c - 1) * ga2, mem2 = comps[c], dx = Rsh * rr * Math.cos(th), dy = Rsh * yy, dz = Rsh * rr * Math.sin(th);
          for (j = 0; j < mem2.length; j++) { X[3 * mem2[j]] += dx; X[3 * mem2[j] + 1] += dy; X[3 * mem2[j] + 2] += dz; }
        }
      }
      return X;
    }

    /** Arrangements that place everything at once (no component packing): circle, rings, grid, groups, and the 3D ones. */
    function globalNetwork(arr, nodes, G, adj, size, rnd, EDGE, idxOf) {
      var nb = nodes.length, res, X, dim, i;
      if (arr === 'force3d') {
        dim = 3; X = new Float64Array(nb * 3);
        var mass = new Float64Array(nb), pairs = [];
        for (i = 0; i < nb; i++) { mass[i] = 1 + Math.sqrt(adj[i].length); adj[i].forEach(function (w) { if (w > i) pairs.push(i, w); }); }
        if (FORCE3.old) {   // the old start (Fibonacci sphere) and iteration counts, kept for the benchmark's before/after
          var Rs = Math.sqrt(nb) * EDGE * 0.35 + 40, ga = Math.PI * (3 - Math.sqrt(5));
          for (i = 0; i < nb; i++) { var y = nb > 1 ? 1 - 2 * i / (nb - 1) : 0, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = i * ga; X[i * 3] = Rs * rr * Math.cos(th) + (rnd() - 0.5); X[i * 3 + 1] = Rs * y; X[i * 3 + 2] = Rs * rr * Math.sin(th); }
          forceSim(X, nb, 3, pairs, mass, nb <= 300 ? 260 : nb <= 1500 ? 160 : nb <= 6000 ? 90 : 45, EDGE * 0.55, rnd);
        } else {
          X = stressStart3d(nb, adj, rnd, EDGE);
          var pit = FORCE3.polish !== null ? FORCE3.polish : nb <= 15000 ? 20 : nb <= 30000 ? 12 : 5;
          if (pit > 0) forceSim(X, nb, 3, pairs, mass, pit, EDGE * 0.55, rnd, FORCE3.polishHi, FORCE3.polishLo);
        }
      } else { res = arrangeAll(arr, nodes, adj, size, rnd, EDGE); X = res.X; dim = res.dim; }
      if (dim === 2) { clearOverlaps(X, nb, 2, function (q) { return size(nodes[q]) / 2 + 8; }, 40, STRESS.growRounds, STRESS.grow); if (STRESS.settle) settleOverlaps(X, nb, 2, function (q) { return size(nodes[q]) / 2 + 2; }); }
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (i = 0; i < nb; i++) { var r = size(nodes[i]) / 2; x0 = Math.min(x0, X[i * dim] - r); x1 = Math.max(x1, X[i * dim] + r); y0 = Math.min(y0, X[i * dim + 1] - r); y1 = Math.max(y1, X[i * dim + 1] + r); if (dim === 3) { z0 = Math.min(z0, X[i * 3 + 2]); z1 = Math.max(z1, X[i * 3 + 2]); } }
      if (!nb) { x0 = x1 = y0 = y1 = 0; }
      var zc = dim === 3 ? (z0 + z1) / 2 : 0;
      nodes.forEach(function (nd, q) {
        var sz = size(nd); nd.w = nd.h = sz; nd.cx = X[q * dim] - x0 + 40; nd.cy = X[q * dim + 1] - y0 + 40; nd.x = nd.cx - sz / 2; nd.y = nd.cy - sz / 2; nd.shape = 'dot'; nd.layer = 0;
        if (dim === 3) nd.z = X[q * 3 + 2] - zc;
      });
      var pos = {}; nodes.forEach(function (nd) { pos[nd.id] = nd; });
      G.edges.forEach(function (ed) { ed.kind = ed.from === ed.to ? 'self' : 'fwd'; ed.pts = []; });
      var W = x1 - x0 + 80, H = y1 - y0 + 80;
      return { kind: 'network', dir: 'none', nodes: nodes, edges: G.edges, pos: pos, order: {}, width: W, height: H, crossings: 0, arrange: arr, is3d: dim === 3, c3: [W / 2, H / 2, 0], radius3: Math.max(W, H, dim === 3 ? z1 - z0 : 0) / 2 };
    }


    /** Quick groups for data that has no group column: label propagation, deterministic. Returns group number per node (0 = biggest). */
    function communities(P) {
      var n = P.n, lab = new Int32Array(n), i, k;
      for (i = 0; i < n; i++) lab[i] = i;
      var order = [];
      for (i = 0; i < n; i++) order.push(i);
      order.sort(function (a, b) { return outdeg(P, b) + indeg(P, b) - outdeg(P, a) - indeg(P, a) || a - b; });
      var count = new Map();
      for (var sweep = 0; sweep < 20; sweep++) {
        var changed = 0;
        for (var oi = 0; oi < n; oi++) {
          var v = order[oi];
          count.clear();
          for (k = P.outStart[v]; k < P.outStart[v + 1]; k++) { var e = P.outEdge[k], w = P.to[e]; count.set(lab[w], (count.get(lab[w]) || 0) + P.w[e]); }
          for (k = P.inStart[v]; k < P.inStart[v + 1]; k++) { var e2 = P.inEdge[k], u = P.from[e2]; count.set(lab[u], (count.get(lab[u]) || 0) + P.w[e2]); }
          if (!count.size) continue;
          var bestL = lab[v], bestW = count.get(lab[v]) || 0;
          count.forEach(function (wt, l) { if (wt > bestW + 1e-12 || (Math.abs(wt - bestW) <= 1e-12 && l < bestL)) { bestW = wt; bestL = l; } });
          if (bestL !== lab[v]) { lab[v] = bestL; changed++; }
        }
        if (!changed) break;
      }
      var size = new Map();
      for (i = 0; i < n; i++) size.set(lab[i], (size.get(lab[i]) || 0) + 1);
      var ranked = Array.from(size.keys()).sort(function (a, b) { return size.get(b) - size.get(a) || a - b; });
      var rankOf = new Map(ranked.map(function (l, r) { return [l, r]; }));
      var out = new Int32Array(n);
      for (i = 0; i < n; i++) out[i] = rankOf.get(lab[i]);
      return out;
    }

    /* ---------------------------------------------------------------- 8. scoring a drawing */
    function segCross(a, b, c, d) {
      var o = function (p, q, r) { return Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); };
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    }
    function metrics(L, ms, cls, prevPos, quick) {
      var nodes = L.nodes, n = nodes.length, C = {};
      nodes.forEach(function (nd) { C[nd.id] = [nd.cx !== undefined ? nd.cx : nd.x + nd.w / 2, nd.cy !== undefined ? nd.cy : nd.y + nd.h / 2]; });
      var cross = 0, segs = [], notMeasured = [];
      if (L.kind === 'arc') {
        /* every arc is drawn above the line, forward or back, so two arcs cross when their ends interleave: a < c < b < d. Counted in n log n (a tree over the right ends). */
        var iv = L.edges.filter(function (e) { return e.from !== e.to; }).map(function (e) { return [Math.min(L.pos[e.from].ai, L.pos[e.to].ai), Math.max(L.pos[e.from].ai, L.pos[e.to].ai)]; });
        iv.sort(function (p, q) { return p[0] - q[0]; });
        var bit = new Float64Array(n + 3), bitAdd = function (x) { for (x += 1; x < bit.length; x += x & -x) bit[x]++; }, bitSum = function (x) { var r = 0; for (x += 1; x > 0; x -= x & -x) r += bit[x]; return r; };
        for (var i = 0; i < iv.length;) {
          var i2 = i; while (i2 < iv.length && iv[i2][0] === iv[i][0]) i2++;
          for (var j = i; j < i2; j++) cross += bitSum(iv[j][1] - 1) - bitSum(iv[j][0]);
          for (j = i; j < i2; j++) bitAdd(iv[j][1]);
          i = i2;
        }
      } else if (L.kind !== 'matrix') {
        L.edges.forEach(function (e, ei) {
          if (e.from === e.to || e.kind === 'tag') return;   /* a tagged link is not drawn across the page, so it crosses nothing */
          var pts = [C[e.from]].concat(e.pts || [], [C[e.to]]);
          for (var q = 0; q + 1 < pts.length; q++) segs.push([pts[q], pts[q + 1], ei]);
        });
        if (segs.length <= 4000) {
          var box = segs.map(function (sg) { return [Math.min(sg[0][0], sg[1][0]), Math.max(sg[0][0], sg[1][0]), Math.min(sg[0][1], sg[1][1]), Math.max(sg[0][1], sg[1][1])]; });
          for (var x = 0; x < segs.length; x++) for (var y = x + 1; y < segs.length; y++) {
            var bi = box[x], bj = box[y];
            if (bi[1] < bj[0] || bj[1] < bi[0] || bi[3] < bj[2] || bj[3] < bi[2]) continue;
            if (segs[x][2] === segs[y][2]) continue;
            if (segCross(segs[x][0], segs[x][1], segs[y][0], segs[y][1])) cross++;
          }
        } else { cross = null; notMeasured.push('crossings'); }   /* too many segments to test every pair: say so, never report a perfect score */
      }
      var fwd = 0, fl = 0;
      L.edges.forEach(function (e) {
        if (e.from === e.to) return;
        var a2 = C[e.from], b2 = C[e.to], dd = L.dir === 'TB' ? b2[1] - a2[1] : b2[0] - a2[0];
        fl++; if (dd > 0) fwd++;
      });
      var ne = Math.max(1, L.edges.length);
      if (quick) return { scores: null, notMeasured: notMeasured, raw: { crossings: cross, ms: ms, backward: fl - fwd, edges: L.edges.length } };
      var dist = function (a3, b3) { return Math.hypot(C[a3][0] - C[b3][0], C[a3][1] - C[b3][1]); };
      var adj = {}, np = 0, npn = 0;
      L.edges.forEach(function (e) { if (e.from !== e.to) { (adj[e.from] = adj[e.from] || new Set()).add(e.to); (adj[e.to] = adj[e.to] || new Set()).add(e.from); } });
      if (n > 600) notMeasured.push('neighbors');
      if (n > 1 && n <= 600) nodes.forEach(function (nd) {
        var k = adj[nd.id] ? adj[nd.id].size : 0;
        if (!k) return;
        var near = [];
        for (var oi = 0; oi < nodes.length; oi++) {
          var o = nodes[oi];
          if (o === nd) continue;
          var dd = dist(nd.id, o.id);
          if (near.length === k && dd >= near[k - 1][0]) continue;
          var at = near.length;
          while (at > 0 && near[at - 1][0] > dd) at--;
          near.splice(at, 0, [dd, o]);
          if (near.length > k) near.pop();
        }
        np += near.filter(function (z) { return adj[nd.id].has(z[1].id); }).length / k; npn++;
      });
      var gs = 0, gsn = 0;
      if (cls && n > 600) notMeasured.push('groups');
      if (cls && n > 1 && n <= 600) nodes.forEach(function (nd) {
        if (!cls[nd.id]) return;
        var bestN = null, bd = Infinity;
        nodes.forEach(function (o) { if (o !== nd && cls[o.id]) { var dd = dist(nd.id, o.id); if (dd < bd) { bd = dd; bestN = o; } } });
        if (bestN) { gs += cls[bestN.id] === cls[nd.id] ? 1 : 0; gsn++; }
      });
      var mv = 0, mvn = 0;
      if (prevPos) nodes.forEach(function (nd) { var p = prevPos[nd.id]; if (p) { mv += Math.hypot(C[nd.id][0] - p[0], C[nd.id][1] - p[1]); mvn++; } });
      var W = L.width || 1, H = L.height || 1, r = W / H, target = 1.6, area = 0;
      nodes.forEach(function (nd) { area += (nd.w || 12) * (nd.h || 12); });
      var fill = Math.min(1, (area / (W * H)) * 4);
      var grid = L.kind === 'matrix', noDir = L.dir === 'none';
      return {
        notMeasured: notMeasured,
        scores: {
          crossings: grid || cross === null ? null : 1 / (1 + cross / ne), neighbors: n > 600 ? null : npn ? np / npn : 1, groups: gsn ? gs / gsn : null,
          stability: mvn ? Math.max(0, 1 - mv / mvn / MAP_W) : null, flow: grid || noDir ? null : fl ? fwd / fl : 1,
          compact: (Math.min(r, target) / Math.max(r, target)) * 0.5 + fill * 0.5, speed: 1 / (1 + ms / 60)
        },
        raw: { crossings: cross, moved: mvn ? mv / mvn : 0, ms: ms, backward: fl - fwd, edges: L.edges.length }
      };
    }
    var TASKS = {
      edit: { label: 'Editing the structure', w: { crossings: 0.3, neighbors: 0.2, stability: 0.2, flow: 0.15, compact: 0.1, speed: 0.05 } },
      beats: { label: 'Reading the story beats', w: { flow: 0.3, crossings: 0.25, compact: 0.2, neighbors: 0.1, stability: 0.1, speed: 0.05 } },
      groups: { label: 'Seeing the groups', w: { groups: 0.35, crossings: 0.2, neighbors: 0.2, stability: 0.15, speed: 0.1 } }
    };
    function taskScore(scores, task) {
      var s = 0, w = 0;
      Object.keys(TASKS[task].w).forEach(function (k) {
        if (scores[k] !== null && scores[k] !== undefined) { s += scores[k] * TASKS[task].w[k]; w += TASKS[task].w[k]; }
      });
      return w ? s / w : 0;
    }

    /* ---------------------------------------------------------------- 9. one call: data in, drawing out */
    var VIEWS = [
      ['flow', 'Flow', 'Left to right: how things lead on from the start.'],
      ['down', 'Top-down', 'The same drawing, top to bottom.'],
      ['spine', 'Choke-point spine', 'Places every route to the goal must pass, held on one line.'],
      ['lanes', 'Lanes', 'One band per group; items in several groups sit in the middle.'],
      ['shape', 'Shape', 'The stretches between choke points, each named by its pattern.'],
      ['river', 'River', 'Simulated walkers pour through; the wider the band, the more take that arrow.'],
      ['arc', 'Arc', 'Everything on one line; arcs show the links, long arcs are long jumps.'],
      ['matrix', 'Matrix', 'A grid of who links to whom; patterns show clusters and loops.'],
      ['network', 'Network', 'Closeness on the page follows closeness in the data; for data that is not a story.']
    ];
    /* ---------------------------------------------------------------- channels: numbers and categories from the data */
    function aggOf(vals, how) {
      var s = 0, c = 0, mx = -Infinity;
      for (var i = 0; i < vals.length; i++) { var v = vals[i]; if (v === v) { s += v; c++; if (v > mx) mx = v; } }
      if (!c) return NaN;
      return how === 'mean' ? s / c : how === 'max' ? mx : s;
    }
    function rangeOf(arr) {
      var mn = Infinity, mx = -Infinity, sm = 0, c = 0;
      for (var i = 0; i < arr.length; i++) { var v = arr[i]; if (v === v) { if (v < mn) mn = v; if (v > mx) mx = v; sm += v; c++; } }
      return c ? { min: mn, max: mx, sum: sm, n: c } : { min: 0, max: 0, sum: 0, n: 0 };
    }
    /** One number per drawn box for a channel string (NaN where the data has none). */
    function nodeChan(P, G, ch, how, imp, flow, o) {
      var out = new Float64Array(G.nodes.length).fill(NaN), t = C.split(ch);
      if (!t) return out;
      var one = function (i) {
        if (t.t === 'col' || t.t === 'weight') return C.numOf(P.nodes[i], t);
        if (t.t !== 'sys') return NaN;
        var k = t.key, v, a, e;
        if (k === 'degree') return outdeg(P, i) + indeg(P, i);
        if (k === 'in') return indeg(P, i);
        if (k === 'out') return outdeg(P, i);
        if (k === 'inW') { v = 0; for (a = P.inStart[i]; a < P.inStart[i + 1]; a++) v += P.rw[P.inEdge[a]]; return v; }
        if (k === 'outW') { v = 0; for (e = P.outStart[i]; e < P.outStart[i + 1]; e++) v += P.rw[P.outEdge[e]]; return v; }
        if (k === 'traffic') return imp.traffic[i];
        if (k === 'visits') return flow ? flow.visits[i] : NaN;
        if (k === 'sim') return o.sim && o.sim.visits ? o.sim.visits[P.norig[i]] : NaN;
        return NaN;
      };
      G.nodes.forEach(function (n, gi) {
        if (n.pages.length === 1) { out[gi] = one(n.pages[0]); return; }
        var vals = n.pages.map(one);
        out[gi] = aggOf(vals, how);
      });
      return out;
    }
    /** One number per drawn arrow for a channel string. */
    function edgeChan(P, G, ch, how, flow, o) {
      var out = new Float64Array(G.edges.length).fill(NaN), t = C.split(ch);
      if (!t) return out;
      G.edges.forEach(function (ed, gi) {
        var vals = ed.srcs.map(function (ei) {
          if (t.t === 'col' || t.t === 'weight') return C.numOf(P.edges[P.eorig[ei]], t);
          if (t.t === 'sys') {
            if (t.key === 'count') return 1;
            if (t.key === 'flow') return flow ? flow.moves[ei] : NaN;
            if (t.key === 'sim') return o.sim && o.sim.moves ? o.sim.moves[P.eorig[ei]] : NaN;
          }
          return NaN;
        });
        out[gi] = aggOf(vals, t.t === 'sys' || how === 'sum' ? 'sum' : how);
      });
      return out;
    }
    /** Is a column on the items mostly numbers? ('num'), words ('cat'), or not a column ('special'). */
    function colorMode(P, ch) {
      var t = C.split(ch);
      if (!t || t.t !== 'col' || t.key === 'group') return { t: 'special' };
      var num = 0, any = 0, n = Math.min(P.n, 4000);
      for (var i = 0; i < n; i++) {
        var node = P.nodes[i], at = node.attrs, v = at && t.key in at ? at[t.key] : node[t.key];
        if (v === undefined || v === null || v === '') continue;
        any++; if (C.num(v) === C.num(v)) num++;
      }
      return { t: any && num >= 0.9 * any ? 'num' : 'cat', key: t.key };
    }

    function groupKey(nd, by) {
      var g = by === 'group' || !by ? nd.group : nd.attrs && nd.attrs[by];
      return g === undefined || g === null || g === '' ? '(none)' : String(g);
    }
    /**
     * o: { view, dir, fold, merge, open, laneBy, colorBy ('group'|'choke'|'traffic'|'odds'|'heat'|'found'), mode ('random'|'first'|'curious'),
     *      runs, weights, block, hideKinds, start, prev (order from last time), traffic (size by traffic) }
     * Returns the drawing L with everything the screen needs on the boxes and arrows; nothing in it needs the engine.
     */
    function build(graph, o) {
      o = o || {};
      var t0 = now(), view = o.view || 'flow';
      var P = prepare(graph, o);
      var imp = importance(P);
      var flowing = view === 'river', amounts = flowing && !!o.amounts;
      var sysFlow = [o.sizeBy, o.widthBy, o.edgeColorBy, o.colorBy].some(function (c) { return c && /^sys:(flow|visits)$/.test(c); });
      var needFlow = (flowing && !amounts) || o.colorBy === 'odds' || o.colorBy === 'heat' || o.wantFlow || sysFlow;
      var flow = null, classes = null;
      if (needFlow && P.start >= 0) {
        if (o.mode && o.mode !== 'random') flow = flowSim(P, imp, o);
        else {
          classes = endClasses(P, imp, o);
          var ab = absorb(P, imp, o, classes.classOf, classes.K), nn0 = P.n, zg = new Float64Array(nn0), zb = new Float64Array(nn0), zn = new Float64Array(nn0), q0;
          if (classes.story) for (q0 = 0; q0 < nn0; q0++) { zg[q0] = ab.c[q0 * 3]; zb[q0] = ab.c[q0 * 3 + 1]; zn[q0] = ab.c[q0 * 3 + 2]; }
          var oc0 = classes.story ? { good: ab.start[0], bad: ab.start[1], neutral: ab.start[2], stuck: 0 } : { good: 0, bad: 0, neutral: 0, stuck: 0 };
          var got = 0; for (q0 = 0; q0 < ab.K; q0++) got += ab.start[q0];
          oc0.stuck = Math.max(0, 1 - got);
          flow = { exact: ab.converged, converged: ab.converged, residual: ab.residual, note: ab.converged ? '' : NOT_SETTLED, runs: 1, visits: ab.visits, moves: ab.moves, pGood: zg, pBad: zb, pNeutral: zn, outcome: oc0, mode: 'random', c: ab.c, K: ab.K, story: classes.story, start: ab.start, classes: classes.list.map(function (cl, k) { return { id: cl.id, label: cl.label, kind: cl.kind, p: ab.start[k] }; }) };
        }
      }
      var foldOn = o.fold !== false && !flowing && view !== 'matrix' && view !== 'network' && view !== 'shape';
      var chOn = foldOn && o.chapters > 0 && P.n > o.chapters && (view === 'flow' || view === 'down' || view === 'spine' || view === 'lanes');
      var G = mapGraph(P, imp, { fold: foldOn, open: o.open, mergeIfFolded: chOn, chapters: chOn ? { min: o.chapterMin, cap: o.chapterCap, open: o.openCh, partsAbove: o.partsAbove === undefined ? 600 : o.partsAbove, part: o.partPages } : null, merge: !!o.merge || flowing || view === 'matrix' || view === 'arc' || view === 'network' });
      var found = o.colorBy === 'found' || o.laneBy === 'found' ? communities(P) : null;
      var how = o.agg || 'sum', colCh = o.colorBy === 'sim' ? 'sys:sim' : o.colorBy, cmode = colCh && /^sys:/.test(colCh) ? { t: 'num' } : colorMode(P, colCh);
      var sizeV = o.sizeBy ? nodeChan(P, G, o.sizeBy, how, imp, flow, o) : null, sizeR = sizeV ? rangeOf(sizeV) : null;
      var colV = cmode.t === 'num' ? nodeChan(P, G, colCh, 'mean', imp, flow, o) : null, colR = colV ? rangeOf(colV) : null;
      var nodeIdx = 0;
      G.nodes.forEach(function (n) {
        var gi = nodeIdx++;
        var pg = P.nodes[n.pages[0]];
        n.traffic = 0; n.choke = false; n.visits = 0; n.pGood = 0; n.pBad = 0; n.pNeutral = 0;
        n.pages.forEach(function (pi) {
          if (imp.traffic[pi] > n.traffic) n.traffic = imp.traffic[pi];
          if (imp.choke[pi]) n.choke = true;
          if (flow) { if (flow.visits[pi] > n.visits) n.visits = flow.visits[pi]; }
        });
        n.pi = n.pages[0]; n.dom = -1; n.domP = 0;
        if (flow) {
          n.pGood = flow.pGood[n.pi]; n.pBad = flow.pBad[n.pi]; n.pNeutral = flow.pNeutral[n.pi];
          if (flow.c) { var bk = -1, bv = 0.0005; for (var qk = 0; qk < flow.K; qk++) { var cv = flow.c[n.pi * flow.K + qk]; if (cv > bv) { bv = cv; bk = qk; } } n.dom = bk; n.domP = bk >= 0 ? bv : 0; }
        }
        n.label = n.chapter ? (n.part ? 'Part · ' : 'Chapter · ') + n.pages.length.toLocaleString('en-US') + ' pages' : n.run ? n.pages.length + ' in a row' : pg.label || pg.id;
        n.sub = n.chapter ? chapterSub(n, pg) : n.run ? P.nodes[n.pages[0]].label + ' … ' + P.nodes[n.pages[n.pages.length - 1]].label : '';
        n.nodeId = pg.id;
        n.group = o.colorBy === 'found' && found ? 'group ' + (found[n.pages[0]] + 1) : groupKey(pg, cmode.t === 'cat' ? cmode.key : 'group');
        n.sizeV = sizeV ? sizeV[gi] : NaN; n.colorV = colV ? colV[gi] : NaN;
        n.start = n.pages.indexOf(P.start) >= 0;
        n.end = !n.run && !n.chapter && outdeg(P, n.pages[0]) === 0;
        n.valence = n.end ? (P.valence[n.pages[0]] === 1 ? 'good' : P.valence[n.pages[0]] === 2 ? 'bad' : 'neutral') : '';
        n.unreached = imp.depth[n.pages[0]] < 0;
        n.deg = indeg(P, n.pages[0]) + outdeg(P, n.pages[0]);
        n.inN = 0; n.outN = 0; n.inW = 0; n.outW = 0;
        n.pages.forEach(function (pi2) { n.inN += indeg(P, pi2); n.outN += outdeg(P, pi2); var q; for (q = P.inStart[pi2]; q < P.inStart[pi2 + 1]; q++) n.inW += P.rw[P.inEdge[q]]; for (q = P.outStart[pi2]; q < P.outStart[pi2 + 1]; q++) n.outW += P.rw[P.outEdge[q]]; });
        n.ghost = !!pg.ghost;
        var k = 1;
        if (o.traffic) k = 1 + 0.45 * n.traffic;
        if (sizeR && sizeR.n) { var sv = n.sizeV; k = sv === sv && sizeR.max > 0 ? 0.7 + 0.9 * Math.sqrt(Math.max(0, sv) / sizeR.max) : 0.7; n.sizeK = sv === sv && sizeR.max > 0 ? Math.sqrt(Math.max(0, sv) / sizeR.max) : 0; }
        if (view === 'spine' && n.choke) k = Math.max(k, 1.2);
        n.k = k; n.w = MAP_W * k; n.h = MAP_H * k;
        if (flowing) { n.k = 1; n.w = 14; n.h = Math.max(6, n.visits * 420); }
      });
      var widthV = o.widthBy ? edgeChan(P, G, o.widthBy, how, flow, o) : null, widthR = widthV ? rangeOf(widthV) : null;
      if (widthR && o.widthMax > widthR.max) widthR.max = o.widthMax;
      var ecT = C.split(o.edgeColorBy), ecNum = false, ecV = null, ecR = null;
      if (ecT && ecT.t === 'col' && ecT.key !== 'kind') {
        var ne = 0, an = 0; for (var ei0 = 0; ei0 < Math.min(P.m, 4000); ei0++) { var rv = (P.edges[P.eorig[ei0]].attrs || {})[ecT.key]; if (rv === undefined || rv === '') continue; an++; if (C.num(rv) === C.num(rv)) ne++; }
        ecNum = an > 0 && ne >= 0.9 * an;
      }
      if (ecNum) { ecV = edgeChan(P, G, o.edgeColorBy, 'mean', flow, o); ecR = rangeOf(ecV); }
      var ei1 = 0, amountMass = null, amountMax = 0;
      if (amounts && widthV) {
        amountMass = new Float64Array(G.nodes.length);
        var gidx = new Map(); G.nodes.forEach(function (n, k) { gidx.set(n.id, k); });
        var ins2 = new Float64Array(G.nodes.length), outs2 = new Float64Array(G.nodes.length);
        G.edges.forEach(function (e, k) { var v = widthV[k]; if (v === v && v > 0) { outs2[gidx.get(e.from)] += v; ins2[gidx.get(e.to)] += v; } });
        for (var gk = 0; gk < amountMass.length; gk++) { amountMass[gk] = Math.max(ins2[gk], outs2[gk]); if (amountMass[gk] > amountMax) amountMax = amountMass[gk]; }
      }
      G.edges.forEach(function (e) {
        var gi = ei1++, labels = [], fw = 0, wsum = 0;
        e.srcs.forEach(function (ei) {
          var orig = P.edges[P.eorig[ei]];
          if (orig.label && labels.length < 4) labels.push(orig.label);
          if (flow) fw += flow.moves[ei];
          wsum += P.w[ei];
        });
        e.label = labels.join(' / '); e.count = e.srcs.length; e.flow = fw; e.weight = wsum; e.orig = e.srcs.map(function (q) { return P.eorig[q]; });
        if (P.stated) e.absent = e.srcs.every(function (q) { return P.edges[P.eorig[q]].absent === true; });
        e.widthV = widthV ? widthV[gi] : NaN; e.colorV = ecV ? ecV[gi] : NaN;
        e.colorC = ecT && !ecNum ? (C.catOf(P.edges[P.eorig[e.srcs[0]]], ecT) || '(none)') : '';
        if (amountMass) { var av = widthV[gi]; e.flow = av === av && av > 0 && amountMax > 0 ? av / amountMax : 0; }
      });
      if (amountMass) { var gj = 0; G.nodes.forEach(function (n) { n.visits = amountMax > 0 ? amountMass[gj] / amountMax : 0; gj++; }); }
      /* groups for lanes and for the "groups" score */
      var cls = {}, laneNames = [], laneOfBox = {};
      var useLanes = view === 'lanes' || true;
      var keyOf = function (n) { return o.laneBy === 'found' && found ? 'group ' + (found[n.pages[0]] + 1) : groupKey(P.nodes[n.pages[0]], o.laneBy || 'group'); };
      G.nodes.forEach(function (n) { cls[n.id] = keyOf(n); });
      var keys = Array.from(new Set(Object.keys(cls).map(function (id) { return cls[id]; })));
      var meanDepth = new Map();   /* a Map, not {}: a group called __proto__ or constructor must not hit Object.prototype */
      G.nodes.forEach(function (n) { var k = cls[n.id], md = meanDepth.get(k); if (!md) meanDepth.set(k, md = [0, 0]); md[0] += Math.max(0, imp.depth[n.pages[0]]); md[1]++; });
      keys.sort(function (a, b) { var ma = meanDepth.get(a), mb = meanDepth.get(b); return ma[0] / ma[1] - mb[0] / mb[1] || (a < b ? -1 : 1); });
      var laneIdx = new Map();
      keys.forEach(function (k, i) { laneNames.push(k); laneIdx.set(k, i); });
      G.nodes.forEach(function (n) { laneOfBox[n.id] = laneIdx.get(cls[n.id]); });
      var root = P.start >= 0 ? G.groupOf[P.start] : undefined, prev = o.prev || undefined, Lr;
      /* optional layered-drawing choices (all off by default, so the picture is the old one): see layered() */
      var LO = { rows: o.rows === 'story' ? 'story' : undefined, tagLen: o.tagLen > 1 ? o.tagLen : 0, better: !!o.better, bundle: !!o.bundle };
      var withLO = function (x) { return Object.assign(x, LO); };
      /* top to bottom (and the Flow view turned that way): a map more than about twice as tall as wide can be cut into columns (o.wrap) */
      var downLanes = view === 'down' && o.downLanes && laneNames.length > 1;
      var topDown = function (dir) {
        var base = { dir: dir, root: root, prev: prev, spine: !!o.spineCol }, L1;
        if (downLanes) base.lane = function (n) { return Math.max(0, laneOfBox[n.id]); };
        L1 = layered(G, withLO(Object.assign({}, base)));
        if (o.wrap && dir === 'TB' && L1.height > 2.2 * L1.width) {
          var K = Math.round(Math.sqrt(1.6 * L1.height / L1.width)), R = Math.ceil(L1.info.rows / Math.max(1, K));
          if (K >= 2 && R >= 2 && R < L1.info.rows) L1 = layered(G, withLO(Object.assign({ wrapRows: R }, base)));
        }
        return L1;
      };
      if (view === 'down') Lr = topDown('TB');
      else if (view === 'spine') Lr = layered(G, withLO({ dir: 'LR', root: root, prev: prev, spine: true }));
      else if (view === 'lanes' && laneNames.length > 1) Lr = layered(G, withLO({ dir: 'LR', root: root, prev: prev, lane: function (n) { return Math.max(0, laneOfBox[n.id]); } }));
      else if (view === 'river') { Lr = layered(G, { dir: 'LR', root: root, prev: prev, gapLayer: 190, gapNode: 14 }); if (SK && o.sk) SK.apply(Lr, SK.layout(Lr, SK.options(o.sk))); }
      else if (view === 'arc') { Lr = arcLayout(G, layered(G, { dir: 'LR', root: root, prev: o.prevFlow })); }
      else if (view === 'matrix') {
        Lr = matrixLayout(G, layered(G, { dir: 'LR', root: root, prev: o.prevFlow }));
        Lr.nodes.forEach(function (n) { n.cx = n.cy = Lr.head + n.mi * Lr.cell + Lr.cell / 2; n.w = n.h = Lr.cell; });
      } else if (view === 'shape') Lr = shapeLayout(P, G);
      else if (view === 'network') { STRESS.previewStop = !!o.previewOnly; try { Lr = networkLayout(P, G, o); } finally { STRESS.previewStop = false; } }
      else Lr = topDown(o.dir === 'TB' ? 'TB' : 'LR');
      if ((view === 'lanes' || downLanes) && laneNames.length > 1) Lr.laneNames = laneNames;
      Lr.view = view;
      Lr.cls = cls;
      Lr.imp = {
        goal: imp.goal.map(function (v) { return P.nodes[v].id; }), goalKind: imp.goalKind,
        spine: imp.spine.map(function (v) { return P.nodes[v].id; }), routesLog10: imp.routesLog10, reached: imp.reached,
        chokeCount: imp.spine.length
      };
      if (chOn) {   /* which boxes every page is inside (outermost first, by the id of the page that names the box), so a search or a click on a page can open what hides it */
        var ci = G.chapterInfo, folded = G.chapters;
        Lr.chapters = { chapters: folded.filter(function (c) { return c.kind === 'chapter'; }).length, parts: folded.filter(function (c) { return c.kind === 'part'; }).length, hidden: 0, all: ci.list.length, of: {} };
        folded.forEach(function (ch) { Lr.chapters.hidden += ch.pages.length; });
        ci.list.forEach(function (ch) { if (!ch.folded) return; ch.pages.forEach(function (pi) { Lr.chapters.of[P.nodes[pi].id] = ci.of[pi]; }); });
        Lr.chapters.openOf = {};   /* pages shown now that sit inside a box the reader opened: the keys to fold it back */
        ci.list.forEach(function (ch) { if (!(o.openCh && o.openCh[ch.key])) return; ch.pages.forEach(function (pi) { if (ci.of[pi]) { var id = P.nodes[pi].id, a = Lr.chapters.openOf[id] || (Lr.chapters.openOf[id] = []); a.push(ch.key); } }); });
      }
      Lr.n = P.n; Lr.m = P.m; Lr.startId = P.start >= 0 ? P.nodes[P.start].id : null; Lr.autoStart = P.autoStart;
      Lr.flow = flow ? { exact: flow.exact, note: flow.note || '', mode: flow.mode, runs: flow.runs, outcome: flow.outcome, K: flow.K || 0, classes: flow.classes || null, story: !!flow.story } : (amounts ? { exact: true, mode: 'amounts', runs: 1, outcome: null, K: 0, classes: null, story: false } : null);
      Lr.amounts = !!amountMass;
      Lr.ch = { size: sizeR ? Object.assign({ ch: o.sizeBy }, sizeR) : null, width: widthR ? Object.assign({ ch: o.widthBy }, widthR) : null, color: colR ? Object.assign({ ch: colCh, kind: 'num' }, colR) : (cmode.t === 'cat' ? { ch: colCh, kind: 'cat' } : null), ecolor: ecR ? Object.assign({ ch: o.edgeColorBy, kind: 'num' }, ecR) : (ecT && ecT.t === 'col' ? { ch: o.edgeColorBy, kind: 'cat' } : null), linkLabels: o.linkLabels || '' };
      Lr.groups = laneNames;
      if (view === 'shape') {
        Lr.segs.forEach(function (s) {
          s.fromId = P.nodes[s.from].id; s.toId = s.to >= 0 ? P.nodes[s.to].id : null;
          s.fromLabel = P.nodes[s.from].label; s.toLabel = s.to >= 0 ? P.nodes[s.to].label : '';
          s.pageIds = s.pages.map(function (pi) { return P.nodes[pi].id; });
        });
      }
      /* the drawing does not need the engine's working lists: free them so a big result stays small */
      var NOLIST = [];
      (Lr.edges || []).forEach(function (ed) { ed.srcs = NOLIST; if (ed.pts && !ed.pts.length) ed.pts = NOLIST; });
      (Lr.nodes || []).forEach(function (nd) { nd.pages = nd.pages.length === 1 ? [nd.pages[0]] : nd.pages; });
      Lr.ms = now() - t0;
      return Lr;
    }

    /** Scores every view for the Compare table. */
    function compare(graph, o) {
      var rows = [];
      ['flow', 'down', 'spine', 'lanes', 'river', 'arc', 'matrix', 'network'].forEach(function (v) {
        var oo = Object.assign({}, o, { view: v });
        try {
          var L = build(graph, oo);
          if (v === 'lanes' && !L.laneNames) { rows.push({ view: v, skipped: 'needs two or more groups' }); return; }
          var m = metrics(L, L.ms, L.cls, null, false);
          var tasks = {};
          Object.keys(TASKS).forEach(function (t) { tasks[t] = taskScore(m.scores, t); });
          rows.push({ view: v, scores: m.scores, notMeasured: m.notMeasured, raw: m.raw, tasks: tasks, ms: L.ms });
        } catch (err) { rows.push({ view: v, skipped: String(err && err.message || err) }); }
      });
      return rows;
    }

    /** Hand an add-on to the engine: 'layers' (netflow-layers) or 'sankey' (netflow-sankey). Optional: both are also found on their own when loaded as page scripts (or, for layers, as the Node file next to this one). */
    function use(name, impl) {
      if (name === 'layers') NL = impl; else if (name === 'sankey') SK = impl; else throw new Error('netflow-engine: use() knows "layers" and "sankey", not "' + name + '"');
      return API;
    }
    var API = {
      MAP_W: MAP_W, MAP_H: MAP_H, VIEWS: VIEWS, TASKS: TASKS, prepare: prepare, importance: importance, flowExact: flowExact, flowSim: flowSim, absorb: absorb, endClasses: endClasses, spread: spread, seedsOf: seedsOf,
      separateGroups: separateGroups, mapGraph: mapGraph, layered: layered, arcLayout: arcLayout, matrixLayout: matrixLayout, shapeLayout: shapeLayout, networkLayout: networkLayout, closeTuning: CLOSE, ARRANGE_NAMES: ARRANGE_NAMES, arrangeAdvice: arrangeAdvice, forceSim: forceSim, stressWasm: STRESS_WASM, separate: separate, forceWasm: FORCE_WASM, stressTuning: STRESS, force3dTuning: FORCE3,
      communities: communities, metrics: metrics, taskScore: taskScore, build: build, compare: compare, bfs: bfs, mapCrossPairs: mapCrossPairs, mapPlaceLine: mapPlaceLine, autoStart: autoStart, use: use, columns: C
    };
    return API;
  })();

  var E = NFMEngine;
  E.version = VERSION; E.api = 1;
  E.status = function () { return { placeholder: false, version: VERSION, api: 1, message: 'netflow-engine ' + VERSION }; };
  return E;
}));
