# Mission Architect Vision Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, cinematic Mars-orbiter mission game in which the player designs the trajectory (real porkchop plot), a modular rocket and a spacecraft, launches, manages cruise and science operations through decisions, and gets a physics-grounded report.

**Architecture:** Framework-free TypeScript modules for physics (`src/physics`) and game rules (`src/game`), unit-tested with Vitest and never importing React, Three.js or the DOM. A React app (`src/app`, `src/screens`, `src/components`) renders screens from one Zustand store. React Three Fiber scenes (`src/scenes`) visualize hangar, launch and the solar system. All NASA data is fetched ahead of time by Node scripts in `scripts/` into JSON under `src/data/generated/`.

**Tech Stack:** Vite 6, React 19, TypeScript 5 (strict), Tailwind CSS 4 (`@tailwindcss/vite`), shadcn/ui (Radix), Motion (`motion/react`), Zustand 5, three + @react-three/fiber 9 + @react-three/drei 10 + @react-three/postprocessing 3, d3-contour + d3-scale, lucide-react, @fontsource fonts, Vitest 3. Use these major versions or the latest stable at install time.

**Spec:** `docs/superpowers/specs/2026-10-22-mission-architect-vision-design.md`

## Global Constraints

- English-only UI copy. No NASA logos or mission insignia anywhere; real mission names only in factual comparisons.
- Desktop-first, 1280 px and up; must not break on a 1366×768 laptop. Phone layout not required.
- Internal units SI (m, s, kg). Display: km, AU, days, t, km²/s² for C3, km/s for v∞, US$ M for cost.
- Time is Julian Date (`jd: number`, TDB treated as UTC). Helpers in `src/physics/time.ts`.
- `src/physics/**` and `src/game/**` must not import `react`, `three`, `@react-three/*`, `zustand`, or touch `window`/`document`. Store glue lives in `src/app/store.ts`.
- Every data file and catalog entry carries `source` (and `url` when there is one) and the fetch date. Every displayed number is real, computed from real data, or labelled "game balance".
- The game never calls a network API at runtime. All textures, fonts and data are in the repo.
- Physical constants (from legacy `js/data/constants.js`, plus): `G0 = 9.80665`, `AU = 1.495978707e11`, `C = 299792458`, `DAY = 86400`, `MU_SUN = 1.32712440018e20`, `MU_EARTH = 3.986004418e14`, `MU_MARS = 4.282837e13`, `R_EARTH = 6371e3`, `R_MARS = 3389.5e3`, `SOI_MARS = 577e6` m.
- Mission constants (from legacy `js/data/mission.js`, translated): parking orbit altitude 200 km; capture orbit periapsis 300 km × apoapsis 33,000 km; min liftoff TWR 1.1 (R18; was 1.2); operations 6 turns × 30 days; science target 100; onboard buffer 40 Gbit; ascent Δv = `ASCENT_DV` 9400 m/s (at liftoff TWR 1.5) + `GRAVITY_LOSS_K` 3000 × (1/TWR − 1/1.5) (R17, game balance calibrated to LSP).
- Launch margin rule: spacecraft wet mass ≤ 0.9 × rocket capacity at the chosen C3.
- Phases: `'select' | 'briefing' | 'design' | 'launch' | 'cruise' | 'arrival' | 'ops' | 'report' | 'sources'`.
- Dev URL flags: `?phase=<phase>&preset=reference&seed=<int>`. Unknown values fall back to `select` without error.
- Commit after every task with a Conventional Commit message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Porkchop cells with no Lambert solution** (TOF out of range, near-180° transfers): stored as `NaN`, rendered empty, not selectable, never propagate NaN into readouts. Test in Task 4.
2. **Stale design after edits**: changing the transfer, a rocket stage or a spacecraft part after the others were set must recompute capacity, propellant and checklist immediately, and the launch button must re-lock if a check fails. Test in Task 7 (`launchChecklist` is a pure function of the whole design) and Task 8 (store derives it, never caches it).
3. **Invalid rocket stacks** (zero stages, stage with no engine, no tanks, mismatched propellant, > 3 stages): capacity is `0`, the stage carries a human-readable error, no `NaN`/`Infinity` reaches the UI. Test in Task 6.
4. **Running out of propellant in cruise**: a TCM the ship cannot afford is offered as disabled with a reason; the mission still reaches arrival (as a flyby) and the report. Test in Task 9.
5. **Bad dev URL params** (`?phase=xyz`, `?preset=nope`, `?seed=abc`): app opens on mission select, no crash. Test in Task 8.

---

## File Structure

```
index.html                       Vite entry
package.json, vite.config.ts, tsconfig*.json, components.json (shadcn), vitest config in vite.config.ts
scripts/fetch-horizons.mjs       JPL Horizons → src/data/generated/ephemeris-{earth,mars}.json
scripts/fetch-donki.mjs          DONKI flares → src/data/generated/donki-flares.json
public/textures/                 NASA planet textures + star map (with SOURCES.md)
legacy/                          old vanilla prototype, moved here in Task 1, deleted in Task 17
src/
  physics/  vec.ts time.ts constants.ts orbit.ts kepler.ts lambert.ts ephemeris.ts porkchop.ts porkchop.worker.ts rocket.ts launcher.ts link.ts
  data/     generated/*.json engines.ts tanks.ts boosters.ts presets.ts lsp.ts spacecraftParts.ts mission.ts realMissions.ts sources.ts concepts.ts
  game/     types.ts rng.ts spacecraft.ts checklist.ts flow.ts cruise.ts events.ts ops.ts scoring.ts lessons.ts
  app/      main.tsx App.tsx store.ts devParams.ts
  components/ui/*                shadcn primitives (generated)
  components/  AppShell.tsx PhysicsPanel.tsx Readout.tsx Gauge.tsx PorkchopPlot.tsx Checklist.tsx DecisionCard.tsx TimeWarp.tsx Timeline.tsx
  screens/  MissionSelect.tsx Briefing.tsx design/{DesignWorkspace,TrajectoryTab,RocketTab,SpacecraftTab}.tsx Launch.tsx Cruise.tsx Arrival.tsx Ops.tsx Report.tsx Sources.tsx
  scenes/   SolarSystem.tsx Planet.tsx OrbitLine.tsx TransferArc.tsx Starfield.tsx Hangar.tsx RocketModel.tsx LaunchScene.tsx SpacecraftModel.tsx Exhaust.tsx
  styles/globals.css
tests mirror src: src/**/*.test.ts (Vitest)
```

