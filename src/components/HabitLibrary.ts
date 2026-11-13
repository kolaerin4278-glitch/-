import { HABIT_TYPES, SPHERES, type HabitType, type Sphere } from '../constants';

export interface HabitTemplate {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly sphere: Sphere;
  readonly type: HabitType;
  readonly trigger: string;
  readonly norm: string;
  readonly planB: string;
  readonly targetValue?: number;
  readonly unit?: string;
  readonly stepValue?: number;
  readonly timerMinutes?: number;
  readonly energyCost: 1 | 2 | 3;
  readonly keystone?: boolean;
  readonly capsule: string;
}

export const HABIT_TEMPLATES: readonly HabitTemplate[] = Object.freeze([
  {
    id: 'tpl_water',
    title: 'Водный баланс',
    icon: '💧',
    sphere: SPHERES.BODY,
    type: HABIT_TYPES.COUNTER,
    trigger: 'Сразу после пробуждения и перед приёмами пищи',
    norm: '8 стаканов',
    planB: '4 стакана',
    targetValue: 8,
    unit: 'ст.',
    stepValue: 1,
    energyCost: 1,
    keystone: true,
    capsule: 'Чистая вода с утра мгновенно включает ясность головы и убирает ложную усталость.'
  },
  {
    id: 'tpl_mobility',
    title: 'Утренняя разминка суставов',
    icon: '🤸',
    sphere: SPHERES.BODY,
    type: HABIT_TYPES.BINARY,
    trigger: 'После того как встану с кровати',
    norm: '15 минут разминки',
    planB: '2 минуты потянуться',
    energyCost: 2,
    keystone: true,
    capsule: 'Тело благодарит за движение весь оставшийся день — даже две минуты снимают зажимы.'
  },
  {
    id: 'tpl_walk',
    title: 'Прогулка без экрана',
    icon: '🚶',
    sphere: SPHERES.BODY,
    type: HABIT_TYPES.TIMER,
    trigger: 'После завершения рабочего блока вечером',
    norm: '30 мин на воздухе',
    planB: '7 мин вокруг дома',
    timerMinutes: 30,
    energyCost: 2,
    capsule: 'Свежий воздух перезагружает нервную систему лучше любого скроллинга ленты.'
  },
  {
    id: 'tpl_sleep',
    title: 'Цифровой закат ко сну',
    icon: '🌙',
    sphere: SPHERES.BODY,
    type: HABIT_TYPES.BINARY,
    trigger: 'В 22:30, когда срабатывает вечерний сигнал',
    norm: 'Убрать экраны за 45 мин до сна',
    planB: 'Ночной режим и телефон в другой конец комнаты',
    energyCost: 1,
    keystone: true,
    capsule: 'Крепкий сон — фундамент завтрашней энергии и спокойствия.'
  },
  {
    id: 'tpl_reading',
    title: 'Глубокое чтение книги',
    icon: '📚',
    sphere: SPHERES.MIND,
    type: HABIT_TYPES.COUNTER,
    trigger: 'Вечером в кресле с чашкой чая',
    norm: '20 страниц',
    planB: '2 страницы',
    targetValue: 20,
    unit: 'стр.',
    stepValue: 5,
    energyCost: 2,
    capsule: 'Две страницы в трудный день сохраняют идентичность читающего человека.'
  },
  {
    id: 'tpl_language',
    title: 'Практика иностранного языка',
    icon: '🌍',
    sphere: SPHERES.MIND,
    type: HABIT_TYPES.TIMER,
    trigger: 'За утренним кофе',
    norm: '20 мин практики',
    planB: '3 карточки слов',
    timerMinutes: 20,
    energyCost: 2,
    capsule: 'Язык строится ежедневным касанием, а не редкими марафонами по выходным.'
  },
  {
    id: 'tpl_notes',
    title: 'Конспект одной идеи дня',
    icon: '🧠',
    sphere: SPHERES.MIND,
    type: HABIT_TYPES.BINARY,
    trigger: 'После прочтения статьи или рабочей встречи',
    norm: 'Заметка своими словами (5 предложений)',
    planB: '1 главная мысль в блокнот',
    energyCost: 1,
    capsule: 'Собственные мысли и инсайты остаются с тобой только тогда, когда зафиксированы.'
  },
  {
    id: 'tpl_deep_work',
    title: 'Фокус-сессия на главную задачу',
    icon: '🎯',
    sphere: SPHERES.WORK,
    type: HABIT_TYPES.TIMER,
    trigger: 'До открытия мессенджеров и почты утром',
    norm: '50 мин без отвлечений',
    planB: '10 мин старта по таймеру',
    timerMinutes: 50,
    energyCost: 3,
    keystone: true,
    capsule: 'Один защищённый час утром двигает главные проекты сильнее целого дня суеты.'
  },
  {
    id: 'tpl_inbox_zero',
    title: 'План 3 приоритетов на завтра',
    icon: '📝',
    sphere: SPHERES.WORK,
    type: HABIT_TYPES.BINARY,
    trigger: 'Перед закрытием ноутбука вечером',
    norm: 'Выписать 3 ключевых шага на завтра',
    planB: 'Назвать 1 главную задачу завтрашнего утра',
    energyCost: 1,
    capsule: 'Ясное утро начинается с вечера — мозг перестаёт тревожиться о незакрытых делах.'
  },
  {
    id: 'tpl_finance',
    title: 'Осознанный учёт расходов',
    icon: '💎',
    sphere: SPHERES.WORK,
    type: HABIT_TYPES.BINARY,
    trigger: 'После последней покупки дня',
    norm: 'Занести траты и проверить лимит дня',
    planB: 'Проверить баланс за 30 секунд',
    energyCost: 1,
    capsule: 'Спокойствие в финансах рождается из прозрачности и регулярного внимания.'
  },
  {
    id: 'tpl_breath',
    title: 'Дыхательная пауза спокойствия',
    icon: '🌬️',
    sphere: SPHERES.SPIRIT,
    type: HABIT_TYPES.TIMER,
    trigger: 'В середине дня при ощущении напряжения',
    norm: '10 мин медитации или дыхания',
    planB: '6 глубоких циклов вдоха-выдоха',
    timerMinutes: 10,
    energyCost: 1,
    keystone: true,
    capsule: 'Между стимулом и реакцией есть пауза — в ней живёт твоя внутренняя свобода.'
  },
  {
    id: 'tpl_gratitude',
    title: 'Три благодарности дня',
    icon: '✨',
    sphere: SPHERES.SPIRIT,
    type: HABIT_TYPES.COUNTER,
    trigger: 'Лёжа в кровати перед сном',
    norm: '3 тёплых момента дня',
    planB: '1 вещь, за которую благодарен сегодня',
    targetValue: 3,
    unit: 'пункта',
    stepValue: 1,
    energyCost: 1,
    capsule: 'Внимание к хорошему меняет оптику ума даже в самые непростые недели.'
  }
]);
