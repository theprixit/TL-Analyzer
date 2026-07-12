# Changelog

## v0.11.8-beta — 2026-07-12

- **Anonymous visit counting** via GoatCounter (owner statistics only — nothing visible on the page): counts unique visitors, no cookies, no personal data, and none of the engineering data, which never leaves the device. Declared openly in the page footer. localhost visits are ignored, so development never skews the numbers.

## v0.11.7-beta — 2026-07-12

**One-tap app install** — ready for the wider mobile beta:

- The landing gate now shows a green **📲 Install as app** banner (plus an Install button in the header). On Android and desktop Chrome it opens the browser's native install dialog directly; on iPhone/iPad — where Apple provides no install API — it shows the exact two-step instructions (Share ⬆️ → Add to Home Screen).
- The banner appears only when installation is actually possible and disappears once the app is installed (or when already running as the installed app).

## v0.11.6-beta — 2026-07-12

- **iOS Home Screen icon cache busted**: iOS caches the Home Screen icon by its URL, so even after v0.11.5 the installed web-clip could keep the old artwork (the Add-to-Home-Screen preview showed the new one, the Home Screen kept the old). The icon file is renamed (`apple-touch-icon-v2.png`), which forces iOS to fetch it fresh. Remove the old Home Screen icon and add again.

## v0.11.5-beta — 2026-07-12

**App icon redesigned** (the one on your browser tab and phone Home Screen):

- The conductor now **sags** between the towers (the old icon arched upward — the one curve a sag analyzer must not draw), with the amber lowest-point marker from the measurement workflow.
- The iOS Home Screen icon is now a full-bleed opaque square — iOS rounds the corners itself; the old transparent corners rendered black on the Home Screen.
- To see the new icon on an already-installed app: remove it from the Home Screen and Add to Home Screen again (iOS snapshots the icon at install time).

## v0.11.4-beta — 2026-07-12

**The photo tool on phones is now preview → editor** (the definitive fix for the scroll-hijack trap):

- In the page, the photo canvas is a **passive preview** — it captures no touches, so page scrolling works normally over it, and portrait no longer shows a sprawling half-broken toolbar. One prominent **"✎ Edit photo"** button opens the editor.
- **All editing happens in the fullscreen editor** (portrait or landscape): gestures navigate, crosshair + toolbar act, an on-canvas hint says what to aim at next, and a **✓ Done** button always returns you to the page. There is no state without an exit.
- Desktop is completely unchanged (mouse tools, in-page editing).

## v0.11.3-beta — 2026-07-11

Touch fixes from continued iPhone testing:

- **Black-screen trap eliminated at the root**: (1) the view is now rubber-band clamped — the photo can never be panned/zoomed fully off-screen, so there is no blackness to get lost in; (2) ghost-pointer self-healing — iOS system gestures sometimes swallow a touch-release, which previously left the canvas believing a pinch was in progress and killed all gestures until reload.
- **Selection now survives panning** (the whole point of the crosshair-move flow — pan to aim, then press Move here). Deselecting is a deliberate *tap* on empty photo; a quick double-tap on empty photo snaps to Fit view.
- While the fullscreen editor is active, native page-zoom is blocked app-wide (previously a pinch straddling the canvas edge could still zoom the page).

## v0.11.2-beta — 2026-07-11

Landscape editing + crosshair point-moving (real-iPhone feedback):

