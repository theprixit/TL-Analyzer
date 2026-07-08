/* TL-SAG Pure Calculation Engine
 * All physics/math with NO DOM access, so it can be unit-tested in Node
 * and reused by the future mobile app unchanged.
 * Loads in the browser as window.TLEngine, and in Node via require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TLEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const G = 9.81;

  // ========================================================================
  // PARABOLIC SAG-TENSION (existing app formulas, extracted)
  // ========================================================================

  // Horizontal tension from a single sighted offset D at position xp.
  // T = (w * xp * (L - xp)) / (2 * D)
  function tensionThreePoint(w, L, xp, D) {
    return (w * xp * (L - xp)) / (2 * D);
  }

  // Equivalent level-span mid-span sag for tension T.
  function midSpanSag(w, L, T) {
    return (w * L * L) / (8 * T);
  }

  // Vertical offset D from the support chord, given Z elevations.
  function sagOffsetFromZ(L, xp, zA, zB, zP) {
    const h = zB - zA;
    const yChord = zA + (h / L) * xp;
    return { h: h, yChord: yChord, D: yChord - zP };
  }

  // Return-wave method: sag from stopwatch time t over N returns.
  function waveSag(t, N) {
    return (G * t * t) / (32 * N * N);
  }

  function tensionFromMidSag(w, L, sag) {
    return (w * L * L) / (8 * sag);
  }

  // Tension with one input perturbed by delta (sensitivity analysis).
  function perturbedTension(w, L, xp, za, zb, zp, delta, variable) {
    let tL = L, tXp = xp, tZa = za, tZb = zb, tZp = zp;
    if (variable === 'zp') tZp += delta;
    if (variable === 'xp') tXp += delta;
    if (variable === 'L') tL += delta;
    if (variable === 'za') tZa += delta;
    if (variable === 'zb') tZb += delta;

    const geo = sagOffsetFromZ(tL, tXp, tZa, tZb, tZp);
    if (geo.D <= 0) return 0;
    return tensionThreePoint(w, tL, tXp, geo.D);
  }

  // ========================================================================
  // CATENARY MODEL
  // Coordinates: x along span, y UP (a hanging conductor opens upward).
  // y(x) = y0 + C * (cosh((x - x0)/C) - 1)
  // C = T / w  (catenary constant, meters) — horizontal tension over weight.
  // ========================================================================

  function catenaryY(C, x0, y0, x) {
    return y0 + C * (Math.cosh((x - x0) / C) - 1);
  }

  // Least-squares parabola y = a x^2 + b x + c through points [{x,y}].
  function fitParabola(pts) {
    const n = pts.length;
    if (n < 3) return null;
    let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
    for (const p of pts) {
      const x = p.x, y = p.y, x2 = x * x;
      sx += x; sx2 += x2; sx3 += x2 * x; sx4 += x2 * x2;
      sy += y; sxy += x * y; sx2y += x2 * y;
    }
    const sol = solve3x3(
      [[sx4, sx3, sx2],
       [sx3, sx2, sx],
       [sx2, sx,  n]],
      [sx2y, sxy, sy]
    );
    if (!sol) return null;
    return { a: sol[0], b: sol[1], c: sol[2] };
  }

  function solve3x3(A, b) {
    // Gaussian elimination with partial pivoting.
    const M = [
      [A[0][0], A[0][1], A[0][2], b[0]],
      [A[1][0], A[1][1], A[1][2], b[1]],
      [A[2][0], A[2][1], A[2][2], b[2]]
    ];
    for (let col = 0; col < 3; col++) {
      let piv = col;
      for (let r = col + 1; r < 3; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
      for (let r = col + 1; r < 3; r++) {
        const f = M[r][col] / M[col][col];
        for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = [0, 0, 0];
    for (let r = 2; r >= 0; r--) {
      let s = M[r][3];
      for (let c = r + 1; c < 3; c++) s -= M[r][c] * x[c];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // Nelder-Mead simplex minimizer (derivative-free, robust for 3 params).
  function nelderMead(f, start, opts) {
    const maxIter = (opts && opts.maxIter) || 600;
    const tol = (opts && opts.tol) || 1e-10;
    const n = start.length;
    const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;

    // Build initial simplex around the start point.
    let simplex = [start.slice()];
    for (let i = 0; i < n; i++) {
      const p = start.slice();
      p[i] += (p[i] !== 0 ? 0.05 * Math.abs(p[i]) : 0.05);
      simplex.push(p);
    }
    let fv = simplex.map(f);
    let iter = 0;

    for (; iter < maxIter; iter++) {
      // Order simplex by function value.
      const idx = fv.map((v, i) => i).sort((i, j) => fv[i] - fv[j]);
      simplex = idx.map(i => simplex[i]);
      fv = idx.map(i => fv[i]);

      if (Math.abs(fv[n] - fv[0]) < tol * (Math.abs(fv[0]) + tol)) break;

      // Centroid of all but worst.
      const cent = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) cent[j] += simplex[i][j] / n;
      }

      const worst = simplex[n];
      const refl = cent.map((c, j) => c + alpha * (c - worst[j]));
      const fRefl = f(refl);

      if (fRefl < fv[0]) {
        const exp = cent.map((c, j) => c + gamma * (refl[j] - c));
        const fExp = f(exp);
        if (fExp < fRefl) { simplex[n] = exp; fv[n] = fExp; }
        else { simplex[n] = refl; fv[n] = fRefl; }
      } else if (fRefl < fv[n - 1]) {
        simplex[n] = refl; fv[n] = fRefl;
      } else {
        const contr = cent.map((c, j) => c + rho * (worst[j] - c));
        const fContr = f(contr);
        if (fContr < fv[n]) { simplex[n] = contr; fv[n] = fContr; }
        else {
          // Shrink toward best.
          for (let i = 1; i <= n; i++) {
            simplex[i] = simplex[i].map((v, j) => simplex[0][j] + sigma * (v - simplex[0][j]));
            fv[i] = f(simplex[i]);
          }
        }
      }
    }

    const bestIdx = fv.indexOf(Math.min.apply(null, fv));
    return { x: simplex[bestIdx], fmin: fv[bestIdx], iterations: iter };
  }

  // Fit a catenary to traced conductor points (y UP, consistent units).
  // Returns { ok, C, x0, y0, rmse, iterations } or { ok:false, reason }.
  function fitCatenary(pts) {
    if (!pts || pts.length < 4) {
      return { ok: false, reason: 'Need at least 4 traced points to fit a catenary.' };
    }

    const para = fitParabola(pts);
    if (!para) return { ok: false, reason: 'Points are degenerate (collinear in x).' };
    if (para.a <= 1e-9) {
      return { ok: false, reason: 'Traced points show no downward sag curvature — check point order / photo orientation.' };
    }

    // Initial guess from the parabola vertex form.
    const C0 = 1 / (2 * para.a);
    const x00 = -para.b / (2 * para.a);
    const y00 = para.c - (para.b * para.b) / (4 * para.a);

    const sse = function (v) {
      const C = Math.exp(v[0]), x0 = v[1], y0 = v[2];
      let s = 0;
      for (const p of pts) {
        const dy = p.y - catenaryY(C, x0, y0, p.x);
        s += dy * dy;
      }
      return s;
    };

    const res = nelderMead(sse, [Math.log(C0), x00, y00]);
    const C = Math.exp(res.x[0]);
    const rmse = Math.sqrt(res.fmin / pts.length);

    if (!isFinite(C) || C <= 0 || C > 1e7) {
      return { ok: false, reason: 'Catenary fit diverged — conductor may be too taut/flat to resolve.' };
    }
    return { ok: true, C: C, x0: res.x[1], y0: res.x[2], rmse: rmse, iterations: res.iterations };
  }

  // Full analysis of a fitted catenary against the physical hook chord.
  // ptA/ptB: hook points {x, y} in meters (y UP). w: N/m. uts: N.
  function analyzeCatenary(fit, ptA, ptB, w, uts) {
    const C = fit.C, x0 = fit.x0, y0 = fit.y0;
    const T = w * C; // horizontal tension, N

    // Chord between the clicked hooks.
    const spanL = Math.abs(ptB.x - ptA.x);
    const m = (ptB.y - ptA.y) / (ptB.x - ptA.x); // chord slope
    const chordY = x => ptA.y + m * (x - ptA.x);

    // Max sag where curve slope equals chord slope: sinh((x-x0)/C) = m.
    let xMax = x0 + C * Math.asinh(m);
    const xLo = Math.min(ptA.x, ptB.x), xHi = Math.max(ptA.x, ptB.x);
    xMax = Math.max(xLo, Math.min(xHi, xMax));
    const sagMax = chordY(xMax) - catenaryY(C, x0, y0, xMax);

    // Sag at geometric mid-span.
    const xMid = (ptA.x + ptB.x) / 2;
    const sagMid = chordY(xMid) - catenaryY(C, x0, y0, xMid);

    // How far the fitted curve misses the clicked hooks (attachment check).
    const endDevA = ptA.y - catenaryY(C, x0, y0, ptA.x);
    const endDevB = ptB.y - catenaryY(C, x0, y0, ptB.x);

    return {
      T: T,
      T_kN: T / 1000,
      C: C,
      spanL: spanL,
      xMaxSag: xMax - Math.min(ptA.x, ptB.x), // from left hook
      sagMax: sagMax,
      sagMid: sagMid,
      endDevA: endDevA,
      endDevB: endDevB,
      pctUTS: uts > 0 ? (T / uts) * 100 : 0,
      safetyFactor: T > 0 && uts > 0 ? uts / T : 0,
      rmse: fit.rmse
    };
  }

  // ========================================================================
  // PERSPECTIVE RECTIFICATION (planar homography)
  // The span's vertical plane maps to the photo via a homography. With 4
  // known correspondences (both hooks + both tower bases, using known span,
  // hook height difference and tower structural heights) we can transform
  // any image pixel into true metres in the span plane — handling oblique
  // camera angles AND camera roll exactly.
  // ========================================================================

  // Gaussian elimination with partial pivoting for an n x n system.
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      if (Math.abs(M[piv][col]) < 1e-10) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
      for (let r = col + 1; r < n; r++) {
        const f = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // Direct Linear Transform from exactly 4 point correspondences.
  // Returns H as a row-major 9-array with H[8] = 1, mapping src -> dst,
  // or null when the configuration is degenerate (e.g. 3 collinear points).
  function computeHomography(src, dst) {
    if (!src || !dst || src.length !== 4 || dst.length !== 4) return null;
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const x = src[i].x, y = src[i].y, X = dst[i].x, Y = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    const h = solveLinear(A, b);
    if (!h) return null;
    const H = h.concat([1]);
    return H.every(isFinite) ? H : null;
  }

  function applyHomography(H, p) {
    const w = H[6] * p.x + H[7] * p.y + H[8];
    if (Math.abs(w) < 1e-12) return { x: Infinity, y: Infinity };
    return {
      x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
      y: (H[3] * p.x + H[4] * p.y + H[5]) / w
    };
  }

  // Rotate points by angle (radians) about a pivot — used to correct
  // camera roll once the user marks a known-vertical reference.
  function rotatePoints(pts, angle, pivot) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const px = pivot ? pivot.x : 0, py = pivot ? pivot.y : 0;
    return pts.map(p => ({
      x: px + (p.x - px) * c - (p.y - py) * s,
      y: py + (p.x - px) * s + (p.y - py) * c
    }));
  }

  // Roll angle needed so the segment p1→p2 becomes screen-vertical
  // (image coords, y DOWN). Apply with rotatePoints(pts, angle).
  function rollFromVerticalRef(p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    // Rotation that zeroes the segment's x-component: tan(theta) = dx/dy.
    return Math.atan2(dx, dy);
  }

  return {
    G: G,
    tensionThreePoint: tensionThreePoint,
    midSpanSag: midSpanSag,
    sagOffsetFromZ: sagOffsetFromZ,
    waveSag: waveSag,
    tensionFromMidSag: tensionFromMidSag,
    perturbedTension: perturbedTension,
    catenaryY: catenaryY,
    fitParabola: fitParabola,
    fitCatenary: fitCatenary,
    analyzeCatenary: analyzeCatenary,
    nelderMead: nelderMead,
    rotatePoints: rotatePoints,
    rollFromVerticalRef: rollFromVerticalRef,
    solveLinear: solveLinear,
    computeHomography: computeHomography,
    applyHomography: applyHomography
  };
});
