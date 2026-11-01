/*!
 * gif-writer-card.js, an optional companion of gif-writer.js: GIF looks on the graphics card (WebGL 2). Same steps and same arithmetic as GifWriterFx.applyJs, one shader pass each.
 * create() returns null where WebGL 2 is missing or a pass fails, and the caller keeps using WebAssembly/JavaScript.
 * Needs GifWriterFx (gif-writer-fx.js). Works on a page canvas or an OffscreenCanvas in a worker. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.6.2 (API 1)
 */
var GifWriterCard = (function () {
  'use strict';
  var VS = '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  var HEAD = '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;\nuniform sampler2D A;uniform sampler2D B;out vec4 o;\n';
  var FS = {
    blurH: 'uniform int r;void main(){ivec2 c=ivec2(gl_FragCoord.xy);int w=textureSize(A,0).x;vec4 s=vec4(0);for(int i=-r;i<=r;i++)s+=floor(texelFetch(A,ivec2(clamp(c.x+i,0,w-1),c.y),0)*255.0+0.5);float iv=floor(65536.0/float(2*r+1));o=floor((s*iv+32768.0)/65536.0)/255.0;}',
    blurV: 'uniform int r;uniform int ph;void main(){ivec2 c=ivec2(gl_FragCoord.xy);int lo=(c.y/ph)*ph,hi=lo+ph-1;vec4 s=vec4(0);for(int i=-r;i<=r;i++)s+=floor(texelFetch(A,ivec2(c.x,clamp(c.y+i,lo,hi)),0)*255.0+0.5);float iv=floor(65536.0/float(2*r+1));o=floor((s*iv+32768.0)/65536.0)/255.0;}',
    unsharp: 'uniform float amt;void main(){ivec2 c=ivec2(gl_FragCoord.xy);vec4 s=texelFetch(A,c,0),b=texelFetch(B,c,0);o=vec4(s.rgb+amt*(s.rgb-b.rgb),s.a);}',
    glowDown: 'uniform float thr;uniform int sh,ph;void main(){ivec2 g=ivec2(gl_FragCoord.xy);int bd=g.y/sh;ivec2 c=ivec2(g.x*4,bd*ph+(g.y-bd*sh)*4);vec3 s=vec3(0);for(int j=0;j<4;j++)for(int i=0;i<4;i++)s+=floor(texelFetch(A,c+ivec2(i,j),0).rgb*255.0+0.5);vec3 q=floor(s/16.0);float l=floor((q.r*54.0+q.g*183.0+q.b*19.0)/256.0);float k=l>thr?(l-thr)/(255.0-thr):0.0;o=vec4(q*k/255.0,1.0);}',
    glowUp: 'uniform float g;uniform int sh,ph;void main(){ivec2 c=ivec2(gl_FragCoord.xy);int bd=c.y/ph;ivec2 sz=ivec2(textureSize(B,0).x,sh);vec2 f=clamp((vec2(c.x,c.y-bd*ph)+0.5)/4.0-0.5,vec2(0),vec2(sz-1));ivec2 p0=ivec2(f);ivec2 p1=min(p0+1,sz-1);vec2 t=f-vec2(p0);p0.y+=bd*sh;p1.y+=bd*sh;vec3 bv=mix(mix(texelFetch(B,p0,0).rgb,texelFetch(B,ivec2(p1.x,p0.y),0).rgb,t.x),mix(texelFetch(B,ivec2(p0.x,p1.y),0).rgb,texelFetch(B,p1,0).rgb,t.x),t.y)*255.0*g;bv=min(bv,vec3(255.0));vec4 s=texelFetch(A,c,0);vec3 a=floor(s.rgb*255.0+0.5);o=vec4((255.0-floor((255.0-a)*(255.0-bv)/256.0))/255.0,s.a);}',
    grade: 'uniform sampler2D L;uniform float m[9];uniform float wr,vs,inv;uniform int vig,ph;uniform vec2 ctr;\nfloat lut(float v){return floor(texelFetch(L,ivec2(int(clamp(floor(v),0.0,255.0)),0),0).r*255.0+0.5);}\nvoid main(){ivec2 c=ivec2(gl_FragCoord.xy);vec4 s=texelFetch(A,c,0);vec3 p=floor(s.rgb*255.0+0.5);vec3 n=vec3(m[0]*p.r+m[1]*p.g+m[2]*p.b+wr,m[3]*p.r+m[4]*p.g+m[5]*p.b,m[6]*p.r+m[7]*p.g+m[8]*p.b-wr);n=vec3(lut(n.r),lut(n.g),lut(n.b));if(vig==1){vec2 d=vec2(c.x,c.y%ph)-ctr;float q=dot(d,d)*inv;n*=1.0-vs*q*q;}o=vec4(n/255.0,s.a);}'
  };
  function create(canvas) {
    var gl, progs = {}, tex = [], vao, maxTex = 2048, lutTex = null;
    try {
      canvas = canvas || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'));
      gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) return null;
      var mk = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      var vs = mk(gl.VERTEX_SHADER, VS);
      Object.keys(FS).forEach(function (k) { var p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, HEAD + FS[k])); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); progs[k] = p; });
      maxTex = Math.min(16384, gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0); vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    } catch (e) { return null; }
    var lost = false; if (canvas.addEventListener) canvas.addEventListener('webglcontextlost', function (e) { lost = true; e.preventDefault(); });
    function target(i, w, h) {   /* texture i of w x h with its framebuffer */
      var t = tex[i]; if (t && t.w === w && t.h === h) return t;
      if (t) { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.f); }
      var tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      var fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer');
      return (tex[i] = { t: tx, f: fb, w: w, h: h });
    }
    function pass(name, src, srcB, dst, set) {
      var p = progs[name]; gl.useProgram(p); gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(gl.getUniformLocation(p, 'A'), 0);
      if (srcB) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, srcB.t); gl.uniform1i(gl.getUniformLocation(p, 'B'), 1); }
      if (set) set(function (n) { return gl.getUniformLocation(p, n); });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    /** Box blur of radius r (rows then columns), src to dst, using mid as the middle texture. */
    function box(src, mid, dst, r, ph) { pass('blurH', src, null, mid, function (u) { gl.uniform1i(u('r'), r); }); pass('blurV', mid, null, dst, function (u) { gl.uniform1i(u('r'), r); gl.uniform1i(u('ph'), ph); }); }
    /** Changes the pixels of RGBA pictures in place like GifWriterFx.applyJs. n pictures of w x h may be stacked one under the other in one array (n defaults to 1): one send up, one set of passes and one read back for all of them. Returns the array, or null when the card could not do it (the caller then uses another path). */
    function apply(rgba, w, h, f, n) {
      var Fx = GifWriterFx; f = Fx.cleanFilter(f); if (Fx.isPlainFilter(f)) return rgba;
      n = n > 1 ? n | 0 : 1; if (lost || gl.isContextLost() || h * n > maxTex || rgba.length !== w * h * n * 4) return null;
      try {
        var H = h * n, X = target(0, w, H), Y = target(1, w, H), Z = target(2, w, H), t;
        gl.bindTexture(gl.TEXTURE_2D, X.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        if (f.blur > 0) { var rb = Math.max(1, Math.round(f.blur * w / 640)); box(X, Y, Z, rb, h); box(Z, Y, X, Math.max(1, rb >> 1), h); }
        if (f.sharpen > 0) { box(X, Y, Z, Math.max(1, Math.round(w / 480)), h); pass('unsharp', X, Z, Y, function (u) { gl.uniform1f(u('amt'), f.sharpen * 1.4); }); t = X; X = Y; Y = t; }
        if (f.glow > 0) {
          var sw = Math.max(2, (w / 4) | 0), sh = Math.max(2, (h / 4) | 0), S0 = target(3, sw, sh * n), S1 = target(4, sw, sh * n), S2 = target(5, sw, sh * n);
          pass('glowDown', X, null, S0, function (u) { gl.uniform1f(u('thr'), 150); gl.uniform1i(u('sh'), sh); gl.uniform1i(u('ph'), h); });
          box(S0, S1, S2, Math.max(1, Math.round(sw / 60)), sh);
          pass('glowUp', X, S2, Y, function (u) { gl.uniform1f(u('g'), f.glow * 1.3); gl.uniform1i(u('sh'), sh); gl.uniform1i(u('ph'), h); }); t = X; X = Y; Y = t;
        }
        var m = Fx.colorMatrix(f), cx = (w - 1) / 2, cy = (h - 1) / 2, cv = Fx.curve(f), lb = new Uint8Array(1024), q;   /* the brightness/contrast table comes from the JavaScript twin, so rounding is identical */
        for (q = 0; q < 256; q++) lb[q * 4] = cv[q];
        if (!lutTex) { lutTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, lutTex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, lutTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, lb); gl.activeTexture(gl.TEXTURE0);
        pass('grade', X, null, Y, function (u) {
          gl.uniform1fv(u('m'), new Float32Array(m)); gl.uniform1f(u('wr'), f.warmth * 28); gl.uniform1i(u('L'), 2);
          gl.uniform1i(u('vig'), f.vignette > 0 ? 1 : 0); gl.uniform1f(u('vs'), f.vignette * 0.85); gl.uniform1f(u('inv'), 1 / (cx * cx + cy * cy)); gl.uniform2f(u('ctr'), cx, cy); gl.uniform1i(u('ph'), h);
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, Y.f); gl.readPixels(0, 0, w, H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        return gl.getError() === gl.NO_ERROR ? rgba : null;
      } catch (e) { return null; }
    }
    function dispose() { try { tex.forEach(function (t) { if (t) { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.f); } }); tex = []; var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* gone */ } }
    /** Blocks until the card has finished (a 1x1 read), so timings are honest. */
    function finish() { var b = new Uint8Array(4); try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); } catch (e) { /* gone */ } }
    function software() { try { var d = gl.getExtension('WEBGL_debug_renderer_info'), n = d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : ''; return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(n); } catch (e) { return false; } }
    /** How many pictures of height h fit in one pass (at most 8). */
    function maxBatch(h) { return Math.max(1, Math.min(8, Math.floor(maxTex / h))); }
    return { apply: apply, maxBatch: maxBatch, dispose: dispose, finish: finish, software: software, canvas: canvas };
  }
  return { create: create };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GifWriterCard;
