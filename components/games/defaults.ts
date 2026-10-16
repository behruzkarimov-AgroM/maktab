import type { Difficulty } from "@/lib/types";
import { DIFFICULTIES, GAME_SLUGS, type DifficultyConfig, type GameConfig, type GameMeta, type GameSlug } from "./types";

const cfg = (g: [number, number, number], m: [number, number, number], h: [number, number, number]): GameConfig => ({
  easy: { grid: g[0], time_limit: g[1], multiplier: g[2] },
  medium: { grid: m[0], time_limit: m[1], multiplier: m[2] },
  hard: { grid: h[0], time_limit: h[1], multiplier: h[2] },
});

export const GAME_DEFAULTS: GameMeta[] = [
  {
    slug: "schulte-table",
    icon: "🔢",
    title: { uz: "Shulte jadvali", ru: "Таблица Шульте", en: "Schulte Table" },
    description: {
      uz: "Raqamlarni tartib bilan tez toping.",
      ru: "Быстро находите числа по порядку.",
      en: "Find the numbers in order, as fast as you can.",
    },
    howTo: {
      uz: "Jadvaldagi raqamlarni 1 dan boshlab o'sish tartibida bosing. Qanchalik tez bo'lsangiz, shuncha ko'p ball.",
      ru: "Нажимайте числа в таблице по возрастанию, начиная с 1. Чем быстрее, тем больше очков.",
      en: "Tap the numbers in ascending order starting from 1. The faster you are, the more points.",
    },
    skill: { uz: "Diqqat va periferik ko'rish", ru: "Внимание и периферическое зрение", en: "Attention & peripheral vision" },
    config: cfg([3, 60, 1], [4, 90, 1.5], [5, 120, 2]),
  },
  {
    slug: "memory-matrix",
    icon: "🧩",
    title: { uz: "Xotira matritsasi", ru: "Матрица памяти", en: "Memory Matrix" },
    description: {
      uz: "Yonib o'chgan kataklarni eslab qoling.",
      ru: "Запомните подсвеченные клетки.",
      en: "Remember which cells lit up.",
    },
    howTo: {
      uz: "Yoritilgan kataklarni eslab qoling, so'ng ularni bosing. 3 ta jon bor, har bosqichda kataklar ko'payadi.",
      ru: "Запомните подсвеченные клетки и нажмите на них. У вас 3 жизни, с каждым уровнем клеток больше.",
      en: "Memorise the highlighted cells, then tap them. You have 3 lives and every level adds more cells.",
    },
    skill: { uz: "Qisqa muddatli xotira", ru: "Кратковременная память", en: "Short-term memory" },
    config: cfg([3, 120, 1], [4, 120, 1.5], [5, 120, 2]),
  },
  {
    slug: "mental-math",
    icon: "➕",
    title: { uz: "Tezkor arifmetika", ru: "Устный счёт", en: "Mental Math" },
    description: {
      uz: "Misollarni tez yeching, kombo to'plang.",
      ru: "Решайте примеры быстро, копите комбо.",
      en: "Solve quickly and build a combo.",
    },
    howTo: {
      uz: "To'g'ri javobni tanlang. Ketma-ket to'g'ri javoblar kombo beradi, har 5-chi kombo +2 soniya qo'shadi.",
      ru: "Выберите верный ответ. Серия верных ответов даёт комбо, каждое 5-е комбо добавляет +2 секунды.",
      en: "Pick the right answer. Streaks build a combo and every 5th correct in a row adds +2 seconds.",
    },
    skill: { uz: "Hisoblash tezligi", ru: "Скорость счёта", en: "Calculation speed" },
    config: cfg([12, 60, 1], [30, 60, 1.5], [99, 45, 2]),
  },
  {
    slug: "stroop-test",
    icon: "🎨",
    title: { uz: "Stroop testi", ru: "Тест Струпа", en: "Stroop Test" },
    description: {
      uz: "So'z emas, uning rangini tanlang.",
      ru: "Выбирайте цвет букв, а не слово.",
      en: "Pick the ink colour, not the word.",
    },
    howTo: {
      uz: "Ekranda rang nomi boshqa rangda yoziladi. So'zni emas, harflarning RANGINI tanlang.",
      ru: "На экране название цвета написано другим цветом. Выберите ЦВЕТ букв, а не слово.",
      en: "A colour name is shown in a different colour. Choose the colour of the INK, not the word.",
    },
    skill: { uz: "Kognitiv nazorat", ru: "Когнитивный контроль", en: "Cognitive control" },
    config: cfg([4, 45, 1], [5, 45, 1.5], [6, 30, 2]),
  },
  {
    slug: "logic-seq",
    icon: "🔮",
    title: { uz: "Mantiqiy ketma-ketlik", ru: "Логическая последовательность", en: "Logic Sequence" },
    description: {
      uz: "Qonuniyatni toping va davom ettiring.",
      ru: "Найдите закономерность и продолжите ряд.",
      en: "Spot the pattern and continue it.",
    },
    howTo: {
      uz: "Raqam yoki shakllar qatoridagi qonuniyatni toping va 4 ta variantdan to'g'risini tanlang.",
      ru: "Найдите закономерность в ряду чисел или фигур и выберите верный вариант из 4.",
      en: "Find the rule in the row of numbers or shapes and choose the right one of 4 options.",
    },
    skill: { uz: "Mantiqiy fikrlash", ru: "Логическое мышление", en: "Logical reasoning" },
    config: cfg([1, 120, 1], [2, 120, 1.5], [3, 100, 2]),
  },
  {
    slug: "matching-pairs",
    icon: "🃏",
    title: { uz: "Juftlikni top", ru: "Найди пару", en: "Matching Pairs" },
    description: {
      uz: "Atama va ta'rifni, so'z va tarjimani juftlang.",
      ru: "Соединяйте термины с определениями, слова с переводами.",
      en: "Match terms with definitions and words with translations.",
    },
    howTo: {
      uz: "Mavzu to'plamini tanlang. Kartalarni oching yoki chap va o'ng ustundagi mos juftlarni ulang. Xatolar ballni kamaytiradi, tezlik oshiradi.",
      ru: "Выберите набор. Переворачивайте карточки или соединяйте пары в левой и правой колонках. Ошибки снижают очки, скорость повышает.",
      en: "Pick a set. Flip cards or connect the matching items in the left and right columns. Mistakes cost points, speed earns them.",
    },
    skill: { uz: "Xotira va bilim", ru: "Память и знания", en: "Memory & knowledge" },
    config: cfg([6, 120, 1], [8, 150, 1.5], [12, 180, 2]),
  },
  {
    slug: "true-false",
    icon: "✅",
    title: { uz: "To'g'ri yoki noto'g'ri", ru: "Верно или неверно", en: "True or False" },
    description: {
      uz: "Tasdiqni tez baholang, kombo to'plang.",
      ru: "Быстро оценивайте утверждения и копите комбо.",
      en: "Judge statements fast and build a combo.",
    },
    howTo: {
      uz: "To'plamni tanlang. Har bir tasdiq to'g'ri yoki noto'g'riligini tez belgilang. Xato javob jonni olib qo'yadi, ketma-ket to'g'ri javoblar kombo beradi.",
      ru: "Выберите набор. Быстро отмечайте, верно ли утверждение. Ошибка отнимает жизнь, серия верных ответов даёт комбо.",
      en: "Pick a set. Quickly mark each statement true or false. A wrong answer costs a life, streaks build a combo.",
    },
    skill: { uz: "Tezkor qaror qabul qilish", ru: "Быстрое принятие решений", en: "Quick judgement" },
    config: cfg([3, 60, 1], [3, 60, 1.5], [2, 60, 2]),
  },
  {
    slug: "quiz-race",
    icon: "🏁",
    title: { uz: "Viktorina poygasi", ru: "Гонка викторины", en: "Quiz Race" },
    description: {
      uz: "Savolga vaqt tugamasdan javob bering, yordamchilardan foydalaning.",
      ru: "Отвечайте до конца времени и используйте подсказки.",
      en: "Answer before the countdown ends and use your lifelines.",
    },
    howTo: {
      uz: "To'plamni tanlang. Har bir savolga cheklangan vaqt beriladi: tezroq javob ko'proq ball beradi. 3 ta yordam: 50/50, o'tkazib yuborish, +vaqt.",
      ru: "Выберите набор. На каждый вопрос ограничено время: чем быстрее ответ, тем больше очков. 3 подсказки: 50/50, пропуск, +время.",
      en: "Pick a set. Each question has a countdown: faster answers score more. Three lifelines: 50/50, skip and +time.",
    },
    skill: { uz: "Bilim va tezlik", ru: "Знания и скорость", en: "Knowledge & speed" },
    config: cfg([8, 20, 1], [10, 15, 1.5], [12, 10, 2]),
  },
];

export function isGameSlug(v: string): v is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(v);
}

export function getDefaultMeta(slug: GameSlug): GameMeta {
  return GAME_DEFAULTS.find((g) => g.slug === slug)!;
}

/** Merge an arbitrary (admin edited) config JSON into a valid GameConfig using defaults + bounds. */
export function sanitizeConfig(raw: unknown, fallback: GameConfig, minTime = 0): GameConfig {
  const out = { ...fallback } as GameConfig;
  if (!raw || typeof raw !== "object") return out;
  for (const d of DIFFICULTIES) {
    const r = (raw as Record<string, unknown>)[d];
    if (!r || typeof r !== "object") continue;
    const base = fallback[d];
    const num = (v: unknown, def: number, min: number, max: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
    const o = r as Record<string, unknown>;
    const next: DifficultyConfig = {
      grid: Math.round(num(o.grid, base.grid, 1, 200)),
      // games without another end condition (mental-math, stroop) need a real time limit (min 10s)
      time_limit: Math.max(minTime, Math.round(num(o.time_limit, base.time_limit, 0, 3600))),
      multiplier: num(o.multiplier, base.multiplier, 0.1, 10),
    };
    (out as Record<Difficulty, DifficultyConfig>)[d] = next;
  }
  return out;
}
