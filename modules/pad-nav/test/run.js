// pad-nav Node tests: fake gamepads and a tiny fake DOM, no browser. Run: node modules/pad-nav/test/run.js
// Covers the parts the Chromium checks in run.py do not: the stick press/release gap, safe callbacks, unplugging,
// sliders and drop-downs, button names and the UMD wrapper. Exits 1 if any check fails.
var fs = require('fs'), path = require('path'), vm = require('vm');
var FILE = path.join(__dirname, '..', 'pad-nav.js');
var PadNav = require(FILE);
var count = 0, fails = [];
function check(name, cond, detail) {
  count++;
  if (!cond) { fails.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail))); }
}

// ---- fake DOM: just what pad-nav touches ----
var NAMES = { a: 0, b: 1, start: 9, up: 12, down: 13, left: 14, right: 15 };
function makeEl(id, o) {
  o = o || {};
  var el = {
    id: id, tagName: o.tag || 'BUTTON', type: o.type || '', value: o.value, min: o.min || '', max: o.max || '', step: o.step || '',
    options: o.options, selectedIndex: o.selectedIndex === undefined ? -1 : o.selectedIndex, multiple: !!o.multiple, disabled: false,
    left: o.left || 0, top: o.top || 0, cls: {}, clicks: 0, events: [],
    classList: { add: function (c) { el.cls[c] = 1; }, remove: function (c) { delete el.cls[c]; }, contains: function (c) { return !!el.cls[c]; } },
    matches: function (s) { return s === ':disabled' && el.disabled; },
    getAttribute: function () { return null; }, closest: function () { return null; },
    getClientRects: function () { return [1]; },
    getBoundingClientRect: function () { return { left: el.left, top: el.top, width: 80, height: 40 }; },
    focus: function () { global.document.activeElement = el; },
    click: function () { el.clicks++; },
    dispatchEvent: function (e) { el.events.push(e.type); }
  };
  return el;
}
function row(n) { var l = [], i; for (i = 0; i < n; i++) l.push(makeEl('b' + i, { left: i * 140 })); return l; }

