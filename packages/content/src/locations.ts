export interface LocationTemplate {
  id: string;
  name: string;
  text: string;
}

export const LOCATIONS: Record<string, LocationTemplate> = {
  forest_clearing: {
    id: 'forest_clearing',
    name: 'Лесная опушка',
    text: 'Холодная опушка в кубическом лесу. Разбитый ящик, дым вдали, шорох в кустах.',
  },
  rem_camp: {
    id: 'rem_camp',
    name: 'Лагерь Рема',
    text: 'Небольшой костёр, навес из веток. Рем смотрит на лес и молчит.',
  },
  stone_scree: {
    id: 'stone_scree',
    name: 'Каменная осыпь',
    text: 'Склон из серых кубов. Булыжник берётся деревянной или каменной киркой.',
  },
  old_adit: {
    id: 'old_adit',
    name: 'Старая штольня',
    text: 'Внутри холодно и сыро. Деревянные подпорки давно сгнили. Где-то впереди капает вода.',
  },
  node_7: {
    id: 'node_7',
    name: 'Узел 7',
    text: 'Массивные ворота. На замке выбита семёрка.',
  },
  secret_chamber: {
    id: 'secret_chamber',
    name: 'Боковая камера',
    text: 'Узкий карман породы. Старый сундук и жила странного синего минерала.',
  },
  player_camp: {
    id: 'player_camp',
    name: 'Свой стан',
    text: 'Клетка леса, которую ты занял. Пока голо. Можно сделать здесь дом.',
  },
  soot_fissure: {
    id: 'soot_fissure',
    name: 'Сажевая расселина',
    text: 'Чёрные кубы, запах гари. Уголь берётся деревянной киркой. Железо ей не по зубам.',
  },
  ashen_wedge: {
    id: 'ashen_wedge',
    name: 'Сизый клин',
    text: 'Хвойный гребень кубов. Смола пахнет железом. На входе три зарубки — чужие ежедневные метки.',
  },
  rival_camp_edge: {
    id: 'rival_camp_edge',
    name: 'Край стана Яры',
    text: 'Колья и вешки. Живых нет. След отвечает, когда тебя нет.',
  },
  seal_forecourt: {
    id: 'seal_forecourt',
    name: 'Преддверие печати',
    text: 'Затвор кривой. Цепь стонет. Это не шахта.',
  },
};

export const DEFAULT_LOCATION = 'forest_clearing';
export const DEFAULT_STATE = 'start';

export function getLocation(id: string): LocationTemplate | undefined {
  return LOCATIONS[id];
}
