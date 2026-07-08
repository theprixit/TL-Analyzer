# TL-SAG — Transmission Line Sag & Tension Analyzer

A browser-based tool for calculating overhead conductor tension from field sag measurements. Built to solve the practical difficulty of quickly verifying conductor tension in transmission lines using simple field instruments — primarily in mountainous and difficult terrain where traditional sag-tension charts are hard to apply.

## What It Does

Given a few field measurements (tower hook elevations and a single conductor sighting), TL-SAG computes:

- **Horizontal Tension (T)** in the conductor
- **Equivalent mid-span sag** for a level span
- **Safety factor** against Ultimate Tensile Strength (UTS)
- **Compliance verdict** per IS 398 / utility everyday tension guidelines

All computation runs **entirely client-side** in the browser — no server, no installation, no data leaves your device.

## Field Methods Supported

### 1. Three-Point Coordinate Sighting (Primary)
Shoot Z-elevations at Tower A hook, Tower B hook, and a conductor point using a Total Station or theodolite. The tool solves for tension using the parabolic sag equation:

```
T = (w × xp × (L − xp)) / (2 × D)
```

### 2. Oblique Laser Rangefinder Solver
For mountainous terrain where you cannot position directly below the line — measure slant distances and angles from an off-axis viewpoint. The tool projects 3D rangefinder readings into the span plane to extract L, h, xp, and D.

### 3. Photo Sag Tracker (Catenary Tracing & Fitting)
Upload a photo of the span (shot as perpendicular to the span as possible). Mark the two tower hooks, then **trace 10–20 points along the conductor** — the tool least-squares fits a catenary `y = y0 + C·(cosh((x−x0)/C) − 1)` through the trace and extracts the catenary constant `C = T/w`, giving horizontal tension **directly from the curve shape**, plus max/mid-span sag and an RMS fit-quality score. A quick 3-point mode (hooks + lowest point) is also available.

Workspace features: scroll/pinch zoom, pan, magnifier loupe during point placement, drag-to-adjust any point, undo, and optional **camera-roll correction** by marking a plumb-vertical reference (e.g. tower body edge).

Image calibration methods:
- **Perspective 4-Point (recommended)** — mark both hooks and both tower bases; with the span length and tower structural heights, a planar homography rectifies the photo into true metres in the span plane. Handles **oblique shots** (span receding into a valley) and camera roll exactly.
- **Chord calibration** (square-on photos; known span L and height difference h)
- **Tower height calibration** (square-on photos; known tower height from drawings)

### 4. Mountain Span Solver
Calculate horizontal span L and height difference h from GPS hook elevations + slant distance, or from slant distance + angle of inclination.

### 5. Return Wave Method
Time a mechanical wave pulse reflected along the conductor to estimate sag from wave velocity.

## Key Features

- **Live catenary SVG visualizer** updating in real-time with inputs
- **Sag vs. Tension safety curve** with UTS threshold bands
- **Statistical sensitivity analysis** with RSS error propagation
- **Print-ready engineering report** — annotated span photograph, span geometry sketch, results & calculation log
- **Project-first workflow** — work starts by creating/resuming a named project; everything auto-saves to the browser on this device
- **Project save/load** via local JSON export/import (backup & sharing between devices)
- **Dedicated results page** for analysis review
- **Interactive sandbox visualizer** (explanations.html) with sliders for each method

## Usage

Open `index.html` in any modern browser. No build step required.

To deploy as a static site (e.g. GitHub Pages), simply serve the repository root — all files are plain HTML/CSS/JS.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main calculator application |
| `engine.js` | Pure calculation engine (no DOM) — sag/tension formulas, catenary least-squares fitter, error propagation. Unit-tested; reusable by the future mobile app |
| `app.js` | UI controller, visualizer logic, export/import |
| `phototracker.js` | Interactive photo canvas: zoom/pan/loupe, catenary tracing, roll correction |
| `style.css` | Application styling and layout |
| `explanations.html` | Interactive sandbox visualizer with physics explanations |
| `results.html` | Dedicated results analysis page |
| `tests/engine.test.js` | Engine unit tests — run `node tests/engine.test.js`, or open `tests/index.html` in a browser |

## License

This project is released under the [MIT License](LICENSE).

## Credits

Initiated to solve practical field difficulties of quickly calculating conductor tension in transmission lines using simple tools available — primarily for mountainous areas of Himachal Pradesh, India.

**Contributors:** Keshav Attri, Parikshit Pal, Sanjay Negi — Power Transmission Engineers, Himachal Pradesh.

---

*Conforms to IS 398 & Indian Standard Electricity Utility Guidelines*