function make(opts, kids) {
  var blurs = [], wl = {};
  kids = kids || row(3);
  var scope = { id: 'scope', clientHeight: 300, scrollTop: 0, querySelectorAll: function () { return kids; } };
  global.document = { activeElement: null, body: scope, addEventListener: function (t, f) { blurs.push(f); }, removeEventListener: function (t, f) { var i = blurs.indexOf(f); if (i >= 0) blurs.splice(i, 1); } };
  global.window = { addEventListener: function (t, f) { wl[t] = f; }, removeEventListener: function (t) { delete wl[t]; } };
  global.getComputedStyle = function () { return { visibility: 'visible' }; };
  var hint = { _h: true, get hidden() { return this._h; }, set hidden(v) { this._h = v; this.writes++; }, textContent: '', attrs: {}, writes: 0, setAttribute: function (k, v) { this.attrs[k] = v; }, getAttribute: function (k) { return this.attrs[k] || null; } };
  var pad = { id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
  for (var i = 0; i < 17; i++) pad.buttons.push({ pressed: false, value: 0 });
  var h = { kids: kids, scope: scope, pad: pad, hint: hint, T: 0, log: [], win: wl, pads: [pad], blurs: blurs, scopeNow: scope };
  var o = { getScope: function () { return h.scopeNow; }, getPads: function () { return h.pads; }, hintEl: hint, onBack: function () { h.log.push('back'); }, onStart: function () { h.log.push('start'); } };
  for (var k in opts) o[k] = opts[k];
  h.pn = new PadNav(o);
  h.hold = function (names, axes) {
    pad.buttons.forEach(function (b) { b.pressed = false; b.value = 0; });
    names.forEach(function (n) { pad.buttons[NAMES[n]].pressed = true; pad.buttons[NAMES[n]].value = 1; });
    pad.axes = axes || [0, 0, 0, 0];
  };
  h.tick = function (dt) { h.T += dt === undefined ? 16 : dt; return h.pn.step(h.T); };
  h.tap = function (name) { h.hold([name]); h.tick(); h.hold([]); h.tick(); };
  h.ring = function () { for (var i = 0; i < kids.length; i++) if (kids[i].cls['pad-focus']) return kids[i].id; return null; };
  h.hintText = function () { return hint.hidden ? '' : hint.textContent; };
  return h;
}

// ---------------------------------------------------------------- 1. pure stick state machine
console.log('1. stick press and release');
var w = { l: 0, r: 0, u: 0, d: 0 }, seq = [0.3, 0.46, 0.5, 0.4, 0.36, 0.34, 0.4, 0.46], got = [];
seq.forEach(function (x) { PadNav.stick(x, 0, w, 0.45, 0.35, w); got.push(w.r); });
check('press above 0.45, hold down to 0.35, release below it, press again only above 0.45', got.join('') === '01111001', got.join(''));
check('exactly 0.45 is not a press', PadNav.stick(0.45, 0, null, 0.45, 0.35).r === 0);
check('exactly the release value lets go', PadNav.stick(0.35, 0, { r: 1 }, 0.45, 0.35).r === 0);
check('just above the release value keeps holding', PadNav.stick(0.36, 0, { r: 1 }, 0.45, 0.35).r === 1);
check('release above press is clamped (no gap)', PadNav.stick(0.4, 0, { r: 1 }, 0.45, 0.9).r === 0);
check('left, up and down work too', PadNav.stick(-0.6, 0, null, 0.45, 0.35).l === 1 && PadNav.stick(0, -0.6, null, 0.45, 0.35).u === 1 && PadNav.stick(0, 0.6, null, 0.45, 0.35).d === 1);
var dg = PadNav.stick(0.8, 0.9, null, 0.45, 0.35);
check('diagonal counts along the stronger axis only', dg.d === 1 && dg.r === 0 && dg.l === 0 && dg.u === 0, dg);
var eq = PadNav.stick(0.7, 0.7, null, 0.45, 0.35);
check('a tie goes to vertical, as before', eq.d === 1 && eq.r === 0, eq);
check('out object is reused', (function () { var o = {}; return PadNav.stick(0.9, 0, null, 0.45, 0.35, o) === o; })());

// ---------------------------------------------------------------- 2. other pure helpers
console.log('2. range, option and label helpers');
check('rangeNext default step', PadNav.rangeNext('5', '', '', '', 1) === '6' && PadNav.rangeNext('5', '', '', '', -1) === '4');
check('rangeNext clamps at max and min', PadNav.rangeNext('100', '0', '100', '1', 1) === '100' && PadNav.rangeNext('0', '0', '100', '1', -1) === '0');
check('rangeNext honors step 0.1 without float noise', PadNav.rangeNext('0.7', '0', '1', '0.1', 1) === '0.8', PadNav.rangeNext('0.7', '0', '1', '0.1', 1));
check('rangeNext honors step 5 and min', PadNav.rangeNext('10', '10', '50', '5', 1) === '15');
check('rangeNext step "any" uses a hundredth of the range', PadNav.rangeNext('0', '0', '1', 'any', 1) === '0.01', PadNav.rangeNext('0', '0', '1', 'any', 1));
check('rangeNext copes with a bad value', PadNav.rangeNext('abc', '2', '9', '1', 1) === '3');
check('decimals', PadNav.decimals(1) === 0 && PadNav.decimals(0.25) === 2 && PadNav.decimals(1e-7) === 7);
var opts = [{ disabled: false }, { disabled: true }, { disabled: false }];
check('nextOption skips disabled and wraps', PadNav.nextOption(opts, 0) === 2 && PadNav.nextOption(opts, 2) === 0);
check('nextOption with one enabled option returns it; with none or empty gives -1', PadNav.nextOption([{ disabled: false }], 0) === 0 && PadNav.nextOption([{ disabled: true }], 0) === -1 && PadNav.nextOption([], -1) === -1 && PadNav.nextOption(null, -1) === -1);
check('nextOption from -1 picks the first enabled', PadNav.nextOption(opts, -1) === 0);
var ps = PadNav.labelsFor('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)');
check('PlayStation id gives Cross and Circle', ps.a === 'Cross' && ps.b === 'Circle' && ps.start === 'Options', ps);
var ns = PadNav.labelsFor('057e-2009-Pro Controller');
check('Nintendo id swaps A and B', ns.a === 'B' && ns.b === 'A', ns);
var xs = PadNav.labelsFor('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)');
check('Xbox and unknown ids stay A, B, Start', xs.a === 'A' && xs.b === 'B' && xs.start === 'Start' && PadNav.labelsFor('').a === 'A' && PadNav.labelsFor(null).b === 'B');

// ---------------------------------------------------------------- 3. safe wrapper
console.log('3. errors never escape step()');
var h = make({ getPads: function () { throw new Error('SecurityError: gamepad disabled'); }, onError: function (e, where) { h.log.push('err:' + where); } });
var r, threw = false;
try { r = h.tick(); h.tick(); h.tick(); } catch (e) { threw = true; }
check('getGamepads that throws does not throw out of step()', !threw && r === false);
check('onError hears a repeating error once, with where', h.log.join() === 'err:getPads', h.log);
check('lastError is kept', h.pn.lastError && /SecurityError/.test(h.pn.lastError.message) && h.pn.lastErrorWhere === 'getPads');
check('default getPads without navigator.getGamepads gives no pad', (function () { var q = make({ getPads: undefined }); return q.tick() === false; })());
(function () {
  var q = make({ getPads: function () { return { get length() { throw new Error('boom'); } }; } });
  var t = false; try { q.tick(); } catch (e) { t = true; }
  check('a throw anywhere inside step() is caught by the outer guard', !t && q.pn.lastErrorWhere === 'step');
})();
(function () {
  var q = make({
    onBack: function () { throw new Error('back'); }, onStart: function () { throw new Error('start'); },
    onA: function () { throw new Error('onA'); }, onUse: function () { throw new Error('use'); },
    filter: function (el) { if (el.id === 'b0') throw new Error('filter'); return true; },
    hintText: function () { throw new Error('hint'); }
  });
  var t = false;
  try { q.tap('right'); q.tap('b'); q.tap('start'); q.tap('a'); } catch (e) { t = true; }
  check('throwing onBack, onStart, onA, onUse, filter and hintText never escape', !t);
  check('a throwing filter leaves the element in', q.ring() === 'b0', q.ring());
  check('a throwing onA does not block the click', q.kids[0].clicks === 1, q.kids[0].clicks);
  q.hold(['right']); q.tick();
  check('a throwing hintText falls back to the default hint', /D-pad: move/.test(q.hintText()), q.hintText());
  var q2 = make({ getScope: function () { throw new Error('scope'); } });
  q2.tap('right');
  check('a throwing getScope means no scope', q2.ring() === null && q2.pn.lastErrorWhere === 'getScope');
  var q3 = make({ onError: function () { throw new Error('in handler'); }, onBack: function () { throw new Error('x'); } });
  var t3 = false; try { q3.tap('b'); } catch (e) { t3 = true; }
  check('a throwing onError is ignored', !t3);
  var q4 = make({}); q4.kids[0].click = function () { throw new Error('click'); };
  var t4 = false; try { q4.tap('right'); q4.tap('a'); } catch (e) { t4 = true; }
  check('a throwing click is caught', !t4 && q4.pn.lastErrorWhere === 'click');
})();

// ---------------------------------------------------------------- 4. stick jitter in a real step loop
console.log('4. a stick resting near the press point does not flip every frame');
function jitter(opts) {
  var q = make(opts, row(8)), i, moves = 0, last;
  q.hold([], [0.5, 0, 0, 0]); q.tick();             // press: wakes the ring on b0
  last = q.ring();
  for (i = 0; i < 12; i++) {                         // about 190 ms: inside the 380 ms repeat delay
    q.hold([], [i % 2 ? 0.5 : 0.4, 0, 0, 0]); q.tick();
    if (q.ring() !== last) { moves++; last = q.ring(); }
  }
  return moves;
}
check('default: 0.5 / 0.4 wobble causes no extra moves', jitter({}) === 0, jitter({}));
check('without a gap (release = deadzone) the same wobble moves every other frame', jitter({ release: 0.45 }) >= 4, jitter({ release: 0.45 }));
check('release below the press point still lets go of a real release', (function () {
  var q = make({}, row(8)); q.hold([], [0.5, 0, 0, 0]); q.tick(); q.hold([], [0.2, 0, 0, 0]); q.tick(); q.hold([], [0.5, 0, 0, 0]); q.tick();
  return q.ring() === 'b1';
})());
check('custom release is honored', (function () {
  var q = make({ release: 0.1 }, row(8)); q.hold([], [0.5, 0, 0, 0]); q.tick(); q.hold([], [0.2, 0, 0, 0]); q.tick(); q.hold([], [0.5, 0, 0, 0]); q.tick();
  return q.ring() === 'b0';   // 0.2 is above 0.1, so it never let go
})());
check('two pads: the latch is kept per pad', (function () {
  var q = make({}, row(8)), p2 = { id: 'second', index: 1, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] }, i;
  for (i = 0; i < 17; i++) p2.buttons.push({ pressed: false, value: 0 });
  q.pads = [q.pad, p2];
  p2.axes = [0.5, 0, 0, 0]; q.tick();   // pad 2 pushes right: ring wakes
  q.pad.axes = [0.4, 0, 0, 0]; p2.axes = [0, 0, 0, 0]; q.tick();   // pad 1 at 0.4 was never pressed, so it must not count
  return q.ring() === 'b0' && !q.pn.prev.r;
})());

