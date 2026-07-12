/* TL-SAG Analytical Engine & UI Controller */

// Single source of truth for the app version — shown in the header/footer,
// stamped into printed reports and project JSON exports.
// Bump on every user-visible release and add an entry to CHANGELOG.md.
const APP_VERSION = '0.11.8-beta';
const APP_VERSION_DATE = '2026-07-09';
const APP_REPO_URL = 'https://github.com/theprixit/TL-Analyzer';

// Standard ACSR Conductor Database (IS 398 Part-II Reference Specs)
// area: total cross-section mm² | E: typical FINAL modulus GPa |
// alpha: coefficient of thermal expansion /°C.
// E and alpha are typical published values — verify against the actual
// conductor datasheet for critical temperature studies.
const conductorDatabase = {
  "dog": { name: "ACSR Dog", w: 3.865, mass: 0.394, uts: 32700, area: 118.5, E: 73.5, alpha: 19.8e-6 },
  "wolf": { name: "ACSR Wolf", w: 7.122, mass: 0.726, uts: 56400, area: 194.9, E: 79.0, alpha: 17.8e-6 },
  "panther": { name: "ACSR Panther", w: 9.555, mass: 0.974, uts: 79700, area: 261.5, E: 79.0, alpha: 17.8e-6 },
  "zebra": { name: "ACSR Zebra", w: 15.912, mass: 1.622, uts: 130300, area: 484.5, E: 68.5, alpha: 19.3e-6 },
  "moose": { name: "ACSR Moose", w: 19.600, mass: 1.998, uts: 161200, area: 597.0, E: 68.5, alpha: 19.3e-6 },
  "custom": { name: "Custom Conductor", w: 0.0, mass: 0.0, uts: 0.0 }
};

// Global State
let activeTab = "threepoint-pane";

// Initialize on Load
window.onload = function() {
  // Bind conductor dropdowns
  populateConductorSelectors();
  // Set initial layouts
  toggleInputMode();
  // Calculate default values
  calculateThreePoint();
  // Calculate rangefinder default values
  calculateRangefinder();
  // Calculate mountain span default values
  calculateMountainSpan();
  // Initialize photo tracker visibility
  if (typeof handlePhotoCalibChange === 'function') {
    handlePhotoCalibChange();
  }
  // Project-first workflow: autosave hooks + open the project gate
  initProjectWorkflow();
  // Offline-first PWA: register the service worker (https or localhost only)
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed:', err));
  }
  // Version badge, footer meta and "app updated" notice
  initVersionInfo();
  // Install-as-app UI (Android/Chrome native prompt; iOS instruction sheet)
  updateInstallUi();
};

// ==========================================================================
// INSTALL AS APP (PWA)
// Android/desktop Chrome fire `beforeinstallprompt` — stash it and offer a
// real install button. iPhone Safari has no API, so the button reveals the
// two-step Share → Add to Home Screen instructions instead. Everything
// hides when already running as an installed app.
// ==========================================================================
let deferredInstallPrompt = null;

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

function isIosBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS masquerades as Mac
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUi();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallUi();
});

function updateInstallUi() {
  const installable = !isStandaloneApp() && (!!deferredInstallPrompt || isIosBrowser());
  const banner = document.getElementById('gate-install');
  if (banner) banner.style.display = installable ? '' : 'none';
  const headerBtn = document.getElementById('header-install-btn');
  if (headerBtn) headerBtn.style.display = installable ? '' : 'none';
}