---

## TIER A — data, math, game rules

### Task 1: Scaffold the new app, park the legacy prototype

**Files:**
- Move: `index.html css/ js/ tests/ Arquitetura.md Contexto.md Desenvolvimento_guiado.md PROJECT-STATE.md` → `legacy/`
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/app/main.tsx`, `src/app/App.tsx`, `src/styles/globals.css`, `components.json`, `src/lib/utils.ts`, `src/smoke.test.ts`
- Modify: `vercel.json` → `{ "framework": "vite", "buildCommand": "npm run build", "outputDirectory": "dist" }`, `.gitignore` (+ `node_modules`, `dist`)

**Interfaces:**
- Produces: path alias `@/` → `src/`; npm scripts `dev`, `build`, `preview`, `test` (`vitest run`), `typecheck` (`tsc -b --noEmit`), `fetch:data` (runs both scripts).

- [ ] **Step 1:** `git mv` the legacy files into `legacy/`. Legacy stays readable as reference for later ports.
- [ ] **Step 2:** Scaffold Vite React-TS in place, add Tailwind 4 via `@tailwindcss/vite`, run `npx shadcn@latest init` (style new-york, base colour neutral, CSS variables on), add primitives: `button card tabs tooltip dialog slider badge separator scroll-area progress toggle-group sheet`.
- [ ] **Step 3:** Install runtime deps listed in Tech Stack. TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.
- [ ] **Step 4:** Write `src/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `npm test` → PASS. Run `npm run build` → succeeds. Run `npm run dev`, page shows "Mission Architect".
- [ ] **Step 5:** Commit `chore: scaffold Vite React TS app, move prototype to legacy/`.

### Task 2: Physics core (vectors, time, constants, two-body propagation, burns)

**Files:**
- Create: `src/physics/vec.ts`, `time.ts`, `constants.ts`, `orbit.ts`, `kepler.ts`, `rocket.ts` + `*.test.ts`
- Reference: `legacy/js/physics/orbit.js`, `legacy/js/physics/rocket.js`, `legacy/tests/*.test.js`

**Interfaces:**
- Produces:
  - `type Vec3 = [number, number, number]`; `add, sub, scale, dot, cross, norm, normalize` in `vec.ts`
  - `interface StateVector { r: Vec3; v: Vec3 }` (SI) in `vec.ts`
  - `time.ts`: `jdFromDate(d: Date): number`, `dateFromJd(jd: number): Date`, `jdFromIso(iso: string): number`, `formatJd(jd: number): string` (e.g. "16 Nov 2026"), `J2000_JD = 2451545.0`
  - `constants.ts`: every constant in Global Constraints, exported by those names
  - `orbit.ts`: `circularSpeed(mu, r)`, `visViva(mu, r, a)`, `period(mu, a)`, `hohmann(mu, r1, r2): {a, dv1, dv2, time}`, `escapeBurn(mu, rPark, vInf)`, `captureBurn(mu, rp, ra, vInf)`, `orbitalElements(s: StateVector, mu): {a, e, i, rp, ra}` (ports of legacy)
  - `kepler.ts`: `propagate(s0: StateVector, mu: number, dt: number): StateVector` (universal-variable Kepler, any conic), `sampleTrajectory(s0, mu, duration, n): Vec3[]`
  - `rocket.ts`: `deltaV(isp: number, m0: number, mf: number): number`, `propellantFor(dv: number, isp: number, dryKg: number): number` (= dry·(e^(dv/(isp·G0)) − 1))

- [ ] **Step 1: Write failing tests** (values ported from legacy tests, which pass today):
```ts
const rLeo = R_EARTH + 200e3;
const t = hohmann(MU_SUN, AU, 1.52371 * AU);
expect(circularSpeed(MU_EARTH, rLeo)).toBeCloseTo(7788, -1);           // ±5 m/s
expect(period(MU_SUN, AU) / DAY).toBeCloseTo(365.25, 1);
expect(t.time / DAY).toBeCloseTo(258.9, 0);
expect(escapeBurn(MU_EARTH, rLeo, t.dv1)).toBeCloseTo(3613, -1);
expect(captureBurn(MU_MARS, R_MARS + 300e3, R_MARS + 33000e3, t.dv2)).toBeCloseTo(907, -1);
// propagate: one full period of a circular 1 AU orbit returns to start within 1 km
// propagate: hyperbolic state (e = 1.5) forward then back returns within 1 m
// propagate: energy (v²/2 − mu/r) conserved to 1e-9 relative over 200 days
expect(jdFromIso('2000-01-01T12:00:00Z')).toBe(2451545);
expect(propellantFor(1000, 320, 1000)).toBeCloseTo(374.7, 0);
```
- [ ] **Step 2:** `npx vitest run src/physics` → FAIL (modules missing).
- [ ] **Step 3:** Implement. `propagate` uses universal variables with Stumpff functions C(z), S(z) and Newton iteration on χ (Curtis, Algorithm 3.4); max 50 iterations, tolerance 1e-10.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat(physics): port two-body core to TypeScript, add universal propagation`.

### Task 3: Real ephemerides from JPL Horizons

**Files:**
- Create: `scripts/fetch-horizons.mjs`, `src/data/generated/ephemeris-earth.json`, `src/data/generated/ephemeris-mars.json`, `src/physics/ephemeris.ts`, `src/physics/ephemeris.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `StateVector`, `time.ts`
- Produces:
  - JSON shape `EphemerisFile { body: 'earth'|'mars'; source: string; url: string; fetched: string; center: '500@10'; frame: 'ecliptic J2000'; startJd: number; stepDays: 1; count: number; data: number[] /* flat x,y,z,vx,vy,vz in km, km/s */ }`
  - `type Body = 'earth' | 'mars'`
  - `bodyState(body: Body, jd: number): StateVector` (SI; throws `RangeError` outside coverage)
  - `EPHEMERIS_RANGE: { startJd: number; endJd: number }`

