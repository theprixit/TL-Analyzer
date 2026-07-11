/* TL-SAG Photo Sag Tracker v2
 * Interactive canvas measurement tool: zoom/pan/pinch, magnifier loupe,
 * multi-point catenary tracing with least-squares fit (via TLEngine),
 * optional camera-roll correction using a marked vertical reference.
 *
 * Exposes window.PhotoTracker plus the global handler names used by
 * index.html inline attributes (loadPhotoTrackerImage, resetPhotoTracker,
 * applyPhotoTrackerReadings, handlePhotoCalibChange, ...).
 */
(function () {
  'use strict';

  const MAX_IMG_DIM = 3200;      // downscale huge photos for memory + save size
  const HIT_RADIUS = 14;         // css px for grabbing an existing point
  const MIN_TRACE_PTS = 5;

  const state = {
    img: null,
    imgSrc: null,
    mode: 'trace',               // 'trace' | 'quick'
    tool: 'place',               // 'place' | 'pan'
    points: { A: null, B: null, P: null, baseA: null, baseB: null }, // image px
    trace: [],                   // image px
    vertRef: [],                 // 0..2 image px
    placingVertRef: false,
    solved: null,                // last successful solve
    view: { scale: 1, tx: 0, ty: 0 },
    // transient interaction
    pointers: new Map(),
    pinch: null,
    pan: null,
    placing: null,               // { pos } candidate for a new point
    dragging: null,              // { kind, index }
    pendingRestore: null
  };

  let canvas = null, ctx = null, container = null;

  // ======================================================================
  // INIT / CANVAS SIZING
  // ======================================================================
  function init() {
    canvas = document.getElementById('photo-tracker-canvas');
    if (!canvas) return;
    container = canvas.parentElement;
    ctx = canvas.getContext('2d');

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', () => { resizeCanvas(); redraw(); });
    document.addEventListener('fullscreenchange', () => {
      // Give the browser a frame to settle the new container size.
      setTimeout(() => { resizeCanvas(); fitView(); redraw(); }, 60);
    });

    resizeCanvas();
    updateToolButtons();
    updateInstructions();
    redraw();
  }

  function resizeCanvas() {
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 520;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function cssSize() {
    return { w: parseFloat(canvas.style.width) || canvas.width, h: parseFloat(canvas.style.height) || canvas.height };
  }

  function fitView() {
    if (!state.img) return;
    const { w, h } = cssSize();
    const s = Math.min(w / state.img.naturalWidth, h / state.img.naturalHeight);
    state.view.scale = s;
    state.view.tx = (w - state.img.naturalWidth * s) / 2;
    state.view.ty = (h - state.img.naturalHeight * s) / 2;
  }

  // image px -> css px
  function i2c(p) { return { x: p.x * state.view.scale + state.view.tx, y: p.y * state.view.scale + state.view.ty }; }
  // css px -> image px
  function c2i(p) { return { x: (p.x - state.view.tx) / state.view.scale, y: (p.y - state.view.ty) / state.view.scale }; }

  function eventCss(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ======================================================================
  // IMAGE LOADING
  // ======================================================================
  // Minimal JPEG/TIFF EXIF reader — only the tags the camera mode needs.
  // (Canvas re-encoding strips EXIF, so this must run on the ORIGINAL file.)
  function parseExif(buf) {
    try {
      const v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return null;
      let i = 2, tiff = -1;
      while (i < v.byteLength - 4) {
        if (v.getUint8(i) !== 0xFF) break;
        const marker = v.getUint8(i + 1);
        const len = v.getUint16(i + 2);
        if (marker === 0xE1 && v.getUint32(i + 4) === 0x45786966) { tiff = i + 10; break; }
        if (marker === 0xDA) break;
        i += 2 + len;
      }
      if (tiff < 0) return null;
      const le = v.getUint16(tiff) === 0x4949;
      const u16 = o => v.getUint16(tiff + o, le);
      const u32 = o => v.getUint32(tiff + o, le);
      const out = {};
      const readIfd = off => {
        const n = u16(off);
        for (let k = 0; k < n; k++) {
          const e = off + 2 + k * 12;
          const tag = u16(e), typ = u16(e + 2), cnt = u32(e + 4);
          if (tag === 0x8769) out._sub = u32(e + 8);
          if (tag === 0xA405 && typ === 3) out.f35 = u16(e + 8);
          if ((tag === 0x010F || tag === 0x0110) && typ === 2) {
            const base = cnt > 4 ? tiff + u32(e + 8) : tiff + e + 8;
            let str = '';
            for (let j = 0; j < Math.min(cnt, 64); j++) {
              const ch = v.getUint8(base + j);
              if (!ch) break;
              str += String.fromCharCode(ch);
            }
            out[tag === 0x010F ? 'make' : 'model'] = str.trim();
          }
        }
      };
      readIfd(u32(4));
      if (out._sub) { readIfd(out._sub); delete out._sub; }
      return (out.f35 || out.make || out.model) ? out : null;
    } catch (e) {
      return null;
    }
  }

  // Camera profiles: per-camera focal correction learned from ONE known span.
  function cameraProfileKey() {
    const f35 = parseFloat((document.getElementById('photo-f35') || {}).value);
    if (!(f35 > 0)) return null;
    const ex = state.exif || {};
    return ((ex.make || 'unknown') + '|' + (ex.model || 'camera') + '|' + f35).toLowerCase();
  }

  function getCameraProfiles() {
    try { return JSON.parse(localStorage.getItem('tlsag_camera_profiles')) || {}; }
    catch (e) { return {}; }
  }

  function getCameraProfile() {
    const k = cameraProfileKey();
    return k ? (getCameraProfiles()[k] || null) : null;
  }

  function updateCameraStatus() {
    const el = document.getElementById('photo-camera-status');
    if (!el) return;
    const ex = state.exif || {};
    const cam = (ex.make || ex.model) ? ((ex.make || '') + ' ' + (ex.model || '')).trim() : null;
    const f35 = parseFloat((document.getElementById('photo-f35') || {}).value);
    if (!(f35 > 0)) {
      el.innerHTML = (cam ? 'Camera: <strong>' + cam + '</strong> — ' : '') +
        '<span style="color: var(--danger);">no focal length. Auto-read fails on WhatsApp-forwarded images (EXIF stripped) — use the original file, or enter the 35mm-equivalent focal manually.</span>';
      return;
    }
    const prof = getCameraProfile();
    el.innerHTML = 'Camera: <strong>' + (cam || 'manual focal') + '</strong> · ' + f35 + ' mm equiv — ' +
      (prof
        ? '<span style="color: var(--success);">✅ calibrated ×' + prof.k.toFixed(3) + ' (' + prof.date + ')</span>'
        : '<span style="color: var(--warning);">⚠ UNCALIBRATED — phone focals are nominal; expect up to ±25% span error. Calibrate once below using any photo of a span with a known length.</span>');
  }

  function loadImageFile(file) {
    const fr = new FileReader();
    fr.onload = e => {
      state.exif = parseExif(e.target.result);
      const f35El = document.getElementById('photo-f35');
      if (f35El) f35El.value = (state.exif && state.exif.f35) ? state.exif.f35 : '';
      updateCameraStatus();
      const fr2 = new FileReader();
      fr2.onload = ev => loadImageSrc(ev.target.result, true);
      fr2.readAsDataURL(file);
    };
    fr.readAsArrayBuffer(file);
  }

  function loadImageSrc(src, isNewPhoto) {
    const img = new Image();
    img.onload = function () {
      // Downscale very large photos once, so project saves stay manageable.
      if (isNewPhoto && Math.max(img.naturalWidth, img.naturalHeight) > MAX_IMG_DIM) {
        const k = MAX_IMG_DIM / Math.max(img.naturalWidth, img.naturalHeight);
        const off = document.createElement('canvas');
        off.width = Math.round(img.naturalWidth * k);
        off.height = Math.round(img.naturalHeight * k);
        off.getContext('2d').drawImage(img, 0, 0, off.width, off.height);
        loadImageSrc(off.toDataURL('image/jpeg', 0.92), false);
        return;
      }
      state.img = img;
      state.imgSrc = src;

      if (state.pendingRestore) {
        const d = state.pendingRestore;
        state.pendingRestore = null;
        state.points = Object.assign({ A: null, B: null, P: null, baseA: null, baseB: null }, d.points || {});
        state.trace = d.trace || [];
        state.vertRef = d.vertRef || [];
        state.mode = d.mode || state.mode;
        syncModeSelect();
      } else if (isNewPhoto !== 'restore-keep') {
        clearAnnotations();
      }

      resizeCanvas();
      fitView();
      solve();
      updateInstructions();
      redraw();
    };
    img.src = src;
  }

  function clearAnnotations() {
    state.points = { A: null, B: null, P: null, baseA: null, baseB: null };
    state.trace = [];
    state.vertRef = [];
    state.placingVertRef = false;
    state.solved = null;
  }

  // ======================================================================
  // POINT SEQUENCE / EDITING
  // ======================================================================
  function calMethod() {
    const el = document.getElementById('photo-cal-method');
    return el ? el.value : 'chord';
  }

  // What does the next tap place?
  function expectedNext() {
    if (state.placingVertRef && state.vertRef.length < 2) return 'vert';
    if (!state.points.A) return 'A';
    if (!state.points.B) return 'B';
    const cm = calMethod();
    if ((cm === 'tower' || cm === 'perspective' || cm === 'camera') && !state.points.baseA) return 'baseA';
    if ((cm === 'perspective' || cm === 'camera') && !state.points.baseB) return 'baseB';
    if (state.mode === 'quick') return state.points.P ? null : 'P';
    return 'trace';
  }

  function commitPoint(ip) {
    const next = expectedNext();
    if (!next) return;
    if (next === 'vert') {
      state.vertRef.push(ip);
      if (state.vertRef.length >= 2) state.placingVertRef = false;
    } else if (next === 'trace') {
      state.trace.push(ip);
    } else {
      state.points[next] = ip;
    }
    solve();
    updateInstructions();
  }

  function hitTest(cssPos) {
    const tryPt = (p) => {
      if (!p) return false;
      const c = i2c(p);
      return Math.hypot(c.x - cssPos.x, c.y - cssPos.y) <= HIT_RADIUS;
    };
    for (const kind of ['A', 'B', 'P', 'baseA', 'baseB']) {
      if (tryPt(state.points[kind])) return { kind: kind, index: -1 };
    }
    for (let i = 0; i < state.vertRef.length; i++) {
      if (tryPt(state.vertRef[i])) return { kind: 'vert', index: i };
    }
    for (let i = state.trace.length - 1; i >= 0; i--) {
      if (tryPt(state.trace[i])) return { kind: 'trace', index: i };
    }
    return null;
  }

  // Delete a hit point (right-click, or double-tap on touch)
  function deleteHit(hit) {
    if (hit.kind === 'trace') state.trace.splice(hit.index, 1);
    else if (hit.kind === 'vert') state.vertRef.splice(hit.index, 1);
    else state.points[hit.kind] = null;
    solve();
    updateInstructions();
    redraw();
  }

  function onContextMenu(e) {
    e.preventDefault();
    if (!state.img) return;
    const hit = hitTest(eventCss(e));
    if (hit) deleteHit(hit);
  }

  function setDragPos(drag, ip) {
    if (drag.kind === 'trace') state.trace[drag.index] = ip;
    else if (drag.kind === 'vert') state.vertRef[drag.index] = ip;
    else state.points[drag.kind] = ip;
  }

  function getDragPos(drag) {
    if (drag.kind === 'trace') return state.trace[drag.index];
    if (drag.kind === 'vert') return state.vertRef[drag.index];
    return state.points[drag.kind];
  }

  function undoLast() {
    if (state.trace.length) state.trace.pop();
    else if (state.points.P) state.points.P = null;
    else if (state.points.baseB) state.points.baseB = null;
    else if (state.points.baseA) state.points.baseA = null;
    else if (state.vertRef.length) { state.vertRef.pop(); }
    else if (state.points.B) state.points.B = null;
    else if (state.points.A) state.points.A = null;
    solve();
    updateInstructions();
    redraw();
  }

  // ======================================================================
  // POINTER / GESTURE HANDLING
  // ======================================================================
  function onPointerDown(e) {
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pos = eventCss(e);
    state.pointers.set(e.pointerId, pos);

    if (state.pointers.size === 2) {
      // Two fingers: switch to pinch-zoom/pan, abandon placement/drag.
      state.placing = null;
      state.dragging = null;
      state.pan = null;
      const pts = Array.from(state.pointers.values());
      state.pinch = {
        d: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        view: { scale: state.view.scale, tx: state.view.tx, ty: state.view.ty }
      };
      redraw();
      return;
    }

    if (!state.img) return;

    if (state.tool === 'pan') {
      state.pan = { start: pos, view: { tx: state.view.tx, ty: state.view.ty } };
      return;
    }

    // Place tool: grab an existing point, or start placing a new one.
    const hit = hitTest(pos);
    if (hit) {
      // Double-tap on a point deletes it (touch-friendly delete)
      const now = performance.now();
      if (state.lastTap && now - state.lastTap.t < 350 &&
          Math.hypot(pos.x - state.lastTap.x, pos.y - state.lastTap.y) < 16) {
        state.lastTap = null;
        state.pointers.delete(e.pointerId);
        deleteHit(hit);
        return;
      }
      state.lastTap = { t: now, x: pos.x, y: pos.y };
      state.dragging = hit;
    } else if (expectedNext()) {
      state.placing = { pos: c2i(pos) };
    }
    redraw();
  }

  function onPointerMove(e) {
    if (!state.pointers.has(e.pointerId)) {
      // Hover (no button down): show a move cursor over grabbable points.
      if (state.img && state.tool === 'place') {
        canvas.style.cursor = hitTest(eventCss(e)) ? 'move' : 'crosshair';
      }
      return;
    }
    const pos = eventCss(e);
    state.pointers.set(e.pointerId, pos);

    if (state.pinch && state.pointers.size >= 2) {
      const pts = Array.from(state.pointers.values());
      const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const k = d / (state.pinch.d || 1);
      const v0 = state.pinch.view;
      const newScale = clampScale(v0.scale * k);
      const kk = newScale / v0.scale;
      // Keep the pinch midpoint anchored while zooming, then apply mid-drift pan.
      state.view.scale = newScale;
      state.view.tx = state.pinch.mid.x - (state.pinch.mid.x - v0.tx) * kk + (mid.x - state.pinch.mid.x);
      state.view.ty = state.pinch.mid.y - (state.pinch.mid.y - v0.ty) * kk + (mid.y - state.pinch.mid.y);
      redraw();
      return;
    }

    if (state.pan) {
      state.view.tx = state.pan.view.tx + (pos.x - state.pan.start.x);
      state.view.ty = state.pan.view.ty + (pos.y - state.pan.start.y);
      redraw();
      return;
    }

    if (state.dragging) {
      setDragPos(state.dragging, c2i(pos));
      redraw();
      return;
    }

    if (state.placing) {
      state.placing.pos = c2i(pos);
      redraw();
    }
  }

  function onPointerUp(e) {
    state.pointers.delete(e.pointerId);

    if (state.pinch) {
      if (state.pointers.size < 2) state.pinch = null;
      return;
    }
    if (state.pan) { state.pan = null; return; }

    if (state.dragging) {
      state.dragging = null;
      solve();
      updateInstructions();
      redraw();
      return;
    }
    if (state.placing) {
      const ip = state.placing.pos;
      state.placing = null;
      // Only accept points that land on the photo itself.
      if (state.img && ip.x >= 0 && ip.y >= 0 && ip.x <= state.img.naturalWidth && ip.y <= state.img.naturalHeight) {
        commitPoint(ip);
      }
      redraw();
    }
  }

  function clampScale(s) {
    let minS = 0.05;
    if (state.img) {
      const { w, h } = cssSize();
      minS = Math.min(w / state.img.naturalWidth, h / state.img.naturalHeight) * 0.5;
    }
    return Math.max(minS, Math.min(40, s));
  }

  function onWheel(e) {
    if (!state.img) return;
    e.preventDefault();
    const pos = eventCss(e);
    const k = Math.exp(-e.deltaY * 0.0015);
    const newScale = clampScale(state.view.scale * k);
    const kk = newScale / state.view.scale;
    state.view.tx = pos.x - (pos.x - state.view.tx) * kk;
    state.view.ty = pos.y - (pos.y - state.view.ty) * kk;
    state.view.scale = newScale;
    redraw();
  }

  // ======================================================================
  // SOLVER
  // ======================================================================
  function imgCenter() {
    return { x: state.img.naturalWidth / 2, y: state.img.naturalHeight / 2 };
  }

  function rollAngle() {
    if (state.vertRef.length === 2) {
      return TLEngine.rollFromVerticalRef(state.vertRef[0], state.vertRef[1]);
    }
    return 0;
  }

  function rect(p, angle, pivot) { return TLEngine.rotatePoints([p], angle, pivot)[0]; }
  function unrect(p, angle, pivot) { return TLEngine.rotatePoints([p], -angle, pivot)[0]; }

  // Read span geometry. The photo panel's own L / h fields take priority;
  // the Primary Inputs below are the fallback. Never fall back to sample
  // values silently.
  function primaryLh() {
    // Span L: photo panel field first, then primary inputs
    const lEl = document.getElementById('photo-span-l');
    let L = lEl ? parseFloat(lEl.value) : NaN;
    let lSrc = 'photo';
    if (!(L > 0)) {
      L = parseFloat(document.getElementById('tp-span').value);
      lSrc = 'primary';
    }
    if (!(L > 0)) return null;

    // Hook elevation difference h: photo panel field first
    let h = 0.0;
    let hKnown = true;
    const hEl = document.getElementById('photo-hook-h');
    const hPhoto = hEl ? parseFloat(hEl.value) : NaN;
    if (!isNaN(hPhoto)) {
      h = hPhoto;
    } else {
      const im = document.getElementById('tp-input-mode').value;
      if (im === 'z-coords') {
        const za = parseFloat(document.getElementById('tp-za').value);
        const zb = parseFloat(document.getElementById('tp-zb').value);
        if (isNaN(za) || isNaN(zb)) { h = 0.0; hKnown = false; }
        else h = zb - za;
      } else {
        const hd = parseFloat(document.getElementById('tp-height-diff').value);
        if (isNaN(hd)) { h = 0.0; hKnown = false; }
        else h = hd;
      }
    }
    return { L: L, h: h, hKnown: hKnown, lSrc: lSrc };
  }

  // Calibration: meters-per-pixel scale + span L + hook height diff h,
  // computed in the roll-rectified frame. Returns { error } when the user
  // has not yet supplied the real-world reference the scale needs.
  function calibration(angle, pivot, pts) {
    const A = rect(pts.A, angle, pivot);
    const B = rect(pts.B, angle, pivot);
    const pxChord = Math.hypot(B.x - A.x, B.y - A.y);
    if (pxChord <= 0) return { error: 'Hook A and Hook B are on the same pixel — re-place them.' };

    if (calMethod() === 'tower') {
      if (!pts.baseA) return null; // next click will place it
      const base = rect(pts.baseA, angle, pivot);
      const pxTower = Math.hypot(base.x - A.x, base.y - A.y);
      if (pxTower <= 0) return { error: 'Tower base and hook are on the same pixel — re-place them.' };
      const H = parseFloat(document.getElementById('photo-cal-tower-h').value);
      if (!(H > 0)) {
        return { error: 'Enter the actual Tower ZA height (m) from structural drawings — the image scale cannot be calibrated without it.' };
      }
      const S = H / pxTower;
      return { S: S, L: Math.abs(B.x - A.x) * S, h: (A.y - B.y) * S, A: A, B: B, hKnown: true };
    }

    const g = primaryLh();
    if (!g) {
      return { error: 'Chord calibration needs the real Span Length L — enter it in the calibration settings on the left (or switch to Tower Height calibration).' };
    }
    const realChord = Math.sqrt(g.L * g.L + g.h * g.h);
    return { S: realChord / pxChord, L: g.L, h: g.h, A: A, B: B, hKnown: g.hKnown };
  }

  function toMeters(p, S) { return { x: p.x * S, y: -p.y * S }; }

  // Geometry abstraction: both calibration families produce the same
  // interface — L, h, hook positions in metres, and image<->world mappers.
  function scaleGeometry(pts) {
    pts = pts || state.points;
    const angle = rollAngle();
    const pivot = imgCenter();
    const cal = calibration(angle, pivot, pts);
    if (!cal) return null;
    if (cal.error) return { error: cal.error };
    const S = cal.S;
    return {
      method: 'scale', S: S, angle: angle,
      L: cal.L, h: cal.h, hKnown: cal.hKnown !== false,
      Am: toMeters(cal.A, S),
      Bm: toMeters(cal.B, S),
      imgToWorld: p => toMeters(rect(p, angle, pivot), S),
      worldToImg: p => unrect({ x: p.x / S, y: -p.y / S }, angle, pivot)
    };
  }

  // Full perspective rectification: both hooks + both tower bases with
  // known world geometry give a homography from the photo to the span
  // plane — oblique camera angles and roll are handled exactly.
  function perspectiveGeometry(pts) {
    pts = pts || state.points;
    if (!pts.baseA || !pts.baseB) return null; // still placing
    const g = primaryLh();
    if (!g) return { error: 'Perspective calibration needs the real Span Length L — enter it in the calibration settings on the left.' };
    const HA = parseFloat(document.getElementById('photo-persp-ha').value);
    if (!(HA > 0)) return { error: 'Enter Tower A structural height (hook to base, from tower drawings) — required to rectify perspective.' };
    const HBraw = parseFloat(document.getElementById('photo-persp-hb').value);
    const HB = HBraw > 0 ? HBraw : HA;

    const worldRefs = [
      { x: 0, y: 0 },          // hook A (origin)
      { x: g.L, y: g.h },      // hook B
      { x: 0, y: -HA },        // base A
      { x: g.L, y: g.h - HB }  // base B
    ];
    const imgRefs = [pts.A, pts.B, pts.baseA, pts.baseB];
    const H = TLEngine.computeHomography(imgRefs, worldRefs);
    const Hinv = TLEngine.computeHomography(worldRefs, imgRefs);
    if (!H || !Hinv) return { error: 'Degenerate 4-point layout — hooks and bases must not be collinear. Re-place the points.' };
    return {
      method: 'perspective', angle: 0,
      L: g.L, h: g.h, hKnown: g.hKnown, HA: HA, HB: HB,
      Am: worldRefs[0], Bm: worldRefs[1],
      imgToWorld: p => TLEngine.applyHomography(H, p),
      worldToImg: p => TLEngine.applyHomography(Hinv, p)
    };
  }

  // Span-free calibration: camera intrinsics + tower heights. EXPERIMENTAL.
  // Same return shape as perspectiveGeometry so everything downstream works.
  function cameraGeometry(pts, opts) {
    pts = pts || state.points;
    opts = opts || {};
    if (!pts.baseA || !pts.baseB) return null; // still placing
    const f35 = parseFloat(document.getElementById('photo-f35').value);
    if (!(f35 > 0)) {
      return { error: 'Camera mode needs the 35mm-equivalent focal length — read automatically from the photo EXIF, or enter it manually. (WhatsApp-forwarded images have EXIF stripped: use the original file.)' };
    }
    const HA = parseFloat(document.getElementById('photo-persp-ha').value);
    if (!(HA > 0)) {
      return { error: 'Enter Tower A structural height (hook to base) — the one known length this mode needs.' };
    }
    const HBraw = parseFloat(document.getElementById('photo-persp-hb').value);
    const HB = HBraw > 0 ? HBraw : HA;

    const prof = getCameraProfile();
    const k = prof ? prof.k : 1;
    const fx = TLEngine.fxFrom35mm(f35, state.img.naturalWidth) * k * (opts.fxScale || 1);
    const cx = state.img.naturalWidth / 2, cy = state.img.naturalHeight / 2;

    const hEl = document.getElementById('photo-hook-h');
    const hv = hEl ? parseFloat(hEl.value) : NaN;
    const hFixed = isNaN(hv) ? null : hv;

    const imgRefs = [pts.A, pts.B, pts.baseA, pts.baseB];
    const sol = TLEngine.solveSpanFromCamera(imgRefs, HA, HB, fx, cx, cy, hFixed, opts.init || null);
    if (!sol) return { error: 'Camera solve failed — check the four reference points, heights and focal length.' };

    const worldRefs = [
      { x: 0, y: 0 }, { x: sol.L, y: sol.h },
      { x: 0, y: -HA }, { x: sol.L, y: sol.h - HB }
    ];
    const H = TLEngine.computeHomography(imgRefs, worldRefs);
    const Hinv = TLEngine.computeHomography(worldRefs, imgRefs);
    if (!H || !Hinv) return { error: 'Degenerate reference layout — re-place the points.' };
    return {
      method: 'camera', angle: 0,
      L: sol.L, h: sol.h, hKnown: hFixed !== null, hSolved: hFixed === null,
      HA: HA, HB: HB, solvedL: true,
      calibrated: !!prof, profileK: k, f35: f35, _sol: { L: sol.L, h: sol.h },
      camLabel: (state.exif && (state.exif.make || state.exif.model))
        ? ((state.exif.make || '') + ' ' + (state.exif.model || '')).trim() : 'manual focal',
      Am: worldRefs[0], Bm: worldRefs[1],
      imgToWorld: p => TLEngine.applyHomography(H, p),
      worldToImg: p => TLEngine.applyHomography(Hinv, p)
    };
  }

  function solve() {
    state.solved = null;

    if (!state.img || !state.points.A || !state.points.B) { renderResults(); return; }

    const cm0 = calMethod();
    const geo = cm0 === 'perspective' ? perspectiveGeometry()
      : cm0 === 'camera' ? cameraGeometry()
      : scaleGeometry();
    if (!geo) { renderResults(); return; }
    if (geo.error) { state.solved = { error: geo.error }; renderResults(); return; }

    const cond = (typeof getConductorSpecs === 'function') ? getConductorSpecs('tp') : { w: 0, uts: 0, name: '' };

    if (state.mode === 'trace') {
      if (state.trace.length < MIN_TRACE_PTS) { renderResults(); return; }
      const traceW = state.trace.map(geo.imgToWorld);
      const fit = TLEngine.fitCatenary(traceW);
      if (!fit.ok) {
        state.solved = { error: fit.reason };
        renderResults();
        return;
      }
      const an = TLEngine.analyzeCatenary(fit, geo.Am, geo.Bm, cond.w, cond.uts);
      const xAbs = Math.min(geo.Am.x, geo.Bm.x) + an.xMaxSag;
      state.solved = {
        kind: 'trace', geo: geo, fit: fit, an: an, cond: cond,
        L: geo.L, h: geo.h,
        xp: Math.abs(xAbs - geo.Am.x), D: an.sagMax
      };

      // In oblique (perspective-rectified) photos the true max-sag point
      // does NOT project onto the visually lowest pixel of the curve —
      // quantify the gap so the UI can reassure the user it's not an error.
      if (geo.method === 'perspective' || geo.method === 'camera') {
        const cat = x => TLEngine.catenaryY(fit.C, fit.x0, fit.y0, x);
        const xLo = Math.min(geo.Am.x, geo.Bm.x), xHi = Math.max(geo.Am.x, geo.Bm.x);
        let low = null;
        for (let i = 0; i <= 100; i++) {
          const x = xLo + ((xHi - xLo) * i) / 100;
          const px = geo.worldToImg({ x: x, y: cat(x) });
          if (!low || px.y > low.y) low = px;
        }
        const mk = geo.worldToImg({ x: xAbs, y: cat(xAbs) });
        state.solved.visualLowOffsetPx = Math.round(Math.hypot(mk.x - low.x, mk.y - low.y));
      }
      scheduleMonteCarlo();
    } else {
      // Quick mode: single conductor point P against the hook chord.
      if (!state.points.P) { renderResults(); return; }
      const Pw = geo.imgToWorld(state.points.P);
      const m = (geo.Bm.y - geo.Am.y) / (geo.Bm.x - geo.Am.x);
      const chordY = geo.Am.y + m * (Pw.x - geo.Am.x);
      state.solved = {
        kind: 'quick', geo: geo, cond: cond,
        L: geo.L, h: geo.h,
        xp: Math.abs(Pw.x - geo.Am.x), D: chordY - Pw.y, Pw: Pw
      };
    }
    renderResults();
  }

  // ======================================================================
  // MONTE-CARLO UNCERTAINTY: clicking a blurry far tower a few pixels off
  // changes the answer — so re-solve many times with the reference and
  // trace points jittered by a realistic pixel scatter, and report the
  // resulting tension DISTRIBUTION instead of a single deceptive number.
  // ======================================================================
  const MC_RUNS = 160;
  const MC_SIGMA_REF = 3;   // px scatter on hook/base clicks
  const MC_SIGMA_TRACE = 2; // px scatter on trace clicks
  let mcTimer = null;

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function jitterPt(p, s) { return { x: p.x + randn() * s, y: p.y + randn() * s }; }

  function scheduleMonteCarlo() {
    if (mcTimer) clearTimeout(mcTimer);
    mcTimer = setTimeout(runMonteCarlo, 350);
  }

  function runMonteCarlo() {
    const s = state.solved;
    if (!s || s.error || s.kind !== 'trace') return;
    const method = calMethod();
    const w = s.cond.w;
    const Ts = [];
    // Camera mode: each resample re-solves the span (warm-started) and also
    // jitters the focal — post-calibration ±2%, uncalibrated ±10%.
    const fxSigma = method === 'camera' ? (s.geo.calibrated ? 0.02 : 0.10) : 0;
    const runs = method === 'camera' ? 80 : MC_RUNS;

    for (let i = 0; i < runs; i++) {
      const jp = {
        A: jitterPt(state.points.A, MC_SIGMA_REF),
        B: jitterPt(state.points.B, MC_SIGMA_REF),
        P: null,
        baseA: state.points.baseA ? jitterPt(state.points.baseA, MC_SIGMA_REF) : null,
        baseB: state.points.baseB ? jitterPt(state.points.baseB, MC_SIGMA_REF) : null
      };
      const geo = method === 'perspective' ? perspectiveGeometry(jp)
        : method === 'camera' ? cameraGeometry(jp, { fxScale: 1 + randn() * fxSigma, init: s.geo._sol })
        : scaleGeometry(jp);
      if (!geo || geo.error) continue;
      const traceW = state.trace.map(p => geo.imgToWorld(jitterPt(p, MC_SIGMA_TRACE)));
      const fit = TLEngine.fitCatenary(traceW);
      if (!fit.ok) continue;
      Ts.push(w * fit.C);
    }

    if (state.solved !== s) return; // a newer solve superseded this run
    if (Ts.length < 30) { s.mc = null; renderResults(); return; }

    Ts.sort((a, b) => a - b);
    const q = f => Ts[Math.min(Ts.length - 1, Math.max(0, Math.round(f * (Ts.length - 1))))];
    const lo = q(0.01), hi = q(0.99);
    const BINS = 18;
    const hist = new Array(BINS).fill(0);
    for (const t of Ts) {
      if (t < lo || t > hi) continue;
      hist[Math.min(BINS - 1, Math.floor(((t - lo) / ((hi - lo) || 1)) * BINS))]++;
    }
    s.mc = { n: Ts.length, p5: q(0.05), p50: q(0.5), p95: q(0.95), lo: lo, hi: hi, hist: hist };
    renderResults();
  }

  function mcHistogramSVG(mc) {
    const W = 460, H = 136, padX = 10, padT = 8, padB = 48;
    const maxC = Math.max.apply(null, mc.hist) || 1;
    const bw = (W - 2 * padX) / mc.hist.length;
    const xOf = t => padX + (W - 2 * padX) * (t - mc.lo) / ((mc.hi - mc.lo) || 1);
    let bars = '';
    mc.hist.forEach((c, i) => {
      const bh = (H - padT - padB) * c / maxC;
      const t0 = mc.lo + ((mc.hi - mc.lo) * i) / mc.hist.length;
      const t1 = mc.lo + ((mc.hi - mc.lo) * (i + 1)) / mc.hist.length;
      const inBand = t1 >= mc.p5 && t0 <= mc.p95;
      bars += `<rect x="${(padX + i * bw).toFixed(1)}" y="${(H - padB - bh).toFixed(1)}" width="${Math.max(1, bw - 1.5).toFixed(1)}" height="${bh.toFixed(1)}" fill="${inBand ? 'var(--success)' : 'var(--border)'}" opacity="${inBand ? 0.8 : 0.55}"/>`;
    });
    const mark = (t, color, dy) =>
      `<line x1="${xOf(t).toFixed(1)}" x2="${xOf(t).toFixed(1)}" y1="${padT}" y2="${H - padB}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,3"/>` +
      `<text x="${xOf(t).toFixed(1)}" y="${H - padB + 10 + (dy || 0)}" font-size="9" fill="${color}" text-anchor="middle">${(t / 1000).toFixed(1)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" style="width: 100%; max-width: 640px; height: auto; display: block; margin: 0.35rem auto 0;">` +
      bars + mark(mc.p5, 'var(--warning)') + mark(mc.p50, 'var(--primary)', 9) + mark(mc.p95, 'var(--warning)') +
      `<text x="${W / 2}" y="${H - 16}" font-size="9.5" font-weight="bold" fill="var(--text-muted)" text-anchor="middle">Probable horizontal tension (kN)</text>` +
      `<text x="${W / 2}" y="${H - 4}" font-size="8.5" fill="var(--text-muted)" text-anchor="middle">${mc.n} Monte-Carlo re-fits · ±${MC_SIGMA_REF}px hook / ±${MC_SIGMA_TRACE}px trace click scatter</text>` +
      `</svg>`;
  }

  function qualityVerdict(rmse, sagMax) {
    const rel = sagMax > 0 ? rmse / sagMax : 1;
    if (rel < 0.01) return { label: 'EXCELLENT', color: 'var(--success)' };
    if (rel < 0.03) return { label: 'GOOD', color: 'var(--success)' };
    if (rel < 0.10) return { label: 'FAIR', color: 'var(--warning)' };
    return { label: 'POOR — retrace points', color: 'var(--danger)' };
  }

  function renderResults() {
    const out = document.getElementById('photo-solved-text');
    if (!out) return;
    const s = state.solved;

    if (!s) { out.style.display = 'none'; return; }
    out.style.display = 'block';

    if (s.error) {
      out.innerHTML = `<strong style="color: var(--danger);">Catenary fit failed:</strong> ${s.error}`;
      return;
    }

    const isPersp = s.geo && (s.geo.method === 'perspective' || s.geo.method === 'camera');
    const rollNote = isPersp
      ? `• <span style="color: var(--success);">Perspective rectified (4-point homography) — oblique camera angle and roll handled exactly.</span><br>`
      : (state.vertRef.length === 2
        ? `• Camera roll corrected: <strong>${(s.geo.angle * 180 / Math.PI).toFixed(2)}°</strong> (from vertical reference)<br>`
        : `• <span style="color: var(--warning);">No vertical reference set — assuming camera was held level.</span><br>`);
    const hNote = (s.geo && s.geo.hKnown === false)
      ? `• <span style="color: var(--warning);">Hook height difference h assumed 0 m — enter hook elevations (ZA/ZB or h) in Primary Inputs for slope correction.</span><br>`
      : '';
    const scaleNote = s.geo.method === 'camera'
      ? `• <strong style="color: var(--warning);">SPAN-FREE (EXPERIMENTAL)</strong> · Camera: ${s.geo.camLabel} · ${s.geo.f35} mm equiv ${s.geo.calibrated ? `· <span style="color: var(--success);">calibrated ×${s.geo.profileK.toFixed(3)}</span>` : `· <span style="color: var(--danger);">UNCALIBRATED — span may be off by ±25%; calibrate this camera on one known span</span>`}<br>` +
        `• Solved from camera geometry: <strong>Span L = ${s.geo.L.toFixed(1)} m</strong>${s.geo.hSolved ? `, hook diff h = ${s.geo.h.toFixed(1)} m <span style="color: var(--text-muted);">(h is only weakly constrained by the photo — enter it above if known)</span>` : ` (h = ${s.geo.h.toFixed(1)} m entered)`}<br>` +
        `• Tower heights used: <strong>A = ${s.geo.HA} m</strong>, <strong>B = ${s.geo.HB} m</strong><br>`
      : isPersp
      ? `• Tower heights used: <strong>A = ${s.geo.HA} m</strong>, <strong>B = ${s.geo.HB} m</strong><br>`
      : `• Calibrated scale: <strong>${(1 / s.geo.S).toFixed(1)} px/m</strong><br>`;
    const perspNote = isPersp
      ? `<span style="color: var(--text-muted); font-size: 0.75rem;">Assumes the conductor hangs in the vertical plane through the two towers (true except under strong wind blow-out).</span>`
      : `<span style="color: var(--text-muted); font-size: 0.75rem;">Assumes photo taken roughly perpendicular to the span plane. For oblique shots switch to Perspective 4-Point calibration.</span>`;

    if (s.kind === 'trace') {
      const q = qualityVerdict(s.an.rmse, s.an.sagMax);
      const devWarn = (Math.abs(s.an.endDevA) > Math.max(0.5, 0.05 * s.an.sagMax) || Math.abs(s.an.endDevB) > Math.max(0.5, 0.05 * s.an.sagMax))
        ? `<br><span style="color: var(--warning);">⚠ Fitted curve misses a hook by ${Math.max(Math.abs(s.an.endDevA), Math.abs(s.an.endDevB)).toFixed(2)} m — check hook clicks, or the conductor attachment (insulator offset / uneven sub-conductor tension).</span>`
        : '';
      const KGF = 9.80665;
      const mcCell = s.mc
        ? `<div style="margin-bottom: 0.2rem;">Probable range (90% band): <strong>${(s.mc.p5 / 1000).toFixed(2)} – ${(s.mc.p95 / 1000).toFixed(2)} kN</strong> ` +
          `(${(s.mc.p5 / KGF).toFixed(0)} – ${(s.mc.p95 / KGF).toFixed(0)} kgf) · median ${(s.mc.p50 / 1000).toFixed(2)} kN</div>` +
          mcHistogramSVG(s.mc)
        : `<div style="color: var(--text-muted);">⏳ Estimating click-uncertainty band (Monte-Carlo)…</div>`;
      out.innerHTML =
        `<div class="photo-results-grid">` +
        `<div>` +
        `<strong>Catenary Fit Result (${state.trace.length} traced points):</strong><br>` +
        rollNote + hNote + scaleNote +
        `• Catenary constant C = T/w: <strong>${s.fit.C.toFixed(1)} m</strong><br>` +
        `• <span style="font-size: 0.95rem;">Horizontal Tension T = w·C = <strong>${s.an.T_kN.toFixed(2)} kN</strong> ≈ <strong>${(s.an.T / KGF).toFixed(0)} kgf</strong></span> (${s.cond.name}, ${s.an.pctUTS.toFixed(1)}% UTS)<br>` +
        `• Max sag from chord: <strong>${s.an.sagMax.toFixed(3)} m</strong> at x = ${s.xp.toFixed(1)} m from Hook A<br>` +
        ((isPersp && s.visualLowOffsetPx > 15)
          ? `• <span style="color: var(--text-muted);">ℹ The max-sag marker sits ~${s.visualLowOffsetPx}px away from where the curve <em>looks</em> lowest — this is expected in oblique photos: perspective shifts the visual bottom of the curve away from the true real-world low point. The marker shows the correct world position.</span><br>`
          : '') +
        `• Mid-span sag: <strong>${s.an.sagMid.toFixed(3)} m</strong><br>` +
        `• Fit quality: <strong style="color: ${q.color};">${q.label}</strong> (RMS residual ${s.an.rmse.toFixed(3)} m)` +
        devWarn + `<br>` + perspNote +
        `</div>` +
        `<div class="mc-cell">` + mcCell + `</div>` +
        `</div>`;
    } else {
      out.innerHTML =
        `<strong>Quick 3-Point Photo Solve:</strong><br>` +
        rollNote + hNote + scaleNote +
        `• Span L: <strong>${s.L.toFixed(2)} m</strong>${calMethod() === 'tower' ? ' (solved from image)' : ' (from primary inputs)'}<br>` +
        `• Hook height diff h: <strong>${s.h.toFixed(3)} m</strong><br>` +
        `• Position xp: <strong>${s.xp.toFixed(2)} m</strong> from Hook A<br>` +
        `• Vertical sag offset D(xp): <strong>${s.D.toFixed(3)} m</strong><br>` +
        perspNote;
    }
  }

  // ======================================================================
  // APPLY TO PRIMARY INPUTS
  // ======================================================================
  function applyToInputs() {
    const s = state.solved;
    if (!s || s.error || !(s.D > 0) || !(s.xp > 0) || !(s.xp < s.L)) {
      alert('Load a photo and complete the point placement / trace first (sag point must lie below the chord, between the hooks).');
      return;
    }

    document.getElementById('tp-span').value = s.L.toFixed(2);
    document.getElementById('tp-xp').value = s.xp.toFixed(2);

    const imSel = document.getElementById('tp-input-mode');
    const za = parseFloat(document.getElementById('tp-za').value);
    if (imSel.value === 'z-coords' && !isNaN(za)) {
      document.getElementById('tp-zb').value = (za + s.h).toFixed(3);
      const zp = za + (s.xp / s.L) * s.h - s.D;
      document.getElementById('tp-zp').value = zp.toFixed(3);
    } else {
      // No real ZA elevation available — the photo only gives RELATIVE
      // geometry, so apply via the direct chord/offset mode instead of
      // inventing an absolute elevation.
      if (imSel.value !== 'direct-offset') {
        imSel.value = 'direct-offset';
        if (typeof toggleInputMode === 'function') toggleInputMode();
      }
      document.getElementById('tp-height-diff').value = s.h.toFixed(3);
      document.getElementById('tp-offset-d').value = s.D.toFixed(3);
    }

    // Let the results panel reference the photo's own fitted figure.
    window.photoAppliedRef = {
      L: s.L, xp: s.xp, D: s.D,
      T: (s.kind === 'trace' && s.an) ? s.an.T : null,
      band: (s.kind === 'trace' && s.mc) ? [s.mc.p5, s.mc.p95] : null
    };

    if (typeof calculateThreePoint === 'function') calculateThreePoint();

    const msg = s.kind === 'trace'
      ? `Applied catenary-fit results: L=${s.L.toFixed(1)} m, xp=${s.xp.toFixed(1)} m, D=${s.D.toFixed(3)} m.\n\nFitted tension was ${s.an.T_kN.toFixed(2)} kN — compare with the three-point result below.`
      : 'Photo sag and coordinates applied to primary inputs below.';
    alert(msg);
  }

  // ======================================================================
  // DRAWING
  // ======================================================================
  // Trace = bright cyan with white ring — stays visible against rock,
  // vegetation and sky (pink was getting lost on real terrain photos).
  const COLORS = { A: '#3b82f6', B: '#f59e0b', P: '#10b981', baseA: '#ec4899', baseB: '#8b5cf6', trace: '#22d3ee', vert: '#a3e635', fit: '#facc15', sag: '#ef4444' };
  const LABELS = { A: 'Hook A', B: 'Hook B', P: 'Point P', baseA: 'Base A', baseB: 'Base B' };

  function redraw() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = cssSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    if (!state.img) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload a span photo to begin', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Photo
    ctx.save();
    ctx.setTransform(dpr * state.view.scale, 0, 0, dpr * state.view.scale, dpr * state.view.tx, dpr * state.view.ty);
    ctx.imageSmoothingEnabled = state.view.scale < 3;
    ctx.drawImage(state.img, 0, 0);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Vertical reference
    if (state.vertRef.length >= 1) {
      const c0 = i2c(state.vertRef[0]);
      if (state.vertRef.length === 2) {
        const c1 = i2c(state.vertRef[1]);
        drawLine(c0, c1, COLORS.vert, 2, [8, 5]);
        drawText('Vertical Ref', { x: (c0.x + c1.x) / 2 + 8, y: (c0.y + c1.y) / 2 }, COLORS.vert);
      }
      state.vertRef.forEach(p => drawMarker(i2c(p), COLORS.vert, 4));
    }

    // Chord
    if (state.points.A && state.points.B) {
      drawLine(i2c(state.points.A), i2c(state.points.B), '#ffffff', 1.5, [6, 4]);
    }
    // Tower reference lines
    if (state.points.A && state.points.baseA) {
      drawLine(i2c(state.points.A), i2c(state.points.baseA), COLORS.baseA, 2);
    }
    if (state.points.B && state.points.baseB) {
      drawLine(i2c(state.points.B), i2c(state.points.baseB), COLORS.baseB, 2);
    }

    // Calibration values annotated at the geometry they describe
    if (state.points.A && state.points.B) {
      const g = primaryLh();
      if (g) {
        const a = i2c(state.points.A), b = i2c(state.points.B);
        drawText(`L = ${g.L.toFixed(1)} m`, { x: (a.x + b.x) / 2 - 34, y: (a.y + b.y) / 2 - 10 }, '#ffffff');
        if (g.hKnown) {
          drawText(`h = ${g.h >= 0 ? '+' : ''}${g.h.toFixed(1)} m`, { x: b.x + 12, y: b.y + 26 }, COLORS.vert);
        }
      }
    }
    const cm = calMethod();
    if (cm === 'perspective') {
      const HAv = parseFloat(document.getElementById('photo-persp-ha').value);
      const HBraw = parseFloat(document.getElementById('photo-persp-hb').value);
      const HBv = HBraw > 0 ? HBraw : HAv;
      if (state.points.A && state.points.baseA && HAv > 0) {
        const a = i2c(state.points.A), ba = i2c(state.points.baseA);
        drawText(`H_A = ${HAv} m`, { x: (a.x + ba.x) / 2 + 8, y: (a.y + ba.y) / 2 }, COLORS.baseA);
      }
      if (state.points.B && state.points.baseB && HBv > 0) {
        const b = i2c(state.points.B), bb = i2c(state.points.baseB);
        drawText(`H_B = ${HBv} m`, { x: (b.x + bb.x) / 2 + 8, y: (b.y + bb.y) / 2 }, COLORS.baseB);
      }
    } else if (cm === 'tower') {
      const Hv = parseFloat(document.getElementById('photo-cal-tower-h').value);
      if (state.points.A && state.points.baseA && Hv > 0) {
        const a = i2c(state.points.A), ba = i2c(state.points.baseA);
        drawText(`H = ${Hv} m`, { x: (a.x + ba.x) / 2 + 8, y: (a.y + ba.y) / 2 }, COLORS.baseA);
      }
    }

    // Trace points (white ring keeps them visible on any background)
    state.trace.forEach(p => drawMarker(i2c(p), COLORS.trace, 3.5, true));

    // Fitted catenary + sag indicator
    if (state.solved && !state.solved.error && state.solved.kind === 'trace') {
      drawFittedCurve(state.solved);
    }
    if (state.solved && !state.solved.error && state.solved.kind === 'quick') {
      drawQuickSag(state.solved);
    }

    // Named points
    for (const kind of ['A', 'B', 'baseA', 'baseB', 'P']) {
      const p = state.points[kind];
      if (!p) continue;
      const c = i2c(p);
      drawMarker(c, COLORS[kind], 5.5, true);
      drawText(LABELS[kind], { x: c.x + 12, y: c.y - 6 }, COLORS[kind]);
    }

    // Placement candidate + loupe
    const active = state.placing ? state.placing.pos : (state.dragging ? getDragPos(state.dragging) : null);
    if (active) {
      const c = i2c(active);
      drawCrosshair(c, '#ffffff');
      drawLoupe(active, c);
    }
  }

  function drawLine(a, b, color, width, dash) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawMarker(c, color, r, ring) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 4, 0, 2 * Math.PI);
    ctx.fillStyle = color + '33';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    if (ring) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawText(text, c, color) {
    ctx.font = 'bold 13px sans-serif';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.5;
    ctx.strokeText(text, c.x, c.y);
    ctx.fillStyle = color;
    ctx.fillText(text, c.x, c.y);
  }

  function drawCrosshair(c, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x - 16, c.y); ctx.lineTo(c.x - 4, c.y);
    ctx.moveTo(c.x + 4, c.y); ctx.lineTo(c.x + 16, c.y);
    ctx.moveTo(c.x, c.y - 16); ctx.lineTo(c.x, c.y - 4);
    ctx.moveTo(c.x, c.y + 4); ctx.lineTo(c.x, c.y + 16);
    ctx.stroke();
  }

  // Magnifier loupe above the active point for precise placement.
  function drawLoupe(imgPos, cssPos) {
    if (!state.img) return;
    const R = 62;
    const zoom = Math.max(4, state.view.scale * 2.5);
    const { w } = cssSize();
    let cx = cssPos.x, cy = cssPos.y - R - 34;
    if (cy - R < 4) cy = cssPos.y + R + 34; // flip below near the top edge
    cx = Math.max(R + 4, Math.min(w - R - 4, cx));

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.clip();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (cx - imgPos.x * zoom), dpr * (cy - imgPos.y * zoom));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.img, 0, 0);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawCrosshair({ x: cx, y: cy }, '#facc15');
  }

  function drawFittedCurve(s) {
    const xLo = Math.min(s.geo.Am.x, s.geo.Bm.x);
    const xHi = Math.max(s.geo.Am.x, s.geo.Bm.x);
    const N = 100;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const xm = xLo + ((xHi - xLo) * i) / N;
      const ym = TLEngine.catenaryY(s.fit.C, s.fit.x0, s.fit.y0, xm);
      const c = i2c(s.geo.worldToImg({ x: xm, y: ym }));
      if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
    }
    ctx.strokeStyle = COLORS.fit;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Max sag indicator: from chord down to curve at x*.
    const xAbs = Math.min(s.geo.Am.x, s.geo.Bm.x) + s.an.xMaxSag;
    const m = (s.geo.Bm.y - s.geo.Am.y) / (s.geo.Bm.x - s.geo.Am.x);
    const chordY = s.geo.Am.y + m * (xAbs - s.geo.Am.x);
    const curveY = TLEngine.catenaryY(s.fit.C, s.fit.x0, s.fit.y0, xAbs);
    const cTop = i2c(s.geo.worldToImg({ x: xAbs, y: chordY }));
    const cBot = i2c(s.geo.worldToImg({ x: xAbs, y: curveY }));
    drawLine(cTop, cBot, COLORS.sag, 2.5);
    drawMarker(cBot, COLORS.sag, 4);
    drawText(`D = ${s.an.sagMax.toFixed(2)} m`, { x: cBot.x + 10, y: (cTop.y + cBot.y) / 2 }, COLORS.sag);
  }

  function drawQuickSag(s) {
    const top = i2c(s.geo.worldToImg({ x: s.Pw.x, y: s.Pw.y + s.D }));
    const bot = i2c(s.geo.worldToImg(s.Pw));
    drawLine(top, bot, COLORS.sag, 2.5);
    drawMarker(top, COLORS.sag, 4);
    drawText(`D = ${s.D.toFixed(2)} m`, { x: bot.x + 10, y: (top.y + bot.y) / 2 }, COLORS.sag);
  }

  // ======================================================================
  // INSTRUCTIONS / UI STATE
  // ======================================================================
  function updateInstructions() {
    const el = document.getElementById('photo-tracker-instructions');
    if (!el) return;

    const style = (color) => {
      el.style.color = `var(--${color})`;
      el.style.borderColor = `var(--${color})`;
      el.style.background = color === 'success' ? 'rgba(16, 185, 129, 0.04)' : 'rgba(180, 83, 9, 0.04)';
    };

    if (!state.img) {
      el.innerHTML = 'No photo loaded. Click <strong>Upload Span Photo</strong> to begin.';
      style('warning');
      return;
    }
    style('success');

    const next = expectedNext();
    const hint = ' <span style="opacity:0.75;">(scroll/pinch to zoom · hold &amp; drag for fine placement with magnifier · drag any point to adjust · right-click or double-tap a point to delete)</span>';

    if (next === 'vert') {
      el.innerHTML = `🎯 <strong>Vertical reference (${state.vertRef.length}/2):</strong> Click two points along a known plumb-vertical edge (e.g. tower body centreline).` + hint;
      return;
    }
    if (next === 'A') { el.innerHTML = '🎯 <strong>Step 1:</strong> Click the <strong>Tower A hook point</strong> (conductor attachment).' + hint; return; }
    if (next === 'B') { el.innerHTML = '🎯 <strong>Step 2:</strong> Click the <strong>Tower B hook point</strong>.' + hint; return; }
    if (next === 'baseA') { el.innerHTML = '🎯 <strong>Step 3:</strong> Click the ground point <strong>plumb below Hook A</strong> — where a stone dropped from the hook would land (usually under the crossarm tip, NOT a tower leg). The tower height you enter must be the hook\'s height above this same point.' + hint; return; }
    if (next === 'baseB') { el.innerHTML = '🎯 <strong>Step 4:</strong> Click the ground point <strong>plumb below Hook B</strong> (same rule: below the hook, not a leg) — completes the 4-point perspective rectification.' + hint; return; }
    if (next === 'P') { el.innerHTML = '🎯 <strong>Final step:</strong> Click the <strong>conductor at its lowest visible point</strong>.' + hint; return; }
    if (next === 'trace') {
      const n = state.trace.length;
      if (n < MIN_TRACE_PTS) {
        el.innerHTML = `🖊 <strong>Trace the conductor:</strong> Click along the wire — <strong>${n}/${MIN_TRACE_PTS} minimum</strong> points placed. Spread them across the whole span; 10–20 points give the best fit.` + hint;
      } else {
        el.innerHTML = `✅ <strong>${n} points traced — catenary fitted live.</strong> Keep adding points to tighten the fit, drag any point to adjust, then press <strong>Apply</strong>.` + hint;
      }
      return;
    }
    el.innerHTML = '✅ <strong>All points placed.</strong> Review the solved values, drag points to fine-tune, then press <strong>Apply</strong>.';
  }

  function updateToolButtons() {
    const place = document.getElementById('pt-tool-place');
    const pan = document.getElementById('pt-tool-pan');
    const vert = document.getElementById('pt-vert-btn');
    if (place) place.classList.toggle('active', state.tool === 'place');
    if (pan) pan.classList.toggle('active', state.tool === 'pan');
    if (vert) vert.classList.toggle('active', state.placingVertRef);
    if (canvas) canvas.style.cursor = state.tool === 'pan' ? 'grab' : 'crosshair';
  }

  function syncModeSelect() {
    const sel = document.getElementById('photo-mode');
    if (sel) sel.value = state.mode;
  }

  // ======================================================================
  // REPORT EXPORT — annotated image + summary for the printed report
  // ======================================================================
  function exportAnnotatedImage(maxW) {
    if (!state.img) return null;
    const iw = state.img.naturalWidth, ih = state.img.naturalHeight;
    const k = Math.min(1, (maxW || 1600) / iw);
    const c = document.createElement('canvas');
    c.width = Math.round(iw * k);
    c.height = Math.round(ih * k);
    const g = c.getContext('2d');
    g.drawImage(state.img, 0, 0, c.width, c.height);

    const P = p => ({ x: p.x * k, y: p.y * k });
    const lw = Math.max(2, c.width / 700);
    const fs = Math.max(13, Math.round(c.width / 70));

    const line = (a, b, color, width, dash) => {
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []);
      g.stroke(); g.setLineDash([]);
    };
    const dot = (p, color, r) => {
      g.beginPath(); g.arc(p.x, p.y, r, 0, 2 * Math.PI);
      g.fillStyle = color; g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = lw * 0.6; g.stroke();
    };
    const label = (text, p, color) => {
      g.font = `bold ${fs}px sans-serif`;
      g.strokeStyle = '#000000'; g.lineWidth = fs / 4;
      g.strokeText(text, p.x, p.y);
      g.fillStyle = color; g.fillText(text, p.x, p.y);
    };

    if (state.vertRef.length === 2) {
      line(P(state.vertRef[0]), P(state.vertRef[1]), COLORS.vert, lw, [10, 6]);
    }
    if (state.points.A && state.points.B) line(P(state.points.A), P(state.points.B), '#ffffff', lw, [8, 6]);
    if (state.points.A && state.points.baseA) line(P(state.points.A), P(state.points.baseA), COLORS.baseA, lw);
    if (state.points.B && state.points.baseB) line(P(state.points.B), P(state.points.baseB), COLORS.baseB, lw);

    state.trace.forEach(p => dot(P(p), COLORS.trace, lw * 1.8));

    const s = state.solved;
    if (s && !s.error && s.kind === 'trace') {
      const xLo = Math.min(s.geo.Am.x, s.geo.Bm.x);
      const xHi = Math.max(s.geo.Am.x, s.geo.Bm.x);
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const xm = xLo + ((xHi - xLo) * i) / 120;
        const ym = TLEngine.catenaryY(s.fit.C, s.fit.x0, s.fit.y0, xm);
        const p = P(s.geo.worldToImg({ x: xm, y: ym }));
        i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y);
      }
      g.strokeStyle = COLORS.fit; g.lineWidth = lw; g.stroke();

      const xAbs = Math.min(s.geo.Am.x, s.geo.Bm.x) + s.an.xMaxSag;
      const m = (s.geo.Bm.y - s.geo.Am.y) / (s.geo.Bm.x - s.geo.Am.x);
      const cTop = P(s.geo.worldToImg({ x: xAbs, y: s.geo.Am.y + m * (xAbs - s.geo.Am.x) }));
      const cBot = P(s.geo.worldToImg({ x: xAbs, y: TLEngine.catenaryY(s.fit.C, s.fit.x0, s.fit.y0, xAbs) }));
      line(cTop, cBot, COLORS.sag, lw * 1.2);
      label(`D = ${s.an.sagMax.toFixed(2)} m`, { x: cBot.x + fs * 0.7, y: (cTop.y + cBot.y) / 2 }, COLORS.sag);
    }
    if (s && !s.error && s.kind === 'quick' && s.Pw) {
      const top = P(s.geo.worldToImg({ x: s.Pw.x, y: s.Pw.y + s.D }));
      const bot = P(s.geo.worldToImg(s.Pw));
      line(top, bot, COLORS.sag, lw * 1.2);
      label(`D = ${s.D.toFixed(2)} m`, { x: bot.x + fs * 0.7, y: (top.y + bot.y) / 2 }, COLORS.sag);
    }

    for (const kind of ['A', 'B', 'baseA', 'baseB', 'P']) {
      const p = state.points[kind];
      if (!p) continue;
      dot(P(p), COLORS[kind], lw * 2.6);
      label(LABELS[kind], { x: P(p).x + fs * 0.8, y: P(p).y - fs * 0.4 }, COLORS[kind]);
    }

    return c.toDataURL('image/jpeg', 0.88);
  }

  function getReportData() {
    const s = state.solved;
    if (!state.img || !s || s.error) return null;

    const isPersp = s.geo.method === 'perspective' || s.geo.method === 'camera';
    const calNames = { perspective: 'Perspective 4-point homography (hooks + tower bases)', tower: 'Tower structural height (Hook-to-Base)', chord: 'Span chord (known L and h)', camera: 'Camera intrinsics — SPAN-FREE (EXPERIMENTAL)' };
    const lines = [];
    lines.push(`Measurement mode      : ${s.kind === 'trace' ? 'Full Catenary Trace (' + state.trace.length + ' points, least-squares fit)' : 'Quick 3-Point Photo Solve'}`);
    lines.push(`Calibration method    : ${calNames[calMethod()] || calMethod()}`);
    if (s.geo.method === 'camera') {
      lines.push(`Camera                : ${s.geo.camLabel} · ${s.geo.f35} mm equiv · ${s.geo.calibrated ? 'calibrated ×' + s.geo.profileK.toFixed(3) : 'UNCALIBRATED (span may be off by ±25%)'}`);
      lines.push(`Solved span           : L = ${s.geo.L.toFixed(1)} m${s.geo.hSolved ? ', h = ' + s.geo.h.toFixed(1) + ' m (both solved from camera geometry)' : ''}`);
    }
    if (isPersp) {
      lines.push(`Tower heights         : A = ${s.geo.HA} m, B = ${s.geo.HB} m (hook to base)`);
      lines.push(`Camera obliquity/roll : rectified exactly via planar homography`);
    } else {
      lines.push(`Calibrated scale      : ${(1 / s.geo.S).toFixed(2)} px/m`);
      lines.push(`Camera roll           : ${state.vertRef.length === 2 ? (s.geo.angle * 180 / Math.PI).toFixed(2) + ' deg (corrected via vertical reference)' : 'not corrected (camera assumed level)'}`);
    }
    lines.push(`Span L / hook diff h  : ${s.L.toFixed(2)} m / ${s.h.toFixed(3)} m${s.geo.hKnown === false ? ' (h assumed 0 — not entered)' : ''}`);
    if (s.kind === 'trace') {
      const KGF = 9.80665;
      lines.push(`Catenary constant C   : ${s.fit.C.toFixed(1)} m`);
      lines.push(`Horizontal tension T  : ${s.an.T_kN.toFixed(2)} kN  =  ${(s.an.T / KGF).toFixed(0)} kgf  (${s.cond.name}, ${s.an.pctUTS.toFixed(1)}% of UTS)`);
      if (s.mc) {
        lines.push(`Probable range (90%)  : ${(s.mc.p5 / 1000).toFixed(2)} - ${(s.mc.p95 / 1000).toFixed(2)} kN  (${(s.mc.p5 / KGF).toFixed(0)} - ${(s.mc.p95 / KGF).toFixed(0)} kgf), from ${s.mc.n} Monte-Carlo re-fits with +/-${MC_SIGMA_REF}px reference / +/-${MC_SIGMA_TRACE}px trace click scatter`);
      }
      lines.push(`Max sag from chord    : ${s.an.sagMax.toFixed(3)} m at x = ${s.xp.toFixed(1)} m from Hook A`);
      lines.push(`Mid-span sag          : ${s.an.sagMid.toFixed(3)} m`);
      lines.push(`Fit RMS residual      : ${s.an.rmse.toFixed(3)} m`);
    } else {
      lines.push(`Position xp           : ${s.xp.toFixed(2)} m from Hook A`);
      lines.push(`Vertical sag D(xp)    : ${s.D.toFixed(3)} m`);
    }
    lines.push(isPersp
      ? `Note: assumes the conductor hangs in the vertical plane through the two towers.`
      : `Note: solve assumes the photo plane is approximately parallel to the span plane.`);

    return {
      image: exportAnnotatedImage(1600),
      summary: lines.join('\n'),
      mcSvg: (s.kind === 'trace' && s.mc) ? mcHistogramSVG(s.mc) : null
    };
  }

  // ======================================================================
  // SERIALIZATION (project save / resume)
  // ======================================================================
  function serialize() {
    return {
      version: 2,
      imgSrc: state.imgSrc,
      exif: state.exif || null,
      mode: state.mode,
      points: state.points,
      trace: state.trace,
      vertRef: state.vertRef
    };
  }

  function restore(data) {
    clearAnnotations();
    state.exif = (data && data.exif) || null;
    updateCameraStatus();
    if (!data || !data.imgSrc) {
      state.img = null;
      state.imgSrc = null;
      solve();
      updateInstructions();
      redraw();
      return;
    }
    state.pendingRestore = {
      points: data.points,
      trace: data.trace,
      vertRef: data.vertRef,
      mode: data.mode
    };
    loadImageSrc(data.imgSrc, false);
  }

  // Legacy (v1) project files: photoImgSrc + photoClicks array.
  function restoreLegacy(imgSrc, clicks) {
    const pts = clicks || [];
    restore({
      imgSrc: imgSrc,
      mode: 'quick',
      points: { A: pts[0] || null, B: pts[1] || null, P: pts[2] || null, baseA: pts[3] || null, baseB: null },
      trace: [],
      vertRef: []
    });
  }

  // ======================================================================
  // GLOBAL HANDLERS (wired from index.html)
  // ======================================================================
  window.loadPhotoTrackerImage = function (event) {
    const file = event.target.files[0];
    if (file) loadImageFile(file);
    event.target.value = '';
  };

  window.resetPhotoTracker = function () {
    clearAnnotations();
    solve();
    updateInstructions();
    updateToolButtons();
    redraw();
  };

  window.handlePhotoCalibChange = function () {
    const method = calMethod();
    const towerGrp = document.getElementById('photo-tower-h-group');
    const haGrp = document.getElementById('photo-persp-ha-group');
    const hbGrp = document.getElementById('photo-persp-hb-group');
    const spanGrp = document.getElementById('photo-span-group');
    const hGrp = document.getElementById('photo-h-group');
    const isProj = method === 'perspective' || method === 'camera';
    if (towerGrp) towerGrp.style.display = method === 'tower' ? 'block' : 'none';
    if (haGrp) haGrp.style.display = isProj ? 'block' : 'none';
    if (hbGrp) hbGrp.style.display = isProj ? 'block' : 'none';
    // The vertical-reference (roll correction) tool only affects the scale
    // calibrations — the homography methods handle roll exactly.
    const vertBtn = document.getElementById('pt-vert-btn');
    if (vertBtn) vertBtn.style.display = isProj ? 'none' : '';
    if (isProj) state.placingVertRef = false;
    // Tower-height and camera methods solve L from the image itself
    if (spanGrp) spanGrp.style.display = (method === 'tower' || method === 'camera') ? 'none' : 'block';
    if (hGrp) hGrp.style.display = method === 'tower' ? 'none' : 'block';
    const camGrp = document.getElementById('photo-camera-group');
    if (camGrp) camGrp.style.display = method === 'camera' ? 'block' : 'none';
    if (method === 'camera') updateCameraStatus();
    // Changing the calibration source invalidates the base points; keep hooks/trace.
    state.points.baseA = null;
    state.points.baseB = null;
    solve();
    updateInstructions();
    redraw();
  };

  window.applyPhotoTrackerReadings = function () { applyToInputs(); };

  window.setPhotoMode = function (sel) {
    state.mode = sel.value;
    // Keep hooks; drop mode-specific extras so the flow restarts cleanly.
    state.points.P = null;
    state.trace = [];
    state.solved = null;
    solve();
    updateInstructions();
    redraw();
  };

  window.setPhotoTool = function (tool) {
    state.tool = tool;
    updateToolButtons();
  };

  window.photoUndo = function () { undoLast(); };

  window.photoFitView = function () {
    fitView();
    redraw();
  };

  window.photoToggleFullscreen = function () {
    if (!container) return;
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) container.requestFullscreen();
      else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  window.photoToggleVertRef = function () {
    if (state.vertRef.length === 2 && !state.placingVertRef) {
      // Clear the existing reference so the user can re-place it.
      state.vertRef = [];
      state.placingVertRef = true;
    } else {
      state.placingVertRef = !state.placingVertRef;
      if (!state.placingVertRef && state.vertRef.length < 2) state.vertRef = [];
    }
    state.tool = 'place';
    solve();
    updateInstructions();
    updateToolButtons();
    redraw();
  };

  window.photoCameraChanged = function () {
    updateCameraStatus();
    if (state.img) { solve(); redraw(); }
  };

  // One-time camera calibration: solve the focal that makes the current
  // photo's solved span equal a KNOWN span; store it as a camera profile.
  window.calibrateCameraFromSpan = function () {
    const LTrue = parseFloat(document.getElementById('photo-calib-span').value);
    if (!(LTrue > 0)) { alert('Enter the known span length of THIS photo (from survey records) to calibrate the camera.'); return; }
    const pts = state.points;
    if (!(state.img && pts.A && pts.B && pts.baseA && pts.baseB)) { alert('Place all four reference points first (both hooks and both bases).'); return; }
    const f35 = parseFloat(document.getElementById('photo-f35').value);
    if (!(f35 > 0)) { alert('Camera focal (35mm equivalent) is needed — from EXIF or manual entry.'); return; }
    const HA = parseFloat(document.getElementById('photo-persp-ha').value);
    if (!(HA > 0)) { alert('Enter Tower A height first.'); return; }
    const HBraw = parseFloat(document.getElementById('photo-persp-hb').value);
    const HB = HBraw > 0 ? HBraw : HA;
    const hEl = document.getElementById('photo-hook-h');
    const hv = hEl ? parseFloat(hEl.value) : NaN;
    const hFixed = isNaN(hv) ? null : hv;

    const fx0 = TLEngine.fxFrom35mm(f35, state.img.naturalWidth);
    const cx = state.img.naturalWidth / 2, cy = state.img.naturalHeight / 2;
    const fxCal = TLEngine.focalForSpan([pts.A, pts.B, pts.baseA, pts.baseB], HA, HB, LTrue, hFixed, cx, cy, fx0);
    if (!fxCal) { alert('Calibration failed — the known span could not be matched. Check the reference points and tower heights.'); return; }

    const key = cameraProfileKey();
    const profiles = getCameraProfiles();
    profiles[key] = { k: fxCal / fx0, date: new Date().toISOString().slice(0, 10), note: 'calibrated on L = ' + LTrue + ' m' };
    try { localStorage.setItem('tlsag_camera_profiles', JSON.stringify(profiles)); } catch (e) {}
    updateCameraStatus();
    solve();
    redraw();
    alert('Camera calibrated — correction x' + (fxCal / fx0).toFixed(3) + ' stored for: ' + key + '. Future photos from this camera can be measured WITHOUT knowing the span.');
  };

  // Re-solve when primary inputs that feed the calibration change.
  window.photoTrackerResolve = function () {
    if (state.img) { solve(); redraw(); }
  };

  window.PhotoTracker = {
    serialize: serialize,
    restore: restore,
    restoreLegacy: restoreLegacy,
    resolve: window.photoTrackerResolve,
    getReportData: getReportData,
    exportAnnotatedImage: exportAnnotatedImage,
    state: state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