// ---------------------------------------------------------------- 5. unplugging, onUse, onDisconnect
console.log('5. unplug cleanup and hooks');
(function () {
  var q = make({ onUse: function (p) { q.log.push('use:' + p.index); }, onDisconnect: function () { q.log.push('gone'); } });
  q.tick();
  check('nothing is shown or called before pad input', q.log.length === 0 && q.hint.hidden === true && q.pn.awake === false);
  q.tap('right');
  check('onUse fires once with the pad, on the first input', q.log.join() === 'use:0', q.log);
  q.tap('right');
  check('onUse does not fire again while awake', q.log.join() === 'use:0');
  check('hint is up, ring is up, awake', q.hintText() !== '' && q.ring() === 'b1' && q.pn.awake);
  q.pads = []; q.tick();
  check('pad gone: hint hidden, ring cleared, awake cleared', q.hintText() === '' && q.ring() === null && q.pn.awake === false && q.pn.hadPad === false);
  check('pad gone: onDisconnect once', q.log.join() === 'use:0,gone', q.log);
  q.tick(); q.tick();
  check('no repeat of onDisconnect on later empty frames', q.log.join() === 'use:0,gone');
  q.pads = [q.pad]; q.tap('right');
  check('plugging back in and pressing fires onUse again and shows the hint', q.log.join() === 'use:0,gone,use:0' && q.hintText() !== '', q.log);
  q.pad.connected = false; q.tick();
  check('connected=false counts as gone', q.log[q.log.length - 1] === 'gone' && q.hintText() === '');
})();
(function () {
  var q = make({ onDisconnect: function () { q.log.push('gone'); } });
  q.tap('right'); q.tap('right');
  check('gamepaddisconnected listener is registered', typeof q.win.gamepaddisconnected === 'function');
  var second = { id: 's', index: 1, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: q.pad.buttons };
  q.pads = [q.pad, second]; q.win.gamepaddisconnected({});
  check('event with a usable pad left does nothing', q.log.length === 0 && q.pn.awake);
  q.pads = []; q.win.gamepaddisconnected({});
  check('event with no pad left cleans up at once, before the next frame', q.log.join() === 'gone' && q.ring() === null && q.hintText() === '' && !q.pn.awake, q.log);
  q.win.gamepaddisconnected({});
  check('a second event does nothing more', q.log.join() === 'gone');
  q.pn.destroy();
  check('destroy() removes the disconnect listener', q.win.gamepaddisconnected === undefined);
  var q2 = make({ getPads: function () { throw new Error('x'); } });
  var t = false; try { q2.win.gamepaddisconnected({}); } catch (e) { t = true; }
  check('the event is safe when getGamepads throws', !t);
})();
(function () {
  var q = make({});
  q.tick();
  var before = q.hint.writes;
  q.pads = []; q.tick(); q.tick();
  check('step() with no pad ever seen leaves the DOM alone', q.hint.hidden === true && q.hint.writes === before && q.ring() === null);
})();

