// Built-in demo data for the surveys module (used when Supabase is not configured).
// Server-side only: it seeds lib/admin/demo-store.ts, which is the in-memory store behind the public
// pages, the public API and the admin CMS (so a demo response shows up in the admin results immediately).
import type { LocalizedText } from "@/lib/types";
import type { Answers, SurveyQuestionRow, SurveyResponseRow, SurveyRow } from "@/lib/surveys/types";

const L = (uz: string, ru: string, en: string): LocalizedText => ({ uz, ru, en });

export const DEMO_PARENTS_ID = "svy-parents";
export const DEMO_STUDENTS_ID = "svy-students";

const day = 86400000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * day - hours * 3600000).toISOString();

const SATISFACTION_UZ = L("Umuman olganda, maktabdan qanchalik mamnunsiz?", "В целом, насколько вы довольны школой?", "Overall, how satisfied are you with the school?");

export function demoSurveys(): SurveyRow[] {
  return [
    {
      id: DEMO_PARENTS_ID,
      title: L("Ota-onalar mamnunligi so'rovnomasi", "Опрос удовлетворённости родителей", "Parent satisfaction survey"),
      description: L(
        "Fikringiz maktabni yaxshilashga yordam beradi. So'rovnoma anonim, 2 daqiqa vaqt oladi.",
        "Ваше мнение помогает нам улучшать школу. Опрос анонимный и занимает 2 минуты.",
        "Your opinion helps us improve the school. The survey is anonymous and takes 2 minutes.",
      ),
      audience: "parents",
      starts_at: null,
      ends_at: null,
      is_active: true,
      is_anonymous: true,
      allow_multiple_responses: false,
      created_at: ago(30),
    },
    {
      id: DEMO_STUDENTS_ID,
      title: L("O'quvchilar qiziqishlari so'rovi", "Опрос интересов учеников", "Students' interests poll"),
      description: L(
        "Sizga nima qiziq? To'garaklar va tadbirlarni sizning fikringiz bilan rejalashtiramiz.",
        "Что вам интересно? Мы планируем кружки и мероприятия с учётом вашего мнения.",
        "What are you into? We plan clubs and events with your input.",
      ),
      audience: "students",
      starts_at: null,
      ends_at: null,
      is_active: true,
      is_anonymous: true,
      allow_multiple_responses: false,
      created_at: ago(20),
    },
  ];
}

const opt = (id: string, uz: string, ru: string, en: string) => ({ id, text: L(uz, ru, en) });

export function demoSurveyQuestions(): SurveyQuestionRow[] {
  const q = (survey: string, i: number, p: Partial<SurveyQuestionRow> & Pick<SurveyQuestionRow, "type" | "question_text">): SurveyQuestionRow => ({
    id: `${survey}-q${i}`,
    survey_id: survey,
    options: [],
    scale_min: 1,
    scale_max: 5,
    scale_min_label: L("", "", ""),
    scale_max_label: L("", "", ""),
    required: true,
    sort_order: i,
    created_at: ago(30),
    ...p,
  });
  const P = DEMO_PARENTS_ID;
  const S = DEMO_STUDENTS_ID;
  return [
    q(P, 1, {
      type: "scale",
      question_text: SATISFACTION_UZ,
      scale_min_label: L("Umuman mamnun emasman", "Совсем не доволен", "Not satisfied at all"),
      scale_max_label: L("Juda mamnunman", "Очень доволен", "Very satisfied"),
    }),
    q(P, 2, {
      type: "single",
      question_text: L("Maktab haqida qayerdan bilib oldingiz?", "Как вы узнали о школе?", "How did you hear about the school?"),
      options: [
        opt("A", "Do'stlar yoki tanishlardan", "От друзей или знакомых", "Friends or acquaintances"),
        opt("B", "Ijtimoiy tarmoqlardan", "Из социальных сетей", "Social media"),
        opt("C", "Reklamadan", "Из рекламы", "Advertising"),
        opt("D", "Boshqa", "Другое", "Other"),
      ],
    }),
    q(P, 3, {
      type: "multiple",
      question_text: L("Quyidagilardan qaysilari siz uchun eng muhim?", "Что для вас важнее всего?", "Which of these matter most to you?"),
      options: [
        opt("A", "Sifatli ta'lim", "Качественное образование", "Quality of teaching"),
        opt("B", "Xavfsizlik", "Безопасность", "Safety"),
        opt("C", "Ovqatlanish", "Питание", "Meals"),
        opt("D", "Maktab transporti", "Школьный транспорт", "School transport"),
        opt("E", "To'garaklar", "Кружки", "Clubs"),
        opt("F", "Ingliz tili", "Английский язык", "English language"),
      ],
    }),
    q(P, 4, {
      type: "scale",
      question_text: L("O'qituvchilar bilan aloqa qanchalik qulay?", "Насколько удобно общение с учителями?", "How easy is it to communicate with teachers?"),
      scale_min_label: L("Qiyin", "Сложно", "Difficult"),
      scale_max_label: L("Juda qulay", "Очень удобно", "Very easy"),
    }),
    q(P, 5, {
      type: "yesno",
      question_text: L("Maktabni boshqa ota-onalarga tavsiya qilasizmi?", "Порекомендуете ли вы школу другим родителям?", "Would you recommend the school to other parents?"),
    }),
    q(P, 6, {
      type: "text",
      required: false,
      question_text: L("Maktabni yaxshilash bo'yicha takliflaringiz?", "Ваши предложения по улучшению школы?", "Any suggestions to improve the school?"),
    }),
    q(S, 1, {
      type: "multiple",
      question_text: L("Qaysi fanlar sizga yoqadi?", "Какие предметы вам нравятся?", "Which subjects do you like?"),
      options: [
        opt("A", "Matematika", "Математика", "Maths"),
        opt("B", "Ingliz tili", "Английский язык", "English"),
        opt("C", "Tabiiy fanlar", "Естественные науки", "Science"),
        opt("D", "Tasviriy san'at", "Рисование", "Art"),
        opt("E", "Jismoniy tarbiya", "Физкультура", "Sport"),
        opt("F", "Informatika", "Информатика", "Computer science"),
      ],
    }),
    q(S, 2, {
      type: "single",
      question_text: L("Qaysi to'garakka qatnashgan bo'lardingiz?", "В какой кружок вы бы пошли?", "Which club would you join?"),
      options: [
        opt("A", "Robototexnika", "Робототехника", "Robotics"),
        opt("B", "Rassomlik", "Рисование", "Art"),
        opt("C", "Sport", "Спорт", "Sport"),
        opt("D", "Musiqa", "Музыка", "Music"),
        opt("E", "Shaxmat", "Шахматы", "Chess"),
      ],
    }),
    q(S, 3, {
      type: "scale",
      question_text: L("Maktabda o'zingizni qanday his qilasiz?", "Как вы себя чувствуете в школе?", "How do you feel at school?"),
      scale_min_label: L("Yoqmaydi", "Не нравится", "I don't like it"),
      scale_max_label: L("Juda yoqadi", "Очень нравится", "I love it"),
    }),
    q(S, 4, {
      type: "yesno",
      question_text: L("Ko'proq ekskursiyalar bo'lishini xohlaysizmi?", "Хотите больше экскурсий?", "Do you want more field trips?"),
    }),
    q(S, 5, {
      type: "text",
      required: false,
      question_text: L("Qanday yangi to'garak yoki tadbir qo'shgan bo'lardingiz?", "Какой новый кружок или мероприятие вы бы добавили?", "What new club or event would you add?"),
    }),
  ];
}

