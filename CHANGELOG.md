# Changelog

All notable user-visible changes to TL-SAG. Version numbers follow [semantic versioning](https://semver.org/); the app is currently in **beta** — calculation results should be cross-checked before safety-critical use.

## v0.4.0-beta — 2026-07-08

### Photo Sag Tracker v2 (major rebuild)
- **Full catenary tracing**: mark the tower hooks, then trace 10–20 points along the conductor — a catenary is least-squares fitted live and horizontal tension is extracted directly from the curve shape (T = w·C), with an RMS fit-quality verdict.
- **Perspective 4-Point calibration**: mark both hooks and both tower bases; with the span length and tower structural heights, the photo is rectified via planar homography — oblique valley shots and camera roll are handled exactly. (Validated: recovers known tension exactly on synthetic oblique spans where uniform-scale calibration errs by ~15%.)
- Workspace tools: scroll/pinch zoom, pan, magnifier loupe during placement, drag-to-adjust any point, undo, fullscreen editing, optional plumb-vertical reference for roll correction in scale modes.

### Project-first workflow
- The app now opens with a project screen: create a named project, resume a saved one (auto-saved on-device as you work), or import a project JSON.
- Methodology chooser after project creation guides you to the right tool.

### Reporting
- Renamed from "Certificate" to **Analysis Report**; signature blocks removed.
- Annotated span photograph (traced points + fitted catenary) now leads the report, followed by the live span-geometry engineering sketch.
- Report records the app version, project reference, and full fit summary.

### Accuracy & trust
- New pure calculation engine (`engine.js`) with 36 unit tests (`tests/`).
- Sample data removed — inputs start empty and solvers refuse to run on missing calibration values instead of silently assuming defaults.

### Fixed
- Photo annotations were lost when re-importing a saved project.
- Analysis charts were crammed into the narrow results column, leaving most of the screen blank.
- Projects dialog had no close button.

## v0.3.x — 2026-05-31 (pre-versioning)
- Full-width layout overhaul, sticky results, beta banner.
- Photo Sag Tracker v1 (3–4 click pixel scaling), local JSON save/resume, dedicated CAD results page.
- Laser rangefinder sighter (in-plane and oblique valley-to-valley), mountain span solver, GPS field helpers.

## v0.1.0 — 2026-05-31
- Initial release: three-point surveyor sighting solver with IS 398 ACSR conductor database, sag-tension safety verdicts, SVG visualizers, print report, sensitivity analysis.
