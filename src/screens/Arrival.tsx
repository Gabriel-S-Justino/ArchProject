// Arrival: Mars orbit insertion. Before the burn the screen shows the approach (v∞, distance from
// Mars on the arrival date, the capture burn and the propellant it takes); the player fires it; the
// result is a capture into the 300 × 33,000 km orbit or a flyby with its reason. The large slot is
// the 3D arrival view (approach hyperbola, capture burn, the orbit traced out, to scale around Mars);
// the 2D drawing of the same conics stands in without WebGL.
import { ArrowRight } from 'lucide-react'
import { useGame } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import { CAPTURE_MAX_MISS_KM, burnPropellantKg, predictArrival, type ArrivalResult } from '@/game/cruise'
import { MU_MARS, R_MARS } from '@/physics/constants'
import { captureBurn } from '@/physics/orbit'
import { formatJd } from '@/physics/time'
import { MarsArrivalView } from '@/scenes/SceneSlot'
import { NoFlight, Plate, PlateActions, PlateTitle } from './flight/plate'

const RP = R_MARS + MISSION.capturePeriapsisAltM
const RA = R_MARS + MISSION.captureApoapsisAltM

export function Arrival() {
  const cruise = useGame((s) => s.cruise)
  const arrival = useGame((s) => s.arrival)
  const completeArrival = useGame((s) => s.completeArrival)
  const setPhase = useGame((s) => s.setPhase)
  const spacecraft = useGame((s) => s.design.spacecraft)
  if (!cruise || cruise.sim.jd < cruise.sim.arrJd) {
    return <NoFlight title="Mars orbit insertion" line="The spacecraft has not reached Mars yet." action="Back to the cruise" onAction={() => setPhase('cruise')} />
  }
  const sim = cruise.sim
  const approach = predictArrival(sim)
  const vInf = arrival?.vInfKms ?? approach.vInfKms
  const moiDv = arrival?.moiDvMs ?? captureBurn(MU_MARS, RP, RA, approach.vInfKms * 1000)
  const needKg = burnPropellantKg(sim, moiDv)
  const missKm = arrival?.missKm ?? approach.missKm
  const inReach = missKm <= CAPTURE_MAX_MISS_KM
  const enough = needKg <= sim.propellantKg

  return (
    <Plate wide>
      <PlateTitle
        title="Mars orbit insertion"
        line={
          <>
            {formatJd(sim.arrJd)}. To stay at Mars the spacecraft must brake at periapsis, {formatNumber(MISSION.capturePeriapsisAltM / 1000)} km
            above the surface, into a {formatNumber(MISSION.capturePeriapsisAltM / 1000)} × {formatNumber(MISSION.captureApoapsisAltM / 1000)} km orbit.
          </>
        }
      />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,1fr)]">
        <div data-slot="arrival-3d" className="relative overflow-hidden aspect-square max-h-[min(34rem,calc(100dvh-15rem))] w-full border border-rule bg-ground-sunken">
          <MarsArrivalView
            vInfKms={vInf}
            missKm={missKm}
            captured={arrival ? arrival.captured : null}
            reason={arrival?.reason}
            design={spacecraft}
            damaged={sim.damaged}
            fallback={<ApproachDiagram vInfKms={vInf} captured={arrival ? arrival.captured : null} missKm={missKm} />}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Readout label="Arrival v∞" value={vInf} digits={2} unit="km/s" hint="Speed relative to Mars, far from it" />
            <Readout label="Capture burn" value={moiDv} unit="m/s" hint="Δv at periapsis (MOI)" />
            <Readout
              label="Arrival-day distance"
              value={missKm}
              unit="km"
              status={inReach ? 'ok' : 'bad'}
              hint={`From Mars on ${formatJd(sim.arrJd)} · capture ≤ ${formatNumber(CAPTURE_MAX_MISS_KM)} km`}
            />
            <Readout
              label={arrival ? 'Propellant before → after' : 'Propellant needed'}
              value={arrival ? `${formatNumber(sim.propellantKg, 1)} → ${formatNumber(arrival.propellantLeftKg, 1)}` : formatNumber(needKg, 1)}
              unit="kg"
              status={arrival ? (arrival.captured ? 'ok' : 'bad') : enough ? 'ok' : 'bad'}
              hint={arrival ? (arrival.captured ? 'Capture burn subtracted' : 'Nothing burned') : `${formatNumber(sim.propellantKg, 1)} kg on board`}
            />
          </div>

          <div aria-live="polite">
            {arrival ? (
              <Outcome arrival={arrival} needKg={needKg} />
            ) : (
              <p className="text-small text-ink-2">
                {inReach && enough
                  ? 'The approach is inside the capture corridor and the tanks hold enough propellant for the burn.'
                  : !inReach
                    ? `The approach passes ${formatNumber(missKm)} km from Mars' centre, outside the ${formatNumber(CAPTURE_MAX_MISS_KM)} km capture corridor: the burn cannot capture.`
                    : `The burn needs ${formatNumber(needKg, 1)} kg of propellant and ${formatNumber(sim.propellantKg, 1)} kg is left.`}
              </p>
            )}
          </div>
        </div>
      </div>

      <PlateActions>
        {!arrival ? (
          <ActionButton onClick={() => completeArrival()} icon={<ArrowRight aria-hidden />}>
            Fire the capture burn
          </ActionButton>
        ) : arrival.captured ? (
          <ActionButton onClick={() => setPhase('ops')} icon={<ArrowRight aria-hidden />}>
            Begin science operations
          </ActionButton>
        ) : (
          <ActionButton onClick={() => setPhase('report')} icon={<ArrowRight aria-hidden />}>
            Read the report
          </ActionButton>
        )}
      </PlateActions>
    </Plate>
  )
}