function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      updateInstallUi();
    });
    return;
  }
  // iOS: no install API — show the instructions on the gate (open it if needed)
  const gate = document.getElementById('project-gate');
  if (gate && gate.style.display === 'none' && typeof openProjectGate === 'function') {
    openProjectGate();
  }
  const steps = document.getElementById('gate-install-ios');
  if (steps) {
    steps.style.display = '';
    steps.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ==========================================================================
// APP VERSION DISPLAY & UPDATE NOTICE
// ==========================================================================
function initVersionInfo() {
  const badge = document.getElementById('app-version-badge');
  if (badge) badge.innerText = 'v' + APP_VERSION;

  const footerMeta = document.getElementById('app-footer-meta');
  if (footerMeta) {
    footerMeta.innerHTML =
      `TL-SAG <strong>v${APP_VERSION}</strong> (${APP_VERSION_DATE}) · ` +
      `<a href="${APP_REPO_URL}/blob/master/CHANGELOG.md" target="_blank" rel="noopener">What's new</a> · ` +
      `Open source under the <a href="${APP_REPO_URL}/blob/master/LICENSE" target="_blank" rel="noopener">MIT License</a> · ` +
      `<a href="${APP_REPO_URL}" target="_blank" rel="noopener">Source on GitHub</a> · ` +
      `<a href="explanations.html" target="_blank" rel="noopener">Physics sandbox</a>`;
  }

  // One-time notice when a returning user gets a new version.
  try {
    const seen = localStorage.getItem('tlsag_seen_version');
    if (seen && seen !== APP_VERSION) {
      const note = document.createElement('div');
      note.className = 'update-notice';
      note.innerHTML =
        `🔄 TL-SAG updated: <strong>v${seen}</strong> → <strong>v${APP_VERSION}</strong> — ` +
        `<a href="${APP_REPO_URL}/blob/master/CHANGELOG.md" target="_blank" rel="noopener">see what's new</a>` +
        `<button type="button" onclick="this.parentElement.remove()" title="Dismiss">✕</button>`;
      const container = document.querySelector('.container');
      if (container) container.insertBefore(note, container.firstChild);
    }
    localStorage.setItem('tlsag_seen_version', APP_VERSION);
  } catch (e) { /* storage unavailable — skip the notice */ }
}

// Collapsible Section Toggle
function toggleCollapsible(contentId, arrowId) {
  const content = document.getElementById(contentId);
  const arrow = document.getElementById(arrowId);
  if (content) {
    content.classList.toggle('active');
    if (arrow) {
      arrow.innerText = content.classList.contains('active') ? "▲" : "▼";
    }
  }
}

// Collapsible GPS helper Panel Toggle
function toggleGpsHelper(helperId) {
  const panel = document.getElementById(helperId);
  if (panel) {
    panel.classList.toggle('active');
  }
}

// GPS Hook Elevation Calculator
function calculateGpsHookElev(targetId) {
  const baseInput = document.getElementById(`${targetId}-gps-base`);
  const heightInput = document.getElementById(`${targetId}-gps-height`);
  const targetInput = document.getElementById(targetId);
  if (baseInput && heightInput && targetInput) {
    const base = parseFloat(baseInput.value) || 0;
    const height = parseFloat(heightInput.value) || 0;
    targetInput.value = (base + height).toFixed(3);
    calculateThreePoint();
  }
}

// Populate Dropdown Menus
function populateConductorSelectors() {
  const tpSelect = document.getElementById('tp-conductor');
  if (!tpSelect) return;
  
  // Clear options
  tpSelect.innerHTML = "";

  for (const [key, value] of Object.entries(conductorDatabase)) {
    const opt1 = document.createElement('option');
    opt1.value = key;
    opt1.text = value.name + (key !== 'custom' ? ` (w: ${value.w} N/m, UTS: ${(value.uts/1000).toFixed(1)} kN)` : '');
    tpSelect.appendChild(opt1);
  }

  // Pre-select Zebra as default primary conductor
  tpSelect.value = "zebra";
}

// Toggle custom fields
function handleConductorChange(calcType) {
  if (calcType !== 'tp') return;
  const selectedKey = document.getElementById('tp-conductor').value;
  const customDiv = document.getElementById('tp-custom-fields');

  if (selectedKey === 'custom') {
    customDiv.style.display = 'grid';
  } else {
    customDiv.style.display = 'none';
  }

  calculateThreePoint();
  // Photo tracker tension (T = w·C) depends on the selected conductor.
  if (typeof photoTrackerResolve === 'function') photoTrackerResolve();
}

// Toggle Z-Coordinates vs Direct Offset input modes in Three-Point Method
function toggleInputMode() {
  const mode = document.getElementById('tp-input-mode').value;
  const zDiv = document.getElementById('tp-z-coords-div');
  const directDiv = document.getElementById('tp-direct-offset-div');

  if (mode === 'z-coords') {
    zDiv.style.display = 'block';
    directDiv.style.display = 'none';
  } else {
    zDiv.style.display = 'none';
    directDiv.style.display = 'block';
  }
  calculateThreePoint();
}

// Retreive active conductor specifications based on calculator selection
function getConductorSpecs(calcType) {
  const prefix = calcType === 'tp' ? 'tp' : 'wave';
  const selectKey = document.getElementById(`${prefix}-conductor`).value;
  
  if (selectKey === 'custom') {
    const customW = parseFloat(document.getElementById(`${prefix}-custom-w`).value) || 0;
    const customMass = parseFloat(document.getElementById(`${prefix}-custom-mass`).value) || 0;
    const customUTS = (parseFloat(document.getElementById(`${prefix}-custom-uts`).value) || 0) * 1000; // to Newtons
    const nameEl = document.getElementById(`${prefix}-custom-name`);
    const customName = (nameEl && nameEl.value.trim()) ? nameEl.value.trim() : "Custom Conductor";
    
    return { name: customName, w: customW, mass: customMass, uts: customUTS };
  } else {
    return conductorDatabase[selectKey];
  }
}

// ==========================================================================
// 1. THREE-POINT CALCULATOR ENGINE & VISUALIZER
// ==========================================================================
function calculateThreePoint() {
  // Photo tracker chord calibration reads L/h from these same inputs —
  // refresh it even when this calculator's own inputs are still incomplete.
  if (typeof photoTrackerResolve === 'function') photoTrackerResolve();

  // 1. Get Conductor mechanical properties
  const cond = getConductorSpecs('tp');
  const w = cond.w;
  const uts = cond.uts;

  // 2. Read basic dimensions
  const L = parseFloat(document.getElementById('tp-span').value) || 0;
  const xp = parseFloat(document.getElementById('tp-xp').value) || 0;
  
  if (L <= 0 || xp <= 0 || xp >= L || w <= 0) {
    const nothingEntered = !document.getElementById('tp-span').value.trim() && !document.getElementById('tp-xp').value.trim();
    displayError('tp-results', nothingEntered
      ? 'Enter your field measurements to begin — Span Length L, sighting position xp, and elevation readings. Or use the Photo Sag Tracker / field helper tools above to fill these in.'
      : 'Ensure Span, Position (xp < L), and Conductor specifications are valid.');
    return;
  }

  // 3. Resolve input mode and calculate intermediate sag parameters
  const inputMode = document.getElementById('tp-input-mode').value;
  let h = 0;
  let offsetD = 0;
  let calculationStepsText = "";
  let Z_A = 0, Z_B = 0, Z_P = 0;

  if (inputMode === 'z-coords') {
    Z_A = parseFloat(document.getElementById('tp-za').value) || 0;
    Z_B = parseFloat(document.getElementById('tp-zb').value) || 0;
    Z_P = parseFloat(document.getElementById('tp-zp').value) || 0;

    h = Z_B - Z_A;
    // Y chord at xp: y_chord = ZA + (h / L) * xp
    const yChord = Z_A + (h / L) * xp;
    // sag offset: D = y_chord - ZP
    offsetD = yChord - Z_P;

    calculationStepsText = 
      `1. Height difference between support points (h):\n` +
      `   h = Z_B - Z_A = ${Z_B.toFixed(3)} - ${Z_A.toFixed(3)} = ${h.toFixed(3)} m\n\n` +
      `2. Calculated elevation of the support-to-support chord line at position xp:\n` +
      `   y_chord = Z_A + (h / L) * xp\n` +
      `   y_chord = ${Z_A.toFixed(3)} + (${h.toFixed(3)} / ${L.toFixed(2)}) * ${xp.toFixed(2)}\n` +
      `   y_chord = ${Z_A.toFixed(3)} + (${(h / L).toFixed(6)}) * ${xp.toFixed(2)} = ${yChord.toFixed(3)} m\n\n` +
      `3. Calculated vertical sag offset (D) from the chord line down to the conductor:\n` +
      `   D = y_chord - Z_P = ${yChord.toFixed(3)} - ${Z_P.toFixed(3)} = ${offsetD.toFixed(3)} m\n\n`;
  } else {
    // Direct Offset Mode
    h = parseFloat(document.getElementById('tp-height-diff').value) || 0;
    offsetD = parseFloat(document.getElementById('tp-offset-d').value) || 0;

    Z_A = 140.000;
    Z_B = Z_A + h;
    const yChord = Z_A + (h / L) * xp;
    Z_P = yChord - offsetD;

    calculationStepsText = 
      `1. Input height difference between attachment hooks (h):\n` +
      `   h = ${h.toFixed(3)} m\n\n` +
      `2. Sighted vertical sag offset (D) from the chord line to the conductor:\n` +
      `   D = ${offsetD.toFixed(3)} m\n\n`;
  }

  // 4. Validate resulting vertical offset
  if (offsetD <= 0) {
    displayError('tp-results', 'Calculated sag offset D is negative or zero. Check that the conductor point Z is below the tower hook chord line.');
    return;
  }

  // 5. Horizontal tension. The parabolic field formula is kept for the
  // calculation log, but the HEADLINE figure is the catenary-exact solution
  // (hook-anchored) whenever solvable - on deep-sag spans the parabola
  // under-reads by ~1%+, and one authoritative number beats three.
  const T_par = TLEngine.tensionThreePoint(w, L, xp, offsetD);
  const C_cat = TLEngine.catenaryCFromChordSag(L, h, xp, offsetD);
  const T = C_cat ? w * C_cat : T_par;
  const T_kN = T / 1000;

  // 6. Calculate equivalent mid-span level-ground sag D_mid
  // D_mid = (w * L^2) / (8 * T)
  const dMid = TLEngine.midSpanSag(w, L, T);

  // 7. Safety evaluations
  const pctUTS = (T / uts) * 100;
  const safetyFactor = uts / T;

  // Continue step numbering from whichever input mode produced the offset
  const stepN = (inputMode === 'z-coords') ? 4 : 3;
  calculationStepsText +=
    `${stepN}. Calculate horizontal tension (T) in the conductor:\n` +
    `   T = (w * xp * (L - xp)) / (2 * D)\n` +
    `   T = (${w.toFixed(3)} * ${xp.toFixed(2)} * (${L.toFixed(2)} - ${xp.toFixed(2)})) / (2 * ${offsetD.toFixed(3)})\n` +
    `   T = (${w.toFixed(3)} * ${xp.toFixed(2)} * ${(L - xp).toFixed(2)}) / ${(2 * offsetD).toFixed(3)}\n` +
    `   T = ${(w * xp * (L - xp)).toFixed(1)} / ${(2 * offsetD).toFixed(3)} = ${T_par.toFixed(1)} N = ${(T_par / 1000).toFixed(2)} kN\n\n` +
    `${stepN + 1}. Calculate equivalent level-ground mid-span sag (D_mid):\n` +
    `   D_mid = (w * L^2) / (8 * T)\n` +
    `   D_mid = (${w.toFixed(3)} * ${L.toFixed(2)}^2) / (8 * ${T.toFixed(1)})\n` +
    `   D_mid = ${(w * L * L).toFixed(1)} / ${(8 * T).toFixed(1)} = ${dMid.toFixed(3)} m`;

  if (C_cat) {
    const gapPct = ((T / T_par) - 1) * 100;
    calculationStepsText =
      calculationStepsText.replace(
        `${stepN}. Calculate horizontal tension (T) in the conductor:`,
        `${stepN}. Parabolic field approximation of tension:`) +
      `\n\n${stepN + 2}. Catenary-exact refinement (headline figure):\n` +
      `   Solve C so the catenary through both hooks gives D at xp\n` +
      `   C = ${C_cat.toFixed(1)} m  ->  T = w * C = ${w.toFixed(3)} * ${C_cat.toFixed(1)} = ${T.toFixed(1)} N = ${T_kN.toFixed(2)} kN` +
      (Math.abs(gapPct) >= 0.1 ? `\n   (parabolic approximation is ${Math.abs(gapPct).toFixed(1)}% lower - it under-reads on deep-sag spans)` : `\n   (agrees with the parabolic approximation at this sag ratio)`);
  }

  // Update UI Elements
  document.getElementById('tp-results-error').style.display = 'none';
  document.getElementById('tp-results-ok').style.display = 'block';
  toggleAnalysisPanel(true);

  document.getElementById('tp-val-tension').innerText = `${T_kN.toFixed(2)} kN  ·  ${(T / 9.80665).toFixed(0)} kgf`;

  // If these inputs came from a photo Apply, show the photo's own fitted
  // figure alongside - it follows the traced wire, not the hook clicks.
  const catNote = document.getElementById('tp-catenary-note');
  if (catNote) {
    const ref = window.photoAppliedRef;
    const near = (a, b) => Math.abs(a - b) < 0.05 + Math.abs(b) * 0.001;
    if (ref && ref.T && near(L, ref.L) && near(xp, ref.xp) && near(offsetD, ref.D)) {
      catNote.style.display = 'block';
      catNote.innerHTML = `Photo catenary fit for this span: <strong>${(ref.T / 1000).toFixed(2)} kN</strong>` +
        (ref.band ? ` (90% band ${(ref.band[0] / 1000).toFixed(2)} - ${(ref.band[1] / 1000).toFixed(2)} kN)` : '') +
        ` - fitted through the traced wire itself; the small offset vs the hook-anchored figure above is hook-click uncertainty. For photo-measured spans, prefer the photo figure.` +
        (ref.experimental
          ? `<br><span style="color: var(--danger); font-weight: bold;">⚠ Source: EXPERIMENTAL span-free camera mode${ref.calibrated ? '' : ' (UNCALIBRATED)'} — the span itself was solved from the photo. Cross-check against a known span before acting on ANY figure in this panel.</span>`
          : '');
    } else {
      catNote.style.display = 'none';
    }
  }

  document.getElementById('tp-val-sag').innerText = dMid.toFixed(2) + " m";
  document.getElementById('tp-val-offset').innerText = offsetD.toFixed(2) + " m";
  document.getElementById('tp-val-sf').innerText = safetyFactor.toFixed(2);
  document.getElementById('tp-val-uts-pct').innerText = pctUTS.toFixed(1) + "%";

  document.getElementById('tp-steps').innerText = calculationStepsText;

  // Build Status Verdict Card
  updateStatusVerdict('tp-status-card', pctUTS, safetyFactor, uts, T_kN);

  // ==========================================
  // DRAW SAG VS. TENSION CHART
  // ==========================================
  try {
    const chartSvg = document.getElementById('svg-sag-tension-chart');
    if (chartSvg) {
      const uts_kN = uts / 1000;
      
      // Update Y-Axis threshold labels
      document.getElementById('chart-lbl-uts-20').textContent = `20% UTS (${(0.20 * uts_kN).toFixed(1)} kN)`;
      document.getElementById('chart-lbl-uts-25').textContent = `25% UTS (${(0.25 * uts_kN).toFixed(1)} kN)`;
      document.getElementById('chart-lbl-uts-50').textContent = `50% UTS (${(0.50 * uts_kN).toFixed(1)} kN)`;
      document.getElementById('chart-lbl-uts-max').textContent = `100% UTS (${uts_kN.toFixed(1)} kN)`;

      // Dynamic sag axis: expand beyond the default 1–20 m window when the
      // measured sag is larger (e.g. 80 m slack-stringing river crossings),
      // so the operating point always sits ON the curve, never clamped.
      const sMin = Math.max(0.5, Math.min(1.0, offsetD * 0.3));
      const sMax = Math.max(20.0, offsetD * 1.4);

      // Update x-axis tick labels to the active range
      for (let i = 0; i <= 4; i++) {
        const lbl = document.getElementById('chart-xlbl-' + i);
        if (lbl) {
          const sv = sMin + ((sMax - sMin) * i) / 4;
          lbl.textContent = (sv >= 100 ? sv.toFixed(0) : sv.toFixed(1)) + 'm';
        }
      }

      // Wide chart geometry: plot area x 70..960, y 30..330 (300px = 100% UTS)
      let pathD = "";
      const steps = 95;
      for (let k = 0; k <= steps; k++) {
        const s = sMin + ((sMax - sMin) * k) / steps;
        // Catenary-exact tension for sag s (parabolic fallback)
        const Cs = TLEngine.catenaryCFromChordSag(L, h, xp, s);
        const tempT = Cs ? w * Cs : (w * xp * (L - xp)) / (2 * s); // in Newtons
        const tempP = tempT / uts;

        const curX = 70 + 890 * (s - sMin) / (sMax - sMin);
        const curY = 330 - 300 * tempP;

        // Clamp Y visually within grid boundaries (30 to 330)
        const clampedY = Math.max(30, Math.min(330, curY));

        if (pathD === "") {
          pathD = `M ${curX},${clampedY}`;
        } else {
          pathD += ` L ${curX},${clampedY}`;
        }
      }

      const curvePath = document.getElementById('chart-curve-path');
      if (curvePath) {
        curvePath.setAttribute('d', pathD);
      }

      // Map dynamic active operating dot position
      let dotX = 70 + 890 * (offsetD - sMin) / (sMax - sMin);
      let dotY = 330 - 300 * (T / uts);

      // Clamp active dot within visual grid boundaries
      dotX = Math.max(70, Math.min(960, dotX));
      dotY = Math.max(30, Math.min(330, dotY));

      const activeDot = document.getElementById('chart-active-dot');
      if (activeDot) {
        activeDot.setAttribute('cx', dotX);
        activeDot.setAttribute('cy', dotY);
      }

      // Update Chart Text Overlay
      const overlayVal = document.getElementById('chart-overlay-val');
      if (overlayVal) {
        overlayVal.textContent = `Operating Point: Sag = ${offsetD.toFixed(2)}m, Tension = ${T_kN.toFixed(2)}kN (${pctUTS.toFixed(1)}% UTS)`;
      }
    }
  } catch (err) {
    console.error("SVG Sag-Tension Chart Draw error: ", err);
  }

  // ==========================================
  // STATISTICAL ACCURACY & SENSITIVITY ANALYSIS
  // ==========================================
  try {
    const sensTable = document.getElementById('sens-zp');
    if (sensTable) {
      // Inputs: w, L, xp, Z_A, Z_B, Z_P, T
      // Tolerances: zp = 0.05m, xp = 0.50m, L = 0.20m, za = 0.10m, zb = 0.10m
      const dT_dZP = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.05, 'zp') - T_par;
      const dT_dXp = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.50, 'xp') - T_par;
      const dT_dL = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.20, 'L') - T_par;
      const dT_dZA = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.10, 'za') - T_par;
      const dT_dZB = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.10, 'zb') - T_par;
      
      const dT_dHooks = Math.sqrt(dT_dZA * dT_dZA + dT_dZB * dT_dZB);

      const sensZpPct = (Math.abs(dT_dZP) / T) * 100;
      const sensXpPct = (Math.abs(dT_dXp) / T) * 100;
      const sensLPct = (Math.abs(dT_dL) / T) * 100;
      const sensHooksPct = (dT_dHooks / T) * 100;

      document.getElementById('sens-zp').innerHTML = `± ${sensZpPct.toFixed(1)}%`;
      document.getElementById('sens-xp').innerHTML = `± ${sensXpPct.toFixed(1)}%`;
      document.getElementById('sens-L').innerHTML = `± ${sensLPct.toFixed(1)}%`;
      document.getElementById('sens-hooks').innerHTML = `± ${sensHooksPct.toFixed(1)}%`;

      // Propagated RSS Error (Sigma)
      const sigma_T = Math.sqrt(dT_dZP * dT_dZP + dT_dXp * dT_dXp + dT_dL * dT_dL + dT_dZA * dT_dZA + dT_dZB * dT_dZB);
      const sigma_T_kN = sigma_T / 1000;
      const sigma_T_Pct = (sigma_T / T) * 100;

      const tMin = Math.max(0, T_kN - 2 * sigma_T_kN);
      const tMax = T_kN + 2 * sigma_T_kN;

      document.getElementById('sens-confidence-range').textContent = `${tMin.toFixed(2)} kN  to  ${tMax.toFixed(2)} kN`;
      document.getElementById('sens-verdict').innerHTML = 
        `RMS Error Bound: <strong>± ${sigma_T_kN.toFixed(2)} kN (${sigma_T_Pct.toFixed(1)}%)</strong> w.r.t. gravity projection references.`;
    }
  } catch (err) {
    console.error("Sensitivity calculations error: ", err);
  }

  // ==========================================
  // REDRAW SVG THREE-POINT VISUALIZER
  // ==========================================
  try {
    const ratio_p = xp / L;
    
    // Scale slope height 'h' to screen pixels dynamically
    // Keep it proportionate to slope h/L (with a standard visual scale)
    // Unified metres->pixels scale so steep slopes (large ±h) and deep sags
    // always fit the canvas. Tower A is fixed art at y=140; keep the whole
    // conductor within y 40..265. down(r) = −h·r + 4·D_mid·r(1−r) [m below A].
    let maxDown = 0, minDown = 0;
    for (let i = 0; i <= 20; i++) {
      const rr = i / 20;
      const dwn = -h * rr + 4 * dMid * rr * (1 - rr);
      if (dwn > maxDown) maxDown = dwn;
      if (dwn < minDown) minDown = dwn;
    }
    let sPx = 10; // preferred scale: 10 px per metre
    if (maxDown > 0) sPx = Math.min(sPx, 125 / maxDown);
    if (minDown < 0) sPx = Math.min(sPx, 100 / -minDown);
    const hScreen = h * sPx;
    const scaleX = 80 + ratio_p * 600;
    
    const supportA_Y = 140;
    const supportB_Y = 140 - hScreen;
    
    // Scale mid-span sag to screen: 1 meter = 10 visual pixels
    const screenSag = Math.max(2, dMid * sPx);

    // Update Tower B on screen (including stretching support legs)
    document.getElementById('tower-b-center').setAttribute('y1', supportB_Y);
    document.getElementById('tower-b-leg-l').setAttribute('y1', supportB_Y);
    document.getElementById('tower-b-leg-r').setAttribute('y1', supportB_Y);
    document.getElementById('svg-threepoint').querySelector('circle[cx="680"]').setAttribute('cy', supportB_Y);
    document.getElementById('svg-threepoint').querySelector('text[x="685"]').setAttribute('y', supportB_Y - 5);

    // Keep Tower B's crossarm and insulator riding at the hook
    const armB = document.getElementById('tower-b-arm');
    if (armB) { armB.setAttribute('y1', supportB_Y - 4); armB.setAttribute('y2', supportB_Y - 4); }
    const insB = document.getElementById('tower-b-ins');
    if (insB) { insB.setAttribute('y1', supportB_Y - 4); insB.setAttribute('y2', supportB_Y); }

    // Update Chord line connecting support hooks
    document.getElementById('chord-line-3pt').setAttribute('y2', supportB_Y);

    // Draw the parabolic conductor
    let pathStr = `M 80,${supportA_Y} `;
    for (let x = 80; x <= 680; x += 10) {
      const r = (x - 80) / 600;
      const y = supportA_Y + (supportB_Y - supportA_Y) * r + 4 * screenSag * r * (1 - r);
      pathStr += `L ${x},${y} `;
    }
    document.getElementById('conductor-3pt').setAttribute('d', pathStr);
    const casing = document.getElementById('conductor-casing');
    if (casing) casing.setAttribute('d', pathStr);

    // Calculate Y coordinates at measurement point P on wire
    const pY = supportA_Y + (supportB_Y - supportA_Y) * ratio_p + 4 * screenSag * ratio_p * (1 - ratio_p);
    const chord_pY = supportA_Y + (supportB_Y - supportA_Y) * ratio_p;

    // Move marker dot P on wire
    const dot = document.getElementById('point-p');
    dot.setAttribute('cx', scaleX);
    dot.setAttribute('cy', pY);
    
    const labelP = document.getElementById('label-point-p');
    labelP.setAttribute('x', scaleX + 10);
    labelP.setAttribute('y', pY - 5);
    labelP.textContent = `P (${xp.toFixed(1)}m, ${inputMode === 'z-coords' ? Z_P.toFixed(1) + "m" : "Wire"})`;

    // Move laser lines from Ground Total Station (tripod top is 350, 245)
    document.getElementById('laser-b').setAttribute('y2', supportB_Y);
    document.getElementById('laser-p').setAttribute('x2', scaleX);
    document.getElementById('laser-p').setAttribute('y2', pY);

    // Vertical offset indicator bracket
    const offsetIndicator = document.getElementById('chord-line-offset');
    offsetIndicator.setAttribute('x1', scaleX);
    offsetIndicator.setAttribute('y1', chord_pY);
    offsetIndicator.setAttribute('x2', scaleX);
    offsetIndicator.setAttribute('y2', pY);

    const offsetLabel = document.getElementById('label-sag-offset');
    offsetLabel.setAttribute('x', scaleX + 10);
    offsetLabel.setAttribute('y', (chord_pY + pY)/2);
    offsetLabel.textContent = `D(${xp.toFixed(1)}m) = ${offsetD.toFixed(2)} m`;

    // Dynamic Updates for Gravity-Referenced Dimension overlays
    document.getElementById('tp-dim-L-text').textContent = `L = ${L.toFixed(1)} m`;
    
    const dimXp = document.getElementById('tp-dim-xp');
    dimXp.setAttribute('x2', scaleX);
    
    const dimXpTicks = document.getElementById('tp-dim-xp-ticks');
    dimXpTicks.setAttribute('d', `M 80,280 L 80,290 M ${scaleX},280 L ${scaleX},290`);
    
    const dimXpText = document.getElementById('tp-dim-xp-text');
    dimXpText.setAttribute('x', (80 + scaleX) / 2);
    dimXpText.textContent = `xp = ${xp.toFixed(1)} m`;

    const dimH = document.getElementById('tp-dim-h');
    dimH.setAttribute('y1', supportA_Y);
    dimH.setAttribute('y2', supportB_Y);

    const dimHTicks = document.getElementById('tp-dim-h-ticks');
    dimHTicks.setAttribute('d', `M 715,${supportA_Y} L 725,${supportA_Y} M 715,${supportB_Y} L 725,${supportB_Y}`);

    const extA = document.getElementById('tp-ext-A');
    extA.setAttribute('y1', supportA_Y);
    extA.setAttribute('y2', supportA_Y);

    const extB = document.getElementById('tp-ext-B');
    extB.setAttribute('y1', supportB_Y);
    extB.setAttribute('y2', supportB_Y);

    const dimHText = document.getElementById('tp-dim-h-text');
    dimHText.setAttribute('y', (supportA_Y + supportB_Y) / 2 + 3);
    dimHText.textContent = `h = ${h.toFixed(2)} m`;
  } catch (err) {
    console.error("SVG Three-Point Redraw error: ", err);
  }

  // ==========================================
  // TEMPERATURE VARIATION (CHANGE OF STATE)
  // ==========================================
  try {
    updateTemperaturePlot(T, w, L, cond);
  } catch (err) {
    console.error("Temperature plot error: ", err);
  }
}

