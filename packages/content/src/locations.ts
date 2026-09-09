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
  rotten_trail_edge: {
    id: 'rotten_trail_edge',
    name: 'Край гнилой тропы',
    text: 'Деревья в тёмных прожилках. Следы зверей обрываются. Старый знак несут свежим резом.',
  },
  split_path: {
    id: 'split_path',
    name: 'Развилка ложных следов',
    text: 'Три тропы. Звериная, овраг, настилка. Все сходятся. Одна врёт меньше.',
  },
  black_bark_marker: {
    id: 'black_bark_marker',
    name: 'Чёрный маркер',
    text: 'Знак печати. Поверх — свежий рез. Направление сдвинуто на палец.',
  },
  rot_hollow: {
    id: 'rot_hollow',
    name: 'Гнилая низина',
    text: 'Почва проседает. Гнилуши, топники, короедники. Смола тёплая.',
  },
  sinking_ground: {
    id: 'sinking_ground',
    name: 'Провальная почва',
    text: 'Грунт дышит и садится. Шаг надо выбирать, не бежать.',
  },
  deadwood_ring: {
    id: 'deadwood_ring',
    name: 'Кольцо мёртвой коры',
    text: 'Кора и корни срослись. Здесь стоит Чернокорень.',
  },
  missing_camp: {
    id: 'missing_camp',
    name: 'Пропавший лагерь',
    text: 'Кострище есть. Вещи есть. Людей нет. Стрелка к печати перечёркнута.',
  },
  warped_marker_field: {
    id: 'warped_marker_field',
    name: 'Поле правленого знака',
    text: 'Старые метки и новые поверх. Путь к печати сдвинут руками.',
  },
  buried_crossing: {
    id: 'buried_crossing',
    name: 'Зарытый перекрёсток',
    text: 'Нити сети уходят в почву. Поверх них — чужой рез.',
  },
  corrupted_node: {
    id: 'corrupted_node',
    name: 'Искажённый узел',
    text: 'Не трещина. Правка. Кто-то знает, как сеть держит путь.',
  },
  rotten_seal_forecourt: {
    id: 'rotten_seal_forecourt',
    name: 'Преддверие четвёртой печати',
    text: 'Почва пахнет тленом. Путь под ногами врёт на палец.',
  },
  black_root_vault: {
    id: 'black_root_vault',
    name: 'Чёрный свод',
    text: 'Четвёртая печать. Тленник держит ядро пути, не кору.',
  },
  seal_4: {
    id: 'seal_4',
    name: 'Четвёртая печать',
    text: 'Печать стихает не в тишину. В ощущение, что путь вчера шёл иначе.',
  },
};

export const DEFAULT_LOCATION = 'forest_clearing';
export const DEFAULT_STATE = 'start';

export function getLocation(id: string): LocationTemplate | undefined {
  return LOCATIONS[id];
}