- [ ] **Step 1:** Script calls `https://ssd.jpl.nasa.gov/api/horizons.api` with `format=json, COMMAND='399'|'499', EPHEMERIS_TYPE='VECTORS', CENTER='500@10', REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF', VEC_TABLE='2', OUT_UNITS='KM-S', CSV_FORMAT='YES', START_TIME='2026-07-01', STOP_TIME='2029-07-01', STEP_SIZE='1 d'`, parses the `$$SOE…$$EOE` block, writes the JSON. Run it with `node scripts/fetch-horizons.mjs` and commit the output (expected ~1,100 rows per body).
- [ ] **Step 2: Failing tests:**
```ts
// Earth distance from Sun on 2027-01-03 (perihelion season) between 0.983 and 0.984 AU
// Mars heliocentric distance always within [1.381, 1.666] AU over the whole range
// bodyState at an exact sample jd equals the stored row (to 1 m)
// Hermite interpolation at jd + 0.5 within 1 km of the average of propagate() from both neighbours
// bodyState('earth', EPHEMERIS_RANGE.endJd + 1) throws RangeError
```
- [ ] **Step 3:** Implement `bodyState` with cubic Hermite interpolation using positions and velocities of the two bracketing daily samples, converting km → m.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat(data): Earth and Mars ephemerides from JPL Horizons`.

### Task 4: Lambert solver and porkchop grid

**Files:**
- Create: `src/physics/lambert.ts`, `src/physics/porkchop.ts`, `src/physics/porkchop.worker.ts`, tests for both

**Interfaces:**
- Consumes: `bodyState`, `MU_SUN`, `Vec3`
- Produces:
  - `lambert(r1: Vec3, r2: Vec3, tof: number, mu: number): { v1: Vec3; v2: Vec3 } | null` (single revolution, prograde w.r.t. ecliptic +z)
  - `interface Transfer { depJd: number; arrJd: number; tofDays: number; r1: Vec3; v1: Vec3; r2: Vec3; v2: Vec3; vInfDep: Vec3; vInfArr: Vec3; c3: number /* km²/s² */; vInfArrKms: number }`
  - `transferFor(depJd: number, arrJd: number): Transfer | null`
  - `interface PorkchopSpec { depStartJd; depEndJd; depStepDays; arrStartJd; arrEndJd; arrStepDays; minTofDays; maxTofDays }`
  - `DEFAULT_PORKCHOP: PorkchopSpec` = dep 2026-09-01 → 2027-01-31 step 2 d; arr 2027-04-01 → 2028-03-31 step 3 d; TOF 100–500 d
  - `interface PorkchopGrid { spec: PorkchopSpec; nDep: number; nArr: number; c3: Float32Array; vInf: Float32Array /* row-major [iArr * nDep + iDep], NaN = invalid */ ; best: { depJd; arrJd; c3 } }`
  - `computePorkchop(spec?: PorkchopSpec): PorkchopGrid`
  - Worker message protocol: in `{ spec }`, out `PorkchopGrid` (typed arrays transferred)

- [ ] **Step 1: Failing tests:**
```ts
// Curtis Example 5.2 (mu = 398600 km³/s², units km & s):
const sol = lambert([5000,10000,2100], [-14600,2500,7000], 3600, 398600)!;
expectVecClose(sol.v1, [-5.9925, 1.9254, 3.2456], 1e-3);
expectVecClose(sol.v2, [-3.3125, -4.1966, -0.38529], 1e-3);
// lambert returns null for tof <= 0 and for r1 ≈ r2 direction (transfer angle < 1e-6 rad)
// round trip: propagate({r: r1, v: v1}, MU_SUN, tof) lands within 10 km of r2 for transferFor(2026-11-15, 2027-09-01)
// computePorkchop(DEFAULT_PORKCHOP): grid.best.c3 in [7, 14] km²/s², best.depJd in Oct–Dec 2026
// cells with tof outside [minTofDays, maxTofDays] are NaN; no cell is Infinity
// computePorkchop runs in < 3 s in Node on the default grid
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `lambert` with universal variables (Curtis Algorithm 5.2): bracket z by bisection then Newton, max 100 iterations, return `null` on non-convergence. Transfer angle prograde: if `cross(r1, r2)[2] < 0` use `2π − Δθ`. `computePorkchop` loops arrival × departure, skips out-of-range TOF as `NaN`. Worker wraps `computePorkchop`.
- [ ] **Step 4:** Tests PASS. Record the real `best` values in the test file comment and in `src/data/sources.ts` (Task 5) as the validation note.
- [ ] **Step 5:** Commit `feat(physics): Lambert solver and porkchop grid on Horizons data`.

### Task 5: Curated catalogs and DONKI events (research + data)

Needs web access. Every number below marked *verify* must be checked against the cited source; if a source disagrees, the source wins and the `source` field says where it came from.

**Files:**
- Create: `scripts/fetch-donki.mjs`, `src/data/generated/donki-flares.json`, `src/data/engines.ts`, `tanks.ts`, `boosters.ts`, `lsp.ts`, `spacecraftParts.ts`, `mission.ts`, `realMissions.ts`, `sources.ts`, `src/data/catalog.test.ts`, `public/textures/*`, `public/textures/SOURCES.md`