// Tension/sag vs conductor temperature. The field can only know AMBIENT
// temperature, so the anchor is bracketed: conductor temperature at the
// moment of measurement lies between ambient and ambient + a condition-based
// solar/load rise. The result is an honest BAND, collapsing to a single
// curve when an IR-measured conductor temperature is supplied. Includes an
// explicit cold-condition check (default -10 C) for winter safety.
function updateTemperaturePlot(T, w, L, cond) {
  const wrap = document.getElementById('temp-plot-wrap');
  if (!wrap) return;

  if (!(cond.area > 0) || !(cond.E > 0) || !(cond.alpha > 0)) {
    wrap.innerHTML = '<div style="color: var(--text-muted); font-size: 0.88rem; padding: 0.4rem 0;">Temperature analysis needs the conductor elastic modulus, cross-section area and expansion coefficient — available for the built-in ACSR catalogue conductors.</div>';
    return;
  }

  const ambient = parseFloat(document.getElementById('tp-temp-meas').value);
  const irTemp = parseFloat((document.getElementById('tp-temp-cond') || {}).value);
  const rise = parseFloat((document.getElementById('tp-temp-rise') || {}).value) || 0;
  let tCold = parseFloat((document.getElementById('tp-temp-cold') || {}).value);
  if (isNaN(tCold)) tCold = -10;

  if (isNaN(ambient) && isNaN(irTemp)) {
    wrap.innerHTML = '<div style="color: var(--warning); font-size: 0.88rem; padding: 0.4rem 0;">⬆ Enter the ambient temperature at the time of measurement (and pick the conditions) to project tension and sag from −20 to 85 °C, including the winter cold-condition check. Tip: measuring early morning / overcast at minimum load makes conductor ≈ ambient almost exact.</div>';
    return;
  }

  // Anchor temperatures: an IR reading collapses the band to one curve.
  const anchors = !isNaN(irTemp)
    ? [{ t: irTemp, label: 'measured (IR) @ ' + irTemp + '°C' }]
    : (rise > 0
      ? [{ t: ambient, label: 'if conductor ≈ ambient (' + ambient + '°C)' },
         { t: ambient + rise, label: 'if conductor ran +' + rise + '°C above ambient' }]
      : [{ t: ambient, label: 'conductor ≈ ambient @ ' + ambient + '°C' }]);

  const EA = cond.E * 1e9 * cond.area * 1e-6; // N
  const tLo = Math.min(-20, Math.floor(tCold / 5) * 5), tHi = 85;
  const curves = anchors.map(a => {
    const pts = [];
    for (let t = tLo; t <= tHi; t += 1) {
      pts.push({ t: t, T: TLEngine.changeOfState(T, a.t, t, w, L, EA, cond.alpha) });
    }
    return pts;
  });

  const allT = [];
  curves.forEach(c => c.forEach(p => allT.push(p.T)));
  const Tmax = Math.max.apply(null, allT), Tmin = Math.min.apply(null, allT);
  const pad = (Tmax - Tmin) * 0.12 || Tmax * 0.05;
  const yTop = Tmax + pad, yBot = Math.max(0, Tmin - pad);

  const X0 = 70, X1 = 960, Y0 = 40, Y1 = 300;
  const xOf = t => X0 + (X1 - X0) * (t - tLo) / (tHi - tLo);
  const yOf = Tn => Y1 - (Y1 - Y0) * (Tn - yBot) / (yTop - yBot);

  let grid = '';
  for (let t = Math.ceil(tLo / 10) * 10; t <= tHi; t += 10) {
    grid += `<line x1="${xOf(t)}" y1="${Y0}" x2="${xOf(t)}" y2="${Y1}" stroke="#e2e8f0" stroke-width="0.6"/>` +
            `<text x="${xOf(t)}" y="${Y1 + 18}" font-size="11" text-anchor="middle" fill="var(--text-muted)">${t}°</text>`;
  }
  let yTicks = '';
  for (let i = 0; i <= 4; i++) {
    const Tv = yBot + ((yTop - yBot) * i) / 4;
    yTicks += `<line x1="${X0}" y1="${yOf(Tv)}" x2="${X1}" y2="${yOf(Tv)}" stroke="#e2e8f0" stroke-width="0.6"/>` +
              `<text x="${X0 - 6}" y="${yOf(Tv) + 4}" font-size="11" text-anchor="end" fill="var(--text-muted)">${(Tv / 1000).toFixed(1)}</text>`;
  }

  const pathOf = pts => pts.map((p, i) => `${i ? 'L' : 'M'} ${xOf(p.t).toFixed(1)},${yOf(p.T).toFixed(1)}`).join(' ');

  let bandSvg = '';
  if (curves.length === 2) {
    const fwd = curves[0].map(p => `${xOf(p.t).toFixed(1)},${yOf(p.T).toFixed(1)}`);
    const back = curves[1].slice().reverse().map(p => `${xOf(p.t).toFixed(1)},${yOf(p.T).toFixed(1)}`);
    bandSvg = `<polygon points="${fwd.concat(back).join(' ')}" fill="var(--primary)" opacity="0.12"/>`;
  }
  let curveSvg = '';
  curves.forEach((pts, i) => {
    curveSvg += `<path d="${pathOf(pts)}" fill="none" stroke="var(--primary)" stroke-width="2.2"${i === 1 ? ' stroke-dasharray="7,4"' : ''}/>`;
  });
  let anchorSvg = '';
  anchors.forEach((a, i) => {
    anchorSvg += `<circle cx="${xOf(a.t)}" cy="${yOf(T)}" r="5.5" class="chart-dot"/>` +
                 `<text x="${xOf(a.t) + 8}" y="${Y0 + 14 + i * 15}" font-size="11" font-weight="bold" fill="var(--success)">${a.label}</text>`;
  });

  // Cold-condition marker + worst case
  const coldTs = anchors.map(a => TLEngine.changeOfState(T, a.t, tCold, w, L, EA, cond.alpha));
  const coldWorst = Math.max.apply(null, coldTs);
  const coldBest = Math.min.apply(null, coldTs);
  const coldPct = (coldWorst / cond.uts) * 100;
  const coldSvg =
    `<line x1="${xOf(tCold)}" y1="${Y0}" x2="${xOf(tCold)}" y2="${Y1}" stroke="var(--danger)" stroke-width="1.4" stroke-dasharray="6,4"/>` +
    `<text x="${xOf(tCold) + 6}" y="${Y1 - 8}" font-size="11" font-weight="bold" fill="var(--danger)">cold check ${tCold}°C</text>`;

  const svg =
    `<svg id="svg-temp-chart" class="chart-svg" viewBox="0 0 1000 360">` +
    grid + yTicks + bandSvg +
    `<line x1="${X0}" y1="${Y1}" x2="${X1}" y2="${Y1}" class="chart-axis"/>` +
    `<line x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y1}" class="chart-axis"/>` +
    curveSvg + coldSvg + anchorSvg +
    `<text x="${(X0 + X1) / 2}" y="345" font-size="12" text-anchor="middle" font-weight="bold" fill="var(--text-main)">Conductor Temperature (°C)</text>` +
    `<text x="24" y="${(Y0 + Y1) / 2}" font-size="12" text-anchor="middle" font-weight="bold" fill="var(--text-main)" transform="rotate(-90 24 ${(Y0 + Y1) / 2})">Horizontal Tension T (kN)</text>` +
    `</svg>`;

  // Cold-condition verdict (static tension only — wind/ice not modelled)
  let vColor = 'var(--success)', vTitle = 'WITHIN EVERYDAY LIMIT';
  if (coldPct > 50) { vColor = 'var(--danger)'; vTitle = 'EXCEEDS 50% UTS LIMIT'; }
  else if (coldPct > 25) { vColor = 'var(--warning)'; vTitle = 'ABOVE EVERYDAY RANGE — CAUTION'; }
  else if (coldPct > 20) { vColor = 'var(--warning)'; vTitle = 'BORDERLINE EVERYDAY LIMIT'; }
  const rangeTxt = curves.length === 2
    ? `${(coldBest / 1000).toFixed(2)} – ${(coldWorst / 1000).toFixed(2)} kN (${(coldBest / 9.80665).toFixed(0)} – ${(coldWorst / 9.80665).toFixed(0)} kgf)`
    : `${(coldWorst / 1000).toFixed(2)} kN (${(coldWorst / 9.80665).toFixed(0)} kgf)`;
  const verdict =
    `<div style="border: 1px solid var(--border); border-left: 6px solid ${vColor}; border-radius: 10px; padding: 0.7rem 1rem; margin-top: 0.8rem; background: var(--bg-input);">` +
    `<div style="font-weight: 800; color: ${vColor};">❄ COLD-CONDITION ESTIMATE AT ${tCold} °C: ${vTitle}</div>` +
    `<div style="font-size: 0.88rem; margin-top: 0.2rem;">Estimated static tension: <strong>${rangeTxt}</strong> — worst case <strong>${coldPct.toFixed(1)}% of UTS</strong>. ` +
    `Static (no wind / no ice) estimate: formal IS 802 loading checks add wind and ice cases on top of this.</div></div>`;

  // Key-temperature table (band-aware)
  const keySet = {};
  [tCold, 0, 15, 32, 45, 65, 85].concat(anchors.map(a => Math.round(a.t))).forEach(t => { keySet[t] = true; });
  const keyTemps = Object.keys(keySet).map(Number).sort((a, b) => a - b);
  const fmt = vals => {
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    return (hi - lo) / hi > 0.005
      ? { kn: `${(lo / 1000).toFixed(2)}–${(hi / 1000).toFixed(2)}`, kgf: `${(lo / 9.80665).toFixed(0)}–${(hi / 9.80665).toFixed(0)}`, sag: `${((w * L * L) / (8 * hi)).toFixed(2)}–${((w * L * L) / (8 * lo)).toFixed(2)}`, pct: `${((lo / cond.uts) * 100).toFixed(1)}–${((hi / cond.uts) * 100).toFixed(1)}` }
      : { kn: (hi / 1000).toFixed(2), kgf: (hi / 9.80665).toFixed(0), sag: ((w * L * L) / (8 * hi)).toFixed(2), pct: ((hi / cond.uts) * 100).toFixed(1) };
  };
  let rows = '';
  for (const t of keyTemps) {
    const vals = anchors.map(a => TLEngine.changeOfState(T, a.t, t, w, L, EA, cond.alpha));
    const f = fmt(vals);
    const isCold = t === tCold;
    rows += `<tr${isCold ? ' style="background: rgba(185, 28, 28, 0.06); font-weight: bold;"' : ''}>` +
      `<td style="border: 1px solid var(--border); padding: 0.35rem 0.6rem;">${t} °C${isCold ? ' ❄ cold check' : ''}</td>` +
      `<td style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right; font-family: var(--font-mono);">${f.kn} kN</td>` +
      `<td style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right; font-family: var(--font-mono);">${f.kgf} kgf</td>` +
      `<td style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right; font-family: var(--font-mono);">${f.sag} m</td>` +
      `<td style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right; font-family: var(--font-mono);">${f.pct} %</td></tr>`;
  }
  const table =
    `<table class="report-table" style="font-size: 0.8rem; width: 100%; border-collapse: collapse; margin-top: 0.8rem;">` +
    `<thead><tr style="background: var(--bg-dark);">` +
    `<th style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: left;">Conductor Temp</th>` +
    `<th style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right;">Tension</th>` +
    `<th style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right;">Tension (kgf)</th>` +
    `<th style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right;">Mid-Span Sag</th>` +
    `<th style="border: 1px solid var(--border); padding: 0.35rem 0.6rem; text-align: right;">% UTS</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Parabolic change-of-state (level-span approximation) with typical final-modulus values: E = ${cond.E} GPa, A = ${cond.area} mm², α = ${(cond.alpha * 1e6).toFixed(1)}×10⁻⁶/°C for ${cond.name} — verify against the conductor datasheet for critical studies. Creep and ice/wind load changes are not modelled.${curves.length === 2 ? ' The band spans the unknown conductor temperature at measurement (ambient … ambient + condition rise); quoted ranges are the exact bounds of that assumption.' : ''} Best practice: measure at minimum load, early morning or overcast — conductor ≈ ambient is then nearly exact.</div>`;

  wrap.innerHTML = svg + verdict + table;
}

