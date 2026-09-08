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
  mist_border: {
    id: 'mist_border',
    name: 'Кромка тумана',
    text: 'Холодный туман стоит стеной. Старые ручьи вышли. След ведёт вниз, в низину.',
  },
  mist_lowland: {
    id: 'mist_lowland',
    name: 'Туманная низина',
    text: 'Вода по щиколотку. Камыш кубами. Белые нити на ветках. Гул идёт из глубины.',
  },
  drowned_quarry: {
    id: 'drowned_quarry',
    name: 'Утонувший карьер',
    text: 'Старая выработка под водой. Берег, затопленный проход, нижняя камера. Не клин.',
  },
  second_seal: {
    id: 'second_seal',
    name: 'Вторая печать',
    text: 'Глубокая впадина. Туман не выходит — втягивается внутрь.',
  },
  rootwood_edge: {
    id: 'rootwood_edge',
    name: 'Край Корневой чащи',
    text: 'Густой старый лес. Корни перекрывают тропы. Почва местами дышит.',
  },
  tangled_path: {
    id: 'tangled_path',
    name: 'Спутанная тропа',
    text: 'Завал из живых корней и камня. Без подготовки не пройти.',
  },
  old_marker: {
    id: 'old_marker',
    name: 'Старый маркер',
    text: 'Деревянный столб. Тот же знак печатей. Часть символа перечёркнута корнями.',
  },
  hollow_grove: {
    id: 'hollow_grove',
    name: 'Полая роща',
    text: 'Деревья внутри пустые. Оттуда тянет смолой и шкурой.',
  },
  root_pit: {
    id: 'root_pit',
    name: 'Корневая яма',
    text: 'Провал. Ползуны спускаются по жилам. Дно дышит.',
  },
  buried_mechanism: {
    id: 'buried_mechanism',
    name: 'Заброшенный узел',
    text: 'Камень и дерево срослись. Не современная машина. Древняя клетка мира.',
  },
  root_chamber: {
    id: 'root_chamber',
    name: 'Корневая камера',
    text: 'Камера под узлом. На своде — нити между знаками печатей.',
  },
  root_seal_forecourt: {
    id: 'root_seal_forecourt',
    name: 'Преддверие третьей печати',
    text: 'Корни расступаются кольцом. В центре — щель глубже низины.',
  },
  deep_root_vault: {
    id: 'deep_root_vault',
    name: 'Глубокий свод',
    text: 'Третья печать. Не Вензель. Не сторож. Что-то старше держит сеть.',
  },
};

export const DEFAULT_LOCATION = 'forest_clearing';
export const DEFAULT_STATE = 'start';

export function getLocation(id: string): LocationTemplate | undefined {
  return LOCATIONS[id];
}