function Outcome({ arrival, needKg }: { arrival: ArrivalResult; needKg: number }) {
  if (arrival.captured) {
    return (
      <div className="border-t border-go pt-2">
        <p className="text-small text-ink">
          <span className="label-caps text-go">Go · Captured</span> The {formatNumber(arrival.moiDvMs)} m/s burn put the spacecraft into Mars
          orbit, with {formatNumber(arrival.propellantLeftKg, 1)} kg of propellant to spare.
        </p>
      </div>
    )
  }
  const why =
    arrival.reason === 'miss'
      ? `The spacecraft passed ${formatNumber(arrival.missKm)} km from Mars' centre, outside the ${formatNumber(CAPTURE_MAX_MISS_KM)} km capture corridor: no burn could stop it there.`
      : `The capture burn needed ${formatNumber(needKg, 1)} kg of propellant and only ${formatNumber(arrival.propellantLeftKg, 1)} kg was left.`
  return (
    <div className="border-t border-nogo pt-2">
      <p className="text-small text-ink">
        <span className="label-caps text-nogo">No-go · Flyby</span> {why} The spacecraft flies past Mars on a hyperbola and back into orbit
        around the Sun.
      </p>
    </div>
  )
}

/**
 * The approach to scale around Mars: the incoming hyperbola with periapsis at the capture altitude
 * (e = 1 + r_p v∞² / μ), the capture ellipse it brakes into, and Mars itself. A flyby keeps the
 * hyperbola; a miss draws it passing outside the corridor.
 */
function ApproachDiagram({ vInfKms, captured, missKm }: { vInfKms: number; captured: boolean | null; missKm: number }) {
  const v = Math.max(0.1, vInfKms) * 1000
  const miss = captured === false && missKm > CAPTURE_MAX_MISS_KM
  const rp = miss ? Math.min(missKm * 1000, RA * 0.9) : RP
  const e = 1 + (rp * v * v) / MU_MARS
  const p = rp * (1 + e)
  const thMax = Math.acos(-1 / e) * 0.93
  // Units: km / 100 in the viewBox; periapsis on the −x side, so the ellipse extends to +x.
  const k = 1 / 1e5
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const th = -thMax + (2 * thMax * i) / 120
    const r = p / (1 + e * Math.cos(th))
    pts.push(`${(-r * Math.cos(th) * k).toFixed(2)},${(r * Math.sin(th) * k).toFixed(2)}`)
  }
  const a = (RP + RA) / 2
  const c = a - RP
  const b = Math.sqrt(RA * RP)
  const ellipseCx = (c * k).toFixed(2)
  const view = RA * k * 1.15
  return (
    <svg viewBox={`${-view * 0.55} ${-view * 0.85} ${view * 1.7} ${view * 1.7}`} className="h-full w-full" role="img"
      aria-label={`Approach at v∞ ${formatNumber(vInfKms, 2)} km/s. ${captured === null ? 'Before the capture burn.' : captured ? 'Captured into the 300 by 33,000 km orbit.' : 'Flyby.'}`}
    >
      <ellipse cx={ellipseCx} cy={0} rx={a * k} ry={b * k} fill="none" stroke={captured ? 'var(--accent)' : 'var(--rule-strong)'} strokeWidth={captured ? 2.4 : 1.2} strokeDasharray={captured ? undefined : "6 5"} />
      <polyline points={pts.join(' ')} fill="none" stroke={captured === false ? 'var(--accent)' : 'var(--ink-3)'} strokeWidth={1.8} strokeDasharray={captured ? "6 5" : undefined} />
      <circle r={R_MARS * k} fill="var(--ink-3)" />
      <text x={R_MARS * k + 4} y={-(R_MARS * k) - 4} fontSize={20} fill="var(--ink-2)">Mars</text>
      <circle cx={-rp * k} cy={0} r={5} fill="var(--accent)" />
      <text x={-rp * k - 4} y={30} fontSize={17} fill="var(--ink-3)" textAnchor="end">
        Periapsis {formatNumber((rp - R_MARS) / 1000)} km
      </text>
      <text x={RA * k * 0.98} y={-b * k - 12} fontSize={17} fill="var(--ink-3)" textAnchor="end">
        Capture orbit {formatNumber(MISSION.capturePeriapsisAltM / 1000)} × {formatNumber(MISSION.captureApoapsisAltM / 1000)} km
      </text>
      <text x={-view * 0.5} y={view * 0.8} fontSize={17} fill="var(--ink-3)">
        To scale · incoming hyperbola e = {formatNumber(e, 2)}
      </text>
    </svg>
  )
}
