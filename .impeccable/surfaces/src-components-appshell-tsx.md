---
version: 1
slug: "src-components-appshell-tsx"
primary_target: "src/components/AppShell.tsx"
related_targets: ["src/components/PhysicsPanel.tsx","src/screens/Sources.tsx"]
---

Scope: the app shell (top bar, phase stepper, main area, physics panel) and the shared components every later screen uses. Mode: Operate.
Audience/job: students playing one Mars orbiter mission; judges watching a 30 s video. They must read real numbers fast and see why a check fails.
Decisions made without the team (agent could not ask): direction assigned by the roll, challengers judged in-thread.

## Direction contract

THESIS: The interplanetary mission design handbook, read as a negative: numbered equations, figure plates, ruled data blocks, plotted on a dark film ground. Refuses the sci-fi HUD (neon cyan glow, glass cards) and the admin dashboard (card grid, KPI tiles).
OWN-WORLD: graphite film ground, warm paper-white ink, hairline rules instead of boxes; one rust accent for the current phase and the primary action; go/caution/no-go in avionics green, amber, red, always with a word. Archivo (condensed caps for labels, tabular figures), STIX Two italic for equations.
STORY: the player sees where they are in the mission, reads every number at a glance, and finds the physics behind it with their own values plugged in.
FIRST VIEWPORT: title block across the top (mission, phase stations, mission date as large tabular figures); the current screen as a figure plate; the equation sheet docked right, collapsible to a rail.
FORM: candidate 3 of 7 (mission design handbook figures), seed e40d7135. Raises: split-flap (fixed digit cells that roll in place), labanotation (timeline length is exact duration), ticket wallet (nothing disappears: done and locked states stay visible), Saville sleeve (one plot owns the field, vast unprinted ground), monochrome canon (accent used a handful of times), botanical folio (shared scales).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
