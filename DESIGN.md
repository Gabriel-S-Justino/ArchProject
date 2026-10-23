---
name: Mission Architect
description: A Mars orbiter mission design game; the interplanetary mission design handbook, read as a negative.
colors:
  ground: "oklch(0.175 0.009 250)"
  ground-raised: "oklch(0.205 0.009 250)"
  ground-sunken: "oklch(0.145 0.009 250)"
  ground-hover: "oklch(0.235 0.009 250)"
  rule: "oklch(0.31 0.01 250)"
  rule-strong: "oklch(0.42 0.01 250)"
  ink: "oklch(0.93 0.012 85)"
  ink-2: "oklch(0.77 0.012 85)"
  ink-3: "oklch(0.645 0.012 85)"
  mars: "oklch(0.72 0.14 52)"
  mars-ink: "oklch(0.175 0.009 250)"
  mars-hover: "oklch(0.77 0.14 52)"
  mars-active: "oklch(0.67 0.14 52)"
  go: "oklch(0.8 0.135 152)"
  caution: "oklch(0.85 0.14 88)"
  nogo: "oklch(0.68 0.2 18)"
typography:
  display:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: "3.125rem"
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 84"
  figure:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: "2.25rem"
    fontFeature: "'tnum' 1, 'lnum' 1"
  title:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    fontVariation: "'wdth' 88"
  lead:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "1.625rem"
  body:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  small:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    lineHeight: "1.375rem"
  detail:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    lineHeight: "1.25rem"
  label:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.045em"
    fontVariation: "'wdth' 78"
  formula:
    fontFamily: "STIX Two Text Variable, Cambria Math, Times New Roman, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "1.625rem"
rounded:
  sm: "2px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.mars}"
    textColor: "{colors.mars-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-primary-disabled:
    backgroundColor: "{colors.ground-hover}"
    textColor: "{colors.ink-3}"
  button-quiet:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  physics-panel:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.ink}"
    width: "352px"
  physics-live-block:
    backgroundColor: "{colors.ground-sunken}"
    textColor: "{colors.ink}"
    padding: "10px 12px"
  top-bar:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    height: "68px"
---

# Design System: Mission Architect

## Overview

**Creative North Star: "The mission design handbook, read as a negative"**

Mission Architect looks like the technical handbooks mission designers actually work from (numbered equations, ruled data blocks, references with fetch dates) printed as light ink on a dark graphite film. Students and Space Apps judges should feel they are using a real engineer's tool. They should not feel they are inside a sci-fi HUD or an admin dashboard. The math is the show: every element exists to make one real number legible, and nothing glows, floats or blurs for decoration.

Density is moderate. Screens are plates with a lot of unprinted ground, so the one plot or number a screen is about (porkchop plot, capacity, checklist) owns the field. Structure comes from hairline rules and type, not from boxes or cards. Colour is rationed: one rust accent for "you are here / do this", and avionics go/caution/no-go for status, always paired with a word.

This direction was chosen by the implementing agent (Task 11) without a team interview. The seed roll (key e40d7135) assigned candidate 3 of 7 from the audience's world: mission design handbook figures. Raises taken from the challengers: split-flap boards gave fixed digit cells that roll in place, labanotation gave timelines where length is exact duration, the ticket wallet gave "nothing disappears", the Saville sleeve gave one plot owning the field, and the monochrome canon gave accent scarcity.

**Key Characteristics:**
- Dark graphite ground, warm paper-white ink, hairline rules; flat, with no shadows.
- One accent (Mars rust), used a handful of times per screen.
- Status is green GO, amber CAUTION, red NO-GO, always with the word and usually an icon.
- Archivo variable (width axis) for all text and numbers, with tabular figures everywhere; STIX Two italic only for equations.
- Equations are numbered (1)…(27) in journey order, like a handbook.
- Motion is functional: digits roll, screens settle, panels slide. All of it respects reduced motion.

## Colors

A restrained palette: neutrals on a cool graphite ground, one warm accent, three status hues. Tokens live in `src/styles/globals.css` (`:root`) and are exposed to Tailwind as `bg-ground`, `text-ink-2`, `border-rule`, `bg-mars`, `text-go` and so on.

