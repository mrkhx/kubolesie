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
  mira: { id: 'mira', name: 'Мира', locationId: 'mist_lowland' },
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
  {
    id: 'mist_trail',
    title: 'След низины',
    description: 'Найти кромку тумана и понять, откуда гул.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'first_plot',
    title: 'Первая грядка',
    description: 'Мотыга, грядка, семена. Еда не только с добычи.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'string_in_mist',
    title: 'Нити в тумане',
    description: 'Добыть нить в низине. Лук — по желанию.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'water_road',
    title: 'Дорога по воде',
    description: 'Ведро, глина, встреча с Мирой.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'drowned_quarry',
    title: 'Утонувший карьер',
    description: 'Спуститься до нижней камеры. Символ печати, путь закрыт.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'smolnik_hunt',
    title: 'Охота на Смольника',
    description: 'Региональный мини-босс. Не хранитель печати.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'second_seal',
    title: 'Вторая печать',
    description: 'Туманный сторож. Печать удерживает, не создаёт туман.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'enter_rootwood',
    title: 'Вход в чащу',
    description: 'Выйти к Корневой чаще и прочитать перечёркнутый знак.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'clear_the_tangle',
    title: 'Расчистить завал',
    description: 'Три пути подготовки. Профессия помогает, не запирает.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'hollow_grove',
    title: 'Полая роща',
    description: 'Первый конфликт. Ползун, гончий, жалец. Повторно, без бесконечного гринда.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'buried_network',
    title: 'Заброшенный узел',
    description: 'Древняя клетка между печатями. Не говорить, кто её ставил.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'prepare_for_depths',
    title: 'Припасы вглубь',
    description: 'Еда, дерево, камень, уголь. Собрать, дворы, рынок, Вел или помощь.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'rootlasher_hunt',
    title: 'Охота на Корнеплёта',
    description: 'Мини-босс чащи. Не хранитель печати. Сердцевина корня — ключ к своду.',
    defaultStatus: 'LOCKED',
  },
  {
    id: 'third_seal',
    title: 'Третья печать',
    description: 'Вязень. Сеть печатей держится. Осталось: 4.',
    defaultStatus: 'LOCKED',
  },
];

export const IRON_FOR_GATE_TARGET = 8;
export const CAMP_QUEST_XP = 30;
export const FURNACE_QUEST_XP = 50;
export const WENZEL_QUEST_XP = 80;
export const MIST_WARDEN_QUEST_XP = 90;
export const SMOLNIK_QUEST_XP = 50;
export const CROP_TICKS_NEEDED = 2;
export const WEEK2_DAY_XP = {
  8: 25,
  9: 25,
  10: 30,
  11: 30,
  12: 35,
  13: 40,
  14: 20,
} as const;
export const VYAZEN_QUEST_XP = 100;
export const ROOTLASHER_QUEST_XP = 55;
export const WEEK3_DAY_XP = {
  15: 25,
  16: 25,
  17: 30,
  18: 30,
  19: 30,
  20: 40,
  21: 20,
} as const;