// ---------------------------------------------------------------- 6. sliders, drop-downs, switches
console.log('6. sliders, drop-downs and switches');
(function () {
  var rng = makeEl('vol', { tag: 'INPUT', type: 'range', value: '5', min: '0', max: '7', step: '1', left: 0 });
  var btn = makeEl('btn', { left: 0, top: 80 });
  var q = make({ onA: function (el) { q.log.push('onA:' + el.id); } }, [rng, btn]);
  q.tap('right');
  check('range input is reachable', q.ring() === 'vol');
  q.tap('a');
  check('A on a range enters adjust mode: no click, class added, hint changes', rng.clicks === 0 && q.pn.adjust === rng && rng.cls['pad-adjust'] && /Left\/Right: change/.test(q.hintText()), q.hintText());
  check('onA still runs first', q.log.join() === 'onA:vol');
  q.tap('right');
  check('right adds one step and fires input then change', rng.value === '6' && rng.events.join() === 'input,change', [rng.value, rng.events]);
  q.tap('left'); q.tap('left');
  check('left subtracts one step each press', rng.value === '4' && rng.events.length === 6, rng.value);
  q.tap('down');
  check('up and down are ignored while adjusting (focus stays)', q.ring() === 'vol' && q.pn.adjust === rng);
  q.hold(['right']); q.tick(); q.tick(379);
  check('holding right repeats only after the repeat delay', rng.value === '5', rng.value);
  q.tick(1);
  check('first repeat at 380 ms', rng.value === '6');
  q.hold([]); q.tick();
  rng.value = '7'; rng.events.length = 0; q.tap('right');
  check('at max nothing changes and no events fire', rng.value === '7' && rng.events.length === 0);
  q.tap('b');
  check('B leaves adjust mode and does not call onBack', q.pn.adjust === null && !rng.cls['pad-adjust'] && q.log.indexOf('back') < 0);
  q.tap('b');
  check('the next B calls onBack', q.log.indexOf('back') >= 0);
  q.tap('a'); q.tap('a');
  check('A again leaves adjust mode without a click', q.pn.adjust === null && rng.clicks === 0);
  q.tap('a');
  q.hold([]); q.tick();
  q.pn.focus(btn);
  check('moving the ring elsewhere ends adjust mode', q.pn.adjust === null && !rng.cls['pad-adjust']);
  q.pn.focus(rng); q.tap('a');
  q.h = q; q.scopeNow = null; q.tick();
  check('a scope change ends adjust mode', q.pn.adjust === null);
  q.scopeNow = q.scope; q.tick();
})();
(function () {
  var rng = makeEl('vol', { tag: 'INPUT', type: 'range', value: '5' });
  var q = make({ formControls: false }, [rng]);
  q.tap('right'); q.tap('a');
  check('formControls:false makes A just click a slider', rng.clicks === 1 && q.pn.adjust === null);
  var stop = makeEl('vol2', { tag: 'INPUT', type: 'range', value: '5' });
  var q2 = make({ onA: function () { return false; } }, [stop]);
  q2.tap('right'); q2.tap('a');
  check('onA returning false also stops adjust mode', q2.pn.adjust === null);
})();
(function () {
  var sel = makeEl('sel', { tag: 'SELECT', options: [{ disabled: false }, { disabled: true }, { disabled: false }], selectedIndex: 0 });
  var q = make({}, [sel]);
  q.tap('right'); q.tap('a');
  check('A on a select moves to the next enabled option and fires input and change', sel.selectedIndex === 2 && sel.events.join() === 'input,change' && sel.clicks === 0, [sel.selectedIndex, sel.events]);
  q.tap('a');
  check('it wraps around', sel.selectedIndex === 0);
  var one = makeEl('one', { tag: 'SELECT', options: [{ disabled: false }], selectedIndex: 0 });
  var q2 = make({}, [one]); q2.tap('right'); q2.tap('a');
  check('a select with one option fires nothing', one.events.length === 0);
  var multi = makeEl('multi', { tag: 'SELECT', options: [{}, {}], selectedIndex: 0, multiple: true });
  var q3 = make({}, [multi]); q3.tap('right'); q3.tap('a');
  check('a multiple select is clicked, not cycled', multi.clicks === 1 && multi.selectedIndex === 0);
  var cb = makeEl('cb', { tag: 'INPUT', type: 'checkbox' }), rd = makeEl('rd', { tag: 'INPUT', type: 'radio', top: 60 });
  var q4 = make({}, [cb, rd]); q4.tap('right'); q4.tap('a'); q4.tap('down'); q4.tap('a');
  check('checkbox and radio are toggled by a normal click', cb.clicks === 1 && rd.clicks === 1);
})();

