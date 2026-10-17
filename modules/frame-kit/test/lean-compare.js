/* Same-answers comparison with Fancy Banana's own code. Copyright (c) 2026 LFC Foundry. MIT License.
 * compare(F, EvenDt, QG, series): F is test/reference-frame.js (Fancy's evenDt, govStep and qApply, verbatim), EvenDt and QG are the class under test, series comes from test/series.js.
 * Every series is fed frame by frame to both. even-dt: the returned gap must be exactly equal. quality-governor: the list of [frame number, new level] must be exactly equal, with the
 * clock starting at 0, at 8,000 and at 123,456.7 ms. Frames marked hidden are fed to Fancy's code with document.hidden set and to the governor as a gap of 0 (nothing measured).
 * Plain old JavaScript with no Node calls, so test/lean.js runs it in Node and tests/small-lean-browser.js runs the same text inside each browser. */
function compare(F, EvenDt, QG, series) {
  var cache = F.__cache || (F.__cache = {});   // Fancy's answers for a series never change, so they are worked out once and reused by every build compared
  var res = { evenFrames: 0, evenDiffs: 0, evenSeriesDiffering: 0, govRuns: 0, govDiffs: 0, govChanges: 0, differing: [] };
  series.forEach(function (s) {
    var i, a, b, ev, bad = 0, gov, t, ref, got, before;
    if (EvenDt) {
      ev = new EvenDt();
      if (!cache['e' + s.name]) { F.reset(); cache['e' + s.name] = s.frames.map(function (f) { return F.evenDt(f.gap); }); }
      for (i = 0; i < s.frames.length; i++) { a = cache['e' + s.name][i]; b = ev.next(s.frames[i].gap); res.evenFrames++; if (a !== b) bad++; }
      res.evenDiffs += bad; if (bad) { res.evenSeriesDiffering++; res.differing.push('even-dt: ' + s.name + ' (' + bad + ' of ' + s.frames.length + ' frames)'); }
    }
    if (QG) [0, 8000, 123456.7].forEach(function (t0) {
      var key = 'g' + s.name + '@' + t0; got = []; t = t0;
      if (!cache[key]) {
        F.reset(); ref = []; t = t0;
        for (i = 0; i < s.frames.length; i++) {
          t += s.frames[i].gap; F.setHidden(s.frames[i].hidden); before = F.get().qLvl; F.govStep(s.frames[i].gap, t);
          if (F.get().qLvl !== before) ref.push([i, F.get().qLvl]);
        }
        cache[key] = ref; t = t0;
      }
      ref = cache[key];
      gov = new QG({ onChange: function (to) { got.push([i, to]); } });
      for (i = 0; i < s.frames.length; i++) { t += s.frames[i].gap; gov.frame(s.frames[i].hidden ? 0 : s.frames[i].gap, t); }
      res.govRuns++; res.govChanges += ref.length;
      if (JSON.stringify(ref) !== JSON.stringify(got)) { res.govDiffs++; res.differing.push('governor: ' + s.name + ', clock from ' + t0 + ' (Fancy ' + JSON.stringify(ref).slice(0, 80) + ' against ' + JSON.stringify(got).slice(0, 80) + ')'); }
    });
  });
  return res;
}
if (typeof module !== 'undefined' && module.exports) module.exports = compare;
