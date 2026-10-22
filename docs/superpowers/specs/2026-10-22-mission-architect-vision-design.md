# Mission Architect — Vision Prototype Design

Date: 2026-10-22 · Branch: `vision-prototype` · Challenge: NASA Space Apps 2026, "Space Mission Design Game"

## 1. Intent

Build a **vision prototype** to show the team what a winning entry looks like. It is not the hackathon submission: the team will rebuild a smaller version in the 48 h of the event (Nov 14–15, 2026). So this prototype can be ambitious, but every piece must be something the team could reproduce in a cut-down form (section 11).

The two things the user wants judges to remember:

1. **Visual wow**: cinematic 3D, polished look, from the first seconds of the demo video.
2. **Visible, serious math on real NASA data**: the player should feel they are using the same tools real mission designers use, not a toy.

Why this wins (from research on 2022–2025 global winners and the judging guide):

- Judges score Impact, Creativity, Validity, Relevance, Presentation (1–5 each). Relevance explicitly requires NASA data to be "a core component… rather than a superficial addition". Without NASA data a project cannot win a global award.
- Closest past winner (PureFlow, 2025 Best Mission Concept) won by making real NASA data drive the gameplay (live solar storms stress-test the design).
- Target awards: Best Mission Concept, Best Use of Data, Art & Technology.
- A second 2026 challenge ("Junior Astronaut Mission Trainer") will draw similar games. We differ by covering the **whole mission**: objective, trajectory, launch vehicle, spacecraft, flight, operations.

## 2. Audience

High-school and undergraduate students with no space-engineering background (from the existing `Contexto.md`). Also the judges, who see it first through a ≤30 s video.

## 3. The core idea: one real feedback loop

Real interplanetary mission design is a loop. The game is built around it:

```
launch date (porkchop plot) → departure energy C3 + arrival speed v∞
        ↓                                   ↓
your rocket's capacity at that C3       propellant needed for Mars orbit insertion
(rocket equation, stage by stage)            ↓
        ↓                                   ↓
        maximum spacecraft wet mass  ←──  spacecraft design (power, comms, instruments, shielding, propellant)
        ↓
     budget (rocket cost + spacecraft cost) ≤ mission cap
```

Picking a cheaper launch date lets you carry more spacecraft. Picking a heavier spacecraft forces a bigger (more expensive) rocket or a better date. This is the challenge's "competing demands" made concrete and visible.

**Design sets the stage; decisions in flight play it out.** The design fixes what the spacecraft *can* do (margins, shielding, power, propellant, data capacity). After launch the player **manages** the mission with a few meaningful decisions during cruise and operations, always constrained by that design: a well-designed spacecraft has good options, a marginal one only bad ones. The report traces each outcome back to both the design choice and the in-flight decision.

Trajectory, rocket and spacecraft (steps 3–5 below) form one **design workspace**: the player moves freely between them, every readout updates live, and a launch checklist (mass margin, TWR, Δv, budget, power) gates the launch button.

## 4. Player journey (one mission fully playable)