// ==========================================================================
// 2. RETURN WAVE CALCULATOR ENGINE & VISUALIZER
// ==========================================================================
let isWaveRunning = false;
let waveAnimId = null;
let waveStartTime = 0;
let currentWaveSagOnScreen = 60; // dynamic mapping from sag to screen pixels

function calculateWaveTiming() {
  // 1. Get Conductor mechanical properties
  const cond = getConductorSpecs('wave');
  const mass = cond.mass;
  const uts = cond.uts;
  const g = 9.81;

  // 2. Read dimensions and timing
  const L = parseFloat(document.getElementById('wave-span').value) || 0;
  const N = parseFloat(document.getElementById('wave-returns').value) || 0;
  const t = parseFloat(document.getElementById('wave-time').value) || 0;

  if (L <= 0 || N <= 0 || t <= 0 || mass <= 0) {
    displayError('wave-results', 'Ensure Span L, Return count N, stopwatch time t, and conductor parameters are valid.');
    return;
  }

  // 3. Compute Sag directly from stopwatch time:
  // d = (g * t^2) / (32 * N^2)
  const sag = (g * t * t) / (32 * N * N);

  // 4. Compute horizontal tension T:
  // T = (mass * g * L^2) / (8 * sag)
  const w = mass * g;
  const T = (w * L * L) / (8 * sag);
  const T_kN = T / 1000;

  // 5. Safety checks
  const pctUTS = (T / uts) * 100;
  const safetyFactor = uts / T;

  const calculationStepsText = 
    `1. Calculate conductor sag (d) directly from stopwatch return time:\n` +
    `   d = (g * t^2) / (32 * N^2)\n` +
    `   d = (9.81 * ${t.toFixed(2)}^2) / (32 * ${N}^2)\n` +
    `   d = (9.81 * ${(t * t).toFixed(4)}) / ${32 * N * N}\n` +
    `   d = ${(g * t * t).toFixed(3)} / ${32 * N * N} = ${sag.toFixed(3)} m\n\n` +
    `2. Calculate unit weight of conductor (w):\n` +
    `   w = mass * g = ${mass.toFixed(3)} * 9.81 = ${w.toFixed(3)} N/m\n\n` +
    `3. Calculate horizontal tension (T) from the sag:\n` +
    `   T = (w * L^2) / (8 * d)\n` +
    `   T = (${w.toFixed(3)} * ${L.toFixed(2)}^2) / (8 * ${sag.toFixed(3)})\n` +
    `   T = ${(w * L * L).toFixed(1)} / ${(8 * sag).toFixed(3)} = ${T.toFixed(1)} N = ${T_kN.toFixed(2)} kN`;

  // Update UI Elements
  document.getElementById('wave-results-error').style.display = 'none';
  document.getElementById('wave-results-ok').style.display = 'block';

  document.getElementById('wave-val-tension').innerText = T_kN.toFixed(2) + " kN";
  document.getElementById('wave-val-sag').innerText = sag.toFixed(2) + " m";
  document.getElementById('wave-val-sf').innerText = safetyFactor.toFixed(2);
  document.getElementById('wave-val-uts-pct').innerText = pctUTS.toFixed(1) + "%";

  document.getElementById('wave-steps').innerText = calculationStepsText;

  // Build Status Verdict Card
  updateStatusVerdict('wave-status-card', pctUTS, safetyFactor, uts, T_kN);

  // ==========================================
  // REDRAW SVG WAVE TIMING VISUALIZER
  // ==========================================
  try {
    // Update screen sag visually: Map physical sag to screen pixels
    // Standard scale: 1 meter sag = 6 pixels on screen
    currentWaveSagOnScreen = Math.max(20, Math.min(180, sag * 6));

    // Redraw conductor curve to visually match the tension setting
    let pathStr = "M 80,120 ";
    for (let x = 80; x <= 680; x += 10) {
      const r = (x - 80) / 600;
      const y = 120 + 4 * currentWaveSagOnScreen * r * (1 - r);
      pathStr += `L ${x},${y} `;
    }
    document.getElementById('conductor-wave').setAttribute('d', pathStr);

    // Dynamic Updates for Gravity-Referenced Dimension overlays in Wave timing SVG
    document.getElementById('wave-dim-L-text').textContent = `L = ${L.toFixed(1)} m (Horizontal Span w.r.t. Gravity)`;

    const dimD = document.getElementById('wave-dim-d');
    dimD.setAttribute('y2', 120 + currentWaveSagOnScreen);

    const dimDText = document.getElementById('wave-dim-d-text');
    dimDText.setAttribute('y', 120 + currentWaveSagOnScreen / 2 + 3);
    dimDText.textContent = `d = ${sag.toFixed(2)} m (Mid-span Sag)`;
  } catch (err) {
    console.error("SVG Wave Timing Redraw error: ", err);
  }
}

// Wave Timing Simulation trigger
function startWaveSimulation() {
  if (isWaveRunning) return;
  isWaveRunning = true;
  document.getElementById('kick-btn').disabled = true;

  const pulse = document.getElementById('wave-pulse');
  pulse.style.display = 'block';

  const totalReturns = parseFloat(document.getElementById('wave-returns').value) || 3;
  let currentReturns = 0;
  
  const mass = parseFloat(document.getElementById('wave-custom-mass').value) || getConductorSpecs('wave').mass;
  const L = parseFloat(document.getElementById('wave-span').value);
  const tRecorded = parseFloat(document.getElementById('wave-time').value);
  
  // Predict stopwatch timing based on selected parameters
  // Velocity = sqrt( T / mass )
  const cond = getConductorSpecs('wave');
  const w = mass * 9.81;
  const T = (w * L * L) / (8 * (9.81 * tRecorded * tRecorded / (32 * totalReturns * totalReturns))); // in Newtons
  
  const velocity = Math.sqrt(T / mass); 
  const timePerTrip = (2 * L) / velocity;
  const totalTimeRequired = timePerTrip * totalReturns;

  waveStartTime = performance.now();
  
  function animateWave(now) {
    const elapsed = (now - waveStartTime) / 1000; // seconds
    
    if (elapsed >= totalTimeRequired) {
      document.getElementById('stopwatch-display').innerText = totalTimeRequired.toFixed(2) + "s";
      document.getElementById('returns-count').innerText = `${totalReturns} / ${totalReturns}`;
      pulse.style.display = 'none';
      isWaveRunning = false;
      document.getElementById('kick-btn').disabled = false;
      return;
    }

    document.getElementById('stopwatch-display').innerText = elapsed.toFixed(2) + "s";
    currentReturns = Math.floor(elapsed / timePerTrip);
    document.getElementById('returns-count').innerText = `${currentReturns} / ${totalReturns}`;

    const localElapsed = elapsed % timePerTrip;
    const halfTrip = timePerTrip / 2;
    let xRatio = 0;
    
    if (localElapsed < halfTrip) {
      xRatio = localElapsed / halfTrip;
    } else {
      xRatio = 1 - ((localElapsed - halfTrip) / halfTrip);
    }

    const pulseX = 80 + xRatio * 600;
    // Pulse Y rides perfectly on the dynamic conductor curve
    const pulseY = 120 + (4 * currentWaveSagOnScreen * xRatio * (1 - xRatio));

    pulse.setAttribute('cx', pulseX);
    pulse.setAttribute('cy', pulseY);

    waveAnimId = requestAnimationFrame(animateWave);
  }

  requestAnimationFrame(animateWave);
}