/** Deterministic pseudo-random sample so the demo results page always looks populated. */
export function demoSurveyResponses(questions: SurveyQuestionRow[]): SurveyResponseRow[] {
  let s = 7771;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const texts: Record<string, string[]> = {
    [DEMO_PARENTS_ID]: [
      "Ko'proq sport to'garaklari bo'lsa yaxshi bo'lardi.",
      "Ota-onalar uchun oylik uchrashuvlar kerak.",
      "Хотелось бы больше информации о успеваемости в чате.",
      "Спасибо учителям за внимание к детям!",
      "More English conversation classes, please.",
      "Menyuda sabzavotlar ko'proq bo'lsin.",
    ],
    [DEMO_STUDENTS_ID]: [
      "Dasturlash to'garagi!",
      "Футбольная секция",
      "A school radio club",
      "Kino klubi",
      "Театральный кружок",
      "Science fair every month",
    ],
  };
  const skew = (min: number, max: number) => {
    // biased towards the high end
    const r = Math.pow(rand(), 0.6);
    return Math.min(max, Math.max(min, Math.round(min + r * (max - min))));
  };
  const out: SurveyResponseRow[] = [];
  const plan: [string, number, "parent" | "student"][] = [
    [DEMO_PARENTS_ID, 32, "parent"],
    [DEMO_STUDENTS_ID, 41, "student"],
  ];
  for (const [sid, n, role] of plan) {
    const qs = questions.filter((q) => q.survey_id === sid);
    for (let i = 0; i < n; i++) {
      const answers: Answers = {};
      for (const q of qs) {
        if (!q.required && rand() < 0.45) continue;
        if (q.type === "single") answers[q.id] = q.options[Math.floor(rand() * q.options.length)].id;
        else if (q.type === "multiple") {
          const picked = q.options.filter(() => rand() < 0.45).map((o) => o.id);
          answers[q.id] = picked.length ? picked : [q.options[0].id];
        } else if (q.type === "scale") answers[q.id] = skew(q.scale_min, q.scale_max);
        else if (q.type === "yesno") answers[q.id] = rand() < 0.78 ? "yes" : "no";
        else if (q.type === "text") answers[q.id] = texts[sid][Math.floor(rand() * texts[sid].length)];
      }
      out.push({
        id: `${sid}-r${i + 1}`,
        survey_id: sid,
        respondent_token_hash: `demo-seed-${sid}-${i}`,
        role_hint: role,
        grade: role === "student" ? 3 + Math.floor(rand() * 8) : null,
        answers,
        created_at: ago(Math.floor(rand() * 18), Math.floor(rand() * 20)),
      });
    }
  }
  return out;
}