// ---------------------------------------------------------------- 7. hint: role, names
console.log('7. hint role and button names');
(function () {
  var q = make({});
  check('hint element gets role="status"', q.hint.attrs.role === 'status');
  var keep = { hidden: true, attrs: { role: 'alert' }, setAttribute: function (k, v) { this.attrs[k] = v; }, getAttribute: function (k) { return this.attrs[k] || null; } };
  make({ hintEl: keep });
  check('an existing role is kept', keep.attrs.role === 'alert');
  check('a hint-less setup is fine', make({ hintEl: null }).tick() !== undefined);
  q.tap('right');
  check('default hint says A, B and Start', q.hintText() === 'D-pad: move    A: pick    B: back    Start: pause', q.hintText());
  var ps = make({ labels: true });
  ps.pad.id = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'; ps.tap('right');
  check('labels:true on a PlayStation pad says Cross, Circle, Options', ps.hintText() === 'D-pad: move    Cross: pick    Circle: back    Options: pause', ps.hintText());
  var xb = make({ labels: true }); xb.tap('right');
  check('labels:true on an Xbox pad still says A, B, Start', xb.hintText() === 'D-pad: move    A: pick    B: back    Start: pause');
  var my = make({ labels: { a: 'Jump', start: 'Menu' } }); my.tap('right');
  check('labels as an object overrides words', my.hintText() === 'D-pad: move    Jump: pick    B: back    Menu: pause', my.hintText());
  var fn = make({ labels: function (id) { return { a: id.length > 0 ? 'X' : 'Y' }; } }); fn.tap('right');
  check('labels as a function gets the pad id', /X: pick/.test(fn.hintText()));
  var d = make({ labels: false }); d.pad.id = '054c-sony'; d.tap('right');
  check('labels off ignores the pad id', /A: pick/.test(d.hintText()));
  var ht = make({ hintText: function (scope, names, mode) { return mode + ':' + names.a; } }); ht.tap('right');
  check('hintText gets (scope, names, mode)', ht.hintText() === 'menu:A', ht.hintText());
  check('names are shared and frozen by default', Object.isFrozen(PadNav.DEFAULT_NAMES));
})();

