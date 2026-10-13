import actions from '@/data/actions.json';
import components from '@/data/components.json';
import crew from '@/data/crew.json';
import events from '@/data/events.json';
import launchers from '@/data/launchers.json';
import missions from '@/data/missions.json';
import type { CardCatalog, Mission } from '@/types/game';

export const catalog = {
  launchers,
  components,
  crew,
  events,
  actions,
} as unknown as CardCatalog;

export const missionList = missions as unknown as Mission[];

export function getMission(id: string): Mission {
  const mission = missionList.find((m) => m.id === id);
  if (!mission) throw new Error(`Missão desconhecida: ${id}`);
  return mission;
}
