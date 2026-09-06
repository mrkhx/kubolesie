import type { QuestStatus } from '@kubolesie/shared';

export interface NpcTemplate {
  id: string;
  name: string;
  locationId: string;
}

export const NPCS: Record<string, NpcTemplate> = {
  rem: { id: 'rem', name: 'Рем', locationId: 'rem_camp' },
};

export interface QuestTemplateContent {
  id: string;
  title: string;
  description: string;
  defaultStatus: QuestStatus;
  target?: { resource: string; amount: number };
}

export const QUEST_TEMPLATES: QuestTemplateContent[] = [
  {
    id: 'iron_for_gate',
    title: 'Железо для ворот',
    description: 'Добыть 8 железной руды, чтобы Рем мог укрепить затвор у Узла 7.',
    defaultStatus: 'LOCKED',
    target: { resource: 'IRON_ORE', amount: 8 },
  },
];

export const IRON_FOR_GATE_TARGET = 8;
