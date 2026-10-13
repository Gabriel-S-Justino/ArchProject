import type { Design } from '@/types/game';
import { getMission } from '@/game/catalog';

export const mars = getMission('red-watch');

/** Reference spacecraft from Arquitetura.md section 17. */
export const referenceDesign: Design = {
  launcherId: 'launcher-medium',
  componentIds: [
    'engine-chemical',
    'solar-large',
    'battery',
    'antenna-high',
    'camera-hires',
    'spectrometer',
    'radar-sounder',
    'magnetometer',
    'shield-radiation',
    'shield-micrometeoroid',
    'computer-redundant',
  ],
  crewIds: ['crew-science', 'crew-comms', 'crew-flight'],
};

export function withSwap(design: Design, from: string, to: string): Design {
  return { ...design, componentIds: design.componentIds.map((id) => (id === from ? to : id)) };
}
