/* TL-SAG Analytical Engine & UI Controller */

// Standard ACSR Conductor Database (IS 398 Part-II Reference Specs)
const conductorDatabase = {
  "dog": { name: "ACSR Dog", w: 3.865, mass: 0.394, uts: 32700 },
  "wolf": { name: "ACSR Wolf", w: 7.122, mass: 0.726, uts: 56400 },
  "panther": { name: "ACSR Panther", w: 9.555, mass: 0.974, uts: 79700 },
  "zebra": { name: "ACSR Zebra", w: 15.912, mass: 1.622, uts: 130300 },
  "moose": { name: "ACSR Moose", w: 19.600, mass: 1.998, uts: 161200 },
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
};

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

  // Pre-select Zebra as default flagship
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
    
    return { name: "Custom Conductor", w: customW, mass: customMass, uts: customUTS };
  } else {
    return conductorDatabase[selectKey];
  }
}

// ==========================================================================
// 1. THREE-POINT CALCULATOR ENGINE & VISUALIZER
// ==========================================================================
function calculateThreePoint() {
  // 1. Get Conductor mechanical properties
  const cond = getConductorSpecs('tp');
  const w = cond.w;
  const uts = cond.uts;

  // 2. Read basic dimensions
  const L = parseFloat(document.getElementById('tp-span').value) || 0;
  const xp = parseFloat(document.getElementById('tp-xp').value) || 0;
  
  if (L <= 0 || xp <= 0 || xp >= L || w <= 0) {
    displayError('tp-results', 'Ensure Span, Position (xp < L), and Conductor specifications are valid.');
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

  // 5. Calculate mechanical horizontal tension T
  // T = (w * xp * (L - xp)) / (2 * D)
  const T = (w * xp * (L - xp)) / (2 * offsetD);
  const T_kN = T / 1000;

  // 6. Calculate equivalent mid-span level-ground sag D_mid
  // D_mid = (w * L^2) / (8 * T)
  const dMid = (w * L * L) / (8 * T);

  // 7. Safety evaluations
  const pctUTS = (T / uts) * 100;
  const safetyFactor = uts / T;

  calculationStepsText += 
    `4. Calculate horizontal tension (T) in the conductor:\n` +
    `   T = (w * xp * (L - xp)) / (2 * D)\n` +
    `   T = (${w.toFixed(3)} * ${xp.toFixed(2)} * (${L.toFixed(2)} - ${xp.toFixed(2)})) / (2 * ${offsetD.toFixed(3)})\n` +
    `   T = (${w.toFixed(3)} * ${xp.toFixed(2)} * ${(L - xp).toFixed(2)}) / ${(2 * offsetD).toFixed(3)}\n` +
    `   T = ${(w * xp * (L - xp)).toFixed(1)} / ${(2 * offsetD).toFixed(3)} = ${T.toFixed(1)} N = ${T_kN.toFixed(2)} kN\n\n` +
    `5. Calculate equivalent level-ground mid-span sag (D_mid):\n` +
    `   D_mid = (w * L^2) / (8 * T)\n` +
    `   D_mid = (${w.toFixed(3)} * ${L.toFixed(2)}^2) / (8 * ${T.toFixed(1)})\n` +
    `   D_mid = ${(w * L * L).toFixed(1)} / ${(8 * T).toFixed(1)} = ${dMid.toFixed(3)} m`;

  // Update UI Elements
  document.getElementById('tp-results-error').style.display = 'none';
  document.getElementById('tp-results-ok').style.display = 'block';

  document.getElementById('tp-val-tension').innerText = T_kN.toFixed(2) + " kN";
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

      // Draw standard curves for s in [1.0m, 20.0m]
      let pathD = "";
      for (let s = 1.0; s <= 20.0; s += 0.2) {
        // Tension T = (w * xp * (L - xp)) / (2 * D(xp))
        const tempT = (w * xp * (L - xp)) / (2 * s); // in Newtons
        const tempT_kN = tempT / 1000;
        const tempP = tempT / uts;
        
        const curX = 50 + 420 * (s - 1.0) / 19.0;
        const curY = 220 - 200 * tempP;
        
        // Clamp Y visually within grid boundaries (20 to 220)
        const clampedY = Math.max(20, Math.min(220, curY));
        
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
      let dotX = 50 + 420 * (offsetD - 1.0) / 19.0;
      let dotY = 220 - 200 * (T / uts);
      
      // Clamp active dot within visual grid boundaries
      dotX = Math.max(50, Math.min(470, dotX));
      dotY = Math.max(20, Math.min(220, dotY));

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
      const dT_dZP = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.05, 'zp') - T;
      const dT_dXp = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.50, 'xp') - T;
      const dT_dL = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.20, 'L') - T;
      const dT_dZA = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.10, 'za') - T;
      const dT_dZB = calculatePerturbedTension(w, L, xp, Z_A, Z_B, Z_P, 0.10, 'zb') - T;
      
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
    const hScreen = Math.max(-100, Math.min(100, (h / L) * 600));
    const scaleX = 80 + ratio_p * 600;
    
    const supportA_Y = 140;
    const supportB_Y = 140 - hScreen;
    
    // Scale mid-span sag to screen: 1 meter = 10 visual pixels
    const screenSag = Math.max(10, Math.min(160, dMid * 10));

    // Update Tower B on screen (including stretching support legs)
    document.getElementById('tower-b-center').setAttribute('y1', supportB_Y);
    document.getElementById('tower-b-leg-l').setAttribute('y1', supportB_Y);
    document.getElementById('tower-b-leg-r').setAttribute('y1', supportB_Y);
    document.getElementById('svg-threepoint').querySelector('circle[cx="680"]').setAttribute('cy', supportB_Y);
    document.getElementById('svg-threepoint').querySelector('text[x="685"]').setAttribute('y', supportB_Y - 5);

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
  // Bind form variables dynamically to the printable A4 DOM elements before printing
  
  // A. Conductor metadata
  const condName = document.getElementById('line-voltage').value;
  document.getElementById('pr-voltage').innerText = condName ? condName : 'N/A';
  document.getElementById('pr-tower-a').innerText = document.getElementById('tower-a-id').value || 'Tower A';
  document.getElementById('pr-tower-b').innerText = document.getElementById('tower-b-id').value || 'Tower B';
  document.getElementById('pr-circuits').innerText = document.getElementById('line-circuits').value || 'Single';
  document.getElementById('pr-config').innerText = document.getElementById('line-config').value || 'Vertical';
  document.getElementById('pr-peaks').innerText = document.getElementById('line-peaks').value || '1';
  document.getElementById('pr-opgw').innerText = document.getElementById('line-opgw-size').value || 'N/A';
  document.getElementById('pr-bundling').innerText = document.getElementById('line-bundling').value || 'Single';
  
  const gpsA_lat = document.getElementById('tower-a-lat').value || '-';
  const gpsA_lon = document.getElementById('tower-a-lon').value || '-';
  const gpsA_el = document.getElementById('tower-a-elev').value || '-';
  document.getElementById('pr-gps-a').innerText = `${gpsA_lat} / ${gpsA_lon} (Elev: ${gpsA_el} m)`;

  const gpsB_lat = document.getElementById('tower-b-lat').value || '-';
  const gpsB_lon = document.getElementById('tower-b-lon').value || '-';
  const gpsB_el = document.getElementById('tower-b-elev').value || '-';
  document.getElementById('pr-gps-b').innerText = `${gpsB_lat} / ${gpsB_lon} (Elev: ${gpsB_el} m)`;

  // Timestamp
  document.getElementById('pr-date').innerText = new Date().toLocaleString();

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
      document.getElementById('pr-verdict-title').innerText = "VERDICT: APPROVED (SAFE TENSION)";
      document.getElementById('pr-verdict-desc').innerText = "The measured everyday tension complies fully with safety code limits (<20% of Conductor UTS). The conductor tension is safe from long-term aeolian vibration breakage.";
    } else if (statusCard.classList.contains('caution')) {
      reportVerdictBox.classList.add('print-caution');
      document.getElementById('pr-verdict-title').innerText = "VERDICT: BORDERLINE COMPLIANCE (CAUTION)";
      document.getElementById('pr-verdict-desc').innerText = "The conductor tension is within maximum design structural load limits but exceeds everyday vibration limits. Installation of Stockbridge dampers is strictly recommended.";
    } else {
      reportVerdictBox.classList.add('print-danger');
      document.getElementById('pr-verdict-title').innerText = "VERDICT: REJECTED (CRITICAL OVER-TENSIONED)";
      document.getElementById('pr-verdict-desc').innerText = "The conductor everyday tension exceeds the 50% UTS utility limit. Critical risk of wire breakage. Readjust line tension immediately.";
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
      document.getElementById('pr-verdict-title').innerText = "VERDICT: APPROVED (SAFE TENSION)";
      document.getElementById('pr-verdict-desc').innerText = "The timed conductor tension complies with code limits (<20% of Conductor UTS). The conductor tension is safe from wind vibration breakage.";
    } else if (statusCard.classList.contains('caution')) {
      reportVerdictBox.classList.add('print-caution');
      document.getElementById('pr-verdict-title').innerText = "VERDICT: BORDERLINE COMPLIANCE (CAUTION)";
      document.getElementById('pr-verdict-desc').innerText = "The conductor tension exceeds standard everyday vibration limits but remains within stormy loading margins. Vibration dampers are highly recommended.";
    } else {
      reportVerdictBox.classList.add('print-danger');
      document.getElementById('pr-verdict-title').innerText = "VERDICT: REJECTED (CRITICAL OVER-TENSIONED)";
      document.getElementById('pr-verdict-desc').innerText = "Tension exceeds the 50% UTS utility safety limit. Conductor snapping hazard. Readjust line tension immediately.";
    }
  }

  // Trigger system print window
  window.print();
}

