// In-memory store used by the admin API when Supabase is not configured (DEMO MODE).
// Data lives in the Node process (globalThis) and resets on server restart.
import { demoSurveyQuestions, demoSurveyResponses, demoSurveys } from "@/components/surveys/demo";
import { seedContentSets } from "@/components/games/content-demo";
import type { ListResult, ResourceDef, Row } from "./types";

type L3 = { uz: string; ru: string; en: string };
const L = (uz: string, ru: string, en: string): L3 => ({ uz, ru, en });

// deterministic RNG so demo data looks the same on every boot
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = rng(20261014);
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];
const day = 86400000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * day - hours * 3600000).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * day).toISOString();

type Tables = Record<string, Row[]>;
interface Extra {
  site_visits: { created_at: string; path: string; locale: string }[];
  quiz_attempts: { created_at: string; quiz_id: string; score_percent: number }[];
}
interface DemoState {
  tables: Tables;
  extra: Extra;
  seq: number;
}

function seed(): DemoState {
  const t: Tables = {};

  t.site_settings = [
    {
      id: 1,
      school_name: L("Children's Academy Group Termez xususiy maktabi", "Частная школа Children's Academy Group Termez", "Children's Academy Group Termez Private School"),
      hero_title: L("Kelajak bugun boshlanadi", "Будущее начинается сегодня", "The future starts today"),
      hero_subtitle: L(
        "Zamonaviy ta'lim, g'amxo'r jamoa va har bir o'quvchiga individual yondashuv.",
        "Современное образование, заботливая команда и индивидуальный подход к каждому ученику.",
        "Modern education, a caring team and an individual approach to every student.",
      ),
      hero_video_url: "",
      hero_image_url: null,
      about_mission: L(
        "Har bir bolaning iste'dodini ochish va uni mas'uliyatli shaxs sifatida tarbiyalash.",
        "Раскрыть талант каждого ребёнка и воспитать ответственную личность.",
        "To unlock every child's talent and raise a responsible individual.",
      ),
      about_vision: L(
        "O'zbekistondagi eng ishonchli xususiy maktab bo'lish.",
        "Стать самой надёжной частной школой Узбекистана.",
        "To become the most trusted private school in Uzbekistan.",
      ),
      about_history: L(
        "Maktab 2015-yilda bir guruh ta'lim ishqibozlari tomonidan tashkil etilgan.",
        "Школа основана в 2015 году группой энтузиастов образования.",
        "The school was founded in 2015 by a group of education enthusiasts.",
      ),
      stats: [
        { key: "students", value: 480, suffix: "+", label: L("O'quvchilar", "Учеников", "Students") },
        { key: "teachers", value: 42, suffix: "", label: L("O'qituvchilar", "Учителей", "Teachers") },
        { key: "awards", value: 120, suffix: "+", label: L("Olimpiada medallari", "Медалей олимпиад", "Olympiad medals") },
        { key: "years", value: 11, suffix: "", label: L("Yillik tajriba", "Лет опыта", "Years of experience") },
      ],
      address: L("Toshkent sh., Mirzo Ulug'bek tumani, Bog'ishamol ko'chasi 12", "г. Ташкент, Мирзо-Улугбекский р-н, ул. Богишамол 12", "12 Bogishamol St., Mirzo Ulugbek district, Tashkent"),
      landmark: L("«Ming o'rik» metro bekati yaqinida", "Рядом с метро «Минг Урик»", "Near Ming Urik metro station"),
      phones: ["+998 71 200 00 00", "+998 90 123 45 67"],
      email: "info@example.com",
      working_hours: L("Du–Sha 08:00–18:00", "Пн–Сб 08:00–18:00", "Mon–Sat 08:00–18:00"),
      map_lat: 41.3395,
      map_lng: 69.3341,
      map_embed_url: "",
      social_links: { telegram: "", instagram: "", youtube: "", facebook: "" },
      virtual_tour_url: "",
      updated_at: ago(2),
    },
  ];

  t.programs = [
    {
      id: "prog-1", category: "primary", grade_range: "1-4", sort_order: 1, is_active: true, icon_name: "Baby", cover_image_url: null,
      title: L("Boshlang'ich sinflar", "Начальная школа", "Primary school"),
      short_description: L("O'yin orqali o'rganish va mustahkam poydevor.", "Обучение через игру и прочный фундамент.", "Learning through play and a strong foundation."),
      full_content: L("Kichik sinflarda o'quvchilar o'qish, yozish, matematika va ingliz tilini zamonaviy metodikalar asosida o'rganadi.", "В младших классах дети изучают чтение, письмо, математику и английский по современным методикам.", "In primary grades students learn reading, writing, maths and English through modern methods."),
      subjects: [
        { key: "math", name: L("Matematika", "Математика", "Mathematics") },
        { key: "english", name: L("Ingliz tili", "Английский язык", "English") },
        { key: "reading", name: L("O'qish", "Чтение", "Reading") },
      ],
      created_at: ago(120),
    },
    {
      id: "prog-2", category: "middle", grade_range: "5-9", sort_order: 2, is_active: true, icon_name: "BookOpen", cover_image_url: null,
      title: L("O'rta sinflar", "Средняя школа", "Middle school"),
      short_description: L("Fanlarni chuqur o'rganish va tadqiqot ko'nikmalari.", "Углублённое изучение предметов и исследовательские навыки.", "In-depth subjects and research skills."),
      full_content: L("5-9 sinflarda STEM, til va gumanitar fanlar muvozanatli o'qitiladi.", "В 5–9 классах сбалансированно преподаются STEM, языки и гуманитарные предметы.", "Grades 5–9 balance STEM, languages and humanities."),
      subjects: [
        { key: "algebra", name: L("Algebra", "Алгебра", "Algebra") },
        { key: "physics", name: L("Fizika", "Физика", "Physics") },
        { key: "informatics", name: L("Informatika", "Информатика", "Computer science") },
      ],
      created_at: ago(119),
    },
    {
      id: "prog-3", category: "high", grade_range: "10-11", sort_order: 3, is_active: true, icon_name: "Rocket", cover_image_url: null,
      title: L("Yuqori sinflar", "Старшая школа", "High school"),
      short_description: L("Oliy o'quv yurtlariga tayyorgarlik va xalqaro imtihonlar.", "Подготовка к вузам и международным экзаменам.", "University preparation and international exams."),
      full_content: L("Profil yo'nalishlari, IELTS/SAT tayyorlov va karyera maslahati.", "Профильные направления, подготовка к IELTS/SAT и карьерное консультирование.", "Profile tracks, IELTS/SAT prep and career counselling."),
      subjects: [
        { key: "biology", name: L("Biologiya", "Биология", "Biology") },
        { key: "chemistry", name: L("Kimyo", "Химия", "Chemistry") },
      ],
      created_at: ago(118),
    },
  ];

  const campus = (key: string, i: number, uz: [string, string], ru: [string, string], en: [string, string]) => ({
    id: `campus-${i}`, section_key: key, title: L(uz[0], ru[0], en[0]), description: L(uz[1], ru[1], en[1]),
    gallery_urls: [], extra_data: {}, sort_order: i, is_active: true, created_at: ago(100),
  });
  t.campus_life = [
    campus("kitchen", 1, ["Oshxona", "Kuniga uch mahal sifatli va sog'lom ovqat."], ["Столовая", "Трёхразовое качественное и здоровое питание."], ["Kitchen", "Three healthy, quality meals a day."]),
    campus("security", 2, ["Xavfsizlik", "24/7 qo'riqlash va videokuzatuv."], ["Безопасность", "Охрана 24/7 и видеонаблюдение."], ["Security", "24/7 guarding and CCTV."]),
    campus("transport", 3, ["Transport", "Shahar bo'ylab maktab avtobuslari."], ["Транспорт", "Школьные автобусы по всему городу."], ["Transport", "School buses across the city."]),
    campus("schedule", 4, ["Kun tartibi", "08:30 dars boshlanishi, 15:30 to'garaklar."], ["Распорядок дня", "Начало уроков в 08:30, кружки в 15:30."], ["Daily schedule", "Classes start at 08:30, clubs at 15:30."]),
  ];

  const staffRows: [string, string, string, boolean, number][] = [
    ["Aziza Karimova", "Direktor", "Director", true, 18],
    ["Rustam Yusupov", "O'quv ishlari bo'yicha direktor o'rinbosari", "Deputy Director for Academics", true, 15],
    ["Dilnoza Rahimova", "Matematika o'qituvchisi", "Mathematics teacher", false, 9],
    ["Jasur Tursunov", "Ingliz tili o'qituvchisi", "English teacher", false, 7],
    ["Malika Abdullayeva", "Maktab psixologi", "School psychologist", false, 11],
    ["Sardor Ismoilov", "Informatika o'qituvchisi", "Computer science teacher", false, 6],
  ];
  const posRu: Record<string, string> = {
    Director: "Директор", "Deputy Director for Academics": "Заместитель директора по учебной работе",
    "Mathematics teacher": "Учитель математики", "English teacher": "Учитель английского языка",
    "School psychologist": "Школьный психолог", "Computer science teacher": "Учитель информатики",
  };
  t.staff_members = staffRows.map(([name, posUz, posEn, adm, exp], i) => ({
    id: `staff-${i + 1}`, is_administration: adm, full_name: L(name, name, name),
    position: L(posUz, posRu[posEn], posEn), subject_key: adm ? "" : posEn.split(" ")[0].toLowerCase(),
    bio: L("Yuqori malakali mutaxassis.", "Высококвалифицированный специалист.", "A highly qualified professional."),
    experience_years: exp, certificates: [], photo_url: null, intro_video_url: "", sort_order: i + 1, is_active: true, created_at: ago(90),
  }));

  t.student_achievements = [
    ["Bobur Aliyev", "10-sinf", "Respublika matematika olimpiadasi — 1-o'rin", "Республиканская олимпиада по математике — 1 место", "Republican Mathematics Olympiad — 1st place", "olympiad", null],
    ["Nilufar Saidova", "11-sinf", "IELTS 8.0", "IELTS 8.0", "IELTS 8.0", "olympiad", "Westminster International University"],
    ["Timur Xasanov", "8-sinf", "Shaxmat bo'yicha respublika chempioni", "Чемпион республики по шахматам", "National chess champion", "sport", null],
    ["Madina Ergasheva", "2024", "Oltin medal bilan bitirdi", "Окончила школу с золотой медалью", "Graduated with a gold medal", "graduate", "Tashkent State University of Economics"],
  ].map(([n, g, uz, ru, en, cat, uni], i) => ({
    id: `ach-${i + 1}`, student_name: L(n as string, n as string, n as string), grade_or_grad_year: g, achievement_title: L(uz as string, ru as string, en as string),
    description: L("", "", ""), university_accepted: uni ? L(uni as string, uni as string, uni as string) : null, photo_url: null, certificate_url: null,
    category: cat, sort_order: i + 1, is_active: true, created_at: ago(60 - i),
  }));

  const subjects = [
    { key: "math", name: L("Matematika", "Математика", "Mathematics") },
    { key: "english", name: L("Ingliz tili", "Английский язык", "English") },
    { key: "physics", name: L("Fizika", "Физика", "Physics") },
  ];
  t.olympiads = [
    {
      id: "oly-1", title: L("Children's Academy ochiq olimpiadasi 2026", "Открытая олимпиада Children's Academy 2026", "Children's Academy Open Olympiad 2026"),
      description: L("Barcha maktab o'quvchilari uchun ochiq intellektual musobaqa.", "Открытое интеллектуальное соревнование для школьников.", "An open intellectual contest for all school students."),
      rules: L("Ro'yxatdan o'ting, chiptani chop eting va imtihon kuni o'zingiz bilan olib keling.", "Зарегистрируйтесь, распечатайте билет и возьмите с собой в день экзамена.", "Register, print your ticket and bring it on exam day."),
      subjects, eligible_grades: [5, 6, 7, 8, 9], event_date: ahead(14), registration_deadline: ahead(10),
      location: L("Children's Academy, katta zal", "Children's Academy, актовый зал", "Children's Academy, main hall"), cover_image_url: null,
      is_registration_open: true, is_results_published: false, created_at: ago(20),
    },
    {
      id: "oly-2", title: L("Bahorgi olimpiada 2026", "Весенняя олимпиада 2026", "Spring Olympiad 2026"),
      description: L("O'tgan bahor olimpiadasi.", "Прошедшая весенняя олимпиада.", "Last spring's olympiad."),
      rules: null, subjects: subjects.slice(0, 2), eligible_grades: [7, 8, 9, 10, 11], event_date: ago(150), registration_deadline: ago(160),
      location: L("Children's Academy", "Children's Academy", "Children's Academy"), cover_image_url: null, is_registration_open: false, is_results_published: true, created_at: ago(200),
    },
  ];

  const first = ["Aziz", "Sevara", "Otabek", "Zarina", "Kamol", "Dildora", "Shahzod", "Madina", "Behzod", "Laylo", "Islom", "Gulnora", "Sanjar", "Munisa"];
  const last = ["Karimov", "Yusupova", "Rahimov", "Tursunova", "Aliyev", "Saidova", "Abdullayev", "Ergasheva", "Nazarov", "Xasanova"];
  const statuses = ["pending", "confirmed", "confirmed", "attended", "pending", "disqualified"];
  t.olympiad_registrations = [];
  for (let i = 0; i < 40; i++) {
    const oid = i < 28 ? "oly-1" : "oly-2";
    const done = oid === "oly-2";
    const status = done ? (rand() > 0.1 ? "attended" : "disqualified") : pick(statuses);
    const scored = done && status === "attended";
    t.olympiad_registrations.push({
      id: `reg-${i + 1}`, olympiad_id: oid,
      ticket_number: `OLY-2026-${String(100001 + i * 7)}`,
      student_full_name: `${pick(first)} ${pick(last)}`,
      birth_date: `${2009 + Math.floor(rand() * 4)}-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}`,
      current_school: `${1 + Math.floor(rand() * 200)}-maktab`, grade: oid === "oly-1" ? 5 + Math.floor(rand() * 5) : 7 + Math.floor(rand() * 5),
      subject_key: pick(subjects).key, parent_phone: `+998 9${Math.floor(rand() * 10)} ${100 + Math.floor(rand() * 899)} ${10 + Math.floor(rand() * 89)} ${10 + Math.floor(rand() * 89)}`,
      extra_phone: "", qr_code_payload: null, status, score: scored ? Math.round(40 + rand() * 60) : null, max_score: 100,
      rank_place: null, certificate_pdf_url: null, created_at: ago(done ? 170 - i : 14 - Math.floor(i / 2), i),
    });
  }
  t.olympiad_registrations
    .filter((r) => r.olympiad_id === "oly-2" && r.score != null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .forEach((r, i) => (r.rank_place = i + 1));

  const q = (quiz: string, i: number, qu: [string, string, string], opts: string[], correct: string): Row => ({
    id: `${quiz}-q${i}`, quiz_id: quiz, question_text: L(...qu), question_image_url: null,
    options: opts.map((o, k) => ({ id: "ABCD"[k], text: L(o, o, o) })), correct_option_id: correct,
    explanation: L("To'g'ri javob izohi.", "Пояснение к правильному ответу.", "Explanation of the correct answer."), points: 1, sort_order: i, created_at: ago(30),
  });
  t.academic_quizzes = [
    {
      id: "quiz-1", title: L("Matematika: kasrlar", "Математика: дроби", "Maths: fractions"), description: L("5-sinf uchun kasrlar bo'yicha test.", "Тест по дробям для 5 класса.", "A fractions quiz for grade 5."),
      subject_key: "math", subject_name: L("Matematika", "Математика", "Mathematics"), grade: 5, difficulty: "medium", duration_minutes: 15, passing_score_percent: 60, is_active: true, created_at: ago(40),
    },
    {
      id: "quiz-2", title: L("Ingliz tili: Present Simple", "Английский: Present Simple", "English: Present Simple"), description: null,
      subject_key: "english", subject_name: L("Ingliz tili", "Английский язык", "English"), grade: 7, difficulty: "easy", duration_minutes: 10, passing_score_percent: 70, is_active: true, created_at: ago(35),
    },
  ];
  t.academic_questions = [
    q("quiz-1", 1, ["1/2 + 1/4 nechaga teng?", "Чему равно 1/2 + 1/4?", "What is 1/2 + 1/4?"], ["3/4", "2/6", "1/6", "1/8"], "A"),
    q("quiz-1", 2, ["2/3 ning 9 dan qismi?", "Сколько составляет 2/3 от 9?", "What is 2/3 of 9?"], ["3", "6", "9", "12"], "B"),
    q("quiz-1", 3, ["Qaysi kasr eng katta?", "Какая дробь наибольшая?", "Which fraction is largest?"], ["1/3", "1/2", "3/4", "2/5"], "C"),
    q("quiz-1", 4, ["5/10 kasrni qisqartiring", "Сократите дробь 5/10", "Simplify 5/10"], ["1/5", "1/2", "2/5", "5/2"], "B"),
    q("quiz-1", 5, ["1 - 1/4 = ?", "1 - 1/4 = ?", "1 - 1/4 = ?"], ["1/4", "2/4", "3/4", "4/4"], "C"),
    q("quiz-2", 1, ["She ___ to school every day.", "She ___ to school every day.", "She ___ to school every day."], ["go", "goes", "going", "gone"], "B"),
    q("quiz-2", 2, ["They ___ football on Sundays.", "They ___ football on Sundays.", "They ___ football on Sundays."], ["plays", "playing", "play", "played"], "C"),
    q("quiz-2", 3, ["He ___ not like coffee.", "He ___ not like coffee.", "He ___ not like coffee."], ["do", "does", "is", "are"], "B"),
    q("quiz-2", 4, ["___ you speak English?", "___ you speak English?", "___ you speak English?"], ["Do", "Does", "Are", "Is"], "A"),
    q("quiz-2", 5, ["My mother ___ in a bank.", "My mother ___ in a bank.", "My mother ___ in a bank."], ["work", "works", "working", "worked"], "B"),
  ];

  const po = (id: string, a: string, score: number) => ({ id, text: L(a, a, a), score });
  t.psych_tests = [
    {
      id: "psy-1", title: L("Maktab xavotirligi darajasi", "Уровень школьной тревожности", "School anxiety level"),
      description: L("O'quvchining maktabga munosabatini aniqlaydi.", "Определяет отношение ученика к школе.", "Measures the student's attitude to school."),
      instruction: L("Har bir savolga o'ylamasdan, birinchi fikringiz bo'yicha javob bering.", "Отвечайте на каждый вопрос не раздумывая.", "Answer each question with your first instinct."),
      topic: "emotional", target_audience: "teens", cover_image_url: null, is_active: true, created_at: ago(50),
    },
    {
      id: "psy-2", title: L("O'zlashtirish uslubi", "Стиль обучения", "Learning style"),
      description: L("Vizual, auditiv yoki kinestetik?", "Визуал, аудиал или кинестет?", "Visual, auditory or kinesthetic?"),
      instruction: L("Eng mos variantni tanlang.", "Выберите наиболее подходящий вариант.", "Choose the best matching option."),
      topic: "interests", target_audience: "kids", cover_image_url: null, is_active: true, created_at: ago(45),
    },
  ];
  const pq = (test: string, i: number, uz: string, ru: string, en: string, max: number): Row => ({
    id: `${test}-q${i}`, psych_test_id: test, question_text: L(uz, ru, en), question_image_url: null,
    options: [po("A", "Hech qachon", 0), po("B", "Ba'zan", Math.ceil(max / 2)), po("C", "Tez-tez", max)], sort_order: i, created_at: ago(40),
  });
  t.psych_questions = [
    pq("psy-1", 1, "Test oldidan uxlay olmaysizmi?", "Не можете уснуть перед контрольной?", "Can't sleep before a test?", 2),
    pq("psy-1", 2, "Doskaga chiqishdan qo'rqasizmi?", "Боитесь выходить к доске?", "Afraid to go to the board?", 2),
    pq("psy-1", 3, "Maktabga borishni xohlamaysizmi?", "Не хочется идти в школу?", "Don't want to go to school?", 2),
    pq("psy-1", 4, "Sinfdoshlar bilan bahsda xavotirlanasizmi?", "Тревожитесь при споре с одноклассниками?", "Anxious in arguments with classmates?", 2),
    pq("psy-1", 5, "Baho olishdan qo'rqasizmi?", "Боитесь получить плохую оценку?", "Afraid of getting a bad grade?", 2),
    pq("psy-2", 1, "Yangi mavzuni qanday yaxshi eslaysiz?", "Как лучше запоминать новую тему?", "How do you best remember a new topic?", 3),
    pq("psy-2", 2, "Dam olish kunida nima qilasiz?", "Чем занимаетесь в выходной?", "What do you do on a day off?", 3),
    pq("psy-2", 3, "Qo'llanmani qanday o'qiysiz?", "Как читаете инструкцию?", "How do you read instructions?", 3),
    pq("psy-2", 4, "Qiyin vazifani qanday hal qilasiz?", "Как решаете сложную задачу?", "How do you solve a hard task?", 3),
  ];
  const sc = (test: string, i: number, min: number, max: number, color: string, tUz: string, tRu: string, tEn: string): Row => ({
    id: `${test}-s${i}`, psych_test_id: test, min_score: min, max_score: max, badge_color: color,
    result_title: L(tUz, tRu, tEn),
    psychological_analysis: L(`${tUz}: tahlil matni.`, `${tRu}: текст анализа.`, `${tEn}: analysis text.`),
    recommendations_for_parents: L("Farzandingiz bilan ochiq suhbatlashing.", "Откровенно разговаривайте с ребёнком.", "Talk openly with your child."), created_at: ago(40),
  });
  t.psych_result_scales = [
    sc("psy-1", 1, 0, 3, "#22c55e", "Past xavotir", "Низкая тревожность", "Low anxiety"),
    sc("psy-1", 2, 4, 7, "#eab308", "O'rtacha xavotir", "Средняя тревожность", "Moderate anxiety"),
    sc("psy-1", 3, 8, 10, "#ef4444", "Yuqori xavotir", "Высокая тревожность", "High anxiety"),
    sc("psy-2", 1, 0, 4, "#3b82f6", "Vizual", "Визуал", "Visual"),
    sc("psy-2", 2, 5, 8, "#8b5cf6", "Auditiv", "Аудиал", "Auditory"),
    sc("psy-2", 3, 10, 12, "#22c55e", "Kinestetik", "Кинестет", "Kinesthetic"), // deliberate gap at 9 to demo the validator
  ];

  const gc = (g: [number, number, number], m: [number, number, number], h: [number, number, number]) => ({
    easy: { grid: g[0], time_limit: g[1], multiplier: g[2] }, medium: { grid: m[0], time_limit: m[1], multiplier: m[2] }, hard: { grid: h[0], time_limit: h[1], multiplier: h[2] },
  });
  const game = (id: string, slug: string, uz: string, ru: string, en: string, skillUz: string, skillRu: string, skillEn: string, i: number, cfg: ReturnType<typeof gc>): Row => ({
    id, game_slug: slug, title: L(uz, ru, en), description: L(`${uz} o'yini`, `Игра «${ru}»`, `${en} game`),
    how_to_play: L("Ko'rsatmalarga amal qiling.", "Следуйте инструкциям.", "Follow the instructions."), cognitive_skill: L(skillUz, skillRu, skillEn),
    icon_name: "Brain", config: cfg, is_active: true, sort_order: i, created_at: ago(70),
  });
  t.brain_games = [
    game("g-schulte", "schulte-table", "Shulte jadvali", "Таблица Шульте", "Schulte table", "Diqqat", "Внимание", "Attention", 1, gc([3, 60, 1], [5, 90, 1.5], [7, 120, 2])),
    game("g-memory", "memory-matrix", "Xotira matritsasi", "Матрица памяти", "Memory matrix", "Xotira", "Память", "Memory", 2, gc([3, 45, 1], [4, 60, 1.5], [5, 75, 2])),
    game("g-math", "mental-math", "Aqliy hisob", "Устный счёт", "Mental math", "Hisoblash", "Счёт", "Calculation", 3, gc([10, 60, 1], [50, 60, 1.5], [100, 60, 2])),
    game("g-stroop", "stroop-test", "Stroop testi", "Тест Струпа", "Stroop test", "Reaksiya", "Реакция", "Reaction", 4, gc([3, 30, 1], [4, 45, 1.5], [5, 60, 2])),
    game("g-logic", "logic-seq", "Mantiqiy ketma-ketlik", "Логические последовательности", "Logic sequences", "Mantiq", "Логика", "Logic", 5, gc([1, 90, 1], [2, 90, 1.5], [3, 90, 2])),
    game("g-matching", "matching-pairs", "Juftlikni top", "Найди пару", "Matching pairs", "Xotira va bilim", "Память и знания", "Memory & knowledge", 6, gc([6, 120, 1], [8, 150, 1.5], [12, 180, 2])),
    game("g-truefalse", "true-false", "To'g'ri yoki noto'g'ri", "Верно или неверно", "True or false", "Tezkor qaror", "Быстрое решение", "Quick judgement", 7, gc([3, 60, 1], [3, 60, 1.5], [2, 60, 2])),
    game("g-quizrace", "quiz-race", "Viktorina poygasi", "Гонка викторины", "Quiz race", "Bilim va tezlik", "Знания и скорость", "Knowledge & speed", 8, gc([8, 20, 1], [10, 15, 1.5], [12, 10, 2])),
  ];
  // staff-authored content for the three content-driven games (playable from /games in demo mode)
  t.game_content_sets = seedContentSets().map((r) => ({ ...r, is_active: true, created_at: ago(30), updated_at: ago(30) })) as unknown as Row[];
  const players = ["Aziz", "Sevara", "Otabek", "Zarina", "Kamol", "Dildora", "Shahzod", "Madina"];
  t.game_leaderboard = Array.from({ length: 24 }, (_, i) => {
    const g = t.brain_games[i % 5];
    return {
      id: `lb-${i + 1}`, game_id: g.id, player_name: pick(players), student_grade: 3 + Math.floor(rand() * 8),
      difficulty: pick(["easy", "medium", "hard"]), score: Math.round(200 + rand() * 1800), completion_time_ms: Math.round(15000 + rand() * 90000),
      accuracy_percent: Math.round(60 + rand() * 40), created_at: ago(Math.floor(rand() * 20), i),
    };
  });

  const appSt = ["new", "new", "contacted", "interview_scheduled", "accepted", "rejected", "new", "contacted"];
  t.admission_applications = Array.from({ length: 14 }, (_, i) => ({
    id: `app-${i + 1}`, application_type: pick(["admission", "admission", "campus_tour", "callback"]), parent_name: `${pick(first)} ${pick(last)}`, child_name: pick(first),
    target_grade: String(1 + Math.floor(rand() * 10)), phone: `+998 9${Math.floor(rand() * 10)} ${100 + Math.floor(rand() * 899)} ${10 + Math.floor(rand() * 89)} ${10 + Math.floor(rand() * 89)}`,
    preferred_language: pick(["uz", "ru", "en"]), message: i % 3 === 0 ? "Iltimos, bog'laning / Пожалуйста, свяжитесь / Please contact me" : "",
    status: appSt[i % appSt.length], admin_notes: i % 4 === 0 ? "Ota-onasi bilan gaplashildi." : "", created_at: ago(Math.floor(i * 2.2), i),
  }));

  t.profiles = [
    { id: "demo-super_admin", full_name: "Demo Super Admin", email: "admin@demo.uz", role: "super_admin", phone: "+998 90 000 00 01", avatar_url: null, grade: null, is_active: true, created_at: ago(300) },
    { id: "demo-methodist", full_name: "Demo Metodist", email: "metodist@demo.uz", role: "methodist", phone: "+998 90 000 00 02", avatar_url: null, grade: null, is_active: true, created_at: ago(200) },
    { id: "demo-psychologist", full_name: "Demo Psixolog", email: "psixolog@demo.uz", role: "psychologist", phone: "+998 90 000 00 03", avatar_url: null, grade: null, is_active: true, created_at: ago(100) },
    { id: "u-teacher", full_name: "Dilnoza Rahimova", email: "dilnoza@example.com", role: "teacher", phone: "", avatar_url: null, grade: null, is_active: true, created_at: ago(90) },
  ];

  // surveys module (seed lives in components/surveys/demo.ts)
  t.surveys = demoSurveys() as unknown as Row[];
  const surveyQs = demoSurveyQuestions();
  t.survey_questions = surveyQs as unknown as Row[];
  t.survey_responses = demoSurveyResponses(surveyQs) as unknown as Row[];

  t.audit_log = [
    { id: "aud-1", user_id: "demo-super_admin", user_email: "admin@demo.uz", action: "update", resource: "site_settings", record_id: "1", diff: { hero_title: { from: "…", to: "Kelajak bugun boshlanadi" } }, created_at: ago(2) },
    { id: "aud-2", user_id: "demo-methodist", user_email: "metodist@demo.uz", action: "create", resource: "programs", record_id: "prog-3", diff: null, created_at: ago(1, 3) },
  ];

  // site visits for the last 60 days (weekday-weighted, trending up)
  const visits: Extra["site_visits"] = [];
  const paths = ["/", "/programs", "/olympiads", "/quizzes", "/games", "/contact", "/about"];
  for (let d = 59; d >= 0; d--) {
    const dow = new Date(Date.now() - d * day).getDay();
    const base = (dow === 0 || dow === 6 ? 18 : 34) + (60 - d) * 0.4;
    const n = Math.round(base + rand() * 14);
    for (let k = 0; k < n; k++) visits.push({ created_at: ago(d, Math.floor(rand() * 23)), path: pick(paths), locale: pick(["uz", "uz", "ru", "en"]) });
  }
  const attempts: Extra["quiz_attempts"] = [];
  for (let d = 29; d >= 0; d--) {
    const n = Math.round(2 + rand() * 7);
    for (let k = 0; k < n; k++) attempts.push({ created_at: ago(d, Math.floor(rand() * 23)), quiz_id: pick(["quiz-1", "quiz-2"]), score_percent: Math.round(30 + rand() * 70) });
  }

  return { tables: t, extra: { site_visits: visits, quiz_attempts: attempts }, seq: 1000 };
}

const g = globalThis as unknown as { __maktabDemo?: DemoState };
const state = (): DemoState => {
  const s = (g.__maktabDemo ??= seed());
  if (!s.tables.surveys) {
    // a dev server that booted before the surveys module existed keeps its old state object: top it up
    const qs = demoSurveyQuestions();
    s.tables.surveys = demoSurveys() as unknown as Row[];
    s.tables.survey_questions = qs as unknown as Row[];
    s.tables.survey_responses = demoSurveyResponses(qs) as unknown as Row[];
  }
  return s;
};

// ---------------------------------------------------------------- generic CRUD
export interface ListParams {
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  all?: boolean;
  filters?: Record<string, string>;
}

const textOf = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return Object.values(v as object).map(textOf).join(" ");
  return String(v);
};
const sortKey = (v: unknown): string | number => {
  if (v == null) return "";
  if (typeof v === "number") return v;
  if (typeof v === "object") return String((v as Record<string, unknown>).uz ?? "");
  return String(v).toLowerCase();
};

