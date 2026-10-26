/**
 * DEMO-mode seed quizzes (server side only - contains the answer key, never import from client components).
 */
import type { LocalizedText } from "@/lib/types";
import type { QuizQuestion, QuizSummary } from "./types";

const L = (uz: string, ru: string, en: string): LocalizedText => ({ uz, ru, en });
const N = (s: string): LocalizedText => L(s, s, s);

export interface DemoQuestion extends QuizQuestion {
  correctOptionId: string;
  explanation: LocalizedText | null;
}

function q(id: string, text: LocalizedText, opts: LocalizedText[], correct: number, explanation: LocalizedText): DemoQuestion {
  return {
    id,
    text,
    imageUrl: null,
    points: 1,
    options: opts.map((o, i) => ({ id: String.fromCharCode(65 + i), text: o })),
    correctOptionId: String.fromCharCode(65 + correct),
    explanation,
  };
}

export const DEMO_QUIZZES: QuizSummary[] = [
  {
    id: "demo-math-3",
    title: L("Matematika: qo'shish va ayirish", "Математика: сложение и вычитание", "Maths: addition and subtraction"),
    description: L("Boshlang'ich sinflar uchun tezkor test", "Быстрый тест для начальной школы", "A quick test for primary grades"),
    subjectKey: "math",
    subjectName: L("Matematika", "Математика", "Mathematics"),
    grade: 3,
    difficulty: "easy",
    durationMinutes: 5,
    passingScorePercent: 60,
    questionCount: 5,
  },
  {
    id: "demo-english-6",
    title: L("Ingliz tili: grammatika", "Английский: грамматика", "English: grammar basics"),
    description: L("Present Simple va artikllar", "Present Simple и артикли", "Present Simple and articles"),
    subjectKey: "english",
    subjectName: L("Ingliz tili", "Английский язык", "English"),
    grade: 6,
    difficulty: "medium",
    durationMinutes: 6,
    passingScorePercent: 70,
    questionCount: 5,
  },
  {
    id: "demo-physics-9",
    title: L("Fizika: kinematika", "Физика: кинематика", "Physics: kinematics"),
    description: L("Tezlik, masofa va tezlanish", "Скорость, путь и ускорение", "Speed, distance and acceleration"),
    subjectKey: "physics",
    subjectName: L("Fizika", "Физика", "Physics"),
    grade: 9,
    difficulty: "hard",
    durationMinutes: 8,
    passingScorePercent: 70,
    questionCount: 5,
  },
];

