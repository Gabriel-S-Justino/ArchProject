import { PRESETS } from '@/data/presets'
import type { RocketDesign } from '@/physics/launcher'

const key = (r: RocketDesign) => JSON.stringify({ stages: r.stages, fairing: r.fairing })

/** The preset class a rocket matches exactly ("Atlas V 401-class"), or a description of a custom stack. */
export function vehicleName(r: RocketDesign): string {
  const k = key(r)
  const hit = PRESETS.filter((p) => p.id !== 'reference').find((p) => key(p.rocket) === k)
  if (hit) return hit.name
  const n = r.stages.length
  return `Custom ${n}-stage stack${r.stages[0]?.boosterCount ? ` + ${r.stages[0].boosterCount} boosters` : ''}`
}