export function demoList(res: ResourceDef, p: ListParams): ListResult {
  let rows = [...(state().tables[res.table] ?? [])];
  for (const [k, v] of Object.entries(p.filters ?? {})) {
    if (v === "" || v == null) continue;
    rows = rows.filter((r) => String(r[k]) === v);
  }
  if (p.q?.trim()) {
    const q = p.q.trim().toLowerCase();
    rows = rows.filter((r) => res.search.some((c) => textOf(r[c]).toLowerCase().includes(q)));
  }
  const field = p.sort || res.sort.field;
  const dir = (p.dir || res.sort.dir) === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const x = sortKey(a[field]);
    const y = sortKey(b[field]);
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return 0;
  });
  const total = rows.length;
  if (!p.all) {
    const size = Math.min(p.pageSize || res.pageSize || 15, 200);
    const page = Math.max(p.page || 1, 1);
    rows = rows.slice((page - 1) * size, page * size);
  }
  return { rows, total };
}

export const demoGet = (res: ResourceDef, id: string): Row | null =>
  (state().tables[res.table] ?? []).find((r) => String(r.id) === id) ?? null;

export function demoCreate(res: ResourceDef, data: Record<string, unknown>, extra?: Record<string, unknown>): Row {
  const s = state();
  const rows = (s.tables[res.table] ??= []);
  const row: Row = { ...data, ...extra, id: `${res.key.slice(0, 4)}-${++s.seq}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (res.table === "olympiad_registrations") row.ticket_number = `OLY-2026-${100000 + s.seq}`;
  rows.push(row);
  return row;
}

export function demoUpdate(res: ResourceDef, id: string, data: Record<string, unknown>): Row | null {
  const s = state();
  let row = demoGet(res, id);
  if (!row && res.singleton) {
    row = { id: 1 } as Row;
    (s.tables[res.table] ??= []).push(row);
  }
  if (!row) return null;
  Object.assign(row, data, { updated_at: new Date().toISOString() });
  return row;
}

export function demoDelete(res: ResourceDef, id: string): boolean {
  const s = state();
  const rows = s.tables[res.table] ?? [];
  const i = rows.findIndex((r) => String(r.id) === id);
  if (i < 0) return false;
  rows.splice(i, 1);
  // cascade
  const cascade: Record<string, [string, string]> = {
    academic_quizzes: ["academic_questions", "quiz_id"],
    psych_tests: ["psych_questions", "psych_test_id"],
    olympiads: ["olympiad_registrations", "olympiad_id"],
    brain_games: ["game_leaderboard", "game_id"],
    surveys: ["survey_questions", "survey_id"],
  };
  if (res.table === "surveys") s.tables.survey_responses = (s.tables.survey_responses ?? []).filter((r) => String(r.survey_id) !== id);
  const c = cascade[res.table];
  if (c) s.tables[c[0]] = (s.tables[c[0]] ?? []).filter((r) => String(r[c[1]]) !== id);
  if (res.table === "psych_tests") s.tables.psych_result_scales = s.tables.psych_result_scales.filter((r) => String(r.psych_test_id) !== id);
  return true;
}

export function demoDeleteWhere(res: ResourceDef, field: string, value: string): number {
  const s = state();
  const before = (s.tables[res.table] ?? []).length;
  s.tables[res.table] = (s.tables[res.table] ?? []).filter((r) => String(r[field]) !== value);
  return before - s.tables[res.table].length;
}

export function demoLog(row: Record<string, unknown>) {
  const s = state();
  (s.tables.audit_log ??= []).push({ ...row, id: `aud-${++s.seq}`, created_at: new Date().toISOString() } as Row);
}

export const demoTable =(table: string): Row[] => state().tables[table] ?? [];
export const demoExtra = () => state().extra;
