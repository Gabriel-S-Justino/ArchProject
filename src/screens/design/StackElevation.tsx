// A side elevation of the rocket, drawn to scale from the catalog's tank and booster dimensions, like
// the vehicle outline in a launch-vehicle user's guide. It fills the hangar and launch slots while the
// 3D scenes load, and stays there when WebGL is unavailable.
import { formatNumber } from '@/components/status'
import { FAIRINGS, type RocketDesign } from '@/physics/launcher'
import { rocketLayout } from '@/scenes/rocketLayout'

interface Block {
  stage: number
  /** Bottom of the stage (nozzle exit plane) and top of its tanks or interstage, m. */
  y0: number
  y1: number
  /** Top of the engine section (where the tanks start), m. */
  bay: number
  d: number
  engines: number
  /** Heights of the joints between stacked tanks, m from the pad. */
  joints: number[]
  wrong: boolean
}

/**
 * The stack's outline from rocketLayout, the same function the 3D hangar and launch use, so the
 * drawing and the 3D callouts give the same heights.
 */
function layout(r: RocketDesign) {
  const l = rocketLayout(r)
  const blocks: Block[] = l.stages.map((st) => {
    const design = r.stages[st.index]
    const prop = st.engines?.propellant
    return {
      stage: st.index,
      y0: st.y0,
      y1: st.y1,
      bay: st.aft.y1,
      d: st.diameter,
      engines: st.engines ? Math.min(5, Math.max(1, design?.engineCount || 1)) : 0,
      joints: st.joints,
      wrong: prop !== undefined && st.tanks.some((t) => t.propellant !== prop),
    }
  })
  const f = l.fairing
  const fairing = f ? { y0: f.y0, y1: f.y1, d: f.diameter } : { y0: 0, y1: 0, d: 0 }
  const b = l.boosters
  return {
    blocks,
    fairing,
    booster: b ? { n: b.count, d: b.diameter, l: b.length } : null,
    height: l.height,
  }
}

/** Parts already dropped in flight (the launch screen ticks them off); drawn as faint outlines. */
export interface StackDropped {
  boosters?: boolean
  /** Number of bottom stages separated. */
  stages?: number
  fairing?: boolean
}

