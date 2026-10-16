/* sprite-baker: a tiny software 3D rasterizer that bakes toon-shaded shapes into 2D sprites. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules */
var SpriteBaker = (function () {
  'use strict';

  /* Conventions (inherited from the code this was extracted from, kept on purpose):
     - Screen space is pixels, x to the right, y DOWN, z toward the viewer. Larger z is nearer.
     - Projection is orthographic: a vertex lands at (ox + x * scale, oy + y * scale), z is only used for the depth test.
     - A vertex is a plain array [x, y, z, nx, ny, nz] (position, then a unit-ish normal). */

  var PI2 = Math.PI * 2;
  var NO_DEPTH = -1e9;        // depth buffer clear value; anything nearer than this is drawn
  var DEFAULT_CULL = -0.75;   // triangles whose three normals' z sum is below this are skipped (see tri)
  var DEFAULT_LIGHT = [-0.42, -0.62, 0.66];   // from the upper left, toward the viewer (y is down, so -y is up)
  var DEFAULT_MAX_PIXELS = 4194304;   // ceiling on w * h * ss * ss for one working surface (8 bytes a pixel, about 32 MiB); see opts.maxPixels

  /* ------------------------------------------------------------------ small vector helpers */

  function norm3(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / l, y / l, z / l];
  }

  /* ------------------------------------------------------------------ Rast: a z-buffered RGBA surface */

  /* Rast(w, h): `z` is a Float32Array depth buffer (cleared to NO_DEPTH), `px` is a Uint8ClampedArray of RGBA bytes
     (cleared to transparent black). Nothing here touches the DOM, so it runs in Node. */
  function Rast(w, h) {
    if (!(this instanceof Rast)) return new Rast(w, h);
    this.w = w | 0;
    this.h = h | 0;
    this.z = new Float32Array(this.w * this.h).fill(NO_DEPTH);
    this.px = new Uint8ClampedArray(this.w * this.h * 4);
    this.setLight(DEFAULT_LIGHT);
  }

  /* setLight(x, y, z) or setLight([x, y, z]): the direction the light travels FROM, toward the scene. Normalized here.
     Also stores the half vector between the light and a viewer looking down -z, which the specular term uses. */
  Rast.prototype.setLight = function (x, y, z) {
    if (Array.isArray(x)) { z = x[2]; y = x[1]; x = x[0]; }
    var l = norm3(x, y, z), h = norm3(l[0], l[1], l[2] + 1);
    this.L = l;
    this.H = h;
    return this;
  };

  Rast.prototype.clear = function () {
    this.z.fill(NO_DEPTH);
    this.px.fill(0);
    return this;
  };

  /* Returns a real ImageData when the platform has one (browsers), else a plain { width, height, data } object with the
     same fields, so the result can be inspected or hashed in Node. The pixel array is shared, not copied. */
  Rast.prototype.toImageData = function () {
    return makeImage(this.w, this.h, this.px);
  };

  function makeImage(w, h, data) {
    if (typeof ImageData !== 'undefined') {
      try { return new ImageData(data, w, h); } catch (e) { /* zero size or a mismatch: fall through to the plain object */ }
    }
    return { width: w, height: h, data: data };
  }

  /* ------------------------------------------------------------------ materials: color ramp baked to a 256-entry LUT */

  /* bakeRamp(stops): stops is [[t, r, g, b], ...] with t ascending in 0..1. Returns a Uint8Array(256 * 3) of RGB, entry i
     being the ramp color at t = i / 255. Before the first stop the first color holds; after the last stop the last holds. */
  function bakeRamp(stops) {
    if (!Array.isArray(stops) || stops.length === 0) throw new Error('a color ramp needs at least one [t, r, g, b] stop');
    var lut = new Uint8Array(256 * 3), n = stops.length, i, j, t, A, B, f;
    for (i = 0; i < 256; i++) {
      t = i / 255;
      for (j = 0; j < n - 1 && t > stops[j + 1][0]; j++);
      A = stops[j];
      B = stops[Math.min(j + 1, n - 1)];
      f = B[0] === A[0] ? 0 : Math.min(1, Math.max(0, (t - A[0]) / (B[0] - A[0])));
      lut[i * 3] = Math.round(A[1] + (B[1] - A[1]) * f);
      lut[i * 3 + 1] = Math.round(A[2] + (B[2] - A[2]) * f);
      lut[i * 3 + 2] = Math.round(A[3] + (B[3] - A[3]) * f);
    }
    return lut;
  }

  function pick(v, d) { return v === undefined ? d : v; }

  /* material(stops, opts): a shading recipe. `lut` is the baked ramp. The options scale the lighting terms described in tri():
       specular (1)  strength of the three-lobe highlight        bounce (1)   warm light bouncing up from the lower right
       pool (1)      how much the ramp's dark end gathers low    rimLight (1) pale light on the right-hand silhouette
       edge (0.88)   brightness factor at a silhouette (1 = no edge darkening)
     Set any of them to 0 (edge: 1) to switch that term off. */
  function material(stops, opts) {
    opts = opts || {};
    return {
      stops: stops,
      lut: bakeRamp(stops),
      specular: pick(opts.specular, 1),
      bounce: pick(opts.bounce, 1),
      pool: pick(opts.pool, 1),
      rimLight: pick(opts.rimLight, 1),
      edge: pick(opts.edge, 0.88)
    };
  }

  var materialCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function asMaterial(m) {
    if (m && m.lut) return m;
    if (Array.isArray(m)) {   // raw stops: convert once and remember
      var hit = materialCache && materialCache.get(m);
      if (!hit) { hit = material(m); if (materialCache) materialCache.set(m, hit); }
      return hit;
    }
    throw new Error('material must be material(stops) or a raw [[t, r, g, b], ...] ramp');
  }

  /* ------------------------------------------------------------------ tri: the triangle filler and the shader */

  /* tri(rast, a, b, c, mat, opts): fill one triangle with an orthographic, z-buffered, per-pixel-shaded fill.
     a, b, c are [x, y, z, nx, ny, nz] in raster pixels. The normal is interpolated per pixel and renormalized.
     opts.cull: number (default -0.75) or false. A triangle is skipped when nz_a + nz_b + nz_c < cull, i.e. it faces well
     away from the viewer. This is only a speed-up for closed meshes; the depth buffer is what actually hides surfaces.

     Look decisions kept from the original on purpose:
     - Pixels are sampled at their centers (x + 0.5, y + 0.5).
     - Edges are inclusive with a tiny tolerance (barycentric weight >= -1e-5), so neighboring triangles leave no cracks.
       A pixel on a shared edge is simply drawn by whichever triangle gets there first.
     - Depth test is strict "nearer wins": a fragment is drawn only if z > stored z. On an exact tie the first drawn stays.
     - Depth is stored as float32 and compared as float64, which is good enough for sprites (not for z-fighting studies).
     - Alpha is binary (0 or 255). Smooth edges come from rendering larger and downsampling (see bakeSprite's `ss`).

     Shading, per pixel, with n = normalized interpolated normal and L the light direction:
       wrap     = (n.L) * 0.5 + 0.5                          half-Lambert, so the shadow side never goes fully dark
       t        = wrap^2 * 0.35 + wrap * 0.65                 a little ease toward the lit end of the ramp
       t        = t * 0.9 + bounce * 0.16 * max(0, n.(0.5, 0.72, 0.2))          fixed screen-space bounce from the lower right
       t       -= pool * 0.3 * (n.(0.55, 0.8) - 0.25) when positive             shadow tone gathers low and to the right
       t       *= edge + (1 - edge) * max(0, nz) / 0.34 when nz < 0.34          darker toward the silhouette
       color    = ramp[t] + specular * (s^16 * 0.55 + s^110 * 0.55 + s^380 * 0.5) + rimLight * rim, where s = max(0, n.H)
       rim      = 0.4 * nx * (1 - max(0, nz))^2.2 when nx > 0 and nz < 0.8        pale rim on the right edge
     The bounce, pool and rim directions are fixed in screen space on purpose; only the main light is settable. */
  function tri(rast, a, b, c, mat, opts) {
    var cull = opts && opts.cull !== undefined ? opts.cull : DEFAULT_CULL;
    if (cull !== false && a[5] + b[5] + c[5] < cull) return;
    /* A NaN or infinite number anywhere in the triangle would poison the depth buffer (NaN never loses a depth test, so
       every later triangle would overwrite that pixel). Skip such a triangle whole. One sum per triangle, not per pixel. */
    if (!isFinite(a[0] + a[1] + a[2] + a[3] + a[4] + a[5] + b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + c[0] + c[1] + c[2] + c[3] + c[4] + c[5])) return;
    mat = asMaterial(mat);

    var w = rast.w, h = rast.h, zbuf = rast.z, out = rast.px, lut = mat.lut;
    var x0 = a[0], y0 = a[1], x1 = b[0], y1 = b[1], x2 = c[0], y2 = c[1];
    var area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0 || !isFinite(area)) return;
    var minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
    var miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
    var inv = 1 / area;
    var lx = rast.L[0], ly = rast.L[1], lz = rast.L[2], hx = rast.H[0], hy = rast.H[1], hz = rast.H[2];
    var kSpec = mat.specular, kBounce = mat.bounce * 0.16, kPool = mat.pool * 0.3, kRim = mat.rimLight * 0.4, kEdge = mat.edge;
    var x, y, px, py, w0, w1, w2, z, idx, nx, ny, nz, l, wrap, t, rim, sp, ed, i3, o, r, g, bl;

    for (y = miny; y <= maxy; y++) {
      for (x = minx; x <= maxx; x++) {
        px = x + 0.5; py = y + 0.5;
        w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
        w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
        w2 = 1 - w0 - w1;
        if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;

        z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        if (!isFinite(z)) continue;   // belt and braces: never store a non-finite depth
        idx = y * w + x;
        if (z <= zbuf[idx]) continue;
        zbuf[idx] = z;

        nx = w0 * a[3] + w1 * b[3] + w2 * c[3];
        ny = w0 * a[4] + w1 * b[4] + w2 * c[4];
        nz = w0 * a[5] + w1 * b[5] + w2 * c[5];
        l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + 1e-9);
        nx *= l; ny *= l; nz *= l;

        wrap = (nx * lx + ny * ly + nz * lz) * 0.5 + 0.5;
        t = wrap * wrap * 0.35 + wrap * 0.65;
        rim = nx * 0.5 + ny * 0.72 + nz * 0.2;
        t = t * 0.9 + (rim > 0 ? rim * kBounce : 0);
        sp = nx * 0.55 + ny * 0.8;
        if (sp > 0.25) t -= (sp - 0.25) * kPool;

        sp = nx * hx + ny * hy + nz * hz;
        sp = sp > 0 ? (Math.pow(sp, 16) * 0.55 + Math.pow(sp, 110) * 0.55 + Math.pow(sp, 380) * 0.5) * kSpec : 0;

        if (nz < 0.34) t *= kEdge + (1 - kEdge) * Math.max(0, nz) / 0.34;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        i3 = ((t * 255) | 0) * 3;
        r = lut[i3]; g = lut[i3 + 1]; bl = lut[i3 + 2];

        ed = nx > 0 && nz < 0.8 ? nx * Math.pow(1 - (nz > 0 ? nz : 0), 2.2) * kRim : 0;
        o = idx * 4;
        out[o] = r + sp * 255 + ed * 255;       // Uint8ClampedArray rounds and clamps
        out[o + 1] = g + sp * 255 + ed * 255;
        out[o + 2] = bl + sp * 235 + ed * 255;  // the highlight is a hair warm: slightly less blue
        out[o + 3] = 255;
      }
    }
  }

  /* ------------------------------------------------------------------ rotation helpers */

  /* A 3x3 rotation matrix (row-major, 9 numbers) about `axis` (any length, normalized here), by phi radians.
     The sense is chosen so that rotateX with a positive phi turns the TOP of a shape (-y) toward the viewer (+z), which
     is what a shape rolling toward the camera looks like in a y-down screen. Sines and cosines within 1e-12 of 0 are
     snapped to 0, so a full turn (phi = 2 pi) reproduces the identity exactly and a looping roll loops pixel for pixel.
     A zero-length or non-finite axis, or a non-finite phi, gives the identity (no turn) instead of a shrunken shape. */
  function rotationMatrix(axis, phi) {
    var len = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
    if (!(len > 0) || !isFinite(len) || !isFinite(phi)) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    var u = norm3(axis[0], axis[1], axis[2]), c = Math.cos(-phi), s = Math.sin(-phi), t, x = u[0], y = u[1], z = u[2];
    if (Math.abs(c) < 1e-12) c = 0;
    if (Math.abs(s) < 1e-12) s = 0;
    t = 1 - c;
    return [
      t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c
    ];
  }

  function applyMatrix(m, x, y, z) {
    return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
  }

  /* rotateAxis(p, axis, phi, center): turn p about the line through `center` (default the origin) along `axis`.
     p is [x, y, z], or [x, y, z, nx, ny, nz]; in the six-number form the normal is turned too (about the origin, as a
     direction should be). Returns a new array. */
  function rotateAxis(p, axis, phi, center) {
    var m = rotationMatrix(axis, phi), cx = center ? center[0] : 0, cy = center ? center[1] : 0, cz = center ? center[2] : 0;
    var q = applyMatrix(m, p[0] - cx, p[1] - cy, p[2] - cz);
    q[0] += cx; q[1] += cy; q[2] += cz;
    if (p.length >= 6) q = q.concat(applyMatrix(m, p[3], p[4], p[5]));
    return q;
  }

  /* rotateX(p, phi, center): rotateAxis about the horizontal x axis (the roll axis). `center` may be a number: the y height
     of the axis, shorthand for [0, cy, 0]. */
  function rotateX(p, phi, center) {
    return rotateAxis(p, [1, 0, 0], phi, typeof center === 'number' ? [0, center, 0] : center);
  }

  /* ------------------------------------------------------------------ meshes */

  function readVertex(r, out) {   // fn may return [x, y, z], [x, y, z, nx, ny, nz] or { x, y, z, nx, ny, nz }
    if (Array.isArray(r)) {
      out.x = r[0]; out.y = r[1]; out.z = r[2];
      out.hasN = r.length >= 6;
      if (out.hasN) { out.nx = r[3]; out.ny = r[4]; out.nz = r[5]; }
    } else {
      out.x = r.x; out.y = r.y; out.z = r.z;
      out.hasN = r.nx !== undefined;
      if (out.hasN) { out.nx = r.nx; out.ny = r.ny; out.nz = r.nz; }
    }
  }

  /* Normal at (u, v) by central finite differences of fn: n = dP/du x dP/dv, normalized. The sign follows that cross
     product (see mesh's `flip`). Steps are clamped to [0, 1] so fn is never asked about parameters outside its range.
     At a degenerate spot (a pole, where dP/dv vanishes) it retries a little inside the surface. */
  function fdNormal(fn, u, v, out) {
    var scratch = {}, tries = [[1e-4, u, v], [5e-4, Math.min(1 - 1e-3, Math.max(1e-3, u)), Math.min(1 - 1e-3, Math.max(1e-3, v))]], k, e, uu, vv, p0, p1, q0, q1, A, B, cx, cy, cz, lc, la, lb;
    function at(a, b) { readVertex(fn(a, b), scratch); return [scratch.x, scratch.y, scratch.z]; }
    for (k = 0; k < tries.length; k++) {
      e = tries[k][0]; uu = tries[k][1]; vv = tries[k][2];
      p0 = at(Math.max(0, uu - e), vv); p1 = at(Math.min(1, uu + e), vv);
      q0 = at(uu, Math.max(0, vv - e)); q1 = at(uu, Math.min(1, vv + e));
      A = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      B = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
      cx = A[1] * B[2] - A[2] * B[1]; cy = A[2] * B[0] - A[0] * B[2]; cz = A[0] * B[1] - A[1] * B[0];
      lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
      la = Math.sqrt(A[0] * A[0] + A[1] * A[1] + A[2] * A[2]);
      lb = Math.sqrt(B[0] * B[0] + B[1] * B[1] + B[2] * B[2]);
      if (lc > 1e-9 * la * lb && lc > 0) { out[0] = cx / lc; out[1] = cy / lc; out[2] = cz / lc; return; }
    }
    out[0] = 0; out[1] = 0; out[2] = 1;   // truly degenerate: face the viewer
  }

  /* mesh(fn, nu, nv, opts): sample the parametric surface fn(u, v), u and v in 0..1, on an (nu + 1) x (nv + 1) grid.
     fn returns [x, y, z] (normal found by finite differences), or [x, y, z, nx, ny, nz] / { x, y, z, nx, ny, nz } when
     you know the true normal. Returns { nu, nv, pos, nrm }, both Float64Array of (nu + 1) * (nv + 1) * 3, unit normals.
     The mesh is evaluated once; drawMesh can then draw it any number of times with different transforms.
     opts.flip: true flips every normal, false flips none, 'auto' (the default) flips only the finite-difference normals
     when, on average, they point toward the mesh's centroid (right for closed, roughly convex shapes; for open or hollow
     surfaces such as a tube, pass true or false yourself). Normals you supply are never auto-flipped. */
  function mesh(fn, nu, nv, opts) {
    nu = nu | 0; nv = nv | 0;
    if (nu < 1 || nv < 1) throw new Error('mesh needs nu >= 1 and nv >= 1');
    var flip = opts && opts.flip !== undefined ? opts.flip : 'auto';
    var cols = nv + 1, n = (nu + 1) * cols, pos = new Float64Array(n * 3), nrm = new Float64Array(n * 3), fd = new Uint8Array(n);
    var i, j, k, v = {}, tmp = [0, 0, 0], l, cx = 0, cy = 0, cz = 0, score = 0;

    for (i = 0; i <= nu; i++) {
      for (j = 0; j <= nv; j++) {
        k = i * cols + j;
        readVertex(fn(i / nu, j / nv), v);
        pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        if (v.hasN) {
          l = Math.sqrt(v.nx * v.nx + v.ny * v.ny + v.nz * v.nz) || 1;
          nrm[k * 3] = v.nx / l; nrm[k * 3 + 1] = v.ny / l; nrm[k * 3 + 2] = v.nz / l;
        } else {
          fdNormal(fn, i / nu, j / nv, tmp);
          nrm[k * 3] = tmp[0]; nrm[k * 3 + 1] = tmp[1]; nrm[k * 3 + 2] = tmp[2];
          fd[k] = 1;
        }
        cx += v.x; cy += v.y; cz += v.z;
      }
    }
    if (flip === 'auto') {
      cx /= n; cy /= n; cz /= n;
      for (k = 0; k < n; k++) if (fd[k]) score += nrm[k * 3] * (pos[k * 3] - cx) + nrm[k * 3 + 1] * (pos[k * 3 + 1] - cy) + nrm[k * 3 + 2] * (pos[k * 3 + 2] - cz);
      if (score < 0) for (k = 0; k < n; k++) if (fd[k]) { nrm[k * 3] = -nrm[k * 3]; nrm[k * 3 + 1] = -nrm[k * 3 + 1]; nrm[k * 3 + 2] = -nrm[k * 3 + 2]; }
    } else if (flip === true) {
      for (k = 0; k < n * 3; k++) nrm[k] = -nrm[k];
    }
    return { nu: nu, nv: nv, pos: pos, nrm: nrm };
  }

  /* drawMesh(rast, m, mat, view, opts): transform a mesh and fill its quads as two triangles each (a,b,c and a,c,d).
     view = { scale (1), ox (0), oy (0), rot (a 3x3 matrix from rotationMatrix, default none), center ([0,0,0]) }:
       p' = rot * (p - center) + center;  screen = (ox + p'.x * scale, oy + p'.y * scale, p'.z * scale)
     and normals are turned by `rot` only. opts is passed on to tri (cull). */
  function drawMesh(rast, m, mat, view, opts) {
    view = view || {};
    var s = view.scale === undefined ? 1 : view.scale, ox = view.ox || 0, oy = view.oy || 0, rot = view.rot || null, cen = view.center || [0, 0, 0];
    var cols = m.nv + 1, n = cols * (m.nu + 1), verts = new Array(n), k, i, j, x, y, z, nx, ny, nz, a, b, c, d;
    mat = asMaterial(mat);

    for (k = 0; k < n; k++) {
      x = m.pos[k * 3]; y = m.pos[k * 3 + 1]; z = m.pos[k * 3 + 2];
      nx = m.nrm[k * 3]; ny = m.nrm[k * 3 + 1]; nz = m.nrm[k * 3 + 2];
      if (rot) {
        x -= cen[0]; y -= cen[1]; z -= cen[2];
        var rx = rot[0] * x + rot[1] * y + rot[2] * z + cen[0], ry = rot[3] * x + rot[4] * y + rot[5] * z + cen[1], rz = rot[6] * x + rot[7] * y + rot[8] * z + cen[2];
        var qx = rot[0] * nx + rot[1] * ny + rot[2] * nz, qy = rot[3] * nx + rot[4] * ny + rot[5] * nz, qz = rot[6] * nx + rot[7] * ny + rot[8] * nz;
        x = rx; y = ry; z = rz; nx = qx; ny = qy; nz = qz;
      }
      verts[k] = [ox + x * s, oy + y * s, z * s, nx, ny, nz];
    }
    for (i = 0; i < m.nu; i++) {
      for (j = 0; j < m.nv; j++) {
        a = verts[i * cols + j]; b = verts[(i + 1) * cols + j]; c = verts[(i + 1) * cols + j + 1]; d = verts[i * cols + j + 1];
        tri(rast, a, b, c, mat, opts);
        tri(rast, a, c, d, mat, opts);
      }
    }
  }

  /* ------------------------------------------------------------------ generic shapes: each returns an fn(u, v) for mesh() */

  /* sphere(radius, center): radius is a number, or [rx, ry, rz] for an ellipsoid. u runs pole to pole along y, v around.
     Exact normals are supplied. */
  function sphere(radius, center) {
    var rx = Array.isArray(radius) ? radius[0] : radius, ry = Array.isArray(radius) ? radius[1] : radius, rz = Array.isArray(radius) ? radius[2] : radius;
    var cx = center ? center[0] : 0, cy = center ? center[1] : 0, cz = center ? center[2] : 0;
    return function (u, v) {
      var ph = (u - 0.5) * Math.PI, th = v * PI2, cp = Math.cos(ph);
      return [cx + rx * cp * Math.cos(th), cy + ry * Math.sin(ph), cz + rz * cp * Math.sin(th),
        cp * Math.cos(th) / rx, Math.sin(ph) / ry, cp * Math.sin(th) / rz];
    };
  }

  /* An orthonormal frame around the segment a -> b: returns { ax, u1, w, len }. */
  function tubeFrame(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) throw new Error('a tube needs two different end points');
    var ax = [dx / len, dy / len, dz / len], up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], d = up[0] * ax[0] + up[1] * ax[1] + up[2] * ax[2];
    var u1 = norm3(up[0] - ax[0] * d, up[1] - ax[1] * d, up[2] - ax[2] * d);
    var w = [ax[1] * u1[2] - ax[2] * u1[1], ax[2] * u1[0] - ax[0] * u1[2], ax[0] * u1[1] - ax[1] * u1[0]];
    return { ax: ax, u1: u1, w: w, len: len };
  }

  /* rod(a, b, r0, r1): an open tube (no end caps) from point a to point b, radius r0 at a and r1 at b. u runs along it, v
     around. Exact normals, pointing away from the axis. */
  function rod(a, b, r0, r1) {
    var f = tubeFrame(a, b);
    if (r1 === undefined) r1 = r0;
    return function (u, v) {
      var th = v * PI2, c = Math.cos(th), s = Math.sin(th), r = r0 + (r1 - r0) * u;
      var nx = c * f.u1[0] + s * f.w[0], ny = c * f.u1[1] + s * f.w[1], nz = c * f.u1[2] + s * f.w[2];
      return [a[0] + (b[0] - a[0]) * u + r * nx, a[1] + (b[1] - a[1]) * u + r * ny, a[2] + (b[2] - a[2]) * u + r * nz, nx, ny, nz];
    };
  }

  /* capsule(a, b, r, opts): a cylinder from a to b closed by two hemispherical caps, as ONE surface. u is proportional to
     arc length from the far pole of cap a to the far pole of cap b; v goes around.
     opts.lobes (0) and opts.depth (0.08): give the radius a cos(lobes * angle) ripple of that relative depth, which makes
     the capsule visibly turn when it rolls. Only positions are returned, so mesh() finds the normals (it handles the
     poles, and 'auto' orientation suits this closed shape). */
  function capsule(a, b, r, opts) {
    var f = tubeFrame(a, b), lobes = (opts && opts.lobes) || 0, depth = opts && opts.depth !== undefined ? opts.depth : 0.08;
    var cap = Math.PI * r / 2, total = 2 * cap + f.len;
    return function (u, v) {
      var s = u * total, th = v * PI2, axial, rad, k;
      if (s < cap) { k = s / r; axial = -r * Math.cos(k); rad = r * Math.sin(k); }
      else if (s < cap + f.len) { axial = s - cap; rad = r; }
      else { k = (s - cap - f.len) / r; axial = f.len + r * Math.sin(k); rad = r * Math.cos(k); }
      if (lobes) rad *= 1 + depth * Math.cos(lobes * th);
      var c = Math.cos(th) * rad, sn = Math.sin(th) * rad;
      return [a[0] + f.ax[0] * axial + f.u1[0] * c + f.w[0] * sn,
        a[1] + f.ax[1] * axial + f.u1[1] * c + f.w[1] * sn,
        a[2] + f.ax[2] * axial + f.u1[2] * c + f.w[2] * sn];
    };
  }

  /* torus(R, r, center, axis): major radius R, tube radius r. axis 'z' (default) is a ring facing the viewer, 'y' a ring
     lying flat, 'x' a ring seen edge-on. u runs around the ring, v around the tube. Exact normals. */
  function torus(R, r, center, axis) {
    var cx = center ? center[0] : 0, cy = center ? center[1] : 0, cz = center ? center[2] : 0, ax = axis || 'z';
    return function (u, v) {
      var th = u * PI2, ph = v * PI2, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph), q = R + r * cp;
      var a = q * ct, b = q * st, c = r * sp, na = cp * ct, nb = cp * st, nc = sp;
      if (ax === 'y') return [cx + a, cy + c, cz + b, na, nc, nb];
      if (ax === 'x') return [cx + c, cy + a, cz + b, nc, na, nb];
      return [cx + a, cy + b, cz + c, na, nb, nc];
    };
  }

  /* ------------------------------------------------------------------ baking: downsample, outline, frames */

  /* Box-filter an ss-times oversized raster down to its true size. Colors are averaged weighted by coverage (so the empty
     samples at an edge do not darken it); alpha is the covered fraction. This stands in for the browser's smoothing
     resample the original used, and keeps the whole pipeline canvas-free. */
  function downsample(rast, ss) {
    var w = rast.w / ss, h = rast.h / ss, data = new Uint8ClampedArray(w * h * 4), px = rast.px, rw = rast.w, x, y, sx, sy, i, o, a, sa, sr, sg, sb, area = ss * ss;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        sa = sr = sg = sb = 0;
        for (sy = 0; sy < ss; sy++) {
          for (sx = 0; sx < ss; sx++) {
            i = ((y * ss + sy) * rw + x * ss + sx) * 4; a = px[i + 3];
            if (a) { sa += a; sr += px[i] * a; sg += px[i + 1] * a; sb += px[i + 2] * a; }
          }
        }
        o = (y * w + x) * 4;
        if (sa) { data[o] = sr / sa; data[o + 1] = sg / sa; data[o + 2] = sb / sa; data[o + 3] = sa / area; }
      }
    }
    return { width: w, height: h, data: data };
  }

  /* outline(img, radius, color): a solid-color outline `radius` pixels thick around everything opaque in img, drawn behind
     it. img is { width, height, data } (RGBA, not premultiplied) or an ImageData; returns a new { width, height, data }.
     The original stamped a tinted copy of the picture at 16 offsets on a ring plus 8 offsets on an inner ring (0.55 of the
     radius) with canvas drawImage. Here the same 24 offsets are used, rounded to whole pixels and merged by taking the
     largest covered alpha. The canvas version blended fractional offsets; this one trades that sub-pixel softness for
     running anywhere. Pixels pushed outside the image are lost, so leave a margin (bakeSprite does). */
  function outline(img, radius, color) {
    var w = img.width, h = img.height, src = img.data, data = new Uint8ClampedArray(src.length), col = color || [0, 0, 0];
    var seen = {}, offs = [], i, a, dx, dy, key, x, y, k, oa, sa, o, ra;
    function add(dxx, dyy) { var kk = dxx + ',' + dyy; if (!seen[kk]) { seen[kk] = 1; offs.push([dxx, dyy]); } }
    if (radius > 0) {
      for (i = 0; i < 16; i++) { a = i * Math.PI / 8; add(Math.round(Math.cos(a) * radius), Math.round(Math.sin(a) * radius)); }
      for (i = 0; i < 8; i++) { a = i * Math.PI / 4 + 0.39; add(Math.round(Math.cos(a) * radius * 0.55), Math.round(Math.sin(a) * radius * 0.55)); }
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        oa = 0;
        for (k = 0; k < offs.length; k++) {
          dx = x - offs[k][0]; dy = y - offs[k][1];
          if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
          sa = src[(dy * w + dx) * 4 + 3];
          if (sa > oa) oa = sa;
        }
        o = (y * w + x) * 4;
        sa = src[o + 3];
        ra = sa + oa * (255 - sa) / 255;   // picture over outline, "source-over"
        if (ra > 0) {
          data[o] = (src[o] * sa + col[0] * oa * (255 - sa) / 255) / ra;
          data[o + 1] = (src[o + 1] * sa + col[1] * oa * (255 - sa) / 255) / ra;
          data[o + 2] = (src[o + 2] * sa + col[2] * oa * (255 - sa) / 255) / ra;
          data[o + 3] = ra;
        }
      }
    }
    return { width: w, height: h, data: data };
  }

  function toImageData(img) {
    return makeImage(img.width, img.height, new Uint8ClampedArray(img.data));
  }

  /* toCanvas(img, opts): browser only. Returns a new <canvas> holding the image, or null (never throws) when there is no
     document (Node, a worker), the image is empty or malformed, or the browser will not give a 2D context (it does that for
     a canvas that is too large). Callers must handle null.
     opts.willReadFrequently: true asks the browser for a plain-memory canvas (getContext('2d', { willReadFrequently: true })).
     Default unchanged: getContext('2d') with no options. Keep the flag off for sprites you only draw. */
  function toCanvas(img, opts) {
    try {
      if (typeof document === 'undefined' || !document || !img) return null;
      var w = img.width, h = img.height;
      if (!(w > 0) || !(h > 0) || w !== Math.floor(w) || h !== Math.floor(h)) return null;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g = opts && opts.willReadFrequently ? c.getContext('2d', { willReadFrequently: true }) : c.getContext('2d');
      if (!g) return null;
      g.putImageData(new ImageData(new Uint8ClampedArray(img.data), w, h), 0, 0);
      return c;
    } catch (e) { return null; }
  }

  /* A scene is an array of parts (or { parts: [...] }). A part is { mesh, material } with a mesh() result, or
     { fn, nu, nv, material [, flip] } and the mesh is built once and remembered. `material` is material(...) or raw stops. */
  var meshCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function prepare(scene) {
    var parts = Array.isArray(scene) ? scene : scene.parts;
    if (!parts || !parts.length) throw new Error('empty scene');
    return parts.map(function (p) {
      var m = p.mesh || (meshCache && meshCache.get(p));
      if (!m) { m = mesh(p.fn, p.nu || 16, p.nv || 24, { flip: p.flip }); if (meshCache && !p.mesh) meshCache.set(p, m); }
      return { mesh: m, material: asMaterial(p.material) };
    });
  }

  function sizeOf(size) {
    var o = size && typeof size === 'object' && !Array.isArray(size);
    var w = Array.isArray(size) ? size[0] : o ? size.width : size, h = Array.isArray(size) ? size[1] : o ? size.height : size;
    return [w | 0, h | 0];
  }

  /* Choose pixels-per-unit so the shape fits at every angle of the roll, with a margin for the outline. When the roll axis
     is the x axis (the default), the exact box is used: half width = largest |x - cx|, half height = largest distance from
     the axis. For any other axis the farthest point from `center` sets a circle. */
  function fitScale(parts, w, h, center, axis, margin) {
    var halfW = 0, halfH = 0, far = 0, p, k, n, dx, dy, dz, rho, onX = Math.abs(axis[1]) < 1e-9 && Math.abs(axis[2]) < 1e-9;
    parts.forEach(function (part) {
      p = part.mesh.pos; n = p.length / 3;
      for (k = 0; k < n; k++) {
        dx = p[k * 3] - center[0]; dy = p[k * 3 + 1] - center[1]; dz = p[k * 3 + 2] - center[2];
        if (!isFinite(dx + dy + dz)) continue;   // a NaN point must not reach `far` (Math.max keeps NaN)
        rho = Math.sqrt(dy * dy + dz * dz);
        if (Math.abs(dx) > halfW) halfW = Math.abs(dx);
        if (rho > halfH) halfH = rho;
        far = Math.max(far, Math.sqrt(dx * dx + dy * dy + dz * dz));   // finite here: non-finite points were skipped above
      }
    });
    if (!onX) { halfW = far; halfH = far; }
    return Math.min((w / 2 - margin) / (halfW || 1), (h / 2 - margin) / (halfH || 1));
  }

  /* The shared core of bakeSprite, bakeRoll and baker: build everything once (meshes, scale, one working surface), then
     return render(phi), which draws one picture and returns it. Returns { reason: '...' } instead when nothing can be baked
     (size zero or not a number, or even ss 1 would pass opts.maxPixels). Programmer errors (empty scene, bad material or
     mesh) still throw. */
  function setup(scene, size, opts) {
    opts = opts || {};
    var parts = prepare(scene), wh = sizeOf(size), w = wh[0], h = wh[1];
    if (!(w > 0) || !(h > 0)) return { reason: 'size' };
    var maxPixels = opts.maxPixels > 0 ? opts.maxPixels : DEFAULT_MAX_PIXELS;
    var ss = Math.max(1, (opts.ss === undefined ? 2 : opts.ss) | 0);
    if (w * h > maxPixels) return { reason: 'too-big' };
    ss = Math.min(ss, Math.max(1, Math.floor(Math.sqrt(maxPixels / (w * h)))));   // lower ss until w * h * ss * ss fits
    var axis = opts.axis || [1, 0, 0], center = opts.center || [0, 0, 0], ol = opts.outline || null;
    var margin = (opts.margin === undefined ? 2 : opts.margin) + (ol ? Math.ceil(ol.radius || 0) : 0);
    var scale = opts.scale !== undefined ? opts.scale : fitScale(parts, w, h, center, axis, margin);
    var ox = opts.ox !== undefined ? opts.ox : w / 2 - center[0] * scale, oy = opts.oy !== undefined ? opts.oy : h / 2 - center[1] * scale;
    var rast = new Rast(w * ss, h * ss);
    if (opts.light) rast.setLight(opts.light);
    var tOpts = opts.cull !== undefined ? { cull: opts.cull } : null;

    return {
      width: w, height: h, ss: ss, scale: scale,
      render: function (phi) {
        var view = { scale: scale * ss, ox: ox * ss, oy: oy * ss, rot: rotationMatrix(axis, phi), center: center }, img;
        rast.clear();
        parts.forEach(function (part) { drawMesh(rast, part.mesh, part.material, view, tOpts); });
        img = downsample(rast, ss);
        return ol ? outline(img, ol.radius, ol.color) : img;
      }
    };
  }

  /* bakeSprite(scene, size, opts): render one picture. size is a number (square), [w, h], or { width, height }, in output
     pixels. Returns { width, height, data } (RGBA, not premultiplied); wrap it with toCanvas() or toImageData(). Returns
     null when nothing can be baked (size zero or not a number, or the picture is over opts.maxPixels even at ss 1).
     opts: phi (0, radians turned about opts.axis), axis ([1,0,0]; a zero axis means no turn), center ([0,0,0], the point the
           axis passes through),
           ss (2, integer supersampling: the raster is ss times larger each way, then box-filtered down),
           maxPixels (4194304: ceiling on width * height * ss * ss; ss is lowered automatically to fit, and Infinity turns
             the ceiling off; a 1024 x 1024 sprite at ss 4 is baked at ss 2 unless you raise it),
           scale / ox / oy (pixels per unit and pixel position of the scene origin; default: auto-fit and centered),
           margin (2, pixels kept clear when auto-fitting), light ([x, y, z]), cull (see tri),
           outline ({ radius, color: [r, g, b] }, default none). */
  function bakeSprite(scene, size, opts) {
    var s = setup(scene, size, opts);
    return s.render ? s.render((opts && opts.phi) || 0) : null;
  }

  /* baker(scene, size, opts): bake a roll in slices. It builds the meshes, the scale and ONE working surface now, and
     bakes frame i only when asked, so a game can bake one frame per tick (or per job) instead of freezing for all of
     them. Same opts as bakeSprite, plus opts.frames (12) and opts.turn (2 pi): frame i is turned i / frames of turn, the
     same angles bakeRoll uses, and the pictures are pixel for pixel what bakeRoll gives for the same input.
     Returns { count, width, height, ss, scale, index, frame(i), next(), reset() }:
       frame(i)  picture i as { width, height, data }, or null when i is not an integer in 0 .. count - 1 (any order)
       next()    the picture at `index`, then index moves on; null once all are done. reset() sets index back to 0.
     When nothing can be baked it still returns an object, with count 0, a `reason` ('size', 'frames' or 'too-big') and
     frame/next returning null, so check `count`. Building the meshes happens here, so call baker() in its own tick too.
     Each picture owns its pixel array; the working surface is reused. */
  function baker(scene, size, opts) {
    var frames = opts && opts.frames !== undefined ? opts.frames : 12, turn = opts && opts.turn !== undefined ? opts.turn : PI2;
    var s = null, self = { count: 0, width: 0, height: 0, ss: 0, scale: 0, index: 0, reason: '' };
    frames = frames | 0;
    self.frame = function (i) {
      if (!self.count || typeof i !== 'number' || i !== Math.floor(i) || i < 0 || i >= self.count) return null;
      return s.render(i / self.count * turn);
    };
    self.next = function () {
      if (self.index >= self.count) return null;
      return self.frame(self.index++);
    };
    self.reset = function () { self.index = 0; return self; };
    if (frames < 1) { self.reason = 'frames'; return self; }
    s = setup(scene, size, opts);
    if (!s.render) { self.reason = s.reason; return self; }
    self.count = frames; self.width = s.width; self.height = s.height; self.ss = s.ss; self.scale = s.scale;
    return self;
  }

  /* bakeRoll(scene, frames, size, opts): render `frames` pictures of the scene turned about its long horizontal axis (the
     x axis through opts.center) by i / frames of opts.turn (default one full turn, 2 pi) for i = 0 .. frames - 1. So frame
     0 is the unturned pose and, because a full turn is not repeated, the sequence loops seamlessly. Same opts as
     bakeSprite. All frames share one scale, so the sprite does not breathe. Returns an array of { width, height, data },
     or null when nothing can be baked (frames below 1, size zero, or over opts.maxPixels even at ss 1). All at once;
     use baker() to bake in slices. */
  function bakeRoll(scene, frames, size, opts) {
    var o = {}, k, b, out = [], i;
    for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];   // a copy, so frames never leaks into the caller's opts
    o.frames = frames | 0;   // undefined or NaN becomes 0, which baker() reports as nothing to bake
    b = baker(scene, size, o);
    if (!b.count) return null;
    for (i = 0; i < b.count; i++) out.push(b.frame(i));
    return out;
  }

  return {
    version: '1.1.0',
    Rast: Rast,
    material: material,
    bakeRamp: bakeRamp,
    tri: tri,
    mesh: mesh,
    drawMesh: drawMesh,
    sphere: sphere,
    rod: rod,
    capsule: capsule,
    torus: torus,
    rotationMatrix: rotationMatrix,
    rotateAxis: rotateAxis,
    rotateX: rotateX,
    downsample: downsample,
    outline: outline,
    bakeSprite: bakeSprite,
    bakeRoll: bakeRoll,
    baker: baker,
    toImageData: toImageData,
    toCanvas: toCanvas,
    DEFAULT_LIGHT: DEFAULT_LIGHT.slice(),
    DEFAULT_MAX_PIXELS: DEFAULT_MAX_PIXELS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SpriteBaker; else (typeof globalThis !== 'undefined' ? globalThis : this).SpriteBaker = SpriteBaker;
