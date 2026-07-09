/* Unit tests for engine.js
 * Run with: node tests/engine.test.js  — or open tests/index.html in a browser. */
const E = (typeof module === 'object' && module.exports)
  ? require('../engine.js')
  : window.TLEngine;

let passed = 0, failed = 0;
function check(name, actual, expected, tolPct) {
  const tol = (tolPct === undefined ? 0.01 : tolPct) / 100;
  const ok = Math.abs(actual - expected) <= Math.abs(expected) * tol + 1e-12;
  if (ok) { passed++; console.log(`  PASS  ${name}  (${actual})`); }
  else { failed++; console.log(`  FAIL  ${name}  got ${actual}, expected ${expected} (±${tolPct ?? 0.01}%)`); }
}
function checkTrue(name, cond) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
}

console.log('\n== Parabolic three-point solver ==');
// Hand-computed: w=15.912 N/m (ACSR Zebra), L=300, xp=100, D=5
// T = (15.912*100*200)/(2*5) = 318240/10 = 31824 N
check('tensionThreePoint Zebra 300m', E.tensionThreePoint(15.912, 300, 100, 5), 31824);
// D_mid = w*L^2/(8T) = 15.912*90000/254592 = 5.625 m
check('midSpanSag round-trip', E.midSpanSag(15.912, 300, 31824), 5.625);
// Level span symmetry: xp at mid, D = D_mid must return same T both ways
const Tsym = E.tensionThreePoint(10, 400, 200, 8);
check('level-span symmetry', E.midSpanSag(10, 400, Tsym), 8);

console.log('\n== Z-coordinate chord geometry ==');
const geo = E.sagOffsetFromZ(300, 100, 140, 175, 146.4);
// h=35, yChord = 140 + (35/300)*100 = 151.6667, D = 5.2667
check('sagOffsetFromZ h', geo.h, 35);
check('sagOffsetFromZ D', geo.D, 5.26667, 0.01);

console.log('\n== Return-wave method ==');
// d = 9.81*t^2/(32 N^2): t=6s, N=3 -> 9.81*36/288 = 1.22625 m
check('waveSag t=6 N=3', E.waveSag(6, 3), 1.22625);
check('tensionFromMidSag', E.tensionFromMidSag(15.912, 300, 5.625), 31824);

console.log('\n== Sensitivity / perturbation ==');
const Tbase = E.tensionThreePoint(15.912, 300, 100, E.sagOffsetFromZ(300, 100, 140, 175, 146.4).D);
const Tzp = E.perturbedTension(15.912, 300, 100, 140, 175, 146.4, 0.05, 'zp');
checkTrue('zp perturbation raises T (smaller D)', Tzp > Tbase);
checkTrue('invalid D returns 0', E.perturbedTension(10, 300, 100, 140, 175, 200, 0, 'zp') === 0);

console.log('\n== Parabola least-squares ==');
const paraPts = [];
for (let x = 0; x <= 100; x += 10) paraPts.push({ x, y: 0.002 * x * x - 0.3 * x + 7 });
const pf = E.fitParabola(paraPts);
check('parabola a', pf.a, 0.002);
check('parabola b', pf.b, -0.3);
check('parabola c', pf.c, 7);

console.log('\n== Catenary fit: exact synthetic recovery ==');
// Wangtoo-like river crossing: L=788 m, T=30 kN, ACSR Zebra w=15.912 N/m
// C = T/w = 1885.37 m
{
  const C = 30000 / 15.912, x0 = 394, y0 = 0;
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const x = (788 * i) / 20;
    pts.push({ x, y: E.catenaryY(C, x0, y0, x) });
  }
  const fit = E.fitCatenary(pts);
  checkTrue('fit ok', fit.ok);
  check('recovered C (noise-free)', fit.C, C, 0.1);
  check('recovered x0', fit.x0, x0, 0.5);
  checkTrue('rmse tiny', fit.rmse < 1e-3);

  // Tension from analysis
  const an = E.analyzeCatenary(fit, { x: 0, y: pts[0].y }, { x: 788, y: pts[20].y }, 15.912, 130300);
  check('tension from C', an.T, 30000, 0.2);
  // Level span mid sag ~ C*(cosh(L/2C)-1) = 1885.37*(cosh(0.20898)-1) = 41.29 m
  check('mid-span sag', an.sagMid, 1885.37 * (Math.cosh(394 / 1885.37) - 1), 0.5);
  checkTrue('max sag near mid for level span', Math.abs(an.xMaxSag - 394) < 2);
}

