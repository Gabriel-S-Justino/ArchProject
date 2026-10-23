// Typed access to the pre-fetched NASA DONKI solar flares (scripts/fetch-donki.mjs).
// No network access at runtime: the JSON is bundled.
import type { DonkiFlare } from '@/game/types'
import data from '@/data/generated/donki-flares.json'

export const DONKI_META: {
  source: string
  url: string
  fetched: string
  range: { start: string; end: string }
  filter: string
  count: number
} = {
  source: data.source,
  url: data.url,
  fetched: data.fetched,
  range: data.range,
  filter: data.filter,
  count: data.count,
}

export const DONKI_FLARES: DonkiFlare[] = data.flares
