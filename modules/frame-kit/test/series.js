/* Frame-time series for the same-answers checks of the lean builds. Copyright (c) 2026 LFC Foundry. MIT License.
 * series() returns [{ name, frames: [{ gap, hidden }] }]: 24 series (steady 60, 120 and 30 Hz, jitter on 60, 120, 144 and 30 Hz, an 80 ms stall, a hidden tab,
 * a long slow stretch then a fast one, a phone that slows in bursts, a ramp, random gaps, spikes, a 5 fps device, and a series that starts late). Always the same numbers.
 * `hidden` marks frames in which the page is hidden or not in a run: Fancy's code skips those frames, a lean build is fed a gap of 0 for them. */
'use strict';
module.exports = function series() {
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const beat = (period, jit, n) => { const g = []; let prev = 0; for (let k = 1; k <= n; k++) { const t = k * period + (rnd() * 2 - 1) * jit; g.push(t - prev); prev = t; } return g; };
  const plain = g => g.map(gap => ({ gap, hidden: false }));
  const S = [];
  const add = (name, gaps) => S.push({ name, frames: plain(gaps) });
  add('steady 60 Hz', beat(16.667, 0, 1500)); add('steady 120 Hz', beat(8.333, 0, 3000)); add('steady 30 Hz phone', beat(33.333, 0, 800));
  for (const j of [0.5, 1, 2, 3]) add('60 Hz, jitter ' + j + ' ms', beat(16.667, j, 1500));
  for (const j of [1, 2]) add('120 Hz, jitter ' + j + ' ms', beat(8.333, j, 3000));
  add('30 Hz, jitter 3 ms', beat(33.333, 3, 800)); add('144 Hz, jitter 1 ms', beat(6.944, 1, 3000));
  add('one 80 ms stall', beat(16.667, 1, 300).concat([80], beat(16.667, 1, 600)));
  add('three stalls 80 to 95 ms', beat(16.667, 1, 300).concat([80], beat(16.667, 1, 200), [80], beat(16.667, 1, 200), [95], beat(16.667, 1, 300)));
  add('hidden-tab gap of 5 s', beat(16.667, 1, 300).concat([5000], beat(16.667, 1, 600)));
  add('six gaps just over 100 ms', beat(16.667, 1, 300).concat([100, 101, 102, 103, 104, 105], beat(16.667, 1, 300)));
  add('slow stretch then fast', beat(30, 3, 600).concat(beat(14, 1, 1500)));
  add('long slow stretch then fast', beat(24, 2, 1500).concat(beat(15, 1, 2500)));
  add('phone slows in bursts', [].concat(...Array.from({ length: 6 }, () => beat(33, 4, 200).concat(beat(16.7, 1, 700)))));
  add('5 fps device', beat(200, 10, 200));
  add('60 and 45 Hz in turn', [].concat(...Array.from({ length: 8 }, (_, i) => beat(i % 2 ? 22.2 : 16.667, 1.5, 300))));
  add('load ramps up', Array.from({ length: 3000 }, (_, i) => 12 + i / 60 + rnd() * 2));
  add('random gaps 8 to 40 ms', Array.from({ length: 2000 }, () => 8 + rnd() * 32));
  add('60 Hz with spikes', beat(16.667, 1, 2000).map(g => rnd() < 0.02 ? g + 35 : g));
  add('tiny gaps then 60 Hz', beat(1.5, 0.2, 200).concat(beat(16.667, 1, 500)));
  // the page is hidden (or not in a run) for 40 and then 300 frames in the middle of a slow stretch and again in a fast one
  const hid = (name, gaps, spans) => S.push({ name, frames: gaps.map((gap, i) => ({ gap, hidden: spans.some(s => i >= s[0] && i < s[1]) })) });
  hid('hidden for 40 and 300 frames, slow', beat(30, 3, 900), [[200, 240], [500, 800]]);
  hid('hidden for 400 frames, fast after slow', beat(26, 2, 400).concat(beat(14, 1, 2400)), [[900, 1300]]);
  return S;
};