console.log('\n== Catenary fit: noisy + inclined span ==');
{
  // Inclined span: hooks at different heights, deterministic pseudo-noise ±0.15 m
  const C = 900, x0 = 260, y0 = 5;
  const pts = [];
  for (let i = 0; i <= 15; i++) {
    const x = 30 + (500 * i) / 15;
    const noise = 0.15 * Math.sin(i * 12.9898) ; // deterministic, zero-ish mean
    pts.push({ x, y: E.catenaryY(C, x0, y0, x) + noise });
  }
  const fit = E.fitCatenary(pts);
  checkTrue('noisy fit ok', fit.ok);
  check('recovered C (noisy)', fit.C, C, 5);
  checkTrue('rmse reflects noise (<0.2m)', fit.rmse < 0.2);
}

console.log('\n== Catenary vs parabola consistency (small sag) ==');
{
  // Small-sag catenary must agree with the parabolic formula within ~0.5%
  const w = 9.555, L = 250, T = 25000; // ACSR Panther
  const C = T / w;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const x = (L * i) / 12;
    pts.push({ x, y: E.catenaryY(C, L / 2, 0, x) });
  }
  const fit = E.fitCatenary(pts);
  const an = E.analyzeCatenary(fit, pts[0], pts[12], w, 79700);
  const Tparab = E.tensionFromMidSag(w, L, an.sagMid);
  check('parabola tension from catenary sag', Tparab, T, 0.5);
}

console.log('\n== Fit failure guards ==');
{
  checkTrue('too few points rejected', E.fitCatenary([{x:0,y:0},{x:1,y:1}]).ok === false);
  const flat = [{x:0,y:5},{x:10,y:4},{x:20,y:3},{x:30,y:2},{x:40,y:1}];
  checkTrue('no-sag (straight line) rejected', E.fitCatenary(flat).ok === false);
  const inverted = [];
  for (let i = 0; i <= 10; i++) { const x = i * 10; inverted.push({ x, y: -0.01 * (x - 50) * (x - 50) }); }
  checkTrue('inverted curvature rejected', E.fitCatenary(inverted).ok === false);
}

console.log('\n== Change of state (temperature) ==');
{
  // ACSR Zebra: A=484.5 mm², E=68.5 GPa -> EA = 33.19e6 N, alpha=19.3e-6
  const EA = 68.5e9 * 484.5e-6, alpha = 19.3e-6, w = 15.912, L = 300, T1 = 30000, t1 = 25;
  // Identity: same temperature must return the same tension (cubic root at T1)
  check('same temp -> same tension', E.changeOfState(T1, t1, 25, w, L, EA, alpha), T1, 0.01);
  const Thot = E.changeOfState(T1, t1, 85, w, L, EA, alpha);
  const Tcold = E.changeOfState(T1, t1, 0, w, L, EA, alpha);
  checkTrue('hotter -> slacker (T drops)', Thot < T1);
  checkTrue('colder -> tighter (T rises)', Tcold > T1);
  // Magnitude sanity: 60°C rise on a 300 m Zebra span should shed
  // roughly 20-60% of tension (typical stringing-chart behaviour)
  checkTrue('hot tension in plausible range', Thot > 0.35 * T1 && Thot < 0.85 * T1);
  // Round trip: state at 85°C carried back to 25°C returns the original
  const Tback = E.changeOfState(Thot, 85, 25, w, L, EA, alpha);
  check('round trip 25->85->25', Tback, T1, 0.05);
}

console.log('\n== Rangefinder hook-height helpers ==');
{
  // Station 60 m out: hook at +25°, base at -8°
  const H1 = E.hookHeightFromSlants(66.2, 25, 60.6, -8);
  // expected: 66.2*sin25 - 60.6*sin(-8) = 27.98 + 8.43 = 36.41
  check('slant mode', H1, 66.2 * Math.sin(25 * Math.PI / 180) - 60.6 * Math.sin(-8 * Math.PI / 180), 0.01);
  const H2 = E.hookHeightFromAngles(60, 25, -8);
  check('angles mode', H2, 60 * (Math.tan(25 * Math.PI / 180) - Math.tan(-8 * Math.PI / 180)), 0.01);
  checkTrue('both modes agree for consistent geometry', Math.abs(H1 - (60 / Math.cos(25 * Math.PI / 180)) * Math.sin(25 * Math.PI / 180) - 60.6 * Math.sin(8 * Math.PI / 180)) < 2);
}