**Interfaces:**
- Produces (in `src/game/types.ts`, created here):
```ts
type Propellant = 'kerolox' | 'hydrolox' | 'methalox' | 'solid';
interface EnginePart { id: string; name: string; propellant: Propellant; thrustSL: number; thrustVac: number /* N */; ispSL: number; ispVac: number /* s */; massKg: number; costM: number; source: string; url?: string }
interface TankPart { id: string; name: string; propellant: Exclude<Propellant,'solid'>; diameterM: number; lengthM: number; propellantKg: number; dryKg: number; costM: number }
interface BoosterPart { id: string; name: string; thrustSL: number; thrustVac: number; ispSL: number; ispVac: number; propellantKg: number; dryKg: number; costM: number; diameterM: number; lengthM: number; source: string }
interface LspCurve { vehicle: string; presetId: string; source: string; url: string; points: [c3: number, kg: number][] }
type SpacecraftCategory = 'core' | 'power' | 'comms' | 'instrument' | 'protection' | 'storage' | 'propulsion';
interface SpacecraftPart { id: string; name: string; category: SpacecraftCategory; costM: number; massKg: number; powerW: number /* + gen at 1 AU or constant, − load */; solar?: boolean; batteryWh?: number; rateMbpsAt1AU?: number; science?: number; dataGbPerTurn?: number; radiationShield?: number /* 0..1 */; storageGb?: number; ispS?: number; max?: number; flavor: string; source?: string }
interface DonkiFlare { id: string; peakTime: string; classType: string; sourceLocation?: string; link: string }
interface DataSource { id: string; title: string; provider: string; url: string; fetched: string; usedFor: string }
interface RealMission { id: 'maven' | 'mro'; name: string; launchDate: string; vehicle: string; launchMassKg: number; costM: number; arrivalDate: string; source: string; url: string }
// realMissions.ts exports REAL_MISSIONS: RealMission[]
```
- `src/data/mission.ts` exports `MISSION` (constants in Global Constraints, plus `budgetM: 900` *game balance*, `name: 'Red Watch'`, briefing text in English).

- [ ] **Step 1:** `fetch-donki.mjs`: GET `https://api.nasa.gov/DONKI/FLR?startDate=2024-01-01&endDate=2024-12-31&api_key=${NASA_API_KEY ?? 'DEMO_KEY'}`, keep M- and X-class flares, write JSON with `source/url/fetched`. If DONKI returns 5xx, retry 3× with backoff; if still failing, stop with a clear error (do not invent events).
- [ ] **Step 2:** `engines.ts`: at least these families with public specs, *verify* each: RD-180 (kerolox, first stage), Merlin 1D (kerolox, first stage), Merlin Vacuum (kerolox, upper), RS-25 (hydrolox, core), RL10C-1 (hydrolox, upper), BE-4 (methalox, first stage). Costs are *game balance* in US$ M, ordered sensibly.
- [ ] **Step 3:** `tanks.ts`: two diameters (3.7 m, 5.4 m) × three lengths (S, M, L) × propellants (kerolox, hydrolox, methalox where sensible). Dry mass fraction (dry / propellant) as *game balance* within real ranges: kerolox ≈ 0.05–0.07, hydrolox ≈ 0.10–0.12, methalox ≈ 0.06–0.08. `boosters.ts`: one solid booster family (GEM-63 class), *verify*.
- [ ] **Step 4:** `lsp.ts`: payload-vs-C3 curves for 2–3 vehicles from the NASA Launch Services Program performance site (elvperf.ksc.nasa.gov) or the vendor user's guide as fallback; at least 5 points each covering C3 0–20 km²/s². Candidates: Atlas V 401 (flew MAVEN, MRO-class), Falcon 9 (expendable), Atlas V 551.
- [ ] **Step 5:** `spacecraftParts.ts`: translate and re-scale the legacy probe parts (`legacy/js/data/parts.js`) to English with real-world-scale masses/powers, plus `storage` (solid-state recorder) and `propulsion` (biprop main engine, `ispS: 320`, *verify* against a real Mars orbiter engine class). `realMissions.ts`: MAVEN and MRO launch date, vehicle, launch mass, cost, arrival date, *verify* on NASA mission pages.
- [ ] **Step 6:** Textures in `public/textures/`: Earth (NASA Blue Marble), Mars (NASA/USGS Viking colour mosaic), Sun (NASA SDO image or procedural), star background (NASA SVS Deep Star Maps), each ≤ 4096 px wide, JPG/KTX2, listed in `SOURCES.md` with URL and licence (public domain). If any NASA source is unavailable, note it and use a procedural material; never use non-NASA textures without a compatible licence.
- [ ] **Step 7:** `sources.ts`: `DATA_SOURCES: DataSource[]` covering every file above plus Horizons (Task 3).
- [ ] **Step 8: Tests** (`catalog.test.ts`): every engine/booster/LSP curve/real mission has non-empty `source`; ids unique across catalogs; every number finite and > 0 where physical; LSP points sorted by C3 with payload decreasing; donki file has ≥ 10 flares, each with `classType` starting `M` or `X`.
- [ ] **Step 9:** Commit `feat(data): curated engine, tank, LSP, spacecraft, DONKI and texture catalogs with sources`.

### Task 6: Modular launcher model and capacity to C3

**Files:**
- Create: `src/physics/launcher.ts`, `src/data/presets.ts`, `src/physics/launcher.test.ts`

