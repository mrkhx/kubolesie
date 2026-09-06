import type { QuestStatus } from '@kubolesie/shared';

export interface NpcTemplate {
  id: string;
  name: string;
  locationId: string;
}

export const NPCS: Record<string, NpcTemplate> = {
  rem: { id: 'rem', name: 'Рем', locationId: 'rem_camp' },
  vel: { id: 'vel', name: 'Вел', locationId: 'player_camp' },
  yara: { id: 'yara', name: 'Яра', locationId: 'rival_camp_edge' },
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
  {
    id: 'found_a_camp',
    title: 'Свой стан',
    description: 'Занять клетку, поставить верстак на землю и зажечь костёр.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'daily_kill',
    title: 'Ежедневка: бой',
    description: 'Победить двух существ Сизого клина.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'daily_gather',
    title: 'Ежедневка: добыча',
    description: 'Добыть ресурс — дерево, камень или уголь.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'daily_craft',
    title: 'Ежедневка: крафт',
    description: 'Изготовить факел, каменный меч или тунику.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'stumpfang_hunt',
    title: 'Охота на Пнеклыка',
    description: 'Мини-босс Сизого клина. Можно отложить.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'light_the_furnace',
    title: 'Зажечь печь',
    description: 'Печь, первый слиток, одно железное орудие.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'deal_with_vel',
    title: 'Сделка с Велом',
    description: 'Продать или купить хотя бы раз. Можно отказаться.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'yara_claim',
    title: 'Претензия Яры',
    description: 'Ответить на след или снести дань.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'hold_the_hinges',
    title: 'Удержать петли',
    description: 'Победить Вензеля у затвора. Ретрай без wipe.',
    defaultStatus: 'LOCKED',
  },
];

export const IRON_FOR_GATE_TARGET = 8;
export const CAMP_QUEST_XP = 30;
export const FURNACE_QUEST_XP = 50;
export const WENZEL_QUEST_XP = 80;