1. **Mission select.** Three objective cards. **Mars orbiter ("Red Watch")** is playable. Europa flyby and near-Earth asteroid sample return are visible but locked ("coming soon"), to show scope.
2. **Briefing.** Objective, science goal, budget cap, the 2026 Mars window, and a Δv map. Short and skippable.
3. **Trajectory design: porkchop plot.** A heatmap of departure date vs. arrival date, computed live in the browser with a Lambert solver on real JPL Horizons ephemerides. Contour lines for C3 and arrival v∞. Hover shows C3, time of flight, arrival v∞, and previews the transfer arc in the 3D view. Click locks the choice. This is the "math wow" moment.
4. **Rocket building (modular, 3D).** The player stacks stages from modular parts (tanks, engines, decouplers, fairing, optional strap-on boosters) in a 3D hangar, like the prototype's builder but in 3D. Engine parts carry real published specs (Isp, thrust, mass) of real engine families, named generically or by engine name, never with logos. Live readouts per stage: Δv, TWR, mass, cost; and for the whole rocket, **the payload mass it can send to the C3 chosen on the porkchop**. Preset templates built from the same parts reproduce real vehicle classes (e.g. an Atlas V-like or Falcon 9-like stack) so beginners can start from something that works; their computed capacity is checked against NASA Launch Services Program C3 curves.
5. **Spacecraft design.** Subsystems with real-world-scale numbers:
   - Power: solar array size, battery, RTG option. Generation scales with 1/r² from the Sun.
   - Comms: antenna choice. Data rate from a simple link budget, falls with 1/d² from Earth.
   - Instruments: camera, spectrometer, radar, magnetometer (science value, mass, power, data volume).
   - Protection: radiation shielding.
   - Propulsion: propellant mass for Mars orbit insertion, computed from the chosen arrival v∞ via the rocket equation.
   - Live readouts: wet mass vs. launch capacity (with a required mass margin), power budget at Mars, data budget, total cost vs. cap.
   - The 3D spacecraft model updates as parts change (bigger panels, bigger dish).
6. **Launch (3D).** The player's own rocket lifts off from a stylized pad, with visible staging (each stage separating as its propellant runs out), fairing separation, and a readout of Δv spent. Too little TWR → it doesn't leave the pad; not enough Δv → it never reaches the departure, and the report explains why.
7. **Departure and cruise (3D cinematic).** Departure burn from Earth parking orbit, then cruise along the Lambert arc with time warp. Camera follows the spacecraft; planets at their real positions for each date.
8. **Cruise events from real data, with decisions.** Historical solar flares/CMEs from NASA DONKI are mapped onto cruise days (labelled "based on the real event of <date>"). Time warp stops and the player chooses a response, e.g. enter safe mode (lose time, protect electronics), keep instruments on (risk damage, gain cruise science), or reorient to shield with the bus. The options available and their odds depend on the design (shielding, power margin, battery). Also during cruise: **trajectory correction maneuvers** (TCMs). The Lambert arc has a small injection error from launch; the player decides when and how much propellant to spend correcting it (early is cheap, late is expensive, skipping risks a bad arrival).
9. **Mars orbit insertion.** Capture burn using the spacecraft's propellant. Not enough → flyby (failure).
10. **Science operations.** Turns in Mars orbit. Each turn the player picks which instruments run and what to downlink, within the power and data budgets the design allows. Power at 1.5 AU, data return limited by Earth–Mars distance (from the same ephemerides), signal delay d/c, and solar conjunction blackout if it falls in the period. Shown as a clear timeline: science collected vs. science actually downlinked.
11. **Report.** Outcome, score, stars, lessons tied to the physics of what happened, and a comparison with a real Mars orbiter (e.g. MAVEN or MRO: launch vehicle, mass, cost, arrival date).

A live **Physics panel** stays from the prototype: in every phase it shows the concepts in play with formula, plain-language explanation and the current numbers plugged in. New concepts to add: Lambert's problem, C3, porkchop plot, mass margin, link budget.

## 5. Real data (NASA first)

All external data is **fetched ahead of time into static JSON in the repo** by small Node scripts committed under `scripts/`. The game never depends on a live API during play or a demo.

| Data | Source | Use |
|---|---|---|
| Earth and Mars state vectors, daily, covering the porkchop range and the operations period | JPL Horizons API (heliocentric, ecliptic J2000) | Porkchop, 3D positions, Earth–Mars distance |
| Engine specs (Isp, thrust, mass) | Published figures for real engine families (NASA for RS-25 / RL10; manufacturer data for others), cited | Rocket parts |
| Launch vehicle payload vs. C3 curves | NASA Launch Services Program performance site (elvperf.ksc.nasa.gov). Fallback: vendor user guides, cited | Validating preset rockets; shown as "real-world reference" next to the player's rocket |
| Historical solar flares / CMEs | NASA DONKI (api.nasa.gov) | Cruise events |
| Planet textures, star background | NASA public-domain imagery (e.g. Solar System Exploration textures, SVS Deep Star Maps) | 3D visuals |
| Instrument and subsystem reference numbers | Real mission figures (MRO, MAVEN) and the NASA SmallSat State-of-the-Art report | Part catalog scale |
| Real mission comparison | NASA mission pages | Report |

