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
  black_marsh_edge: {
    id: 'black_marsh_edge',
    name: 'Край Чёрной топи',
    text: 'Вода стоит. Деревья по пояс. Старый столб несёт знак четвёртой территории — и стёртую стрелку.',
  },
  sunken_boardwalk: {
    id: 'sunken_boardwalk',
    name: 'Затонувший настил',
    text: 'Доски проседают. Следы в воде не держатся. Три пути сходятся дальше.',
  },
  reed_crossing: {
    id: 'reed_crossing',
    name: 'Камышовая переправа',
    text: 'Настил, каменные островки, камыш по грудь. Профессия короче, не запирает.',
  },
  black_reed_basin: {
    id: 'black_reed_basin',
    name: 'Чаша чёрного камыша',
    text: 'Камышники, топеклыки, илистые панцирники. Камыш жёсткий и чёрный.',
  },
  drowned_stones: {
    id: 'drowned_stones',
    name: 'Утонувшие камни',
    text: 'Опоры под водой. Шаг надо выбирать, не бежать.',
  },
  deep_mire: {
    id: 'deep_mire',
    name: 'Глубокая топь',
    text: 'Ил по колено. Дно врёт. Дышать можно — стоять нельзя.',
  },
  sunken_outpost: {
    id: 'sunken_outpost',
    name: 'Затопленный стан',
    text: 'Крыша в воде. На стене старая схема к пятой печати. Свежие метки ведут иначе.',
  },
  miremaw_lair: {
    id: 'miremaw_lair',
    name: 'Логово Топежора',
    text: 'Корни и ил в одной пасти. Не страж печати. Страж воды.',
  },
  moving_marker: {
    id: 'moving_marker',
    name: 'Живой знак',
    text: 'Утром линия уходила влево. Теперь вырезана вправо. Срез свежий. Пыль ещё светлая.',
  },
  submerged_node: {
    id: 'submerged_node',
    name: 'Затопленный узел',
    text: 'Нити сети уходят в воду. Поверх них — чужой рез, сделанный сегодня.',
  },
  black_water_crossing: {
    id: 'black_water_crossing',
    name: 'Чёрный брод',
    text: 'Старый путь влево. Свежие метки вправо. Кто-то правит сеть на ходу.',
  },
  fifth_seal_approach: {
    id: 'fifth_seal_approach',
    name: 'Подход к пятой печати',
    text: 'Вода неподвижная, как глаз. Свод уже слышен.',
  },
  sunken_seal_forecourt: {
    id: 'sunken_seal_forecourt',
    name: 'Преддверие пятой печати',
    text: 'Камень, корень и глубина. Бездонник держит ядро — не правит сеть.',
  },
  seal_3_vault: {
    id: 'seal_3_vault',
    name: 'Свод пятой печати',
    text: 'Пятая печать. Identifier = 3. Бездонник. Не Тленник. Не Вязень.',
  },
  abandoned_station_edge: {
    id: 'abandoned_station_edge',
    name: 'Край заброшенного стана',
    text: 'Деревянные платформы. Каменные основания. Пыль. И свежая стружка на рычаге.',
  },
  collapsed_yard: {
    id: 'collapsed_yard',
    name: 'Обвалившийся двор',
    text: 'Ящик сдвинут недавно. След на пыли ещё не затёрт.',
  },
  old_loading_platform: {
    id: 'old_loading_platform',
    name: 'Старая погрузочная',
    text: 'Канат натянут. Рычаг тёплый. Здесь кто-то был совсем недавно.',
  },
  sorting_yard: {
    id: 'sorting_yard',
    name: 'Сортировочный двор',
    text: 'Завал, противовес, обходные мостки. Три способа пройти. Ни один не запирает.',
  },
  broken_railway: {
    id: 'broken_railway',
    name: 'Сломанный путь',
    text: 'Тележечные направляющие. Дерево и камень. Не рельсы поезда — путь груза.',
  },
  counterweight_pass: {
    id: 'counterweight_pass',
    name: 'Проход противовеса',
    text: 'Камень на канате. Если вернуть груз — мост опустится.',
  },
  lower_gallery: {
    id: 'lower_gallery',
    name: 'Нижние галереи',
    text: 'Шпальники, пыльники, железоспины. Повторно, без бесконечного гринда.',
  },
  crushed_storage: {
    id: 'crushed_storage',
    name: 'Смятый склад',
    text: 'Крепёж и лом. Потолок держит — пока.',
  },
  dark_haulway: {
    id: 'dark_haulway',
    name: 'Тёмная откатка',
    text: 'Узкий ход. Пыль стоит столбом. Шаг слышно далеко.',
  },
  switching_chamber: {
    id: 'switching_chamber',
    name: 'Комната переключений',
    text: 'Каменные каналы. Рычаги. Пазы. Указатели из дерева и железа. Не пульт.',
  },
  route_control_room: {
    id: 'route_control_room',
    name: 'Зал маршрутов',
    text: 'Старые указатели сети. Стан обслуживал узлы. Теория Миры держится.',
  },
  skrezhetnik_lair: {
    id: 'skrezhetnik_lair',
    name: 'Логово Скрежетника',
    text: 'На панцире застряли скобы и пластины. Не механизм. Не страж печати.',
  },
  upper_switchyard: {
    id: 'upper_switchyard',
    name: 'Верхняя сортировка',
    text: 'Мост. Решётка. На той стороне — силуэт. Лица нет.',
  },
  signal_bridge: {
    id: 'signal_bridge',
    name: 'Сигнальный мост',
    text: 'Он заканчивает ход. Противовес падает. Указатель сети сдвигается.',
  },
  sealed_service_pass: {
    id: 'sealed_service_pass',
    name: 'Служебный затвор',
    text: 'Проход разделяет вас. Он уходит. Имя не сказано.',
  },
  sixth_seal_approach: {
    id: 'sixth_seal_approach',
    name: 'Подход к шестой печати',
    text: 'Глубина стана. Затвор уже слышен. Слова незнакомца не уходят.',
  },
  station_depths: {
    id: 'station_depths',
    name: 'Глубина стана',
    text: 'Каменные затворы. Старые крепления. Живое держит печать — не правит сеть.',
  },
  seal_2_chamber: {
    id: 'seal_2_chamber',
    name: 'Свод шестой печати',
    text: 'Шестая печать. Identifier = 2. Затворник. Не Бездонник. Не тот, кто говорит.',
  },
};

export const DEFAULT_LOCATION = 'forest_clearing';
export const DEFAULT_STATE = 'start';

export function getLocation(id: string): LocationTemplate | undefined {
  return LOCATIONS[id];
}