// Render error messaging to UI panels
function displayError(prefixId, message) {
  document.getElementById(`${prefixId}-ok`).style.display = 'none';
  document.getElementById(`${prefixId}-error`).style.display = 'block';
  document.getElementById(`${prefixId}-error-msg`).innerText = message;
  // The full-width analysis panel mirrors the three-point results state.
  if (prefixId === 'tp-results') toggleAnalysisPanel(false);
}

function toggleAnalysisPanel(show) {
  const panel = document.getElementById('tp-analysis-panel');
  if (panel) panel.style.display = show ? 'block' : 'none';
}

// Generate Safety Verdict Dashboard Card
function updateStatusVerdict(cardId, pctUTS, safetyFactor, uts, T_kN) {
  const card = document.getElementById(cardId);
  const badge = card.querySelector('.status-badge');
  const title = card.querySelector('.status-title');
  const desc = card.querySelector('.status-desc');
  const gaugeFill = card.querySelector('.gauge-fill');
  const gaugeValLabel = card.querySelector('.gauge-val-label');

  // Reset classes
  card.className = "status-card";
  
  // Limit gauge fill percentage on UI to 100%
  const visualGaugePct = Math.min(100, pctUTS);
  gaugeFill.style.width = `${visualGaugePct}%`;
  gaugeValLabel.innerText = `${pctUTS.toFixed(1)}% of Conductor UTS`;

  // Evaluate structural codes
  if (pctUTS <= 20.0) {
    card.classList.add('safe');
    badge.innerText = "SAFE";
    title.innerText = "Conductor Tension: SAFE";
    desc.innerText = `Everyday Tension is within safe limits (${pctUTS.toFixed(1)}% of UTS). This complies fully with standard utility codes, keeping the line safe from long-term vibration fatigue.`;
  } else if (pctUTS > 20.0 && pctUTS <= 25.0) {
    card.classList.add('caution');
    badge.innerText = "CAUTION";
    title.innerText = "Conductor Tension: BORDERLINE";
    desc.innerText = `Everyday Tension (${pctUTS.toFixed(1)}% of UTS) lies at the borderline limit. High risk of long-term aeolian vibration fatigue. Clamping Stockbridge vibration dampers is highly recommended.`;
  } else if (pctUTS > 25.0 && pctUTS <= 50.0) {
    card.classList.add('caution');
    badge.innerText = "CAUTION";
    title.innerText = "High Operating Tension Alert";
    desc.innerText = `Tension (${pctUTS.toFixed(1)}% of UTS) exceeds standard everyday tension limits, but remains within design margins for wind/ice loads. Conductor is safe from immediate mechanical breakage but requires extensive vibration damping systems.`;
  } else {
    card.classList.add('danger');
    badge.innerText = "UNSAFE";
    title.innerText = "OVER-TENSIONED VIOLATION";
    desc.innerText = `CRITICAL FAILURE RISK: Conductor tension (${pctUTS.toFixed(1)}% of UTS) exceeds the utility code absolute limit of 50%. The conductor is drawn dangerously tight and is highly prone to structural fatigue failure or immediate snapping under stormy wind loads. Relieve tension immediately.`;
  }
}

// ==========================================================================
// 3. OFFICIAL CALCULATION SHEET - BROWSER PRINT GENERATOR
// ==========================================================================
function printEngineeringReport() {
  // Bind form variables dynamically to the printable DOM elements before printing

  // A. Adaptive metadata table — report only what the user actually entered.
  const gv = id => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
  const gpsText = (lat, lon, elev) => {
    const coords = [lat, lon].filter(Boolean).join(' / ');
    if (!coords && !elev) return '';
    return coords + (elev ? `${coords ? ' ' : ''}(Elev: ${elev} m)` : '');
  };
  const metaFields = [
    ['Project Reference', currentProject.name],
    ['Line Voltage Level', gv('line-voltage')],
    ['Line Circuits Config', gv('line-circuits')],
    ['Lower Tower A ID', gv('tower-a-id')],
    ['Higher Tower B ID', gv('tower-b-id')],
    ['Circuits Configuration', gv('line-config')],
    ['Conductor Bundling', gv('line-bundling')],
    ['Earth Peaks / Earthwires', gv('line-peaks')],
    ['Earthwire/OPGW Spec', gv('line-opgw-size')],
    ['Tower A Coordinates', gpsText(gv('tower-a-lat'), gv('tower-a-lon'), gv('tower-a-elev'))],
    ['Tower B Coordinates', gpsText(gv('tower-b-lat'), gv('tower-b-lon'), gv('tower-b-elev'))]
  ].filter(f => f[1]);

  const metaBody = document.getElementById('pr-meta-body');
  if (metaBody) {
    let html = '';
    for (let i = 0; i < metaFields.length; i += 2) {
      const a = metaFields[i], b = metaFields[i + 1];
      html += `<tr><th style="width: 25%;">${a[0]}</th><td style="width: 25%; font-weight: bold;">${escapeHtml(a[1])}</td>`;
      html += b
        ? `<th style="width: 25%;">${b[0]}</th><td style="width: 25%;">${escapeHtml(b[1])}</td></tr>`
        : `<th style="width: 25%;"></th><td style="width: 25%;"></td></tr>`;
    }
    metaBody.innerHTML = html || '<tr><td style="color: #777777;">No line metadata entered for this session.</td></tr>';
  }

  // Timestamp + generating app version (traceability of engineering outputs)
  document.getElementById('pr-date').innerText = new Date().toLocaleString();
  const prVer = document.getElementById('pr-app-version');
  if (prVer) prVer.innerText = 'v' + APP_VERSION;

  // B. Method-specific content
  const reportVerdictBox = document.getElementById('pr-verdict-box');
  reportVerdictBox.className = "print-verdict-box";

  if (activeTab === "threepoint-pane") {
    // Three-point method data binding
    const cond = getConductorSpecs('tp');
    const span = parseFloat(document.getElementById('tp-span').value) || 0;
    const tension = document.getElementById('tp-val-tension').innerText;
    const sag = document.getElementById('tp-val-sag').innerText;
    const sf = document.getElementById('tp-val-sf').innerText;
    const pct = document.getElementById('tp-val-uts-pct').innerText;
    const steps = document.getElementById('tp-steps').innerText;
    const statusCard = document.getElementById('tp-status-card');

    document.getElementById('pr-method').innerText = "Three-Point Surveyor Method (Direct Coordinate Sighting)";
    document.getElementById('pr-span').innerText = span.toFixed(2) + " m";
    document.getElementById('pr-cond-name').innerText = cond.name;
    document.getElementById('pr-cond-w').innerText = cond.w.toFixed(3) + " N/m";
    document.getElementById('pr-cond-uts').innerText = (cond.uts / 1000).toFixed(1) + " kN";
    
    document.getElementById('pr-calc-tension').innerText = tension;
    document.getElementById('pr-calc-sag').innerText = sag;
    document.getElementById('pr-calc-sf').innerText = sf;
    document.getElementById('pr-calc-uts-pct').innerText = pct;
    document.getElementById('pr-math-steps').innerText = steps;

    // Apply safety status banner color to A4 sheet
    if (statusCard.classList.contains('safe')) {
      reportVerdictBox.classList.add('print-safe');
      document.getElementById('pr-verdict-title').innerText = "ASSESSMENT: ESTIMATED TENSION WITHIN SAFE LIMITS";
      document.getElementById('pr-verdict-desc').innerText = "The estimated everyday tension lies within safety code guidelines (<20% of Conductor UTS), indicating low risk of long-term aeolian vibration fatigue. Estimate is subject to the measurement uncertainties stated in this report.";
    } else if (statusCard.classList.contains('caution')) {
      reportVerdictBox.classList.add('print-caution');
      document.getElementById('pr-verdict-title').innerText = "ASSESSMENT: BORDERLINE ESTIMATE — CAUTION ADVISED";
      document.getElementById('pr-verdict-desc').innerText = "The estimated tension is within maximum design structural load limits but exceeds everyday vibration guidelines. Verification by direct measurement and installation of Stockbridge dampers are recommended.";
    } else {
      reportVerdictBox.classList.add('print-danger');
      document.getElementById('pr-verdict-title').innerText = "ASSESSMENT: ESTIMATE EXCEEDS SAFE TENSION LIMIT";
      document.getElementById('pr-verdict-desc').innerText = "The estimated everyday tension exceeds the 50% UTS utility guideline, indicating elevated risk of conductor fatigue or breakage. Field verification and tension readjustment are strongly advised.";
    }
  } else {
    // Wave timing method data binding
    const cond = getConductorSpecs('wave');
    const span = parseFloat(document.getElementById('wave-span').value) || 0;
    const tension = document.getElementById('wave-val-tension').innerText;
    const sag = document.getElementById('wave-val-sag').innerText;
    const sf = document.getElementById('wave-val-sf').innerText;
    const pct = document.getElementById('wave-val-uts-pct').innerText;
    const steps = document.getElementById('wave-steps').innerText;
    const statusCard = document.getElementById('wave-status-card');

    document.getElementById('pr-method').innerText = "Return Wave Timing Method (Stopwatch Vibration Reflection)";
    document.getElementById('pr-span').innerText = span.toFixed(2) + " m";
    document.getElementById('pr-cond-name').innerText = cond.name;
    document.getElementById('pr-cond-w').innerText = (cond.mass * 9.81).toFixed(3) + " N/m";
    document.getElementById('pr-cond-uts').innerText = (cond.uts / 1000).toFixed(1) + " kN";
    
    document.getElementById('pr-calc-tension').innerText = tension;
    document.getElementById('pr-calc-sag').innerText = sag;
    document.getElementById('pr-calc-sf').innerText = sf;
    document.getElementById('pr-calc-uts-pct').innerText = pct;
    document.getElementById('pr-math-steps').innerText = steps;

    // Apply safety status banner color to A4 sheet
    if (statusCard.classList.contains('safe')) {
      reportVerdictBox.classList.add('print-safe');
      document.getElementById('pr-verdict-title').innerText = "ASSESSMENT: ESTIMATED TENSION WITHIN SAFE LIMITS";
      document.getElementById('pr-verdict-desc').innerText = "The tension estimated from wave timing lies within code guidelines (<20% of Conductor UTS). Estimate is subject to stopwatch and span-length uncertainties.";
    } else if (statusCard.classList.contains('caution')) {
      reportVerdictBox.classList.add('print-caution');
      document.getElementById('pr-verdict-title').innerText = "ASSESSMENT: BORDERLINE ESTIMATE — CAUTION ADVISED";
      document.getElementById('pr-verdict-desc').innerText = "The estimated tension exceeds everyday vibration guidelines but remains within storm loading margins. Verification and vibration dampers are recommended.";
    } else {
      reportVerdictBox.classList.add('print-danger');
      document.getElementById('pr-verdict-title').innerText = "ASSESSMENT: ESTIMATE EXCEEDS SAFE TENSION LIMIT";
      document.getElementById('pr-verdict-desc').innerText = "The estimated tension exceeds the 50% UTS utility guideline. Field verification and tension readjustment are strongly advised.";
    }
  }

  // C. Photo Sag Tracker section — annotated span photograph + fit summary
  const annex = document.getElementById('pr-photo-annex');
  if (annex) {
    const photoData = (typeof PhotoTracker !== 'undefined' && PhotoTracker.getReportData)
      ? PhotoTracker.getReportData()
      : null;
    if (photoData && photoData.image) {
      document.getElementById('pr-photo-img').src = photoData.image;
      document.getElementById('pr-photo-summary').innerText = photoData.summary;
      const mcBox = document.getElementById('pr-photo-mc');
      if (mcBox) {
        mcBox.innerHTML = photoData.mcSvg || '';
        mcBox.style.display = photoData.mcSvg ? 'block' : 'none';
      }
      annex.style.display = 'block';
    } else {
      annex.style.display = 'none';
    }
  }

  // D. Engineering sketch — clone the live three-point geometry drawing
  const cloneSvgInto = (svgId, boxId) => {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.innerHTML = '';
    const svg = document.getElementById(svgId);
    if (svg) {
      const clone = svg.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('class');
      clone.setAttribute('style', 'width: 100%; height: auto; display: block;');
      box.appendChild(clone);
    }
  };
  cloneSvgInto('svg-threepoint', 'pr-sketch-box');

  // D2. Sag vs tension safety curve — only when a valid result exists
  const chartSection = document.getElementById('pr-chart-section');
  if (chartSection) {
    const resultsOk = document.getElementById('tp-results-ok');
    const haveResults = resultsOk && resultsOk.style.display !== 'none';
    chartSection.style.display = haveResults ? 'block' : 'none';
    if (haveResults) cloneSvgInto('svg-sag-tension-chart', 'pr-chart-box');
  }

  // D3. Temperature variation — only when the user entered a measurement temp
  const tempSection = document.getElementById('pr-temp-section');
  if (tempSection) {
    const wrap = document.getElementById('temp-plot-wrap');
    const haveTemp = wrap && wrap.querySelector('svg');
    tempSection.style.display = haveTemp ? 'block' : 'none';
    if (haveTemp) document.getElementById('pr-temp-box').innerHTML = wrap.innerHTML;
  }

  // E. Renumber visible section headings (the photo section hides without a photo)
  let sectionNo = 0;
  document.querySelectorAll('#printable-report .report-section').forEach(sec => {
    const h2 = sec.querySelector('h2');
    if (!h2 || sec.style.display === 'none') return;
    sectionNo++;
    h2.innerText = h2.innerText.replace(/^\d+\./, sectionNo + '.');
  });

  // Trigger system print window
  window.print();
}