export const DEMO_QUESTIONS: Record<string, DemoQuestion[]> = {
  "demo-math-3": [
    q("m1", L("7 + 8 = ?", "7 + 8 = ?", "7 + 8 = ?"), [N("14"), N("15"), N("16"), N("13")], 1, L("7 + 8 = 15.", "7 + 8 = 15.", "7 + 8 = 15.")),
    q("m2", L("20 - 9 = ?", "20 - 9 = ?", "20 - 9 = ?"), [N("10"), N("12"), N("11"), N("13")], 2, L("20 - 10 = 10, keyin 1 qo'shamiz: 11.", "20 - 10 = 10, прибавим 1: 11.", "20 - 10 = 10, then add 1: 11.")),
    q("m3", L("6 x 4 = ?", "6 x 4 = ?", "6 x 4 = ?"), [N("24"), N("20"), N("26"), N("28")], 0, L("6 ni 4 marta qo'shing: 24.", "Повторите 6 четыре раза: 24.", "Add 6 four times: 24.")),
    q("m4", L("Uchburchakning nechta tomoni bor?", "Сколько сторон у треугольника?", "How many sides does a triangle have?"), [N("2"), N("3"), N("4"), N("5")], 1, L("Uchburchak 3 tomonli.", "У треугольника 3 стороны.", "A triangle has 3 sides.")),
    q("m5", L("Qaysi son eng katta?", "Какое число самое большое?", "Which number is the largest?"), [N("98"), N("89"), N("101"), N("99")], 2, L("101 uch xonali son, qolganlari ikki xonali.", "101 трёхзначное, остальные двузначные.", "101 has three digits, the others have two.")),
  ],
  "demo-english-6": [
    q("e1", L("To'g'ri variantni tanlang: She ___ to school every day.", "Выберите верный вариант: She ___ to school every day.", "Choose the correct form: She ___ to school every day."), [N("go"), N("goes"), N("going"), N("gone")], 1, L("3-shaxs birlikda fe'lga -es qo'shiladi.", "В 3 лице ед. числа к глаголу добавляется -es.", "Third person singular takes -es.")),
    q("e2", L("Artikl: I saw ___ elephant.", "Артикль: I saw ___ elephant.", "Article: I saw ___ elephant."), [N("a"), N("an"), N("the a"), N("-")], 1, L("Unli tovushdan oldin 'an'.", "Перед гласным звуком 'an'.", "Use 'an' before a vowel sound.")),
    q("e3", L("'Big' so'zining antonimi?", "Антоним слова 'big'?", "Opposite of 'big'?"), [N("large"), N("huge"), N("small"), N("tall")], 2, L("Big - small.", "Big - small.", "Big - small.")),
    q("e4", L("They ___ football on Sundays.", "They ___ football on Sundays.", "They ___ football on Sundays."), [N("plays"), N("play"), N("playing"), N("is play")], 1, L("'They' bilan fe'l o'zgarmaydi.", "С 'they' глагол без окончания.", "With 'they' the verb has no -s.")),
    q("e5", L("Savol: ___ you like pizza?", "Вопрос: ___ you like pizza?", "Question: ___ you like pizza?"), [N("Does"), N("Is"), N("Do"), N("Are")], 2, L("'You' bilan 'Do' ishlatiladi.", "С 'you' используется 'Do'.", "Use 'Do' with 'you'.")),
  ],
  "demo-physics-9": [
    q("p1", L("Tezlik formulasi qaysi?", "Какова формула скорости?", "Which is the speed formula?"), [N("v = s / t"), N("v = s * t"), N("v = t / s"), N("v = s + t")], 0, L("Tezlik = masofa / vaqt.", "Скорость = путь / время.", "Speed = distance / time.")),
    q("p2", L("Avtomobil 2 soatda 120 km yurdi. O'rtacha tezligi?", "Автомобиль проехал 120 км за 2 часа. Средняя скорость?", "A car travels 120 km in 2 h. Average speed?"), [N("40 km/h"), N("60 km/h"), N("240 km/h"), N("100 km/h")], 1, L("120 / 2 = 60 km/soat.", "120 / 2 = 60 км/ч.", "120 / 2 = 60 km/h.")),
    q("p3", L("Tezlanish birligi?", "Единица ускорения?", "Unit of acceleration?"), [N("m/s"), N("m/s^2"), N("N"), N("J")], 1, L("Tezlanish m/s^2 da o'lchanadi.", "Ускорение измеряется в м/с^2.", "Acceleration is measured in m/s^2.")),
    q("p4", L("Tinch holatdan 5 m/s^2 bilan 4 s harakatlansa, tezligi?", "Из покоя с ускорением 5 м/с^2 за 4 с. Скорость?", "From rest at 5 m/s^2 for 4 s. Speed?"), [N("9 m/s"), N("20 m/s"), N("1.25 m/s"), N("40 m/s")], 1, L("v = a * t = 5 * 4 = 20 m/s.", "v = a * t = 5 * 4 = 20 м/с.", "v = a * t = 5 * 4 = 20 m/s.")),
    q("p5", L("Erkin tushish tezlanishi taxminan?", "Ускорение свободного падения примерно?", "Free-fall acceleration is about?"), [N("1 m/s^2"), N("5 m/s^2"), N("9.8 m/s^2"), N("98 m/s^2")], 2, L("g ~ 9.8 m/s^2.", "g ~ 9,8 м/с^2.", "g ~ 9.8 m/s^2.")),
  ],
};

// ---------------------------------------------------------------------------------------------------------------------
// School test bank for grades 2-6 (4 variants each), generated from content/quizzes/*.json by
// scripts/content/build-quizzes.mjs. In production the same quizzes come from the database
// (supabase/content/quizzes-grades-2-6.sql); this block makes them visible in DEMO mode as well.
// ---------------------------------------------------------------------------------------------------------------------
import schoolBank from "@/content/quizzes/bundle.json";

interface BankQuestion {
  id: string;
  question_text: LocalizedText;
  options: { id: string; text: LocalizedText }[];
  correct_option_id: string;
  explanation: LocalizedText | null;
  points: number;
}
interface BankQuiz {
  id: string;
  grade: number;
  variant: number;
  title: LocalizedText;
  description: LocalizedText | null;
  subject_key: string;
  subject_name: LocalizedText;
  difficulty: QuizSummary["difficulty"];
  duration_minutes: number;
  passing_score_percent: number;
  questions: BankQuestion[];
}

for (const b of schoolBank as unknown as BankQuiz[]) {
  DEMO_QUIZZES.push({
    id: b.id,
    title: b.title,
    description: b.description,
    subjectKey: b.subject_key,
    subjectName: b.subject_name,
    grade: b.grade,
    difficulty: b.difficulty,
    durationMinutes: b.duration_minutes,
    passingScorePercent: b.passing_score_percent,
    questionCount: b.questions.length,
  });
  DEMO_QUESTIONS[b.id] = b.questions.map((x) => ({
    id: x.id,
    text: x.question_text,
    imageUrl: null,
    points: x.points,
    options: x.options,
    correctOptionId: x.correct_option_id,
    explanation: x.explanation,
  }));
}