// ---------------------------------------------------------------- 7b. nextRule, checkVisibility, onInput
console.log('7b. nextRule edges, checkVisibility, onInput');
(function () {
  function R(l, t, w, hh) { return { left: l, top: t, width: w, height: hh }; }
  // a wide button on top, a narrow one below-left of its center and a narrow one below-right: down from the wide one
  var wide = R(0, 0, 300, 40), under = [R(0, 60, 60, 40), R(240, 60, 60, 40)];
  check('center rule: down from a wide button picks the one nearer its center line (tie goes to the first)', PadNav.nearest(wide, under, 'd') >= 0);
  // in-line case: a short button to the right on the same row beats a closer-by-center one on the next row
  var from = R(0, 0, 100, 40), cand = [R(130, 4, 60, 32), R(60, 50, 40, 40)];
  check('edges: right goes to the button on the same row, not the one that is mostly below', PadNav.nearest(from, cand, 'r', 'edges') === 0);
  // a button that overlaps in line but is farther away must lose to a nearer one in line
  var near = [R(300, 0, 40, 40), R(120, 0, 40, 40)];
  check('edges: the nearest edge in line wins', PadNav.nearest(from, near, 'r', 'edges') === 1);
  // nothing in line: falls back to the center rule
  var diag = [R(150, 100, 40, 40)];
  check('edges: with none in line it falls back to the center rule', PadNav.nearest(from, diag, 'r', 'edges') === PadNav.nearest(from, diag, 'r'));
  check('edges: nothing in that direction gives -1', PadNav.nearest(from, [R(-200, 0, 40, 40)], 'r', 'edges') === -1);
  check('edges: up and left mirror down and right', PadNav.nearest(R(0, 200, 100, 40), [R(10, 100, 40, 40), R(300, 190, 40, 40)], 'u', 'edges') === 0 && PadNav.nearest(R(300, 0, 100, 40), [R(100, 5, 40, 40), R(310, 100, 40, 40)], 'l', 'edges') === 0);
  check('edges: a larger overlap wins when the gap is equal', PadNav.nearest(R(0, 0, 100, 100), [R(120, 80, 40, 40), R(120, 10, 40, 60)], 'r', 'edges') === 1);
  check('unknown rule is the default center rule', PadNav.nearest(from, cand, 'r', 'bogus') === PadNav.nearest(from, cand, 'r'));
  check('nextRule defaults to center, accepts edges, ignores anything else', make({}).pn.nextRule === 'center' && make({ nextRule: 'edges' }).pn.nextRule === 'edges' && make({ nextRule: 'x' }).pn.nextRule === 'center');
  // moving with nextRule edges through step(): row of three, then a tall button below the first
  var kids = row(3); kids[1].top = 0; kids[0].top = 0; kids[2].top = 0;
  var e = make({ nextRule: 'edges' }, kids); e.tap('right'); e.tap('right');
  check('edges rule moves through a row like the default', e.ring() === 'b1', e.ring());

  // checkVisibility is used when the element has it (and getClientRects is then not needed)
  var seen = [], vis = row(3);
  vis.forEach(function (el, i) { el.checkVisibility = function (o) { seen.push(o && o.checkVisibilityCSS && o.visibilityProperty ? 'ok' : 'bad'); return i !== 1; }; el.getClientRects = function () { throw new Error('should not be called'); }; });
  var v = make({}, vis); v.tap('right'); v.tap('right');
  check('checkVisibility hides b1 and both option spellings are passed', v.ring() === 'b2' && seen.length > 0 && seen.every(function (x) { return x === 'ok'; }), v.ring() + ' ' + seen.join());
  // without it, the old path still hides display:none elements
  var old = row(3); old[1].getClientRects = function () { return []; };
  var o2 = make({}, old); o2.tap('right'); o2.tap('right');
  check('without checkVisibility the old path still skips a hidden button', o2.ring() === 'b2', o2.ring());

  // onInput
  var n = 0, ii = make({ onInput: function (pad) { n++; ii.log.push('in:' + (pad === ii.pad)); } });
  ii.hold(['right']); ii.tick(0); ii.tick(50); ii.tick(50);
  check('onInput fires on pad input, at most once per 250 ms', n === 1 && ii.log[0] === 'in:true', n + ' ' + ii.log.join());
  ii.tick(400);
  check('onInput fires again after the gap', n === 2, n);
  ii.hold([]); ii.tick(1000);
  check('no input, no onInput', n === 2, n);
  var jj = 0, ij = make({ onInput: function () { jj++; }, inputMs: 0 }); ij.hold(['right']); ij.tick(); ij.tick(); ij.tick();
  check('inputMs 0 reports every frame with input', jj === 3, jj);
  var thr = make({ onInput: function () { throw new Error('page bug'); } }); thr.hold(['right']); var tt = false; try { thr.tick(); thr.tick(); } catch (x) { tt = true; }
  check('a throwing onInput does not break step()', !tt);
  var st = make({ onInput: function () { st.log.push('input'); }, onUse: function () { st.log.push('use'); } }); st.hold(['right']); st.tick();
  check('onInput comes before onUse on the first input', st.log.join() === 'input,use', st.log.join());
})();