Every data file records its source and fetch date. An in-game "Data sources" screen lists them (this is also what goes in the submission's NASA Data field).

Constants and planet data are **real**. Part prices, science points and event effects are **game balance** inspired by real orders of magnitude, and the game says so (the prototype's "How the game simplifies" section stays).

## 6. Math

- **Lambert solver** (single revolution, prograde), e.g. Izzo's or universal-variables method. Pure function, unit-tested.
- **Porkchop**: grid over departure × arrival dates. Per cell: C3 = |v∞,dep|², arrival v∞. Must compute fast enough to feel instant (use a Web Worker if needed).
- **Validation**: the 2026 window minimum C3 and its dates must match a published reference (NASA mission design handbook porkchop or a GMAT run) within a stated tolerance. The reference and result go in the tests and on the Data sources screen.
- **Propagation** along the chosen arc: two-body Kepler, already in `js/physics/orbit.js` (extend to 3D).
- **Escape / capture**: existing `escapeBurn` / `captureBurn`, driven by v∞ from the Lambert solution.
- **Rocket equation** stage by stage (existing `rocket.js` logic), for both the launcher and the spacecraft's own propellant.
- **Launcher capacity to a C3**: Δv required = ascent to parking orbit (fixed budget including gravity and drag losses, as in the prototype) + departure burn for that C3 (`escapeBurn` with v∞ = √C3). Capacity = the largest payload mass for which the rocket's total Δv still covers it (solve by bisection). Preset rockets must land within a stated tolerance of their LSP reference curve; the tolerance and results go in the tests.
- **Launch animation** follows the same numbers: stage burn times from propellant mass and mass flow (thrust / (Isp·g₀)), staging when each stage's Δv is spent. It is a visualization of the computed result, not a separate flight simulation.
- **Power** ∝ 1/r², **data rate** ∝ 1/d², **signal delay** d/c (existing ops logic).

Simplifications to declare on screen: two-body patched conics, impulsive burns, launch to departure not flown (capacity comes from the vehicle's C3 curve), no gravity assists.

## 7. Look and feel

- Cinematic 3D solar system: real textures, bloom/glow, starfield, glowing trajectory arc, smooth camera moves between scales (Earth departure, interplanetary, Mars orbit).
- The rest of the UI is mission-control style: dark, precise, readable numbers, restrained colour, clear hierarchy. It must not look like a generic admin dashboard.
- **No NASA logos or mission insignia** (Space Apps rule). Real mission names only in factual comparisons.
- English only (Space Apps requires English).
- Desktop-first (1280 px and up). Must not break on a laptop; phone support not required.

## 8. Tech

- **Vite + Three.js + plain JavaScript ES modules.** No UI framework.
- Reuse the prototype's pure modules where they fit: `js/physics/orbit.js`, `js/physics/rocket.js`, `js/data/constants.js`, the concepts/physics-panel pattern, the lessons pattern. Keep the "physics and game rules never touch the DOM" layering so they stay testable with `node --test`.
- The prototype's KSP-style stage builder is kept as a concept and rebuilt as a 3D modular hangar with real engine data. The 2D canvas map is replaced by the 3D scene.
- Translate all retained text from Portuguese to English.
- Deploy as a static site (the repo already has `vercel.json`).

## 9. Goals

- The full Mars loop is playable end to end in roughly 10–15 minutes.
- Every number the player sees is either real data, computed from real data, or labelled as game balance.
- The 30 s demo has at least five strong shots: rocket assembly in the 3D hangar, lift-off with staging, porkchop plot reveal, solar-flare hit during cruise, Mars capture plus report.
- A student who loses understands why, from the lessons.

## 10. Non-goals and anti-goals

**Non-goals:** free-form piloting after launch (decisions are discrete choices, not stick-and-throttle control), piloted launch or landing, aerodynamic or physics-engine flight simulation, n-body or gravity-assist trajectories, multiplayer, accounts, backend, saving to cloud, mobile layout, the locked missions (Europa, asteroid) beyond their teaser cards.

**Anti-goals (failure even if it works):**
- Pretty 3D on top of fake or decorative math.
- NASA data used only as decoration.
- So hard that a student without guidance gets stuck in the first two screens.
- A demo that can break because an API is down.
- An empty, "AI-generated dashboard" look.

## 11. Hackathon cut-down (what the 48 h team version keeps)

Not built now, but the prototype is structured so this cut is easy:

- **Keep:** porkchop plot on pre-fetched Horizons data, modular rocket with capacity vs. C3, spacecraft mass/power/budget design, simple cruise with one or two DONKI events, capture, report.
- **Simplify:** the rocket builder and launch can go back to 2D (the prototype's SVG stack); 3D becomes one solar-system scene with fewer camera moves (or 2D if time is short).
- **Drop:** locked mission teasers, extra subsystems, the real-mission comparison.

## 12. Left to the builder

- Exact Lambert algorithm, grid resolution and date ranges (centred on the real 2026 Earth–Mars window).
- Which engine families and part sizes, and which 2–3 preset rockets (presets must be vehicles with published LSP C3 curves; cost figures from public sources, cited).
- The look of the 3D parts and pad (stylized, logo-free).
- Exact part catalog values and scoring formula, within the constraints above.
- Which DONKI events to use and how they map onto cruise days.
- Camera choreography, post-processing, UI layout and visual details.
- Whether a "guided" difficulty mode is needed to meet the "not stuck" anti-goal.

## 13. Calls made by Claude (user to check)

1. (User decision) **Modular rocket building in 3D** stays, with a lift-off of the player's own rocket. My call on top: parts use real engine specs, and real launch-vehicle C3 curves are used to validate preset rockets rather than as a pick list.
2. Stack: Vite + Three.js + vanilla JS, dropping the prototype's "no frameworks / no 3D / no dependencies" rule.
3. All NASA data pre-fetched into static JSON (no live API calls during play).
4. Mars orbiter only playable. Europa and asteroid missions shown as locked teasers.
5. English-only UI. Desktop-first.
6. Work happens on the `vision-prototype` branch. The existing code stays on `main` untouched.
7. **Build order in tiers**, so a working loop exists early: (a) data scripts + Lambert/porkchop + launch vehicle + spacecraft design + capture + report, end to end, plain visuals; (b) 3D cinematic scene and camera; (c) DONKI cruise events, physics-panel additions, polish. If time runs short, the end-to-end loop wins over any single demo shot.
8. **Code written to be liftable.** Space Apps rules on pre-existing code are unconfirmed, so the solver, porkchop worker, fetch scripts and data files are clean, documented, tested modules that work both ways: the team can reuse them if allowed, or re-type them as a reference if not.
9. **Dev shortcuts, not a video pipeline.** A URL flag to jump to any phase with a preset design and a fixed seed for events, so demo shots are repeatable. Producing the video itself is out of scope.
10. (User decision) **Decisions during cruise** stay. My calls on top: the cruise decisions are flare responses and trajectory correction maneuvers; operations also get light per-turn choices (instruments and downlink), since the challenge says "manage". Drop the operations choices if they feel like too much.
11. Launch is a visualization of the computed numbers (staging timed from the rocket equation), not a physics-engine flight.