**Interfaces:**
- Consumes: catalogs (Task 5), `escapeBurn`, `deltaV`, `MU_EARTH`, `R_EARTH`, `G0`
- Produces:
```ts
interface StageDesign { tanks: string[]; engineId: string | null; engineCount: number; boosterId?: string; boosterCount?: number /* stage 0 only */ }
interface RocketDesign { stages: StageDesign[] /* index 0 = bottom */; fairing: 'small' | 'large' }
interface StageStat { index: number; m0: number; mf: number; dv: number; twr: number; burnTime: number; ispUsed: number; errors: string[] }
interface RocketStats { stages: StageStat[]; totalDv: number; liftoffTwr: number; massKg: number; costM: number; valid: boolean; errors: string[] }
rocketStats(r: RocketDesign, payloadKg: number): RocketStats
requiredDeltaV(c3: number): number            // ASCENT_DV + escapeBurn(MU_EARTH, R_EARTH+200e3, sqrt(c3)*1000)
capacityToC3(r: RocketDesign, c3: number): number  // kg, 0 if invalid or cannot reach even with 0 payload
interface LaunchEvent { t: number; kind: 'liftoff'|'booster-sep'|'stage-sep'|'fairing-sep'|'orbit'|'departure-burn'; stage?: number }
launchTimeline(r: RocketDesign, payloadKg: number, c3: number): { events: LaunchEvent[]; reachedOrbit: boolean; reachedDeparture: boolean; failure?: 'twr'|'dv' }
PRESETS: { id: string; name: string; description: string; rocket: RocketDesign; lspCurveId?: string }[]  // in presets.ts
```
- Rules: stage valid iff ≥ 1 tank, exactly one engine type with count 1–9, all tanks' propellant = engine propellant, ≤ 3 stages. Stage 0 uses `(ispSL + ispVac)/2` and `thrustSL` for liftoff TWR; upper stages use vacuum values. Boosters burn in parallel with stage 0: phase A with combined thrust and `Isp_eff = ΣF / Σ(F/Isp)` until boosters are empty (core propellant consumed = core mass flow × booster burn time), boosters dropped, phase B core alone. Fairing mass (small 1,500 kg, large 2,500 kg, *game balance*) dropped at the start of stage 1. Liftoff TWR < 1.2 → launch fails at pad.

- [ ] **Step 1: Failing tests:**
```ts
// rocketStats of a 1-stage design with no engine → valid false, errors include 'Stage 1 has no engine'
// mismatched propellant (hydrolox tank + kerolox engine) → error, capacityToC3 = 0
// 4 stages → error; empty stages array → valid false, capacity 0; never NaN/Infinity anywhere in RocketStats
// totalDv decreases monotonically as payloadKg increases
// capacityToC3 decreases monotonically as c3 increases
// boosters: adding 2 boosters to a preset raises liftoffTwr and capacityToC3(…, 10)
// each preset with lspCurveId: for every LSP point, |capacityToC3 − kg| / kg ≤ 0.15
// launchTimeline of a preset: events ordered by t, include liftoff, every stage-sep, fairing-sep, orbit; a TWR-1.05 stack → failure 'twr'
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `capacityToC3` bisects payload in [0, 200,000] kg to 1 kg. Burn times from `propellant / (thrust / (isp · G0))`. Build presets from catalog parts to reproduce the LSP vehicles; tune tank choices first, `ASCENT_DV` second, never edit LSP data. Add one "Reference" preset that the game's balance test uses (Task 7).
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat(physics): modular launcher, parallel boosters, capacity to C3 validated against LSP`.

### Task 7: Spacecraft model and launch checklist

**Files:**
- Create: `src/physics/link.ts`, `src/game/spacecraft.ts`, `src/game/checklist.ts`, tests for all three

