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

### 3. Photo Sag Tracker
Upload a front-view photo of the span (e.g. from an opposite ridge). Click tower hooks and the conductor low point. The tool calibrates pixel-to-meter scale using either:
- **Chord calibration** (known span L and height difference h)
- **Tower height calibration** (known tower structural height from drawings)

### 4. Mountain Span Solver
Calculate horizontal span L and height difference h from GPS hook elevations + slant distance, or from slant distance + angle of inclination.

### 5. Return Wave Method
Time a mechanical wave pulse reflected along the conductor to estimate sag from wave velocity.

## Key Features

- **Live catenary SVG visualizer** updating in real-time with inputs
- **Sag vs. Tension safety curve** with UTS threshold bands
- **Statistical sensitivity analysis** with RSS error propagation
- **Print-ready engineering report** with signature blocks
- **Project save/load** via local JSON export/import
- **Dedicated results page** for analysis review
- **Interactive sandbox visualizer** (explanations.html) with sliders for each method

## Usage

Open `index.html` in any modern browser. No build step required.

To deploy as a static site (e.g. GitHub Pages), simply serve the repository root — all files are plain HTML/CSS/JS.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main calculator application |
| `app.js` | All calculation engines, visualizer logic, export/import |
| `style.css` | Application styling and layout |
| `explanations.html` | Interactive sandbox visualizer with physics explanations |
| `results.html` | Dedicated results analysis page |

## License

This project is released under the [MIT License](LICENSE).

## Credits

Initiated to solve practical field difficulties of quickly calculating conductor tension in transmission lines using simple tools available — primarily for mountainous areas of Himachal Pradesh, India.

**Contributors:** Keshav Attri, Parikshit Pal, Sanjay Negi — Power Transmission Engineers, Himachal Pradesh.

---

*Conforms to IS 398 & Indian Standard Electricity Utility Guidelines*