export function StackElevation({ rocket, dropped }: { rocket: RocketDesign; dropped?: StackDropped }) {
  const gone = (on: boolean | undefined) => (on ? { opacity: 0.18, strokeDasharray: '0.6 0.6' } : {})
  const { blocks, fairing, booster, height } = layout(rocket)
  // viewBox in metres; 4 m of margin, and room for one booster column per side.
  const maxD = Math.max(fairing.d, ...blocks.map((b) => b.d), 1)
  const side = booster ? booster.d * 1.15 + 0.6 : 0
  const halfW = maxD / 2 + side + 6
  const H = Math.max(height, 30) + 8
  const yOf = (m: number) => H - 4 - m // metres from the pad up → SVG y
  const stroke = 'var(--ink-2)'
  const fairingKg = FAIRINGS[rocket.fairing]?.massKg ?? 0

  return (
    <svg viewBox={`${-halfW} 0 ${halfW * 2} ${H}`} className="h-full w-full" role="img" aria-label={describe(rocket, height)}>
      {/* pad line and a 10 m scale bar */}
      <line x1={-halfW + 1} x2={halfW - 1} y1={yOf(0)} y2={yOf(0)} stroke="var(--rule-strong)" strokeWidth={0.12} />
      <g transform={`translate(${-halfW + 1.5},0)`} stroke="var(--ink-3)" strokeWidth={0.12}>
        <line x1={0} x2={0} y1={yOf(0)} y2={yOf(10)} />
        <line x1={-0.5} x2={0.5} y1={yOf(10)} y2={yOf(10)} />
        <line x1={-0.5} x2={0.5} y1={yOf(0)} y2={yOf(0)} />
        <text x={0.9} y={yOf(5) + 0.5} fontSize={1.6} fill="var(--ink-3)" stroke="none" className="num">
          10 m
        </text>
      </g>

      {/* boosters on stage 1, one column per side (the rest stand behind) */}
      {booster &&
        [-1, 1].map((sgn) => {
          const x = sgn * ((blocks[0]?.d ?? 3) / 2 + booster.d / 2 + 0.15)
          return (
            <g key={sgn} fill="var(--ground-raised)" stroke={stroke} strokeWidth={0.12} {...gone(dropped?.boosters)}>
              <path
                d={`M${x - booster.d / 2},${yOf(1.5)} V${yOf(booster.l - booster.d)} L${x},${yOf(booster.l)} L${x + booster.d / 2},${yOf(booster.l - booster.d)} V${yOf(1.5)} Z`}
              />
              <path d={`M${x - booster.d * 0.3},${yOf(1.5)} L${x - booster.d * 0.4},${yOf(0.2)} H${x + booster.d * 0.4} L${x + booster.d * 0.3},${yOf(1.5)} Z`} />
            </g>
          )
        })}

      {blocks.map((b) => {
        const r = b.d / 2
        const bellW = Math.min(b.d / Math.max(1, b.engines), 2.2)
        return (
          <g key={b.stage} {...gone(dropped?.stages !== undefined && b.stage < dropped.stages)}>
            {/* engine bells */}
            {Array.from({ length: b.engines }, (_, k) => {
              const cx = (k - (b.engines - 1) / 2) * bellW
              return (
                <path
                  key={k}
                  d={`M${cx - bellW * 0.22},${yOf(b.bay)} L${cx - bellW * 0.45},${yOf(b.y0 + 0.15)} H${cx + bellW * 0.45} L${cx + bellW * 0.22},${yOf(b.bay)} Z`}
                  fill="var(--ground-sunken)"
                  stroke={stroke}
                  strokeWidth={0.1}
                />
              )
            })}
            <rect
              x={-r}
              y={yOf(b.y1)}
              width={b.d}
              height={Math.max(0.1, b.y1 - b.bay)}
              fill="var(--ground-raised)"
              stroke={b.wrong ? 'var(--nogo)' : stroke}
              strokeWidth={0.14}
            />
            {b.joints.map((j) => (
              <line key={j} x1={-r} x2={r} y1={yOf(j)} y2={yOf(j)} stroke="var(--rule-strong)" strokeWidth={0.1} />
            ))}
            <text x={r + 0.8} y={yOf((b.y0 + b.y1) / 2) + 0.6} fontSize={1.7} fill="var(--ink-3)" className="num">
              S{b.stage + 1}
            </text>
          </g>
        )
      })}

      {/* fairing: cylinder plus ogive nose */}
      {blocks.length > 0 && (
        <path
          d={`M${-fairing.d / 2},${yOf(fairing.y0)} V${yOf(fairing.y0 + (fairing.y1 - fairing.y0) * 0.45)} C${-fairing.d / 2},${yOf(fairing.y1 - 1.5)} ${-0.6},${yOf(fairing.y1)} 0,${yOf(fairing.y1)} C${0.6},${yOf(fairing.y1)} ${fairing.d / 2},${yOf(fairing.y1 - 1.5)} ${fairing.d / 2},${yOf(fairing.y0 + (fairing.y1 - fairing.y0) * 0.45)} V${yOf(fairing.y0)} Z`}
          fill="var(--ground)"
          stroke={stroke}
          strokeWidth={0.14}
          {...gone(dropped?.fairing)}
        >
          <title>{`Fairing, ${fairingKg.toLocaleString('en-US')} kg`}</title>
        </path>
      )}
      <text x={halfW - 1} y={yOf(height) - 1} textAnchor="end" fontSize={1.7} fill="var(--ink-2)" className="num">
        {formatNumber(height, 1)} m
      </text>
    </svg>
  )
}

function describe(r: RocketDesign, height: number): string {
  if (r.stages.length === 0) return 'Stack elevation: no stages yet'
  return `Stack elevation to scale: ${r.stages.length} stage${r.stages.length === 1 ? '' : 's'}, ${formatNumber(height, 1)} m tall with the fairing`
}