// ---------------------------------------------------------------- 8. loader and house rules
console.log('8. UMD wrapper and house rules');
var src = fs.readFileSync(FILE, 'utf8');
var box = {}; vm.runInNewContext(src, box);
check('plain script load puts PadNav on the global object', typeof box.PadNav === 'function' && typeof box.PadNav.nearest === 'function');
var sandbox = { self: {} }; sandbox.self = sandbox; vm.runInNewContext(src, sandbox);
check('self-based global also works', typeof sandbox.PadNav === 'function');
check('module.exports works', typeof PadNav === 'function');
check("'use strict' is inside the wrapper, not at file level", /function \(\) \{\s*\n\s*'use strict';/.test(src) && !/^'use strict'/m.test(src));
check('no globals leak from the wrapper', (function () { var b = {}; vm.runInNewContext(src, b); return Object.keys(b).join() === 'PadNav'; })());
check('license header is kept', /Copyright \(c\) 2026 LFC Foundry\. MIT License/.test(src));
check('ES5 only: no arrow functions, template literals, let or const', !/=>|`|\blet\b|\bconst\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^'\n]*'/g, "''")));

console.log(count + ' checks, ' + fails.length + ' failed');
if (fails.length) { console.log('FAILED: ' + fails.join(', ')); process.exit(1); }
console.log('OK');