// ==========================================================================
// 4. PRACTICAL SURVEYOR FIELD HELPER - LASER RANGEFINDER SOLVER
// ==========================================================================
function calculateRangefinder() {
  const hda = parseFloat(document.getElementById('rf-hda').value) || 0;
  const vda = parseFloat(document.getElementById('rf-vda').value) || 0;
  const hdb = parseFloat(document.getElementById('rf-hdb').value) || 0;
  const vdb = parseFloat(document.getElementById('rf-vdb').value) || 0;
  const hdp = parseFloat(document.getElementById('rf-hdp').value) || 0;
  const vdp = parseFloat(document.getElementById('rf-vdp').value) || 0;
  const towardsB = document.getElementById('rf-p-towards-b').checked;

  const L = hda + hdb;
  const xp = towardsB ? (hda + hdp) : (hda - hdp);
  const za = vda;
  const zb = vdb;
  const zp = vdp;

  const solvedDiv = document.getElementById('rf-solved-text');
  if (solvedDiv) {
    solvedDiv.innerHTML = 
      `<strong>Solved Geometry (Instrument Eye Elevation = 0.0m):</strong><br>` +
      `• Span L = <strong>${L.toFixed(2)} m</strong> (Horiz Projection)<br>` +
      `• Position xp = <strong>${xp.toFixed(2)} m</strong> (Horiz Projection)<br>` +
      `• Hook ZA = <strong>${za.toFixed(3)} m</strong> (Vert Projection)<br>` +
      `• Hook ZB = <strong>${zb.toFixed(3)} m</strong> (Vert Projection)<br>` +
      `• Conductor ZP = <strong>${zp.toFixed(3)} m</strong> (Vert Projection)`;
  }
}

