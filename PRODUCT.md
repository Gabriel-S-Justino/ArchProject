# Product

<!-- impeccable:product-schema 1 -->

> Inferred, not interviewed: written during Task 11 by an implementing agent that could not ask the
> team questions. Every fact below comes from `docs/superpowers/specs/2026-10-22-mission-architect-vision-design.md`
> and the task briefs; correct anything that is wrong.

## Platform

web

## Users

High-school and undergraduate students with no space-engineering background, playing one Mars
orbiter mission end to end (10–15 minutes) on a desktop or laptop browser. Second audience: NASA
Space Apps 2026 judges, who first see the game through a 30-second demo video and then may click
through it themselves.

## Product Purpose

Mission Architect lets a student design, manage and simulate a complete Mars orbiter mission
("Red Watch"): pick a launch date on a real porkchop plot, build a rocket that can deliver the
spacecraft, design the spacecraft, launch, manage cruise and science operations through decisions,
and get a report that explains every outcome with physics. Success: a student who loses
understands why; a judge remembers the visual impact and the serious math on real NASA data.

## Positioning

One real feedback loop, the one mission designers use: launch date → C3 and arrival v∞ → rocket
capacity and capture propellant → maximum spacecraft mass → budget. Every number is computed live
from JPL Horizons ephemerides, NASA LSP launch curves and NASA DONKI flares, not decorative.

## Operating Context

Desktop browser, 1280 px and up, must work on a 1366×768 laptop. Played alone or shown on a
projector/video. Static site, no network calls at runtime, no accounts.

## Capabilities and Constraints

- Phases: select, briefing, design (trajectory / rocket / spacecraft workspace), launch, cruise,
  arrival, ops, report, plus a Data sources side screen.
- A Physics panel in every phase shows the concepts in play: formula, plain explanation, analogy,
  and the player's own live numbers.
- Display units: km, AU, days, t, km²/s² for C3, km/s for v∞, US$ M for cost. Game-balance numbers
  must be labelled as such.
- English only. No NASA logos or mission insignia; real mission names only in factual comparisons.
- Stack: Vite, React 19, TypeScript, Tailwind 4, shadcn/ui (Radix), Motion, Zustand, React Three Fiber.

## Brand Commitments

- Name: Mission Architect. Mission name: Red Watch.
- Direction pinned by the spec: cinematic mission control, dark, precise and highly readable
  numbers, restrained colour with clear status semantics, must not look like a generic admin
  dashboard or an "AI-generated" UI.

## Evidence on Hand

Real data in `src/data/` (Horizons ephemerides, LSP curves, engine specs, DONKI flares, NASA
textures in `public/textures/`), each with source and fetch date (`src/data/sources.ts`). No
testimonials, users or awards exist; none may be invented.

## Product Principles

1. The math is the show: every visual earns its place by making a real number legible.
2. Never stuck: a student without guidance always knows the next step and why a check fails.
3. Honest numbers: real, computed from real data, or labelled game balance; never NaN on screen.
4. Cause and effect stay visible: a change anywhere in the design updates every readout at once.

## Accessibility & Inclusion

WCAG AA text contrast, visible keyboard focus, labelled icon buttons, prefers-reduced-motion respected.