**Interfaces:**
- Consumes: `Transfer`, `RocketDesign`, `rocketStats`, `capacityToC3`, spacecraft catalog, `MISSION`, `captureBurn`, `propellantFor`, `link.ts` (below)
- Produces:
  - `src/physics/link.ts`: `solarPowerW(powerAt1AU: number, rAU: number)` (= P/r²), `dataRateMbps(rateAt1AU: number, dAU: number)` (= R/d²), `signalDelayS(dMeters: number)`, `solarConjunction(sunEarthMarsAngleDeg: number): boolean` (angle < 3°)
  - `interface SpacecraftDesign { parts: Record<string, number>; tcmReserveMs: number /* 0–150 */ }`
  - `interface SpacecraftStats { dryKg; moiDvMs; propellantKg; wetKg; powerGenAtMarsW; powerLoadW; batteryWh; rateMbpsAt1AU; storageGb; science; costM; shield: number; errors: string[] }`
  - `spacecraftStats(d: SpacecraftDesign, vInfArrKms: number | null): SpacecraftStats` — propellant covers `captureBurn(MU_MARS, R_MARS+300e3, R_MARS+33000e3, vInf) + tcmReserveMs`
  - `interface MissionDesign { transfer: { depJd: number; arrJd: number } | null; rocket: RocketDesign; spacecraft: SpacecraftDesign }`
  - `interface CheckItem { id: 'trajectory'|'rocket-valid'|'twr'|'margin'|'budget'|'power'|'comms'|'instruments'|'propulsion'; label: string; ok: boolean; detail: string }`
  - `launchChecklist(d: MissionDesign): CheckItem[]` and `canLaunch(d: MissionDesign): boolean`
  - `REFERENCE_DESIGN: MissionDesign` (transfer = the `best` dates recorded in Task 4, hard-coded so tests don't recompute the grid; Reference preset; a sensible spacecraft)

- [ ] **Step 1: Failing tests:**
```ts
// solarPowerW(2000, 1.52) ≈ 865.7
// spacecraftStats with vInf 2.65 km/s, 0 reserve: moiDvMs ≈ 907 ± 10 (matches legacy capture test)
// missing 'core' part → errors non-empty
// launchChecklist(REFERENCE_DESIGN) → every item ok; canLaunch true
// same design with transfer null → 'trajectory' not ok and canLaunch false
// changing transfer to a higher-C3 cell flips 'margin' to not ok when wet > 0.9·capacity (pure recompute, no cache)
// cost over MISSION.budgetM → 'budget' not ok with detail showing both numbers
// power: load of all instruments > generation at Mars + battery coverage → 'power' not ok
```
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(game): spacecraft budgets and launch checklist`.

### Task 8: Game flow, store and dev URL flags

**Files:**
- Create: `src/game/rng.ts`, `src/game/flow.ts`, `src/app/store.ts`, `src/app/devParams.ts`, tests for `flow.ts`, `rng.ts`, `devParams.ts`

**Interfaces:**
- Produces:
  - `rng.ts`: `createRng(seed: number): () => number` (mulberry32)
  - `type Phase` (Global Constraints)
  - `flow.ts`: `nextPhase(p: Phase): Phase`, `canEnter(p: Phase, s: GameSnapshot): boolean` where `GameSnapshot = { design: MissionDesign; launched: boolean; arrived: boolean; opsDone: boolean }`
  - `devParams.ts`: `parseDevParams(search: string): { phase: Phase; preset: 'reference' | null; seed: number }` — invalid values fall back to `{ phase: 'select', preset: null, seed: 1 }` per field
  - `store.ts` (Zustand): `useGame` with `phase, design, seed, porkchop: PorkchopGrid | null, hoverTransfer: Transfer | null, launch, cruise, ops, result` and actions `setPhase, setTransfer, setRocket, setSpacecraft, applyPreset, startLaunch, …` (cruise/ops actions wired in Tasks 9–10). Derived values (`rocketStats`, `spacecraftStats`, `launchChecklist`) computed via selectors, never stored.

- [ ] **Step 1: Failing tests:** `parseDevParams('?phase=xyz&preset=nope&seed=abc')` → `{ phase: 'select', preset: null, seed: 1 }`; `parseDevParams('?phase=cruise&preset=reference&seed=7')` → as given; `canEnter('launch', snapshotWith(REFERENCE_DESIGN))` true and false with `transfer: null`; `createRng(1)` gives the same first 5 numbers twice.
- [ ] **Step 2–4:** FAIL → implement → PASS. Dev params with `preset=reference` load `REFERENCE_DESIGN` and jump to the phase, simulating earlier phases deterministically with the seed.
- [ ] **Step 5:** Commit `feat(game): phase flow, store and dev URL flags`.

### Task 9: Cruise simulation, TCMs, DONKI events, arrival

**Files:**
- Create: `src/game/cruise.ts`, `src/game/events.ts`, tests

**Interfaces:**
- Consumes: `Transfer`, `propagate`, `lambert`, `bodyState`, `spacecraftStats`, `createRng`, donki flares
- Produces:
```ts
interface CruiseState { jd: number; ship: StateVector; arrJd: number; propellantKg: number; dryKg: number; ispS: number; injectionErrorMs: Vec3; tcms: { jd: number; dvMs: number }[]; events: ResolvedEvent[]; damaged: string[]; cruiseScience: number; safeModeDays: number; log: string[] }
startCruise(design: MissionDesign, seed: number): CruiseState   // injection error: 3 axes ~ N(0, 2 m/s), seeded
predictArrival(c: CruiseState): { missKm: number; vInfKms: number }   // propagate to arrJd, distance to Mars
tcmCost(c: CruiseState): number    // m/s: |lambert(ship.r, bodyState('mars', arrJd).r, (arrJd − jd)·DAY, MU_SUN).v1 − ship.v|
applyTcm(c: CruiseState): CruiseState | { error: 'insufficient-propellant' }
advanceCruise(c: CruiseState, days: number): CruiseState
TCM_WINDOWS = [{ id: 'TCM-1', dayAfterLaunch: 15 }, { id: 'TCM-2', dayAfterLaunch: 60 }, { id: 'TCM-3', daysBeforeArrival: 30 }]
interface CruiseEvent { id: string; day: number; flare: DonkiFlare; severity: 'moderate' | 'severe' /* M → moderate, X → severe */ }
scheduleEvents(seed: number, tofDays: number): CruiseEvent[]   // 2–3 events, ≥ 20 days apart, not in the first 10 days
interface EventOption { id: 'safe-mode' | 'keep-observing' | 'shield-attitude'; label: string; risk: number; cost: string; available: boolean; reason?: string }
eventOptions(e: CruiseEvent, design: MissionDesign): EventOption[]
resolveEvent(c: CruiseState, e: CruiseEvent, optionId: EventOption['id'], rng: () => number): { state: CruiseState; outcome: string }
interface ArrivalResult { captured: boolean; vInfKms: number; moiDvMs: number; reason?: 'miss' | 'propellant' }
arrive(c: CruiseState): ArrivalResult
```
- Event rules (*game balance*, stated in the UI): base damage risk moderate 0.15, severe 0.4; `keep-observing` uses base × (1 − shield) and earns cruise science; `safe-mode` risk 0.02, costs 5 days of cruise science, unavailable if `batteryWh` < 300 (reason shown); `shield-attitude` risk base × (1 − shield) × 0.5, costs 2 m/s from propellant, unavailable if propellant can't cover it. Damage disables one random instrument (seeded). Capture iff `missKm ≤ 10,000` and propellant covers `captureBurn` at the actual v∞; otherwise flyby with the reason.

- [ ] **Step 1: Failing tests:**
```ts
// zero injection error (test helper) on REFERENCE_DESIGN: arrive() captured true, moiDvMs within 5% of spacecraftStats moiDvMs
// seeded error, no TCMs: predictArrival missKm > 10,000
// tcmCost at TCM-1 < tcmCost at TCM-3 for the same seeded error (early is cheaper)
// applying TCM-1 brings predicted miss below 10,000 km
// propellant set to 0: applyTcm → { error: 'insufficient-propellant' }; arrive → captured false, reason 'propellant' or 'miss'; no throw
// scheduleEvents(seed, 300) deterministic for a seed; days satisfy spacing rules
// eventOptions with battery 0 → safe-mode available false with a reason
// resolveEvent deterministic for the same rng seed
```
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(game): cruise with Lambert-based TCMs, DONKI flare events, arrival`.

### Task 10: Science operations, scoring, lessons

**Files:**
- Create: `src/game/ops.ts`, `src/game/scoring.ts`, `src/game/lessons.ts`, tests
- Reference: `legacy/js/game/mission.js` (operations), `legacy/js/game/scoring.js`, `legacy/js/game/lessons.js`

**Interfaces:**
- Produces:
```ts
interface OpsState { turn: number; startJd: number; bufferGb: number; collected: number; delivered: number; turns: OpsTurnReport[] }
interface OpsPlan { instrumentsOn: string[] }
interface OpsTurnReport { turn: number; jd: number; earthMarsAU: number; delayMin: number; conjunction: boolean; powerGenW: number; powerLoadW: number; instrumentsRun: string[]; dataCollectedGb: number; dataDownlinkedGb: number; scienceDelivered: number; notes: string[] }
startOps(arrJd: number): OpsState
opsPlanLimits(state: OpsState, design: MissionDesign, damaged: string[]): { maxLoadW: number; available: string[] }
runOpsTurn(state: OpsState, design: MissionDesign, damaged: string[], plan: OpsPlan): OpsState
interface MissionResult { outcome: 'success' | 'partial' | 'failure'; score: number; stars: 0|1|2|3; failureReason?: 'pad'|'orbit'|'departure'|'miss'|'propellant' }
scoreMission(input: { captured: boolean; science: number; budgetLeftM: number; dvLeftMs: number; safeModeDays: number }): MissionResult
lessons(history: { design: MissionDesign; launch: ReturnType<typeof launchTimeline>; cruise: CruiseState | null; arrival: ArrivalResult | null; ops: OpsState | null; result: MissionResult }): { id: string; title: string; text: string; formula?: string }[]
```
- Score formula and stars: legacy formula (`legacy/js/game/scoring.js`) with `safeTurns` replaced by `safeModeDays / 10`. Plan instruments beyond `maxLoadW` are rejected (not silently dropped).

- [ ] **Step 1: Failing tests:** distance and conjunction use `bodyState`; 6 turns of REFERENCE_DESIGN with all instruments on reach `delivered ≥ 100` (balance check); a conjunction turn downlinks 0; plan over power limit throws `RangeError`; lessons for a pad failure mention TWR and include the liftoff TWR number; lessons for a miss mention TCM and the predicted miss in km.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(game): science operations, scoring and lessons`.

---

## TIER B — UI, 3D, screens

UI tasks have no unit tests beyond store glue; each ends with a browser check through the dev server and the dev URL flags, plus `npm run typecheck && npm test && npm run build` green.

### Task 11: Visual identity, design system, app shell, physics panel

**Required sub-skill:** `impeccable` (shape the direction first, then build). Direction from the spec: cinematic mission control, dark, precise numbers, restrained colour, not a generic admin dashboard, no NASA logos.

**Files:**
- Create: `src/styles/globals.css` (tokens), `src/components/AppShell.tsx`, `Readout.tsx`, `Gauge.tsx`, `Checklist.tsx`, `PhysicsPanel.tsx`, `Timeline.tsx`, `src/data/concepts.ts`, `src/screens/Sources.tsx`; `DESIGN.md` at repo root recording the system

**Interfaces:**
- Produces: `Readout({ label, value, unit, status?: 'ok'|'warn'|'bad', hint? })`; `Gauge({ value, max, label, threshold? })`; `Checklist({ items: CheckItem[] })`; `PhysicsPanel({ phase: Phase })` reading `CONCEPTS` from `concepts.ts`: `{ id, title, formula, plain, analogy?, phases: Phase[], live: (s: GameView) => string }` where `GameView` is the store snapshot plus derived stats.
- `concepts.ts`: English translations of every legacy concept (`legacy/js/data/concepts.js`) plus new: Lambert's problem, C3, porkchop plot, launch margin, parallel staging, link budget, trajectory correction maneuver, solar conjunction. Always live numbers. Fixed "How the game simplifies" section (spec section 6 simplifications).
- AppShell: top bar (mission name, date, phase stepper), main area, collapsible right physics panel, screen transitions with Motion. Self-hosted fonts via @fontsource.

- [ ] Steps: run impeccable to set the direction → tokens → components → shell → Sources screen listing `DATA_SOURCES` → browser check at 1366×768 and 1920×1080 → commit `feat(ui): visual identity, app shell, physics panel, data sources`.

### Task 12: Mission select, briefing, design workspace (2D parts)

**Files:**
- Create: `src/screens/MissionSelect.tsx`, `Briefing.tsx`, `design/DesignWorkspace.tsx`, `design/TrajectoryTab.tsx`, `design/RocketTab.tsx`, `design/SpacecraftTab.tsx`, `src/components/PorkchopPlot.tsx`

**Interfaces:**
- Consumes: store, `computePorkchop` via worker, `transferFor`, `rocketStats`, `capacityToC3`, `spacecraftStats`, `launchChecklist`, `PRESETS`
- `PorkchopPlot({ grid, selected, onHover(transfer|null), onSelect(transfer) })`: canvas heatmap of C3 (log colour scale, NaN transparent), d3-contour lines for C3 (8, 10, 12, 15, 20 km²/s²) and dashed lines for arrival v∞, axes in dates, crosshair, tooltip (dates, TOF, C3, v∞ arr), marker on `grid.best` labelled "Minimum C3".

- [ ] MissionSelect: three cards; Mars playable; Europa flyby and asteroid sample return locked with "Coming soon".
- [ ] Briefing: objective, science target, budget, window, Δv map, "Start design".
- [ ] DesignWorkspace: three tabs (Trajectory, Rocket, Spacecraft) plus a persistent side rail with the live checklist, budget gauge, mass vs. capacity gauge and the Launch button (enabled iff `canLaunch`). Tabs reachable in any order.
- [ ] RocketTab (this task: the 2D/list controls; the 3D hangar view is added in Task 14): presets, add/remove stage, pick engine and count, add tanks, boosters on stage 1, fairing; per-stage readouts (Δv, TWR, mass, cost, errors); capacity at chosen C3 next to the LSP reference curve point for presets.
- [ ] SpacecraftTab: parts by category with counts and `max`, TCM reserve slider (0–150 m/s), live mass/power/data/cost readouts, propellant breakdown (MOI + reserve).
- [ ] Browser check: full design flow with REFERENCE values reaches an enabled Launch button; Review Focus 1–3 behave as specified. Commit `feat(ui): mission select, briefing and design workspace`.

### Task 13: Launch, cruise, arrival, ops and report screens

**Files:**
- Create: `src/screens/Launch.tsx`, `Cruise.tsx`, `Arrival.tsx`, `Ops.tsx`, `Report.tsx`, `src/components/DecisionCard.tsx`, `TimeWarp.tsx`; extend `src/app/store.ts` with cruise/ops actions

**Interfaces:**
- Consumes: `launchTimeline`, `startCruise`, `advanceCruise`, `tcmCost`, `applyTcm`, `scheduleEvents`, `eventOptions`, `resolveEvent`, `arrive`, ops functions, `scoreMission`, `lessons`, `REAL_MISSIONS`
- TimeWarp: pause / 1 / 5 / 20 days per second; auto-stops at TCM windows, events and 3 days before arrival.
- Cruise: TCM prompt at each window showing cost now vs. predicted miss, "Burn now" / "Wait"; DecisionCard for each flare with the real event date and class, options with risk and cost, disabled options with reason; outcome toast.
- Ops: per-turn planner (toggle instruments within `maxLoadW`, damaged ones disabled), Earth–Mars distance, delay, conjunction banner, collected vs. downlinked chart.
- Report: outcome, stars, score, timeline, lessons, comparison table with MAVEN and MRO.
- [ ] Browser check through dev flags: `?phase=cruise&preset=reference&seed=1` and `?phase=ops&preset=reference&seed=1`; Review Focus 4 (zero propellant → disabled TCM with reason, game reaches report). Commit `feat(ui): launch, cruise decisions, ops planner and report`.

### Task 14: 3D hangar and launch scene

**Files:**
- Create: `src/scenes/Hangar.tsx`, `RocketModel.tsx`, `LaunchScene.tsx`, `Exhaust.tsx`; mount Hangar in RocketTab and LaunchScene in Launch screen

**Interfaces:**
- `RocketModel({ design: RocketDesign, separated?: number[] /* stage indices dropped */, fairingOn: boolean })`: procedural meshes from catalog dimensions: tanks as cylinders (diameter/length from `TankPart`), engine bells via `LatheGeometry`, interstage/decoupler rings, nose cone fairing, boosters around stage 0. PBR materials, generic livery, no logos.
- `LaunchScene({ timeline })`: stylized pad and tower, sky gradient darkening with altitude, exhaust (instanced particles or shader) scaled by thrust, stage/booster/fairing separation animated at `timeline.events` times (time-compressed so the full sequence plays in ~25 s), camera follows then cuts wide; HUD with altitude-free readouts (stage, Δv spent of required, event labels). Failure 'twr' shows engines firing and the rocket staying on the pad; failure 'dv' ends short of orbit.
- Lighting with drei `Environment` built from `Lightformer`s (no remote HDR), postprocessing bloom on exhaust.
- [ ] Browser check: building a stack updates the 3D model live; REFERENCE launch plays every separation; 60 fps target on a laptop at 1366×768 (no more than ~200 draw calls). Commit `feat(3d): modular rocket hangar and launch sequence`.

### Task 15: 3D solar system, transfer arc and spacecraft model

**Files:**
- Create: `src/scenes/SolarSystem.tsx`, `Planet.tsx`, `OrbitLine.tsx`, `TransferArc.tsx`, `Starfield.tsx`, `SpacecraftModel.tsx`; mount in TrajectoryTab (preview), Cruise, Arrival, Ops

**Interfaces:**
- Scale: 1 AU = 100 scene units; planets exaggerated with an on-screen "not to scale" label; `logarithmicDepthBuffer`.
- `SolarSystem({ jd, transfer?, preview?, ship?, focus: 'sun'|'earth'|'mars'|'ship' })`: Sun (emissive + bloom), Earth and Mars with textures at `bodyState` positions, orbit lines sampled from the ephemerides, starfield from the NASA star map, `TransferArc` for selected (solid glow) and hovered (dashed) transfers via `sampleTrajectory`, smooth camera transitions between focus targets.
- `SpacecraftModel({ design: SpacecraftDesign, damaged: string[] })`: bus box, solar panel wings sized by solar parts, dish sized by antenna, instrument boom, RTG fin if present; shown in SpacecraftTab and near the ship marker in cruise; flare hit flash effect.
- Arrival: capture burn shot around Mars (scaled view), then orbit ellipse.
- [ ] Browser check: porkchop hover updates the arc in < 100 ms; cruise time warp moves planets and ship consistently; capture plays. Commit `feat(3d): solar system with real ephemerides, transfer arcs and spacecraft model`.

---

## TIER C — polish and hand-off

### Task 16: Polish pass

- [ ] Run `impeccable` critique/polish on every screen; fix hierarchy, spacing, motion, empty/error states (WebGL unavailable → message with the 2D fallback text), loading state while the porkchop worker runs.
- [ ] Optional sound design only if time allows (no external assets without licence).
- [ ] Performance: code-split the 3D scenes with `React.lazy`; textures compressed; first load under 5 MB of JS+textures excluding the star map.
- [ ] Commit `polish: UI critique pass, loading and fallback states, performance`.

### Task 17: Clean-up, docs and whole-branch verification

- [ ] Delete `legacy/` (history keeps it). Rewrite `README.md` in English: what it is, how to run (`npm i`, `npm run dev`), how to refresh data (`npm run fetch:data`, needs `NASA_API_KEY` optional), dev flags, data sources, AI-use disclosure note for Space Apps.
- [ ] `npm run typecheck && npm test && npm run build` all green; `npm run preview` and play the full mission once in the browser with REFERENCE_DESIGN and once with a deliberate failure (TWR) — no console errors.
- [ ] Commit `docs: README, remove legacy prototype`.