function applyRangefinderReadings() {
  const hda = parseFloat(document.getElementById('rf-hda').value) || 0;
  const vda = parseFloat(document.getElementById('rf-vda').value) || 0;
  const hdb = parseFloat(document.getElementById('rf-hdb').value) || 0;
  const vdb = parseFloat(document.getElementById('rf-vdb').value) || 0;
  const hdp = parseFloat(document.getElementById('rf-hdp').value) || 0;
  const vdp = parseFloat(document.getElementById('rf-vdp').value) || 0;
  const towardsB = document.getElementById('rf-p-towards-b').checked;

  const L = hda + hdb;
  const xp = towardsB ? (hda + hdp) : (hda - hdp);

  // Apply to primary inputs
  document.getElementById('tp-span').value = L.toFixed(2);
  document.getElementById('tp-xp').value = xp.toFixed(2);
  
  // Enforce Z-Coordinates input mode
  document.getElementById('tp-input-mode').value = 'z-coords';
  toggleInputMode();

  document.getElementById('tp-za').value = vda.toFixed(3);
  document.getElementById('tp-zb').value = vdb.toFixed(3);
  document.getElementById('tp-zp').value = vdp.toFixed(3);

  // Recalculate
  calculateThreePoint();
}

// ==========================================================================
// 5. ERROR PROPAGATION MATH HELPER
// ==========================================================================
function calculatePerturbedTension(w, L, xp, za, zb, zp, delta, variable) {
  let tempL = L;
  let tempXp = xp;
  let tempZa = za;
  let tempZb = zb;
  let tempZp = zp;

  if (variable === 'zp') tempZp += delta;
  if (variable === 'xp') tempXp += delta;
  if (variable === 'L') tempL += delta;
  if (variable === 'za') tempZa += delta;
  if (variable === 'zb') tempZb += delta;

  const h = tempZb - tempZa;
  const yChord = tempZa + (h / tempL) * tempXp;
  const offsetD = yChord - tempZp;
  
  if (offsetD <= 0) return 0;
  return (w * tempXp * (tempL - tempXp)) / (2 * offsetD);
}
