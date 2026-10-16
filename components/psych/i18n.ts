"use client";
import { useLocale } from "next-intl";
import type { Locale } from "@/lib/types";

const dict = {
  uz: {
    title: "Psixologik testlar",
    subtitle: "Bolalar, o'smirlar va ota-onalar uchun do'stona testlar. To'g'ri yoki noto'g'ri javob yo'q.",
    all: "Hammasi",
    audience: { kids: "6-10 yosh", teens: "11-15 yosh", older: "16-18 yosh", parents: "Ota-onalar" },
    topic: {
      interests: "Qiziqishlar",
      temperament: "Temperament",
      career: "Kasb tanlash",
      readiness: "Maktabga tayyorlik",
      emotional: "Hissiy holat",
    },
    questionsCount: "savol",
    begin: "Testni boshlash",
    start: "Boshlaymiz!",
    nameOpt: "Ismingiz (ixtiyoriy)",
    ageOpt: "Yoshingiz (ixtiyoriy)",
    optionalHint: "Ism natija varag'ida ko'rsatiladi. Hech narsa majburiy emas.",
    question: "Savol",
    of: "/",
    back: "Orqaga",
    submitting: "Natija hisoblanmoqda...",
    errorTitle: "Xatolik yuz berdi",
    retry: "Qayta urinish",
    notFound: "Test topilmadi",
    allTests: "Barcha testlar",
    empty: "Bu toifada testlar yo'q.",
    result: "Natija",
    analysis: "Tahlil",
    recommendations: "Ota-onalar uchun tavsiyalar",
    print: "Chop etish / PDF",
    again: "Testni qayta topshirish",
    date: "Sana",
    forWho: "Ishtirokchi",
    disclaimer:
      "Muhim: bu test klinik tashxis emas va mutaxassis xulosasini almashtirmaydi. Natija faqat umumiy yo'nalish beradi. Savollaringiz bo'lsa, maktab psixologiga murojaat qiling.",
    score: "Ball",
  },
  ru: {
    title: "Психологические тесты",
    subtitle: "Дружелюбные тесты для детей, подростков и родителей. Правильных и неправильных ответов нет.",
    all: "Все",
    audience: { kids: "6-10 лет", teens: "11-15 лет", older: "16-18 лет", parents: "Родители" },
    topic: {
      interests: "Интересы",
      temperament: "Темперамент",
      career: "Профориентация",
      readiness: "Готовность к школе",
      emotional: "Эмоциональное состояние",
    },
    questionsCount: "вопросов",
    begin: "Начать тест",
    start: "Поехали!",
    nameOpt: "Ваше имя (по желанию)",
    ageOpt: "Ваш возраст (по желанию)",
    optionalHint: "Имя будет указано в листе результатов. Ничего не обязательно.",
    question: "Вопрос",
    of: "из",
    back: "Назад",
    submitting: "Считаем результат...",
    errorTitle: "Произошла ошибка",
    retry: "Повторить",
    notFound: "Тест не найден",
    allTests: "Все тесты",
    empty: "В этой категории пока нет тестов.",
    result: "Результат",
    analysis: "Анализ",
    recommendations: "Рекомендации для родителей",
    print: "Печать / PDF",
    again: "Пройти заново",
    date: "Дата",
    forWho: "Участник",
    disclaimer:
      "Важно: этот тест не является клиническим диагнозом и не заменяет заключение специалиста. Результат даёт лишь общий ориентир. При вопросах обратитесь к школьному психологу.",
    score: "Баллы",
  },
  en: {
    title: "Psychology Tests",
    subtitle: "Friendly tests for kids, teens and parents. There are no right or wrong answers.",
    all: "All",
    audience: { kids: "Ages 6-10", teens: "Ages 11-15", older: "Ages 16-18", parents: "Parents" },
    topic: {
      interests: "Interests",
      temperament: "Temperament",
      career: "Career guidance",
      readiness: "School readiness",
      emotional: "Emotional state",
    },
    questionsCount: "questions",
    begin: "Start test",
    start: "Let's go!",
    nameOpt: "Your name (optional)",
    ageOpt: "Your age (optional)",
    optionalHint: "The name appears on your result sheet. Nothing is required.",
    question: "Question",
    of: "of",
    back: "Back",
    submitting: "Calculating your result...",
    errorTitle: "Something went wrong",
    retry: "Try again",
    notFound: "Test not found",
    allTests: "All tests",
    empty: "No tests in this category yet.",
    result: "Result",
    analysis: "Analysis",
    recommendations: "Recommendations for parents",
    print: "Print / PDF",
    again: "Retake the test",
    date: "Date",
    forWho: "Participant",
    disclaimer:
      "Important: this test is not a clinical diagnosis and does not replace a specialist's opinion. The result only gives a general direction. If you have concerns, please contact the school psychologist.",
    score: "Score",
  },
} as const;

export type PsychDict = (typeof dict)["en"];

export function getPsychDict(locale: Locale): PsychDict {
  return (dict[locale] ?? dict.uz) as unknown as PsychDict;
}

export function usePsychT(): { t: PsychDict; locale: Locale } {
  const locale = useLocale() as Locale;
  return { t: getPsychDict(locale), locale };
}
