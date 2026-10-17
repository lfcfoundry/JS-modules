"""Browser test for canvas-probe on a real canvas (Chromium). Run: python3 tools/canvas-probe/test/browser.py
Checks that the wrapped real CanvasRenderingContext2D still draws the right pixels, that the counts are right, that a planted
save() leak and an overhanging drawImage source are caught, and that uninstall() puts the real methods back.
Python 3 + Playwright for Python with Chromium; no network. Counts only: never judge milliseconds with the probe on.
Copyright (c) 2026 LFC Foundry. MIT License."""
import os, pathlib, sys
from playwright.sync_api import sync_playwright
SRC = (pathlib.Path(__file__).resolve().parent.parent / "src" / "canvas-probe.js").read_text()
fails = 0
def check(name, ok, extra=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ((" " + str(extra)[:500]) if not ok and extra else ""))
    if not ok: fails += 1

PAGE = """<canvas id=c width=200 height=100></canvas><script>
window.origFill = CanvasRenderingContext2D.prototype.fillRect;
window.origStyle = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle').set;
</script>"""
with sync_playwright() as p:
    br = p.chromium.launch(args=["--disable-gpu"], executable_path=os.environ.get("CHROMIUM") or None); pg = br.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.set_content(PAGE); pg.add_script_tag(content=SRC)
    r = pg.evaluate("""() => {
      var probe = CanvasProbe.install({ keep: 10 }), cv = document.getElementById('c'), x = cv.getContext('2d');
      var img = document.createElement('canvas'); img.width = 100; img.height = 50;
      for (var f = 0; f < 4; f++) {
        x.fillStyle = '#f00'; x.fillRect(0, 0, 200, 100);               // red over the whole canvas
        x.save(); x.fillStyle = '#00f'; x.fillRect(10, 10, 20, 20); x.restore();
        x.drawImage(img, 0, 0, 120, 60, 0, 0, 120, 60);                 // source sticks out on both axes
        x.drawImage(img, 0, 0, 20, 10);                                 // shrunk below half size
        if (f === 3) x.save();                                          // planted leak at the last frame
        probe.frame();
      }
      var out = { rep: probe.report(), text: probe.text(), px: Array.prototype.slice.call(x.getImageData(5, 5, 1, 1).data), blue: Array.prototype.slice.call(x.getImageData(15, 15, 1, 1).data) };
      probe.uninstall();
      out.restored = CanvasRenderingContext2D.prototype.fillRect === window.origFill && Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle').set === window.origStyle;
      return out;
    }""")
    rep = r["rep"]
    check("real context: pixels are still drawn (red, then blue inside)", r["px"][:3] == [255, 0, 0] and r["blue"][:3] == [0, 0, 255], r)
    check("fillRect counted twice per frame", rep["calls"]["fillRect"]["median"] == 2, rep["calls"])
    check("drawImage counted twice per frame", rep["calls"]["drawImage"]["median"] == 2, rep["calls"])
    check("overhanging source rectangle found on both axes", rep["drawImage"]["sourceOverhangBothAxes"] >= 1, rep["drawImage"])
    check("a draw below half size is counted", rep["drawImage"]["belowHalfSize"]["max"] >= 1, rep["drawImage"])
    check("the planted save() leak is reported", rep["saveRestore"]["leakFrames"] == 1 and rep["saveRestore"]["openContextsNow"] == 1, rep["saveRestore"])
    check("the plain-words report mentions the leak", "leak" in r["text"], r["text"])
    check("uninstall restores the real methods and accessors", r["restored"])
    # added 2026-10-15 (not yet run in a browser by the author of the change): reset(), size writes and the readback flag on a real canvas
    r2 = pg.evaluate("""() => {
      var probe = CanvasProbe.install({ keep: 10 }), out = {};
      var a = document.createElement('canvas'); a.width = 50; a.height = 50;
      var x = a.getContext('2d'), y = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      x.save(); x.save(); if (typeof x.reset === 'function') x.reset(); else { x.restore(); x.restore(); }
      probe.frame(); out.afterReset = probe.report().saveRestore;
      x.save(); a.width = a.width; probe.frame(); out.afterResize = probe.report().saveRestore;
      probe.reset(); x.getImageData(0, 0, 1, 1); y.getImageData(0, 0, 1, 1); probe.frame(); out.readback = probe.report().readback;
      var g = document.createElement('canvas'); g.width = 10; g.height = 10; var gx = g.getContext('2d');
      var big = document.createElement('canvas'); big.width = 2000; big.height = 2000; big.getContext('2d').fillRect(0, 0, 2000, 2000);
      probe.reset(); gx.fillRect(0, 0, 10, 10); big.getContext('2d').fillRect(0, 0, 5, 5); probe.frame(); out.area = probe.report().paintedArea;
      out.text = probe.text(); probe.uninstall(); return out;
    }""")
    check("real context: save, save, reset leaves no open context", r2["afterReset"]["openContextsNow"] == 0 and r2["afterReset"]["leakFrames"] == 0, r2["afterReset"])
    check("real canvas: writing width empties the save stack", r2["afterResize"]["openContextsNow"] == 0 and r2["afterResize"]["leakFrames"] == 0, r2["afterResize"])
    check("real canvas: getImageData without willReadFrequently is flagged once, with it is not", r2["readback"]["getImageDataWithoutWillReadFrequently"] == 1, r2["readback"])
    check("real canvases: painted area is per canvas (full fill of a small canvas next to a big one reads 1)", r2["area"]["median"] == 1, r2["area"])
    r3 = pg.evaluate("""() => {
      var out = {}, orig = { fill: CanvasRenderingContext2D.prototype.fill, drawImage: CanvasRenderingContext2D.prototype.drawImage };
      var off = CanvasProbe.install({ keep: 10 });
      var cv = document.createElement('canvas'); cv.width = 60; cv.height = 40; var x = cv.getContext('2d'), img = document.createElement('canvas'); img.width = 20; img.height = 20;
      x.filter = 'blur(1px)'; x.drawImage(img, 0, 0); x.filter = 'none'; off.frame(); out.offCostly = off.report().costlyDraws; off.uninstall();
      var probe = CanvasProbe.install({ keep: 10, deep: true });
      for (var f = 0; f < 3; f++) {
        x.filter = 'blur(1px)'; x.drawImage(img, 0, 0); x.filter = 'none';
        x.shadowBlur = 6; x.shadowColor = '#000'; x.fillRect(0, 0, 10, 10); x.shadowBlur = 0;
        x.globalCompositeOperation = 'lighter'; x.beginPath(); x.rect(0, 0, 5, 5); x.fill(); x.globalCompositeOperation = 'source-over';
        x.drawImage(img, 30, 0);
        probe.frame();
      }
      out.costly = probe.report().costlyDraws; out.text = probe.text();
      out.pass = probe.check({ callsPerFrame: 100, withFilter: 1, withShadow: 1, withBlendMode: 1 });
      out.fail = probe.check({ withFilter: 0 });
      probe.uninstall();
      out.restored = CanvasRenderingContext2D.prototype.fill === orig.fill && CanvasRenderingContext2D.prototype.drawImage === orig.drawImage;
      return out;
    }""")
    check("real context: deep mode off gives no costly-draw numbers", r3["offCostly"] is None, r3["offCostly"])
    check("real context: filtered, shadowed and blended draws are counted per frame", r3["costly"]["withFilter"]["median"] == 1 and r3["costly"]["withShadow"]["median"] == 1 and r3["costly"]["withBlendMode"]["median"] == 1, r3["costly"])
    check("real context: the text says deep mode is on", "Deep mode is on" in r3["text"], r3["text"])
    check("real context: check() passes within the limits and fails over them", r3["pass"]["ok"] and not r3["fail"]["ok"], [r3["pass"], r3["fail"]])
    check("real context: uninstall puts fill and drawImage back after deep mode", r3["restored"])
    check("no page errors", not errs, errs)
    br.close()
print("FAILED %d" % fails if fails else "all passed")
sys.exit(1 if fails else 0)