- **Rotate to landscape → the photo editor goes fullscreen automatically** (the page layout can't fit the workspace plus chrome in ~390px of height; the ⛶ button exits as usual). Fullscreen toolbar keeps to a single row and respects the iPhone home-bar safe area.
- **Moving points now uses the crosshair too**: tapping a point *selects* it (gold ring) — a dragging finger hides its own target — then aim the crosshair and press **✥ Move here**. A **🗑 Point** button deletes the selection; double-tap delete still works. The toolbar swaps between Place and Move/Delete automatically.
- Removed the "FLAGSHIP" label from the photo tool banner.

## v0.11.1-beta — 2026-07-11

First real-iPhone feedback fixes:

- **Escaped the zoom trap**: iOS Safari could hijack a pinch that started on the photo canvas as *page* zoom, blowing the toolbar off-screen with no way back. The canvas now blocks the native gesture (our pinch handler owns it), and **double-tapping any empty area of the photo snaps back to Fit view** — a guaranteed escape hatch from deep zoom into dark regions.
- **🗑 Clear button** on the canvas toolbar — removes all placed points and the trace (photo stays), with a confirmation prompt. The side-panel Reset Points now also asks before wiping.
- Fixed the start-screen action cards rendering as squeezed columns on phones for returning users (a persona style overrode the mobile collapse).

## v0.11.0-beta — 2026-07-11

**Phase 3: TL-SAG on your phone — installable, offline, touch-native.** No app store, no fees: open the live site once, *Add to Home Screen*, and it launches full-screen and works with no signal.

- **PWA**: web app manifest + service worker (offline-first app shell with background refresh), app icons, iOS/Android install metas. A "📷 Camera" button captures span photos straight from the phone camera (EXIF intact).
- **Mobile-responsive UI**: the desktop layout previously broke on phones (98px sideways overflow, unreadable 2px chart text, a photo canvas taller than the screen). Now: compact stacked header, charts keep legible text and scroll horizontally instead of shrinking, tables scroll, the photo canvas fits the viewport.
- **Touch-native photo workspace** (the flagship flow, rethought for fingers): one finger pans, pinch zooms — native photo-viewer feel — and points are placed with a **centre crosshair + big "＋ Place" button** (steer the wire under the crosshair at any zoom; pixel-precise, no fat-finger error). Tapping an existing point still grabs it with the magnifier loupe; double-tap deletes. The toolbar docks to the bottom of the canvas with thumb-sized buttons.
- **iPhone fullscreen fixed**: iOS Safari has no fullscreen API for page elements — the ⛶ button now falls back to an equivalent fixed overlay (in the installed app it is true fullscreen).
- Install/backup guidance on the start screen (iOS can clear browser storage after weeks of disuse — Export what matters).

Desktop behaviour is unchanged.

## v0.10.2-beta — 2026-07-11

Whole-app QA sweep:

- **Experimental context now follows applied results**: applying a span-free camera result stamps the Calculation Results panel with the EXPERIMENTAL/UNCALIBRATED warning (previously it showed a clean "SAFE" verdict with no caveat), and results stamped INVALID (outside the expected span range) **cannot be applied at all**.
- **Mountain Helper & Laser Rangefinder tools brought up to app standards**: all 19 pre-filled sample values removed (they silently produced fake solutions), blank inputs now show "enter your readings" prompts instead of zeros, and the Apply buttons refuse to run before anything is solved — the mountain helper previously wrote sample values (L=300, h=35!) into the primary inputs when its fields were incomplete.
- Custom-conductor fields no longer pre-fill Zebra's values.
- Removed the dead detailed-CAD-results code (page was retired in v0.6). Duplicate-ID scan clean.

## v0.10.1-beta — 2026-07-11

Field-feedback fixes for the span-free mode and beyond:

- **Range inputs**: Span L and both tower heights now accept ranges — type `600-800` or `25-30` when the exact value isn't known. Headline figures use the midpoint; the Monte-Carlo band samples the full range, so uncertainty in your records becomes an honest tension band. Camera calibration also accepts a span range (stores the correction spread).
- **Camera-mode guardrails**: the span field becomes an optional *expected range* — if the camera-solved span lands outside it, results are stamped **⛔ INVALID** with the likely cause (zoom/lens mismatch with the calibration). This catches the 2–3× tension errors a tester hit with an unmatched camera profile. Prominent EXPERIMENTAL disclaimers now sit in the results themselves, calibrated or not.
- **Visualizer fixed for steep spans**: large hook-elevation differences (e.g. h = −83 m) pushed the conductor off the canvas; the sketch now auto-scales metres→pixels so slope and sag always fit.

## v0.10.0-beta — 2026-07-11

**Span-free photo calibration (EXPERIMENTAL)** — measure a span without knowing its length:

- New calibration method **"📷 Camera + tower heights — span-free"**: using the photo's focal length (read automatically from EXIF) the perspective mapping is metrically decomposed, so **span length and hook difference become outputs** — only the tower heights are needed.
- **Camera profiles**: phone EXIF focals are nominal (validation on the real 788 m Kashang–Bhaba span showed a −24% systematic bias), so the mode requires a **one-time calibration per camera**: point it at any span with a known length, press *Calibrate camera*, and the correction (×1.343 for the test phone) is stored and auto-applied to every later photo from that camera. Calibrated, the test photo solves L = 788.1 m from the image alone.
- Uncalibrated results carry an explicit ±25% warning; the Monte-Carlo band includes focal uncertainty (±2% calibrated / ±10% not) and span re-solving per sample. WhatsApp-forwarded images (EXIF stripped) are detected with guidance to use the original file.
- Engine: `solveSpanFromCamera`, `focalForSpan`, `fxFrom35mm` with 8 new unit tests (58 total) including exact synthetic-camera span recovery.

All notable user-visible changes to TL-SAG. Version numbers follow [semantic versioning](https://semver.org/); the app is currently in **beta** — calculation results should be cross-checked before safety-critical use.

## v0.9.5-beta — 2026-07-11

One authoritative tension figure per panel (testers were seeing three competing numbers):

- The Calculation Results **headline is now the catenary-exact tension** (best model); the classic parabolic field formula moved into the calculation log, labelled as the approximation it is, with the refinement step shown. Verdict, %UTS, safety chart and temperature analysis all follow the headline — the app is internally consistent.
- The safety-curve chart is now computed catenary-exact too, so the operating point stays on the curve.
- After **Apply from the photo tool**, the results card shows one connecting line — *"Photo catenary fit: X kN (90% band …)"* — and the band visibly contains the hook-anchored headline. The line disappears the moment inputs are edited away from the applied geometry.
- Sensitivity percentages are computed against a consistent parabolic baseline.

## v0.9.4-beta — 2026-07-11

- **Catenary-exact cross-check** in the Calculation Results panel: for the entered L/h/xp/D the engine now also solves the exact catenary (new `catenaryCFromChordSag`, bisection on the hook-anchored catenary), and whenever it diverges from the parabolic field formula by more than 0.3% a note shows both figures. On deep-sag spans (D/L ≳ 5%) the parabolic formula **under-reads** tension — ~1.2% on the 788 m example.
- Clarifies the photo-vs-panel difference testers noticed: the Photo Sag Tracker's tension comes from a least-squares fit through the *traced wire* (hook clicks only calibrate scale), so it can sit slightly to either side of the hook-anchored figures — that spread is real click-uncertainty, echoed by the Monte-Carlo band.
- 6 new engine tests (50 total) — including one that corrected the author's own sign expectation for the parabola/catenary gap.

## v0.9.3-beta — 2026-07-11

- Example project refreshed with a recalibrated Kashang–Bhaba trace (36 points, per-tower heights 27.5 m / 24 m, fit RMS under 1 m); the example download is now version-cache-busted so updates reach returning browsers.
- Base-point instructions now teach the plumb rule explicitly: click the ground point **directly below the hook** (under the crossarm tip — not a tower leg), and the entered tower height must be the hook's height above that same point.
- The Vertical Reference tool is hidden in Perspective 4-Point mode — the homography corrects camera roll exactly, so the tool only applies to the chord / tower-height calibrations.

## v0.9.2-beta — 2026-07-09

Landing experience redesigned for first-time visitors:

- **First visit** now opens on a proper landing: one line explaining what the app is, a 3-step "how it works" strip (Photograph → Calibrate → Results), and two big actions — **See it in action** (example project) and **Start your own project**. No empty "resume" list, no form demanding a name before the app has introduced itself.
- **Returning visitors** (saved projects on the device) skip the hero and land straight on their project list.
- Footer of the landing links to the physics sandbox and keeps import / quick-calculation escape hatches.

## v0.9.1-beta — 2026-07-09

Temperature analysis redesigned around what the field can actually measure:

- **Ambient temperature is now the primary input** (nobody knows conductor temperature in the field!). A "conditions during measurement" selector brackets the unknown solar/load heating (overcast/off-load ≈ ambient, up to +5/+10/+20 °C) and the analysis shows an honest **band** instead of a false-precision line. An optional IR-measured conductor temperature collapses the band.
- **Winter cold-condition check**: the plot now extends below zero and a dedicated verdict reports the estimated static tension and %UTS at your chosen low temperature (default −10 °C) — built for the "will it be over-tensioned in snow conditions at minimum load?" question. Wind/ice load cases are explicitly out of scope (IS 802 checks add those).
- Field guidance built in: measuring at minimum load, early morning or overcast makes conductor ≈ ambient nearly exact.

## v0.9.0-beta — 2026-07-09

Field-tester requests: temperature behaviour and tower heights without drawings.

- **Tension vs. Conductor Temperature (change of state)**: enter the conductor temperature at the time of measurement and the app projects tension and sag across 0–85 °C using the parabolic change-of-state equation, anchored at your measured tension — chart plus a key-temperature table (0/15/32/45/65/85 °C with kN, kgf, mid-span sag and %UTS). Uses typical final-modulus E, area and expansion coefficients for the IS 398 ACSR catalogue (stated in the output; verify against datasheets for critical studies). Included in the printed report.
- **Rangefinder hook-height helper** in the photo panel: when tower drawings aren't available (old lines, poor records), shoot the hook and the tower base from one station — slant distances + inclinations, or horizontal distance + two inclinations — and apply the computed hook-to-base height straight into the Tower A/B fields.
- Removed "real-time" phrasing from the visualizer and results panels ("updates as you edit the inputs" is what it actually does).
- Engine: `changeOfState` and hook-height helpers added with 8 new unit tests (44 total).

## v0.8.1-beta — 2026-07-09

- **"Load a real example project"** on the start screen: one click loads the bundled 220kV Kashang–Bhaba river crossing (788 m span, photo, 60-point conductor trace, perspective calibration) — the fastest way for a new tester to see a fully worked analysis.
- Fixed the Physics Sandbox sidebar layout — the Quick Calculator inputs and labels were truncated by an over-narrow column.
- Tagline simplified to "Overhead Line Sag-Tension Calculator".

## v0.8.0-beta — 2026-07-09

- **Physics Sandbox integrated**: rebranded as *TL-SAG Physics Sandbox* with a back-link to the app, a callout pointing to the flagship Photo Catenary method's in-app explainer, and a footer with license/source links. (All three interactive simulations verified working.)
- **Safety curve v2**: taller plot (no longer artificially squeezed) and the UTS threshold labels moved inside the plot's right edge — they previously collided with the rotated tension-axis title.

## v0.7.1-beta — 2026-07-09

Analysis section polish:

- **Sag-vs-Tension safety curve redesigned in a wide format** and given full-panel width — same emphasis as the photo tool and the geometry visualizer; sensitivity analysis and the calculation log now sit side by side beneath it.
- **Three-point visualizer upgraded**: lattice tower bracing, crossarms and insulator strings at both hooks (Tower B's ride its dynamic hook), foundation blocks, arrowheaded dimension lines, and a cased conductor stroke for contrast.
- **Calculation log numbering fixed**: in chord/offset input mode the steps jumped from 2 to 4; they now number continuously.
- Measurement Guidelines & Survey Procedures section collapsed into a dropdown (like the photo calibration explainer) — less scroll for daily use, still one click away.

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