### Primary
- **Mars Dust** (`mars`, `oklch(0.72 0.14 52)`, ≈ #e8894a): the current phase station, the one primary button per screen, the player's own trajectory (cruise span, launch and arrival events) and the active Sources link. It never marks status. Text on it uses `mars-ink` (7.3:1). The primary button steps to `mars-hover` (one step lighter) under the pointer and `mars-active` (one step darker) while pressed.

### Status
- **Go** (`go`, ≈ #75d792), **Caution** (`caution`, ≈ #f4c855), **No-go** (`nogo`, ≈ #fb5668). Words: GO / CAUTION / NO-GO (`STATUS_WORD` in `src/components/status.ts`). Status colours are used for text, 1px rules and bar fills only, never for large fields.

### Neutral
- **Ground** (`ground`, ≈ #0e1114) is the page. **Raised** (`ground-raised`) is the physics panel. **Sunken** (`ground-sunken`) is the live-number block. **Hover** (`ground-hover`) is pointer feedback and the disabled primary button.
- **Rule** (`rule`) and **Rule strong** (`rule-strong`) are hairlines. They are decorative, never text.
- **Ink** (≈ #ebe7df, 15.4:1), **Ink 2** (≈ #b8b4ac, 9.2:1), **Ink 3** (≈ #918d86, 5.8:1 on ground, ≥ 5.0:1 on every ground step). Every ink step passes WCAG AA for body text on every ground.

### Named Rules
**The Rationed Accent Rule.** Mars rust appears at most about five times per screen. It means "you are here" or "this is your choice", never "good" or "warning".
**The Word Rule.** No status is shown by colour alone: GO / CAUTION / NO-GO text (and a check or cross icon in lists) always goes with it.

## Typography

**Text and numbers:** Archivo Variable (self-hosted via `@fontsource-variable/archivo`, width axis 62–125 %).
**Equations:** STIX Two Text Variable italic (`@fontsource-variable/stix-two-text`).

**Character:** a technical grotesque that condenses for labels and headings (the handbook's figure-label voice), with a textbook serif reserved for math. Width is a design axis: display text at `wdth` 84, headings at 88, labels at 78, and the wordmark expanded to 118.

### Hierarchy
- **Display** (600, 48 px, `wdth` 84, −0.025em): one screen title per plate.
- **Figure** (500, 32 px, tabular): the one number a screen is about (`Readout size="lg"`).
- **Title** (600, 22 px, `wdth` 88): section headings and medium readouts.
- **Lead** (400, 18 px): the one line under a screen title; also equations (STIX italic).
- **Body / Small / Detail** (15 / 14 / 13 px): prose, list labels, the numbers behind a verdict.
- **Label** (`.label-caps`: 600, 12 px, `wdth` 78, uppercase, +0.045em): readout labels, status words, timeline spans. Labels sit beside or inside data and are never placed as a kicker above a heading.

### Named Rules
**The Tabular Rule.** Every number on screen carries `.num` (`tnum`, `lnum`), so columns align and rolling digits keep their width.
**The Math Face Rule.** STIX Two appears only in equations (`.formula`, the `Formula` component sets `_x` as a subscript). It is never used for headings or prose.

## Layout

- Shell: a 68 px top bar (wordmark, phase stations, mission date, Sources). Below it, the screen sits in `main` next to the physics panel (352 px open, 44 px rail collapsed). Total height is `100dvh`, and only `main` and the panel scroll.
- Plates: content is centred, max 68 rem (Sources 64 rem), with 40 px side padding and 48 px top. The single primary action sits at the bottom-left of the plate. On a plate taller than a laptop screen whose next step matters (Briefing; the operations planner), that action row is sticky: it holds the bottom edge of the view on ground behind a hairline, so the next step is always in sight at 1366×768.
- Readout rows use a 4-column grid at ≥ 1024 px (2 below) with a 32 px gap. Gauges and the checklist share a `1fr : 1.35fr` grid.
- Spacing is on a 4 px base (4, 8, 12, 16, 20, 24, 32, 40, 48). Space above a section heading (40–56 px) is larger than the space below it (8 px).
- Desktop first, built for 1366×768 up to 1920×1080. Phone layouts are out of scope.
- Measure: prose stays within 62–72 ch.

## Elevation & Depth

Flat. There are no shadows. Depth comes from tone only: sunken (live numbers) < ground (page) < raised (panel) < hover. Hairline rules separate regions.

## Shapes

All corners are square (`--radius` 2 px). Bars are flat rectangles. The only round forms come from the icons (lucide, 1.5–2.5 stroke).

## Components

### Readout (`src/components/Readout.tsx`)
`{ label, value, unit?, status?, hint?, digits?, size? }`. A 1px top rule (status colour when there is a status, `rule-strong` otherwise), a caps label with the status word on the right, the value in tabular figures whose changed digits roll in place (`RollingText`), the unit in `ink-2`, and the hint in `ink-3`. A non-finite value shows "–" and hides the unit. Use `size="lg"` only for the screen's headline numbers. A small real value never prints as a bare 0 (give it a decimal).

`RollingText` rolls a change only when the previous roll has finished; values arriving faster (time warp, a running clock) swap in place until they settle, so nothing smears.

### Gauge (`src/components/Gauge.tsx`)
`{ value, max, label, threshold?, limit?: 'ceiling'|'floor', unit?, digits?, thresholdLabel?, status? }`. A nomograph scale: a hairline baseline with ticks every tenth, a 6 px fill in the status colour (ink-2 when neutral) and a 1px ink tick at the threshold. Status: beyond the threshold is NO-GO, within 5 % of it on the safe side is CAUTION. `role="meter"` with a full `aria-valuetext`.

### Checklist (`src/components/Checklist.tsx`)
`{ items: CheckItem[], title?, headingLevel? }`. A go/no-go poll. Every item keeps its row in its given order, with the icon, the word, the label and the numbers behind the verdict. The header shows "n of m go" and ALL GO / HOLD.

### Timeline (`src/components/Timeline.tsx`)
`{ startJd, endJd, spans?, events?, nowJd?, label }`. Length is exact duration (one day is the same width everywhere). Overlapping spans get lanes, the axis has month ticks with the years in ink-2, and events are leader lines with labels in up to four rows below the axis, each label in the first row where it does not overlap another. The full content is repeated in an `sr-only` list.

### TimeWarp (`src/components/TimeWarp.tsx`)
`{ rate, onRateChange, onAdvance, lockedReason? }`. A segmented radio group: Pause, 1, 5, 20 days per second, driven by `requestAnimationFrame`. It follows the ARIA radio pattern: one tab stop (the checked rate); arrow keys, Home and End move and select among the enabled rates. When `onAdvance` reports a stop it pauses itself; while a decision is pending the rates are disabled, `lockedReason` says why, and keyboard focus that was on the rates moves to the decision's heading. Nothing eases, so reduced motion changes nothing.

### DecisionCard (`src/components/DecisionCard.tsx`)
`{ event, jd, options, onChoose, note? }`. A flare decision under a 2px Mars rule (the player's choice): the real DONKI date, class and source region with a link to the record, then one ruled row per response with its damage risk and cost, a quiet "Choose" button, and for a ruled-out response the NO-GO word and the reason. The game-balance note sits under the rows.

### PhysicsPanel (`src/components/PhysicsPanel.tsx`)
`{ phase, conceptIds?, collapsed?, onCollapsedChange? }`. The equation sheet. Each concept shows its title with the equation number (n) on the right, the formula in STIX italic, the plain idea in ink-2, the analogy in italic ink-3, and a sunken "With your design" block holding `live(view)`. The live text cross-fades when it changes. Collapsed, it becomes a 44 px rail with vertical "Physics · n". `conceptIds` lets a design tab show its own subset. Concepts live in `src/data/concepts.ts`, and `live()` never throws and never prints NaN.

### AppShell (`src/components/AppShell.tsx`)
`{ renderScreen(phase) }`. The top bar, the phase stations and the docked panel. Screen readers get the mission date from a polite live region that speaks only once the date has held still for 0.7 s (a warp stop, a new turn), never every frame. Stations show their number and name. The current one gets a 2px Mars underline, reached ones a check and an ink-3 underline, and locked ones a lock icon with the reason as title and accessible description. Mission select is reached through the wordmark, Data sources through the Sources link, and Sources' Back button returns to the last phase.

### 3D views (`src/scenes/`)
The 3D views are the only places with depth, and they keep the plate's palette: a graphite studio or dusk sky, paper-white and insulation-foam tanks, graphite structure, no logos or flags. The hangar is a product shot: soft boxes, a metric floor grid that fades out (it is a scale, 1 m cells and 10 m sections), a dark gantry, and plain DOM callouts in label and figure type (height, stage lengths, fairing width) on the camera's side. Live edits slide parts into place with the standard ease-out. The launch view plays the real burn timeline compressed into about 25 s; only the exhaust blooms. Its HUD is DOM over the view: the T+ clock and current event at the top left (the event in no-go red only for a failure, always as words), one Skip/Replay button at the top right (one element, so keyboard focus stays on it), and the stage and "Δv spent of required" with a hairline bar at the bottom, on tonal scrims (no blur). Antialiasing is SMAA, not multisampled buffers (those render the launch black on Direct3D 11 GPUs). Without WebGL the 2D elevation stays (drawn from the same `rocketLayout` as the 3D, so the heights agree), with a one-line note that says why: "3D view unavailable on this device (no WebGL 2)" or "3D view failed to load". Each slot places the note clear of its own HUD and insets. Under reduced motion the hangar snaps and the launch shows its result at once, with still frames per event.

The solar system (Trajectory tab preview, cruise) is black space under the NASA star map, kept dim. Orbits are 1 px graphite hairlines; the chosen or flown arc is the one solid Mars-rust line (2 px, the only line that blooms, faintly); a hovered porkchop cell, the planned transfer and the predicted path are 1 px dashes whose length stays constant on screen (pale ink for the hover, grey for the plan, rust for the prediction). Only the Sun (the SDO image) and the flown arc bloom; tone mapping is neutral so rust stays rust. Bodies are labelled in caps beside them, never over the view's own captions, insets or buttons (overlays marked `data-label-avoid` push labels aside), and the view always says what is not to scale ("planets ×350, Sun ×13"). Focus buttons (Sun, Earth, Mars, Ship) and zoom sit top-right and bottom-right on ground scrims; changing focus flies the camera with the standard ease-out. A flare reaching the ship plays once: a short stream of pale particles from the Sun's side and a soft flash, after the camera has arrived. The Mars arrival is to scale around Mars; the stage (Approach, Capture burn at periapsis, In orbit) is a caps label at the top left, and the orbit is traced out in rust as the ship flies it. The spacecraft model is foil-wrapped, with grey-blue cells and a white dish, no markings; a flare-damaged instrument turns soot-grey. Markers that stand in for bodies too small to see (planet discs, the ship's rust diamond with a dark keyline) fade out as the real model comes into view.

### ActionButton (`src/components/ActionButton.tsx`)
Primary is the Mars fill with mars-ink text: one per screen, square, 40 px, label then arrow. Quiet is a hairline border with ink-2 text. Disabled primary turns to ground-hover with ink-3 text, and the reason sits next to it in ink-3. A button whose action puts a new button under the pointer ("Run turn n", "Fire the capture burn") takes a `guardKey`: it ignores clicks for 400 ms after it appears or its key changes, so a double-click never runs two turns or skips an outcome.

### ConfirmDialog (`src/components/ConfirmDialog.tsx`)
For an action that throws work away (launching again mid-flight). A raised sheet with a hairline frame and a 2px Mars rule on top, square, no shadow, over a flat sunken-tone backdrop (no blur). Title in title type, the consequence in one sentence, then the action (primary) and the way out (quiet). Focus starts on the way out ("Keep flying"); Escape closes it.

### Porkchop plot (`src/components/PorkchopPlot.tsx`, `PorkchopOverlay.tsx`, `PorkchopLegend.tsx`)
The figure that owns the Trajectory tab. The heatmap and contours come first, with the key and the caption under it as in a handbook figure; the arrival-axis title sits above the axis (the date flag that follows the crosshair runs down the tick labels). The tooltip sits beside the crosshair and moves to another corner rather than cover the "Minimum C3" or "Your transfer" labels; a marker label fades while the crosshair runs through it. The key draws each line the way the plot does (dark C3 lines on a swatch of the bright scale). "Click to choose" appears only where the solver gives a usable transfer. Design tabs lay out by their own width (container queries), not the viewport.

### Focus, selection, scrollbars
`:focus-visible` is a 2px Mars outline offset 2px. Selection is Mars at 38 % under ink, and the caret is Mars. Scrollbars are thin, with a rule-strong thumb on a transparent track.

## Motion

- Easing is `cubic-bezier(0.16, 1, 0.3, 1)` (exponential ease-out) everywhere. There is no bounce and no spring overshoot.
- Screen change: exit to opacity 0, −8 px, 4 px blur; enter from opacity 0, +12 px, 6 px blur. Total ≈ 340 ms, mode "wait".
- Physics panel open/close: width animation, 320 ms. A changed live line cross-fades over 180 ms.
- Rolling digits: only changed characters move, sliding vertically over 320 ms in fixed cells keyed from the right; updates faster than a roll swap in place.
- Gauge fills animate `scaleX` over 500 ms.
- Reduced motion: `MotionConfig reducedMotion="user"` turns transforms into instant swaps, and a CSS media query clamps CSS transitions and animations.

## Do's and Don'ts

### Do:
- **Do** pass derived numbers into Readout, Gauge, Checklist and Timeline. They never read the store. Screens read the `use*` hooks or `useGameView()`.
- **Do** label game-balance numbers as such in a hint.
- **Do** give every status its word, and give every locked control its reason.
- **Do** keep one primary action per screen, bottom-left of the plate.
- **Do** draw the one plot that matters large and let the ground stay empty around it.

### Don't:
- **Don't** use cards, glass, blur-as-decoration, glows or shadows. Separate with hairline rules and tone.
- **Don't** use the Mars accent for status, or a status colour for emphasis.
- **Don't** put a kicker or eyebrow above a heading. Caps labels belong next to data.
- **Don't** use purple, cyan neon or gradient text, and don't use emoji or Unicode glyphs as icons (use lucide).
- **Don't** draw a decorative grid or graph-paper background behind text. Grids belong only to real plots.
- **Don't** use NASA logos or insignia anywhere.
- **Don't** print NaN, Infinity or "undefined": format through `formatNumber` / `fmt`, which print "–".