// ==========================================================================
// 4. PRACTICAL SURVEYOR FIELD HELPER - LASER RANGEFINDER SOLVER
// ==========================================================================
function toggleRangefinderSetup() {
  const mode = document.getElementById('rf-setup-mode').value;
  const inplaneDiv = document.getElementById('rf-inplane-div');
  const obliqueDiv = document.getElementById('rf-oblique-div');

  if (mode === 'in-plane') {
    inplaneDiv.style.display = 'block';
    obliqueDiv.style.display = 'none';
  } else {
    inplaneDiv.style.display = 'none';
    obliqueDiv.style.display = 'block';
  }
  calculateRangefinder();
}

// Global sighter solved values cache
let rfSolvedL = 300.0;
let rfSolvedXp = 100.0;
let rfSolvedZa = 140.0;
let rfSolvedZb = 175.0;
let rfSolvedZp = 146.4;

function calculateRangefinder() {
  const setupMode = document.getElementById('rf-setup-mode').value;
  const solvedDiv = document.getElementById('rf-solved-text');
  
  const rfRaw = id => (document.getElementById(id).value || '').trim();

  if (setupMode === 'in-plane') {
    if (!rfRaw('rf-hda') || !rfRaw('rf-hdb') || !rfRaw('rf-vda') || !rfRaw('rf-vdb') || !rfRaw('rf-hdp') || !rfRaw('rf-vdp')) {
      rfSolvedL = 0;
      if (solvedDiv) solvedDiv.innerHTML = 'Enter all six rangefinder readings (horizontal + vertical distances to Hook A, Hook B and the conductor point) to solve the span geometry.';
      return;
    }
    const hda = parseFloat(document.getElementById('rf-hda').value) || 0;
    const vda = parseFloat(document.getElementById('rf-vda').value) || 0;
    const hdb = parseFloat(document.getElementById('rf-hdb').value) || 0;
    const vdb = parseFloat(document.getElementById('rf-vdb').value) || 0;
    const hdp = parseFloat(document.getElementById('rf-hdp').value) || 0;
    const vdp = parseFloat(document.getElementById('rf-vdp').value) || 0;
    const towardsB = document.getElementById('rf-p-towards-b').checked;

    rfSolvedL = hda + hdb;
    rfSolvedXp = towardsB ? (hda + hdp) : (hda - hdp);
    rfSolvedZa = vda;
    rfSolvedZb = vdb;
    rfSolvedZp = vdp;

    if (solvedDiv) {
      solvedDiv.innerHTML = 
        `<strong>Solved In-Plane Geometry (Eye Elevation = 0m):</strong><br>` +
        `• Solved Span L = <strong>${rfSolvedL.toFixed(2)} m</strong> (Horiz Projection)<br>` +
        `• Position xp = <strong>${rfSolvedXp.toFixed(2)} m</strong> (Horiz Projection)<br>` +
        `• Hook ZA = <strong>${rfSolvedZa.toFixed(3)} m</strong> (Vert Projection)<br>` +
        `• Hook ZB = <strong>${rfSolvedZb.toFixed(3)} m</strong> (Vert Projection)<br>` +
        `• Conductor ZP = <strong>${rfSolvedZp.toFixed(3)} m</strong> (Vert Projection)`;
    }
  } else {
    // Oblique Transverse Setup (Valley-to-Valley)
    if (!rfRaw('rf-ob-sa') || !rfRaw('rf-ob-sb') || !rfRaw('rf-ob-alpha') || !rfRaw('rf-ob-sp')) {
      rfSolvedL = 0;
      if (solvedDiv) solvedDiv.innerHTML = 'Enter the slant ranges, inclinations and horizontal swing angles measured from your standing position to solve the span geometry.';
      return;
    }
    const sa = parseFloat(document.getElementById('rf-ob-sa').value) || 0;
    const thetaA_deg = parseFloat(document.getElementById('rf-ob-theta-a').value) || 0;
    const sb = parseFloat(document.getElementById('rf-ob-sb').value) || 0;
    const thetaB_deg = parseFloat(document.getElementById('rf-ob-theta-b').value) || 0;
    const alpha_deg = parseFloat(document.getElementById('rf-ob-alpha').value) || 0;
    const sp = parseFloat(document.getElementById('rf-ob-sp').value) || 0;
    const thetaP_deg = parseFloat(document.getElementById('rf-ob-theta-p').value) || 0;
    const beta_deg = parseFloat(document.getElementById('rf-ob-beta').value) || 0;

    const radA = thetaA_deg * Math.PI / 180;
    const radB = thetaB_deg * Math.PI / 180;
    const radP = thetaP_deg * Math.PI / 180;
    const radAlpha = alpha_deg * Math.PI / 180;
    const radBeta = beta_deg * Math.PI / 180;

    // Ground projection distances
    const da = sa * Math.cos(radA);
    const db = sb * Math.cos(radB);
    const dp = sp * Math.cos(radP);

    // Coordinates in horizontal ground plane (O is origin, OA is X axis)
    const xa = da;
    const ya = 0;
    const xb = db * Math.cos(radAlpha);
    const yb = db * Math.sin(radAlpha);
    const xp_coord = dp * Math.cos(radBeta);
    const yp_coord = dp * Math.sin(radBeta);

    // Vertical elevations w.r.t sighter eye level as 0m
    rfSolvedZa = sa * Math.sin(radA);
    rfSolvedZb = sb * Math.sin(radB);
    rfSolvedZp = sp * Math.sin(radP);

    // Horizontal Span L between A and B
    rfSolvedL = Math.sqrt((xb - xa) * (xb - xa) + (yb - ya) * (yb - ya));

    // Projected position xp of P along the line AB (from A)
    const dx_ab = xb - xa;
    const dy_ab = yb - ya;
    const dx_ap = xp_coord - xa;
    const dy_ap = yp_coord - ya;

    rfSolvedXp = rfSolvedL > 0 ? (dx_ab * dx_ap + dy_ab * dy_ap) / rfSolvedL : 0;
    const outOfPlaneY = rfSolvedL > 0 ? Math.abs(dx_ab * dy_ap - dy_ab * dx_ap) / rfSolvedL : 0;

    if (solvedDiv) {
      solvedDiv.innerHTML = 
        `<strong>Solved Valley-to-Valley Oblique Geometry:</strong><br>` +
        `• Solved Span L = <strong>${rfSolvedL.toFixed(2)} m</strong> (Horiz Projection)<br>` +
        `• Position xp = <strong>${rfSolvedXp.toFixed(2)} m</strong> (Horiz Projection)<br>` +
        `• Hook ZA = <strong>${rfSolvedZa.toFixed(3)} m</strong> (Vert Projection)<br>` +
        `• Hook ZB = <strong>${rfSolvedZb.toFixed(3)} m</strong> (Vert Projection)<br>` +
        `• Conductor ZP = <strong>${rfSolvedZp.toFixed(3)} m</strong> (Vert Projection)<br>` +
        `• <span style="color: var(--text-muted); font-size: 0.7rem;">Out-of-Plane Wind Sway Dev: ${outOfPlaneY.toFixed(3)} m</span>`;
    }
  }
}

function applyRangefinderReadings() {
  if (!(rfSolvedL > 0)) {
    alert('Fill in the rangefinder readings first — nothing has been solved yet.');
    return;
  }
  calculateRangefinder(); // ensure fresh calculation

  if (rfSolvedL <= 0 || rfSolvedXp <= 0 || rfSolvedXp >= rfSolvedL) {
    alert("Please input valid rangefinder readings before applying.");
    return;
  }

  // Apply to primary inputs
  document.getElementById('tp-span').value = rfSolvedL.toFixed(2);
  document.getElementById('tp-xp').value = rfSolvedXp.toFixed(2);
  
  // Enforce Z-Coordinates input mode
  document.getElementById('tp-input-mode').value = 'z-coords';
  toggleInputMode();

  document.getElementById('tp-za').value = rfSolvedZa.toFixed(3);
  document.getElementById('tp-zb').value = rfSolvedZb.toFixed(3);
  document.getElementById('tp-zp').value = rfSolvedZp.toFixed(3);

  // Recalculate
  calculateThreePoint();
}

// ==========================================================================
// 5. ERROR PROPAGATION MATH HELPER
// ==========================================================================
function calculatePerturbedTension(w, L, xp, za, zb, zp, delta, variable) {
  return TLEngine.perturbedTension(w, L, xp, za, zb, zp, delta, variable);
}

// ==========================================================================
// 6. MOUNTAIN SURVEYOR SLOPED SPAN SOLVER TRIGONOMETRY HELPERS
// ==========================================================================
function toggleMountainMode() {
  const mode = document.getElementById('mt-input-mode').value;
  const gpsDiv = document.getElementById('mt-gps-slant-div');
  const angleDiv = document.getElementById('mt-angle-slant-div');

  if (mode === 'gps-slant') {
    gpsDiv.style.display = 'flex';
    angleDiv.style.display = 'none';
  } else {
    gpsDiv.style.display = 'none';
    angleDiv.style.display = 'flex';
  }
  calculateMountainSpan();
}

function calculateMountainSpan() {
  const mode = document.getElementById('mt-input-mode').value;
  const solvedDiv = document.getElementById('mt-solved-text');
  if (!solvedDiv) return;

  const mtRaw = id => (document.getElementById(id).value || '').trim();

  if (mode === 'gps-slant') {
    if (!mtRaw('mt-za') || !mtRaw('mt-zb') || !mtRaw('mt-slant-1')) {
      solvedDiv.innerHTML = 'Enter both hook elevations and the slant range to solve the horizontal span.';
      return;
    }
    const za = parseFloat(document.getElementById('mt-za').value) || 0;
    const zb = parseFloat(document.getElementById('mt-zb').value) || 0;
    const slant = parseFloat(document.getElementById('mt-slant-1').value) || 0;

    const h = zb - za;
    const hAbs = Math.abs(h);

    if (slant <= hAbs) {
      solvedDiv.innerHTML = `<span style="color: var(--danger);">Error: Slant Range S must be greater than height difference h (${hAbs.toFixed(2)}m)</span>`;
      return;
    }

    const L = Math.sqrt(slant * slant - h * h);
    solvedDiv.innerHTML = 
      `<strong>Method 1 Solved (GPS + Slant distance):</strong><br>` +
      `• Height Difference h = ZB - ZA = <strong>${h.toFixed(3)} m</strong><br>` +
      `• Solved Span L = sqrt(S² - h²) = <strong>${L.toFixed(3)} m</strong>`;
  } else {
    if (!mtRaw('mt-slant-2') || !mtRaw('mt-angle')) {
      solvedDiv.innerHTML = 'Enter the slant range and its inclination angle to solve the horizontal span.';
      return;
    }
    const slant = parseFloat(document.getElementById('mt-slant-2').value) || 0;
    const angleDeg = parseFloat(document.getElementById('mt-angle').value) || 0;
    const angleRad = angleDeg * Math.PI / 180;

    const L = slant * Math.cos(angleRad);
    const h = slant * Math.sin(angleRad);
    
    // Base ZA on the active primary input, or a safe default
    const primaryZaInput = document.getElementById('tp-za');
    const za = primaryZaInput ? (parseFloat(primaryZaInput.value) || 140.0) : 140.0;
    const zb = za + h;

    solvedDiv.innerHTML = 
      `<strong>Method 2 Solved (Sight Angle + Slant distance):</strong><br>` +
      `• Solved Span L = S · cos(θ) = <strong>${L.toFixed(3)} m</strong><br>` +
      `• Height Diff h = S · sin(θ) = <strong>${h.toFixed(3)} m</strong><br>` +
      `• Projective Hook ZB = ZA + h = <strong>${zb.toFixed(3)} m</strong> (based on ZA = ${za.toFixed(2)}m)`;
  }
}

