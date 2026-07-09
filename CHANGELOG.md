# Changelog

All notable user-visible changes to TL-SAG. Version numbers follow [semantic versioning](https://semver.org/); the app is currently in **beta** — calculation results should be cross-checked before safety-critical use.

## v0.7.0-beta — 2026-07-09

Calibration inputs live with the photo tool, and the tool now teaches its own physics:

- **Span L and hook elevation difference h are now entered directly in the photo panel** (they fall back to the Primary Inputs if left blank) — calibration data lives together with the tool that uses it.
- **Entered values are annotated on the photo itself**: L on the chord, h at Hook B, and the tower heights along their tower lines — so a wrong entry is visible at the geometry it describes.
- **New "How the photo calibration works" explainer** built into the photo panel (collapsible): the world-model diagram, why different ground elevations are handled automatically, and the input-sensitivity physics — h barely affects tension (shear has no curvature), tower heights matter ~1:1, span matters ~2:1 (T ∝ L²/H).
- Project files now save/restore the photo-panel L and h fields.

## v0.6.0-beta — 2026-07-09

## v0.6.0-beta — 2026-07-09

Workspace & report usability pass (from field-test feedback):

- **On-canvas toolbar**: Place/Pan/Vertical Ref/Undo/Fit/Fullscreen now float on the photo itself — and stay available in fullscreen editing.
- **Delete points**: right-click (desktop) or double-tap (touch) any placed point to remove it; hovering a point shows a move cursor so it's obvious points are draggable.
- **Fit results moved below the canvas** at full panel width — no more cramped skinny results column; the Monte-Carlo histogram gets proper room.
- **Sag-vs-Tension chart axis is now dynamic** — an 80 m slack-stringing sag previously pinned the operating point to the clamped chart edge; the axis now expands to fit the measured sag.
- **Three-point visualizer** moved into the input column so the results panel top-aligns with it (no more dead space beside it).
- **Print page breaks disciplined**: headings stay with their content; figures, tables, cards and the photo never split across pages.
- Removed the separate "Detailed CAD Results" page button — the printed report now carries the sketch, chart and distribution, making it redundant. The physics sandbox link moved from the header to the footer.
- Added a reassurance note in perspective mode: in oblique photos the true max-sag point does not coincide with where the curve *looks* lowest (projection shifts the visual bottom toward the camera) — the tool now says so explicitly when the gap is noticeable, instead of letting users doubt the marker.

## v0.5.1-beta — 2026-07-09

UI & report polish pass:

- **Photo tool promoted to flagship position** — now the first, full-width panel with a much larger canvas (660px); the three-point geometry visualizer moved below it at reduced width.
- **Report redesigned** to carry the app's visual identity: modern typography, colored section headings, app-style assessment card, and two new embedded figures — the **Sag vs. Tension safety curve** and the **Monte-Carlo tension distribution** now print alongside the photo and sketch.
- Fixed truncated calibration-method dropdowns in the photo panel (labels were cut off); shortened option labels and stacked the control fields.

## v0.5.0-beta — 2026-07-09

Driven by the first real field test (oblique river-crossing photo with a distant, blurry far tower):

- **Probabilistic tension estimate**: after every catenary trace, the tool re-solves ~160 times with realistic click scatter (±3 px on hooks/bases, ±2 px on trace points) and reports a **90% probable tension range with a distribution plot** — because clicking a blurry far tower a few pixels off changes the answer, a single number is deceptive.
- **Tension shown in kgf** alongside kN everywhere (results, photo tool, report).
- **Adaptive report**: empty fields are no longer printed — the metadata table only lists what was actually entered.
- **Landscape report** orientation, giving the annotated photograph and geometry sketch full width.
- **Estimation language**: report assessments now say "estimated tension within safe limits" etc. instead of "APPROVED / REJECTED" — the tool estimates, it does not certify.
- Trace points recoloured from pink to **cyan with a white ring** — visible against rock, vegetation and sky.
- Fixed: perspective tower heights (A/B) were not saved in project files, so re-imported projects lost their calibration.

## v0.4.0-beta — 2026-07-08

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