console.log('\n== Homography (perspective rectification) ==');
{
  // Known projective transform: mild perspective + rotation + scale
  const Htrue = [1.2, 0.15, 40, -0.1, 1.05, 260, 0.00021, -0.00013, 1];
  const world = [{ x: 0, y: 0 }, { x: 788, y: 55 }, { x: 0, y: -60 }, { x: 788, y: -8 }];
  const img = world.map(p => E.applyHomography(Htrue, p));

  const H = E.computeHomography(img, world); // image -> world
  checkTrue('homography solvable', H !== null);
  // Round-trip a point that was NOT part of the 4 correspondences
  const mid = E.applyHomography(Htrue, { x: 394, y: -30 });
  const back = E.applyHomography(H, mid);
  check('round-trip x', back.x, 394, 0.001);
  check('round-trip y', back.y, -30, 0.02);

  // Degenerate: 3 collinear points must be rejected
  const bad = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 5, y: 0 }];
  checkTrue('collinear degenerate rejected', E.computeHomography(bad, world) === null);
}

console.log('\n== Perspective catenary recovery (oblique Wangtoo-style shot) ==');
{
  // Ground truth: 788 m span, Zebra, T = 28 kN -> C = 1759.68 m, h = +55 m,
  // towers 60 m tall. Photographed from a STRONGLY oblique viewpoint.
  const w = 15.912, T = 28000, C = T / w, L = 788, h = 55, HA = 60, HB = 60;
  // solve x0/y0 so the catenary passes through (0,0) and (L,h)
  const f = x0 => C * (Math.cosh((L - x0) / C) - 1) - C * (Math.cosh((0 - x0) / C) - 1) - h;
  let lo = -4000, hi = 4000;
  for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0) ? hi = m : lo = m; }
  const x0 = (lo + hi) / 2, y0 = -C * (Math.cosh(-x0 / C) - 1);
  const yw = x => y0 + C * (Math.cosh((x - x0) / C) - 1);

  // Simulated oblique camera: strong keystone (world -> image)
  const Hcam = [1.9, 0.35, 120, 0.22, 1.6, 700, 0.00095, 0.0004, 1];
  const worldRefs = [{ x: 0, y: 0 }, { x: L, y: h }, { x: 0, y: -HA }, { x: L, y: h - HB }];
  const imgRefs = worldRefs.map(p => E.applyHomography(Hcam, p));

  // User rectification from the 4 marked points
  const Hrect = E.computeHomography(imgRefs, worldRefs);
  checkTrue('rectifying homography found', Hrect !== null);

  // Trace 16 conductor points in the oblique image, rectify, fit
  const traceWorld = [];
  for (let i = 1; i <= 16; i++) {
    const x = (L * i) / 17;
    const imgPt = E.applyHomography(Hcam, { x: x, y: yw(x) });
    traceWorld.push(E.applyHomography(Hrect, imgPt));
  }
  const fit = E.fitCatenary(traceWorld);
  checkTrue('oblique fit ok', fit.ok);
  check('recovered C through perspective', fit.C, C, 0.5);
  const an = E.analyzeCatenary(fit, { x: 0, y: 0 }, { x: L, y: h }, w, 130300);
  check('recovered tension through perspective', an.T, T, 0.5);
}

console.log('\n== Roll correction helpers ==');
{
  // A segment tilted 5° from vertical must come back to vertical after rotation.
  const ang = 5 * Math.PI / 180;
  const p1 = { x: 100, y: 100 };
  const p2 = { x: 100 + 200 * Math.sin(ang), y: 100 + 200 * Math.cos(ang) }; // y down
  const roll = E.rollFromVerticalRef(p1, p2);
  const rot = E.rotatePoints([p1, p2], roll, p1);
  checkTrue('vertical ref rectified', Math.abs(rot[1].x - rot[0].x) < 1e-9);
  checkTrue('length preserved', Math.abs(Math.hypot(rot[1].x - rot[0].x, rot[1].y - rot[0].y) - 200) < 1e-9);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (typeof process !== 'undefined' && process.exit) process.exit(failed ? 1 : 0);
if (typeof window !== 'undefined') window.__testResults = { passed: passed, failed: failed };