function applyMountainSpan() {
  const mode = document.getElementById('mt-input-mode').value;
  let L = 0;
  let h = 0;
  let zb = 0;

  if (mode === 'gps-slant') {
    const za = parseFloat(document.getElementById('mt-za').value) || 0;
    const zbVal = parseFloat(document.getElementById('mt-zb').value) || 0;
    const slant = parseFloat(document.getElementById('mt-slant-1').value) || 0;
    h = zbVal - za;
    const hAbs = Math.abs(h);
    if (slant > hAbs) {
      L = Math.sqrt(slant * slant - h * h);
    }
    zb = zbVal;
  } else {
    const slant = parseFloat(document.getElementById('mt-slant-2').value) || 0;
    const angleDeg = parseFloat(document.getElementById('mt-angle').value) || 0;
    const angleRad = angleDeg * Math.PI / 180;
    L = slant * Math.cos(angleRad);
    h = slant * Math.sin(angleRad);
    
    const primaryZaInput = document.getElementById('tp-za');
    const za = primaryZaInput ? (parseFloat(primaryZaInput.value) || 140.0) : 140.0;
    zb = za + h;
  }

  if (!(L > 0)) {
    alert('Fill in the mountain-helper readings first — nothing has been solved yet.');
    return;
  }

  // Set primary span length
  document.getElementById('tp-span').value = L.toFixed(2);

  // Set secondary height elements
  const inputMode = document.getElementById('tp-input-mode').value;
  if (inputMode === 'z-coords') {
    document.getElementById('tp-zb').value = zb.toFixed(3);
  } else {
    document.getElementById('tp-height-diff').value = h.toFixed(3);
  }

  // Recalculate
  calculateThreePoint();
}

// (Detailed CAD results page removed in v0.6 — the printed report now
// carries the sketch, charts and distribution.)


// ==========================================================================
// 7. PHOTO SAG TRACKER — moved to phototracker.js (catenary tracing tool).
//    That module provides the global handlers used by index.html and the
//    PhotoTracker.serialize()/restore() API used by save/resume below.
// ==========================================================================
// ==========================================================================
// 8. LOCAL PROJECT JSON SAVE / RESUME
// ==========================================================================
function collectProjectData() {
  const data = {
    // Project identity & provenance
    projectId: currentProject.id,
    projectName: currentProject.name,
    appVersion: APP_VERSION,

    // Primary Inputs
    tpConductor: document.getElementById('tp-conductor').value,
    tpCustomName: document.getElementById('tp-custom-name') ? document.getElementById('tp-custom-name').value : "",
    tpCustomW: document.getElementById('tp-custom-w') ? document.getElementById('tp-custom-w').value : "",
    tpCustomMass: document.getElementById('tp-custom-mass') ? document.getElementById('tp-custom-mass').value : "",
    tpCustomUts: document.getElementById('tp-custom-uts') ? document.getElementById('tp-custom-uts').value : "",
    tpSpan: document.getElementById('tp-span').value,
    tpXp: document.getElementById('tp-xp').value,
    tpInputMode: document.getElementById('tp-input-mode').value,
    
    // Z Coords Inputs
    tpZa: document.getElementById('tp-za').value,
    tpZaGpsBase: document.getElementById('tp-za-gps-base').value,
    tpZaGpsHeight: document.getElementById('tp-za-gps-height').value,
    
    tpZb: document.getElementById('tp-zb').value,
    tpZbGpsBase: document.getElementById('tp-zb-gps-base').value,
    tpZbGpsHeight: document.getElementById('tp-zb-gps-height').value,
    
    tpZp: document.getElementById('tp-zp').value,
    tpZpGpsBase: document.getElementById('tp-zp-gps-base') ? document.getElementById('tp-zp-gps-base').value : "",
    tpZpGpsHeight: document.getElementById('tp-zp-gps-height') ? document.getElementById('tp-zp-gps-height').value : "",
    
    // Direct Offset Inputs
    tpHeightDiff: document.getElementById('tp-height-diff').value,
    tpOffsetD: document.getElementById('tp-offset-d').value,
    
    // Line Configurations
    lineVoltage: document.getElementById('line-voltage').value,
    towerAId: document.getElementById('tower-a-id').value,
    towerBId: document.getElementById('tower-b-id').value,
    lineCircuits: document.getElementById('line-circuits').value,
    lineConfig: document.getElementById('line-config').value,
    lineBundling: document.getElementById('line-bundling').value,
    linePeaks: document.getElementById('line-peaks').value,
    lineOpgwSize: document.getElementById('line-opgw-size').value,
    
    // Laser Rangefinder Inputs
    rfSetupMode: document.getElementById('rf-setup-mode').value,
    rfHda: document.getElementById('rf-hda').value,
    rfVda: document.getElementById('rf-vda').value,
    rfHdb: document.getElementById('rf-hdb').value,
    rfVdb: document.getElementById('rf-vdb').value,
    rfHdp: document.getElementById('rf-hdp').value,
    rfVdp: document.getElementById('rf-vdp').value,
    rfPTowardsB: document.getElementById('rf-p-towards-b') ? document.getElementById('rf-p-towards-b').checked : true,
    
    rfObSa: document.getElementById('rf-ob-sa').value,
    rfObThetaA: document.getElementById('rf-ob-theta-a').value,
    rfObSb: document.getElementById('rf-ob-sb').value,
    rfObThetaB: document.getElementById('rf-ob-theta-b').value,
    rfObAlpha: document.getElementById('rf-ob-alpha').value,
    rfObSp: document.getElementById('rf-ob-sp').value,
    rfObThetaP: document.getElementById('rf-ob-theta-p').value,
    rfObBeta: document.getElementById('rf-ob-beta').value,
    
    // Mountain Span Inputs
    mtInputMode: document.getElementById('mt-input-mode') ? document.getElementById('mt-input-mode').value : "gps-slant",
    mtZa: document.getElementById('mt-za') ? document.getElementById('mt-za').value : "",
    mtZb: document.getElementById('mt-zb') ? document.getElementById('mt-zb').value : "",
    mtSlant1: document.getElementById('mt-slant-1') ? document.getElementById('mt-slant-1').value : "",
    mtSlant2: document.getElementById('mt-slant-2') ? document.getElementById('mt-slant-2').value : "",
    mtAngle: document.getElementById('mt-angle') ? document.getElementById('mt-angle').value : "",

    // Canvas Photo Sag Tracker state (v2 catenary tracer)
    photoCalMethod: document.getElementById('photo-cal-method').value,
    photoCalTowerH: document.getElementById('photo-cal-tower-h').value,
    photoPerspHa: document.getElementById('photo-persp-ha') ? document.getElementById('photo-persp-ha').value : '',
    photoPerspHb: document.getElementById('photo-persp-hb') ? document.getElementById('photo-persp-hb').value : '',
    photoSpanL: document.getElementById('photo-span-l') ? document.getElementById('photo-span-l').value : '',
    photoHookH: document.getElementById('photo-hook-h') ? document.getElementById('photo-hook-h').value : '',
    photoF35: document.getElementById('photo-f35') ? document.getElementById('photo-f35').value : '',
    tpTempMeas: document.getElementById('tp-temp-meas') ? document.getElementById('tp-temp-meas').value : '',
    tpTempCond: document.getElementById('tp-temp-cond') ? document.getElementById('tp-temp-cond').value : '',
    tpTempRise: document.getElementById('tp-temp-rise') ? document.getElementById('tp-temp-rise').value : '',
    tpTempCold: document.getElementById('tp-temp-cold') ? document.getElementById('tp-temp-cold').value : '',
    photoTracker: (typeof PhotoTracker !== 'undefined') ? PhotoTracker.serialize() : null,


    timestamp: new Date().toISOString()
  };

  return data;
}

function exportProjectJSON() {
  const data = collectProjectData();
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const baseName = data.projectName || `${data.towerAId || 'TowerA'}-${data.towerBId || 'TowerB'}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `TL-SAG-${baseName.replace(/[^\w.-]+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importProjectJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      applyProjectData(data);

      // Register the imported project locally so it shows in the saved list.
      currentProject = {
        id: data.projectId || ('p' + Date.now().toString(36)),
        name: data.projectName || ((data.towerAId && data.towerBId) ? `${data.towerAId} – ${data.towerBId}` : 'Imported Project')
      };
      updateProjectBadge();
      saveCurrentProject(false);
      closeProjectGate();

      alert("Project imported and restored successfully!");
    } catch (err) {
      alert("Failed to parse project JSON file: " + err.message);
    }
  };
  reader.readAsText(file);

  event.target.value = "";
}

// Apply a saved project data object to the whole workspace.
function applyProjectData(data) {
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) {
          el.value = val;
        }
      };

      setVal('tp-conductor', data.tpConductor);
      if (data.tpCustomName && document.getElementById('tp-custom-name')) {
        document.getElementById('tp-custom-name').value = data.tpCustomName;
      }
      if (data.tpCustomW && document.getElementById('tp-custom-w')) {
        document.getElementById('tp-custom-w').value = data.tpCustomW;
      }
      if (data.tpCustomMass && document.getElementById('tp-custom-mass')) {
        document.getElementById('tp-custom-mass').value = data.tpCustomMass;
      }
      if (data.tpCustomUts && document.getElementById('tp-custom-uts')) {
        document.getElementById('tp-custom-uts').value = data.tpCustomUts;
      }
      
      setVal('tp-span', data.tpSpan);
      setVal('tp-xp', data.tpXp);
      setVal('tp-input-mode', data.tpInputMode);
      
      setVal('tp-za', data.tpZa);
      setVal('tp-za-gps-base', data.tpZaGpsBase);
      setVal('tp-za-gps-height', data.tpZaGpsHeight);
      
      setVal('tp-zb', data.tpZb);
      setVal('tp-zb-gps-base', data.tpZbGpsBase);
      setVal('tp-zb-gps-height', data.tpZbGpsHeight);
      
      setVal('tp-zp', data.tpZp);
      if (data.tpZpGpsBase && document.getElementById('tp-zp-gps-base')) {
        document.getElementById('tp-zp-gps-base').value = data.tpZpGpsBase;
      }
      if (data.tpZpGpsHeight && document.getElementById('tp-zp-gps-height')) {
        document.getElementById('tp-zp-gps-height').value = data.tpZpGpsHeight;
      }
      
      setVal('tp-height-diff', data.tpHeightDiff);
      setVal('tp-offset-d', data.tpOffsetD);
      
      setVal('line-voltage', data.lineVoltage);
      setVal('tower-a-id', data.towerAId);
      setVal('tower-b-id', data.towerBId);
      setVal('line-circuits', data.lineCircuits);
      setVal('line-config', data.lineConfig);
      setVal('line-bundling', data.lineBundling);
      setVal('line-peaks', data.linePeaks);
      setVal('line-opgw-size', data.lineOpgwSize);
      
      setVal('rf-setup-mode', data.rfSetupMode);
      setVal('rf-hda', data.rfHda);
      setVal('rf-vda', data.rfVda);
      setVal('rf-hdb', data.rfHdb);
      setVal('rf-vdb', data.rfVdb);
      setVal('rf-hdp', data.rfHdp);
      setVal('rf-vdp', data.rfVdp);
      
      const pTowardsB = document.getElementById('rf-p-towards-b');
      if (pTowardsB && data.rfPTowardsB !== undefined) {
        pTowardsB.checked = data.rfPTowardsB;
      }
      
      setVal('rf-ob-sa', data.rfObSa);
      setVal('rf-ob-theta-a', data.rfObThetaA);
      setVal('rf-ob-sb', data.rfObSb);
      setVal('rf-ob-theta-b', data.rfObThetaB);
      setVal('rf-ob-alpha', data.rfObAlpha);
      setVal('rf-ob-sp', data.rfObSp);
      setVal('rf-ob-theta-p', data.rfObThetaP);
      setVal('rf-ob-beta', data.rfObBeta);
      
      if (data.mtInputMode && document.getElementById('mt-input-mode')) {
        document.getElementById('mt-input-mode').value = data.mtInputMode;
      }
      if (data.mtZa && document.getElementById('mt-za')) setVal('mt-za', data.mtZa);
      if (data.mtZb && document.getElementById('mt-zb')) setVal('mt-zb', data.mtZb);
      if (data.mtSlant1 && document.getElementById('mt-slant-1')) setVal('mt-slant-1', data.mtSlant1);
      if (data.mtSlant2 && document.getElementById('mt-slant-2')) setVal('mt-slant-2', data.mtSlant2);
      if (data.mtAngle && document.getElementById('mt-angle')) setVal('mt-angle', data.mtAngle);

      setVal('photo-cal-method', data.photoCalMethod);
      setVal('photo-cal-tower-h', data.photoCalTowerH);
      setVal('photo-persp-ha', data.photoPerspHa);
      setVal('photo-persp-hb', data.photoPerspHb);
      setVal('photo-span-l', data.photoSpanL);
      setVal('photo-hook-h', data.photoHookH);
      setVal('photo-f35', data.photoF35);
      setVal('tp-temp-meas', data.tpTempMeas);
      setVal('tp-temp-cond', data.tpTempCond);
      setVal('tp-temp-rise', data.tpTempRise);
      setVal('tp-temp-cold', data.tpTempCold);

      // Trigger respective layout refreshes
      handleConductorChange('tp');
      toggleInputMode();
      toggleRangefinderSetup();
      if (typeof toggleMountainMode === 'function') toggleMountainMode();
      handlePhotoCalibChange();
      
      // Restore photo tracker workspace (v2 format, with legacy v1 fallback).
      // PhotoTracker.restore re-applies saved clicks AFTER the image loads,
      // so annotations survive the round-trip.
      if (typeof PhotoTracker !== 'undefined') {
        if (data.photoTracker) {
          PhotoTracker.restore(data.photoTracker);
        } else if (data.photoImgSrc) {
          PhotoTracker.restoreLegacy(data.photoImgSrc, data.photoClicks);
        } else {
          PhotoTracker.restore(null);
        }
      }

      // Re-trigger calculation sheets
      calculateThreePoint();
      calculateRangefinder();
      if (typeof calculateMountainSpan === 'function') calculateMountainSpan();
}



