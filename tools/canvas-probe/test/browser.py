"""Browser test for canvas-probe on a real canvas (Chromium). Run: python3 tools/canvas-probe/test/browser.py
Checks that the wrapped real CanvasRenderingContext2D still draws the right pixels, that the counts are right, that a planted
save() leak and an overhanging drawImage source are caught, and that uninstall() puts the real methods back.
Python 3 + Playwright for Python with Chromium; no network. Counts only: never judge milliseconds with the probe on."""
import pathlib, sys
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
    br = p.chromium.launch(args=["--disable-gpu"]); pg = br.new_page(); errs = []
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
    check("no page errors", not errs, errs)
    br.close()
print("FAILED %d" % fails if fails else "all passed")
sys.exit(1 if fails else 0)
