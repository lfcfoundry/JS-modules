// The page side of the comparison bench. Copyright (c) 2026 LFC Foundry. MIT License.
// Runs one case in a fresh page: the same random graph is laid out by one library, twice (cold = first call in the page, warm = second call),
// and the picture is scored outside the timing. URL: ?lib=engine|d3|cytoscape|dagre|elk &task=force|stress|layered &n=items.
(function () {
  var Q = new URLSearchParams(location.search), lib = Q.get('lib'), task = Q.get('task'), n = +Q.get('n');
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Network: a random connected graph, a random tree plus n extra links (about 4 links per item on average).
  function network(n) {
    var r = rng(1000 + n), E = [], i;
    for (i = 1; i < n; i++) E.push([Math.floor(r() * i), i]);
    for (i = 0; i < n; i++) { var a = Math.floor(r() * n), b = Math.floor(r() * n); if (a !== b) E.push([a, b]); }
    return { n: n, edges: E, layer: null };
  }
  // Layered: one start item, then rows of equal width; every item has one or two parents in the row above, so every link joins neighbouring rows.
  function layered(n) {
    var r = rng(2000 + n), rows = Math.max(8, Math.round(Math.sqrt(n) / 1.2)), w = Math.max(2, Math.ceil((n - 1) / rows)), E = [], layer = [0], prev = [0], id = 1, k, j;
    for (k = 1; k <= rows && id < n; k++) {
      var cur = [];
      for (j = 0; j < w && id < n; j++, id++) {
        cur.push(id); layer[id] = k;
        var p1 = prev[Math.floor(r() * prev.length)]; E.push([p1, id]);
        if (prev.length > 1 && r() < 0.5) { var p2 = prev[Math.floor(r() * prev.length)]; if (p2 !== p1) E.push([p2, id]); }
      }
      prev = cur;
    }
    return { n: id, edges: E, layer: layer };
  }
  var G = task === 'layered' ? layered(n) : network(n), N = G.n;
  function ids() { var a = [], i; for (i = 0; i < N; i++) a.push('n' + i); return a; }
  var P = [];   // x, y per item after a run
  // Each runner takes no arguments, lays out the graph and fills P; it may return a promise.
  var RUN = {
    engine: function () {
      var E = window.NetflowEngine, nodes = ids().map(function (id) { return { id: id, label: id, group: '', valence: '', ghost: false, attrs: {} }; });
      var g = { start: 'n0', nodes: nodes, edges: G.edges.map(function (e) { return { from: 'n' + e[0], to: 'n' + e[1], label: '', kind: '', attrs: {} }; }) };
      var L = E.build(g, task === 'layered' ? { view: 'down', fold: false } : { view: 'network', arrange: task });
      var at = {}; L.nodes.forEach(function (o) { at[o.id] = o; });
      for (var i = 0; i < N; i++) { var o = at['n' + i]; P[i] = task === 'layered' ? [o.x, o.y] : [o.cx, o.cy]; }
    },
    d3: function () {
      var nodes = []; for (var i = 0; i < N; i++) nodes.push({ index: i });
      var links = G.edges.map(function (e) { return { source: e[0], target: e[1] }; });
      var sim = d3.forceSimulation(nodes).force('link', d3.forceLink(links).distance(30)).force('charge', d3.forceManyBody()).force('center', d3.forceCenter(0, 0)).stop();
      var ticks = Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()));   // the library's own default number of steps
      for (i = 0; i < ticks; i++) sim.tick();
      for (i = 0; i < N; i++) P[i] = [nodes[i].x, nodes[i].y];
    },
    cytoscape: function () {
      var el = [], i; for (i = 0; i < N; i++) el.push({ data: { id: 'n' + i } });
      G.edges.forEach(function (e, j) { el.push({ data: { id: 'e' + j, source: 'n' + e[0], target: 'n' + e[1] } }); });
      var cy = cytoscape({ headless: true, styleEnabled: false, elements: el });
      cy.layout({ name: 'cose', animate: false, randomize: true, nodeDimensionsIncludeLabels: false }).run();
      for (i = 0; i < N; i++) { var p = cy.getElementById('n' + i).position(); P[i] = [p.x, p.y]; }
      cy.destroy();
    },
    dagre: function () {
      var g = new dagre.graphlib.Graph(); g.setGraph({ rankdir: 'TB' }); g.setDefaultEdgeLabel(function () { return {}; });
      for (var i = 0; i < N; i++) g.setNode('n' + i, { width: 20, height: 20 });
      G.edges.forEach(function (e) { g.setEdge('n' + e[0], 'n' + e[1]); });
      dagre.layout(g);
      for (i = 0; i < N; i++) { var o = g.node('n' + i); P[i] = [o.x, o.y]; }
    },
    elk: function () {
      var elk = new ELK(), i, ch = [];
      for (i = 0; i < N; i++) ch.push({ id: 'n' + i, width: 20, height: 20 });
      var graph = { id: 'root', layoutOptions: task === 'layered' ? { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' } : { 'elk.algorithm': 'stress' }, children: ch,
        edges: G.edges.map(function (e, j) { return { id: 'e' + j, sources: ['n' + e[0]], targets: ['n' + e[1]] }; }) };
      return elk.layout(graph).then(function (res) { var at = {}; res.children.forEach(function (c) { at[c.id] = c; }); for (var i = 0; i < N; i++) P[i] = [at['n' + i].x, at['n' + i].y]; });
    }
  };
  // Scores (outside the timing). Network: stress, the mean squared relative gap between picture distance and link-count distance over 30 start items (lower is better, 0 is perfect after rescaling).
  // Layered: how many pairs of links in neighbouring rows cross each other (lower is better).
  function stress() {
    var adj = [], i, k; for (i = 0; i < N; i++) adj[i] = [];
    G.edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    var r = rng(7), swd = 0, sw = 0, sdd = 0, pairs = [];
    for (k = 0; k < 30; k++) {
      var s = Math.floor(r() * N), d = new Array(N).fill(-1), q = [s]; d[s] = 0;
      for (var h = 0; h < q.length; h++) { var u = q[h]; for (var j = 0; j < adj[u].length; j++) { var v = adj[u][j]; if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } } }
      for (i = 0; i < N; i++) if (i !== s && d[i] > 0) { var de = Math.hypot(P[i][0] - P[s][0], P[i][1] - P[s][1]); pairs.push([de, d[i]]); swd += de / d[i]; sdd += (de * de) / (d[i] * d[i]); }
    }
    var a = swd / sdd, tot = 0; pairs.forEach(function (p) { var t = (a * p[0] - p[1]) / p[1]; tot += t * t; });
    return tot / pairs.length;
  }
  function crossings() {
    var by = {}, c = 0; G.edges.forEach(function (e) { (by[G.layer[e[0]]] = by[G.layer[e[0]]] || []).push(e); });
    function ccw(a, b, c2) { return (c2[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c2[0] - a[0]); }
    Object.keys(by).forEach(function (k) { var E = by[k]; for (var i = 0; i < E.length; i++) for (var j = i + 1; j < E.length; j++) {
      var a = E[i], b = E[j]; if (a[0] === b[0] || a[1] === b[1]) continue;
      var p1 = P[a[0]], p2 = P[a[1]], p3 = P[b[0]], p4 = P[b[1]];
      if ((ccw(p1, p2, p3) > 0) !== (ccw(p1, p2, p4) > 0) && (ccw(p3, p4, p1) > 0) !== (ccw(p3, p4, p2) > 0)) c++; } });
    return c;
  }
  function overlap() { var seen = {}, d = 0; for (var i = 0; i < N; i++) { var k = Math.round(P[i][0]) + ',' + Math.round(P[i][1]); if (seen[k]) d++; seen[k] = 1; } return d; }
  function time(f) { var t0 = performance.now(); try { var r = f(); } catch (e) { return Promise.reject(e); } return Promise.resolve(r).then(function () { return performance.now() - t0; }); }
  setTimeout(function () {
    var out = { lib: lib, task: task, n: N, links: G.edges.length };
    time(RUN[lib]).then(function (ms) { out.cold = ms; return time(RUN[lib]); }).then(function (ms) {
      out.warm = ms; var bad = P.some(function (p) { return !p || !isFinite(p[0]) || !isFinite(p[1]); });
      out.finite = !bad; if (!bad) { out.quality = task === 'layered' ? crossings() : stress(); out.stacked = overlap(); }
      window.__res = out;
    }, function (e) { out.error = String(e && e.message || e); window.__res = out; });
  }, 30);
})();