// ==========================================================================
// 9. PROJECT WORKFLOW — named project context with device autosave
// ==========================================================================
let currentProject = { id: null, name: "" };
const PROJECTS_LS_KEY = 'tlsag_projects_v1';

function listProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_LS_KEY)) || {}; }
  catch (e) { return {}; }
}

function persistProjects(map) {
  try { localStorage.setItem(PROJECTS_LS_KEY, JSON.stringify(map)); return true; }
  catch (e) {
    console.warn('Project save failed (browser storage quota exceeded?):', e);
    return false;
  }
}

function updateProjectBadge() {
  const el = document.getElementById('project-name-display');
  if (el) el.innerText = currentProject.name || 'No project (not saving)';
}

function saveCurrentProject(notify) {
  if (!currentProject.id) {
    if (notify) openProjectGate(); // no project yet — send the user to create one
    return;
  }
  const map = listProjects();
  map[currentProject.id] = {
    id: currentProject.id,
    name: currentProject.name,
    savedAt: new Date().toISOString(),
    data: collectProjectData()
  };
  const ok = persistProjects(map);
  if (notify) {
    const btn = document.getElementById('project-save-btn');
    if (btn) {
      const original = '💾 Save';
      btn.innerText = ok ? '✓ Saved' : '⚠ Save failed';
      setTimeout(() => { btn.innerText = original; }, 1600);
    }
  }
}

let autosaveTimer = null;
function projectAutosave() {
  if (!currentProject.id) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveCurrentProject(false), 2000);
}

function initProjectWorkflow() {
  document.addEventListener('input', projectAutosave);
  document.addEventListener('change', projectAutosave);
  window.addEventListener('beforeunload', () => {
    if (currentProject.id) saveCurrentProject(false);
  });
  updateProjectBadge();
  openProjectGate();
}

function openProjectGate() {
  renderGateProjectList();
  // Landing persona: first-time visitors get the full "what is this" hero;
  // returning users (saved projects exist) get straight to their list.
  const gateEl = document.getElementById('project-gate');
  const hasProjects = Object.keys(listProjects()).length > 0;
  if (gateEl) gateEl.classList.toggle('returning', hasProjects);
  const resume = document.getElementById('gate-resume-section');
  if (resume) resume.style.display = hasProjects ? 'block' : 'none';
  const methods = document.getElementById('gate-step-methods');
  const start = document.getElementById('gate-step-start');
  const gate = document.getElementById('project-gate');
  if (methods) methods.style.display = 'none';
  if (start) start.style.display = 'block';
  if (gate) gate.style.display = 'flex';
}

function closeProjectGate() {
  const gate = document.getElementById('project-gate');
  if (gate) gate.style.display = 'none';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderGateProjectList() {
  const listEl = document.getElementById('gate-project-list');
  if (!listEl) return;
  const items = Object.values(listProjects())
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  if (!items.length) {
    listEl.innerHTML = '';
    return;
  }
  listEl.innerHTML = items.map(p => `
    <div class="gate-project-item">
      <button type="button" class="gate-project-open" onclick="openSavedProject('${p.id}')">
        <strong>${escapeHtml(p.name || 'Untitled')}</strong>
        <span>${p.savedAt ? new Date(p.savedAt).toLocaleString() : ''}</span>
      </button>
      <button type="button" class="gate-project-delete" title="Delete this saved project" onclick="deleteSavedProject('${p.id}')">✕</button>
    </div>`).join('');
}

function gateCreateProject() {
  const nameInput = document.getElementById('gate-project-name');
  const name = (nameInput.value || '').trim();
  if (!name) {
    nameInput.focus();
    nameInput.style.borderColor = 'var(--danger)';
    nameInput.placeholder = 'Give the project a name first — e.g. line, circuit & span';
    return;
  }
  nameInput.style.borderColor = '';
  currentProject = {
    id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    name: name
  };
  resetWorkspaceForNewProject();
  updateProjectBadge();
  saveCurrentProject(false);
  nameInput.value = '';

  // Step 2: methodology chooser
  document.getElementById('gate-step-start').style.display = 'none';
  document.getElementById('gate-methods-title').innerText = `“${name}” created — how will you measure this span?`;
  document.getElementById('gate-step-methods').style.display = 'block';
}

function openSavedProject(id) {
  const p = listProjects()[id];
  if (!p) return;
  currentProject = { id: p.id, name: p.name };
  applyProjectData(p.data || {});
  updateProjectBadge();
  closeProjectGate();
}

function deleteSavedProject(id) {
  const map = listProjects();
  const p = map[id];
  if (!p) return;
  if (!confirm(`Delete saved project "${p.name}"? This cannot be undone.`)) return;
  delete map[id];
  persistProjects(map);
  if (currentProject.id === id) {
    currentProject = { id: null, name: "" };
    updateProjectBadge();
  }
  renderGateProjectList();
}

// ==========================================================================
// RANGEFINDER HOOK-HEIGHT HELPER (photo panel)
// Estimates a tower's hook-to-base height when drawings are unavailable:
// shoot the hook and the base from one station with a laser rangefinder.
// ==========================================================================
let hhLastResult = NaN;

function toggleHhMode() {
  const mode = document.getElementById('hh-mode').value;
  document.getElementById('hh-slant-fields').style.display = mode === 'slant' ? 'grid' : 'none';
  document.getElementById('hh-angle-fields').style.display = mode === 'slant' ? 'none' : 'grid';
  calcHookHeight();
}

function calcHookHeight() {
  const out = document.getElementById('hh-result');
  if (!out) return;
  const num = id => parseFloat(document.getElementById(id).value);
  const mode = document.getElementById('hh-mode').value;
  let H = NaN;

  if (mode === 'slant') {
    const sh = num('hh-s-hook'), ah = num('hh-a-hook');
    const sb = num('hh-s-base'), ab = num('hh-a-base');
    if (!isNaN(sh) && !isNaN(ah) && !isNaN(sb) && !isNaN(ab)) {
      H = TLEngine.hookHeightFromSlants(sh, ah, sb, ab);
    }
  } else {
    const hd = num('hh-hd'), ah = num('hh-ang-hook'), ab = num('hh-ang-base');
    if (!isNaN(hd) && !isNaN(ah) && !isNaN(ab)) {
      H = TLEngine.hookHeightFromAngles(hd, ah, ab);
    }
  }

  hhLastResult = H;
  if (isNaN(H)) {
    out.innerHTML = '<span style="color: var(--text-muted);">Fill the fields above — angles are in degrees, + above horizontal, − below.</span>';
  } else if (H <= 0) {
    out.innerHTML = `<span style="color: var(--danger);">Result ${H.toFixed(2)} m — the hook shot must be higher than the base shot. Check angle signs (+up / −down).</span>`;
  } else {
    out.innerHTML = `Hook height above base: <strong style="font-size: 1.05rem;">${H.toFixed(2)} m</strong>`;
  }
}

function applyHookHeight(target) {
  if (!(hhLastResult > 0)) {
    alert('Compute a valid hook height first (the result must be positive).');
    return;
  }
  const ids = { a: 'photo-persp-ha', b: 'photo-persp-hb', tower: 'photo-cal-tower-h' };
  const el = document.getElementById(ids[target]);
  if (el) {
    el.value = hhLastResult.toFixed(2);
    if (typeof photoTrackerResolve === 'function') photoTrackerResolve();
  }
}

// Bundled real-world example (Kashang-Bhaba 788 m river crossing) — the
// fastest way for a new tester to see a fully worked photo analysis.
function loadExampleProject() {
  const btn = document.getElementById('gate-example-btn');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="gac-icon">⏳</span><strong>Loading example…</strong><small>Fetching the span photo (~2 MB)</small>'; }
  fetch('examples/kashang-bhaba-demo.json?v=' + APP_VERSION)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      applyProjectData(data);
      currentProject = {
        id: data.projectId || 'example-kashang-bhaba',
        name: data.projectName || 'Example project'
      };
      updateProjectBadge();
      saveCurrentProject(false);
      closeProjectGate();
    })
    .catch(e => alert('Could not load the example project (' + e.message + ').\nThe example needs the app served over http(s) — use the live site.'))
    .finally(() => { if (btn) { btn.disabled = false; btn.innerHTML = original; } });
}

function gateSkipProject() {
  currentProject = { id: null, name: "" };
  updateProjectBadge();
  closeProjectGate();
}

function gateChooseMethod(method) {
  closeProjectGate();
  const targets = {
    photo: 'photo-panel',
    threepoint: 'tp-span',
    rangefinder: 'rf-setup-mode',
    mountain: 'mt-input-mode'
  };
  const el = document.getElementById(targets[method]);
  if (el) {
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') el.focus();
    }, 80);
  }
}

// Fresh workspace for a newly created project — never carry over data.
function resetWorkspaceForNewProject() {
  const blankIds = [
    'tp-span', 'tp-xp', 'tp-za', 'tp-zb', 'tp-zp', 'tp-height-diff', 'tp-offset-d',
    'tp-za-gps-base', 'tp-za-gps-height', 'tp-zb-gps-base', 'tp-zb-gps-height',
    'tp-zp-gps-base', 'tp-zp-gps-height', 'photo-cal-tower-h',
    'tower-a-id', 'tower-b-id', 'tower-a-lat', 'tower-a-lon', 'tower-a-elev',
    'tower-b-lat', 'tower-b-lon', 'tower-b-elev'
  ];
  blankIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset line-spec dropdowns to their HTML defaults
  document.querySelectorAll('#specs-content select').forEach(sel => {
    const di = Array.from(sel.options).findIndex(o => o.defaultSelected);
    sel.selectedIndex = di >= 0 ? di : 0;
  });

  const cond = document.getElementById('tp-conductor');
  if (cond) cond.value = 'zebra';
  handleConductorChange('tp');

  if (typeof PhotoTracker !== 'undefined') PhotoTracker.restore(null);
  calculateThreePoint();
}
