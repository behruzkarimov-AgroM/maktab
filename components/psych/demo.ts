import type { LocalizedText } from "@/lib/types";
import type { DemoTest, ResultScale, ScoredOption, ScoredQuestion } from "./types";

/**
 * Built-in trilingual demo tests (used when Supabase is not configured or has no tests).
 * Scores live ONLY here / in the DB and are never sent to the browser (see data.ts toPublic()).
 * These are friendly orientation questionnaires, not clinical instruments.
 */

const L = (uz: string, ru: string, en: string): LocalizedText => ({ uz, ru, en });
const opt = (id: string, score: number, uz: string, ru: string, en: string): ScoredOption => ({ id, score, text: L(uz, ru, en) });
const q = (id: string, text: LocalizedText, options: ScoredOption[]): ScoredQuestion => ({ id, text, options });

/** Never / Sometimes / Often / Almost always -> 0..3 */
const freq = (): ScoredOption[] => [
  opt("a", 0, "Deyarli hech qachon", "Почти никогда", "Almost never"),
  opt("b", 1, "Ba'zan", "Иногда", "Sometimes"),
  opt("c", 2, "Tez-tez", "Часто", "Often"),
  opt("d", 3, "Deyarli doim", "Почти всегда", "Almost always"),
];

const scale = (
  min: number,
  max: number,
  badge: string,
  title: LocalizedText,
  analysis: LocalizedText,
  recommendations: LocalizedText,
): ResultScale => ({ min, max, badge, title, analysis, recommendations });

/* ------------------------------------------------------------------ 1. Kids interests (6-10) */
const interests: DemoTest = {
  id: "demo-interests-kids",
  audience: "kids",
  topic: "interests",
  title: L("Mening qiziqishlarim", "Мои интересы", "My Interests"),
  description: L(
    "Farzandingiz nimani yoqtirishini bilib oling: ijod, tabiat yoki mantiqiy o'yinlar.",
    "Узнайте, что больше нравится ребёнку: творчество, природа или логические игры.",
    "Find out what your child enjoys most: creativity, nature or logic games.",
  ),
  instruction: L(
    "To'g'ri yoki noto'g'ri javob yo'q. Eng ko'proq yoqqan variantni tanlang.",
    "Правильных и неправильных ответов нет. Выберите то, что нравится больше всего.",
    "There are no right or wrong answers. Pick what you like the most.",
  ),
  questions: [
    q("q1", L("Dam olish kuni nima qilishni yoqtirasan?", "Что ты любишь делать в выходной?", "What do you like to do on a day off?"), [
      opt("a", 1, "Hovlida yugurish va o'ynash", "Бегать и играть во дворе", "Run and play outside"),
      opt("b", 2, "Rasm chizish yoki yasash", "Рисовать или мастерить", "Draw or make crafts"),
      opt("c", 3, "Jumboq yoki konstruktor yig'ish", "Собирать пазлы или конструктор", "Build puzzles or construction sets"),
    ]),
    q("q2", L("Eng yoqtirgan sovg'a qaysi?", "Какой подарок тебе нравится больше?", "Which gift would you love most?"), [
      opt("a", 1, "To'p yoki velosiped", "Мяч или велосипед", "A ball or a bike"),
      opt("b", 2, "Bo'yoqlar yoki musiqa asbobi", "Краски или музыкальный инструмент", "Paints or a musical instrument"),
      opt("c", 3, "Kichik tajriba to'plami", "Набор для опытов", "A little science kit"),
    ]),
    q("q3", L("Yangi narsani qanday o'rganasan?", "Как ты узнаёшь новое?", "How do you like to learn new things?"), [
      opt("a", 1, "Qilib ko'rib", "Пробуя руками", "By trying it out"),
      opt("b", 2, "Hikoya va rasmlar orqali", "Через истории и картинки", "Through stories and pictures"),
      opt("c", 3, "Savol berib, sababini aniqlab", "Задавая вопросы и ища причины", "By asking why and finding out"),
    ]),
    q("q4", L("Sinfda eng qiziq dars qaysi?", "Какой урок самый интересный?", "Which lesson is the most fun?"), [
      opt("a", 1, "Jismoniy tarbiya", "Физкультура", "Physical education"),
      opt("b", 2, "Tasviriy san'at yoki musiqa", "Рисование или музыка", "Art or music"),
      opt("c", 3, "Matematika yoki tabiatshunoslik", "Математика или окружающий мир", "Maths or science"),
    ]),
    q("q5", L("Do'stlar bilan o'yinda sen kimsan?", "Кто ты в играх с друзьями?", "Who are you in games with friends?"), [
      opt("a", 1, "Eng tez va harakatchan", "Самый быстрый и активный", "The fastest and most active"),
      opt("b", 2, "Yangi qoidalar o'ylab topuvchi", "Тот, кто придумывает новые правила", "The one who invents new rules"),
      opt("c", 3, "Reja tuzuvchi", "Тот, кто строит план", "The one who makes the plan"),
    ]),
  ],
  scales: [
    scale(
      5,
      8,
      "green",
      L("Faol kashfiyotchi", "Активный исследователь", "Active Explorer"),
      L(
        "Farzandingiz harakat, o'yin va jismoniy faollikdan zavq oladi. U dunyoni tanasi va tajribasi orqali o'rganadi.",
        "Ребёнок получает радость от движения, игр и физической активности. Он познаёт мир через тело и практический опыт.",
        "Your child enjoys movement, play and physical activity, and learns about the world through hands-on experience.",
      ),
      L(
        "Sport to'garaklari, sayr va jamoaviy o'yinlarni qo'llab-quvvatlang. Yangi mavzularni amaliy mashqlar bilan tushuntiring.",
        "Поддерживайте спортивные секции, прогулки и командные игры. Объясняйте новое через практические задания.",
        "Support sports clubs, outdoor time and team games. Explain new topics through practical activities.",
      ),
    ),
    scale(
      9,
      12,
      "purple",
      L("Ijodkor tasavvur", "Творческое воображение", "Creative Imagination"),
      L(
        "Farzandingizda boy tasavvur bor: u tasvirlar, hikoyalar va tovushlar orqali o'zini ifoda etishni yoqtiradi.",
        "У ребёнка богатое воображение: ему нравится выражать себя через образы, истории и звуки.",
        "Your child has a rich imagination and likes to express themselves through images, stories and sounds.",
      ),
      L(
        "Rasm, musiqa, teatr yoki qo'l mehnati to'garaklarini sinab ko'ring. Ijodiy ishlarini maqtang va uyda ko'rgazma qiling.",
        "Попробуйте студии рисования, музыки, театра или рукоделия. Хвалите творческие работы и устраивайте домашние выставки.",
        "Try art, music, drama or crafts clubs. Praise creative work and display it at home.",
      ),
    ),
    scale(
      13,
      15,
      "blue",
      L("Mantiqiy tadqiqotchi", "Любознательный логик", "Curious Thinker"),
      L(
        "Farzandingiz «nega?» degan savollarni yaxshi ko'radi, jumboq va qonuniyatlarni topishdan zavq oladi.",
        "Ребёнок любит вопрос «почему?», ему нравятся головоломки и поиск закономерностей.",
        "Your child loves asking “why?” and enjoys puzzles and finding patterns.",
      ),
      L(
        "Mantiqiy o'yinlar, konstruktorlar va oddiy tajribalar bering. Savollariga shoshilmay javob bering yoki birga javob izlang.",
        "Давайте логические игры, конструкторы и простые опыты. Отвечайте на вопросы без спешки или ищите ответы вместе.",
        "Offer logic games, construction sets and simple experiments. Answer questions patiently or look for answers together.",
      ),
    ),
  ],
};

/* ------------------------------------------------------------------ 2. School readiness (parents) */
const readiness: DemoTest = {
  id: "demo-readiness-parents",
  audience: "parents",
  topic: "readiness",
  title: L("Maktabga tayyorlik", "Готовность к школе", "School Readiness"),
  description: L(
    "Ota-onalar uchun qisqa so'rovnoma: farzandingiz maktabga qanchalik tayyor.",
    "Короткий опросник для родителей: насколько ребёнок готов к школе.",
    "A short questionnaire for parents: how ready is your child for school.",
  ),
  instruction: L(
    "Oxirgi bir oy davomida farzandingizni kuzatib, har bir fikrga qanchalik mos kelishini belgilang.",
    "Вспомните последний месяц и отметьте, насколько каждое утверждение подходит вашему ребёнку.",
    "Think about the last month and mark how well each statement describes your child.",
  ),
  questions: [
    q("q1", L("Bola 10-15 daqiqa bir mashg'ulotga e'tibor bera oladi.", "Ребёнок может 10-15 минут заниматься одним делом.", "My child can focus on one activity for 10-15 minutes."), freq()),
    q("q2", L("Bola o'z ismi, yoshi va oila a'zolarini aytib bera oladi.", "Ребёнок может назвать своё имя, возраст и членов семьи.", "My child can tell their name, age and family members."), freq()),
    q("q3", L("Bola oddiy ko'rsatmalarni (2-3 qadam) tushunib bajaradi.", "Ребёнок понимает и выполняет простые инструкции (2-3 шага).", "My child follows simple 2-3 step instructions."), freq()),
    q("q4", L("Bola o'zi kiyinadi, qo'l yuvadi va buyumlarini yig'adi.", "Ребёнок сам одевается, моет руки и собирает вещи.", "My child dresses, washes hands and packs things on their own."), freq()),
    q("q5", L("Bola tengdoshlari bilan o'ynaydi va navbat kutadi.", "Ребёнок играет со сверстниками и умеет ждать очереди.", "My child plays with other children and can wait for a turn."), freq()),
    q("q6", L("Bola harflar, raqamlar va shakllarga qiziqish bildiradi.", "Ребёнок проявляет интерес к буквам, цифрам и фигурам.", "My child shows interest in letters, numbers and shapes."), freq()),
  ],
  scales: [
    scale(
      0,
      6,
      "amber",
      L("Qo'llab-quvvatlash kerak", "Нужна поддержка", "Needs Support"),
      L(
        "Hozircha bir nechta ko'nikmalar shakllanish bosqichida. Bu normal holat: har bir bola o'z sur'atida rivojlanadi.",
        "Некоторые навыки пока формируются. Это нормально: каждый ребёнок развивается в своём темпе.",
        "Several skills are still developing. This is normal: every child grows at their own pace.",
      ),
      L(
        "Kundalik o'yinlar orqali diqqat, nutq va mustaqillikni mashq qiling. Maktab psixologi bilan maslahatlashing.",
        "Тренируйте внимание, речь и самостоятельность в ежедневных играх. Обсудите результаты со школьным психологом.",
        "Practise attention, speech and independence through daily play. Talk it over with the school psychologist.",
      ),
    ),
    scale(
      7,
      12,
      "blue",
      L("Tayyorlik yo'lida", "На пути к готовности", "On the Way"),
      L(
        "Ko'pchilik ko'nikmalar yaxshi rivojlangan, ayrimlari esa mustahkamlashni talab qiladi.",
        "Большинство навыков развито хорошо, некоторые нужно закрепить.",
        "Most skills are well developed and a few need more practice.",
      ),
      L(
        "Kuchsiz tomonlarni o'yin shaklida mashq qiling, kun tartibini maktab rejimiga yaqinlashtiring.",
        "Закрепляйте слабые стороны в игровой форме и постепенно приближайте режим дня к школьному.",
        "Practise weaker areas through play and gradually shift the daily routine towards a school schedule.",
      ),
    ),
    scale(
      13,
      18,
      "green",
      L("Maktabga tayyor", "Готов к школе", "Ready for School"),
      L(
        "Farzandingiz maktab hayotiga yaxshi tayyor: diqqat, mustaqillik va muloqot ko'nikmalari yetarli.",
        "Ребёнок хорошо готов к школьной жизни: достаточно развиты внимание, самостоятельность и общение.",
        "Your child seems well prepared for school life, with good attention, independence and social skills.",
      ),
      L(
        "Qiziqishni saqlang, ko'p kitob o'qing va maktab haqida ijobiy gapiring. Bolani bosim qilmasdan qo'llab-quvvatlang.",
        "Поддерживайте интерес, читайте вместе и говорите о школе позитивно. Помогайте без давления.",
        "Keep curiosity alive, read together and talk about school positively. Support without pressure.",
      ),
    ),
  ],
};

/* ------------------------------------------------------------------ 3. Emotional state (teens 11-15) */
const emotional: DemoTest = {
  id: "demo-emotional-teens",
  audience: "teens",
  topic: "emotional",
  title: L("Mening kayfiyatim", "Моё настроение", "How I Feel"),
  description: L(
    "Oxirgi paytlardagi kayfiyat va stressni o'zingiz baholash uchun qisqa test.",
    "Короткий тест для самооценки настроения и стресса за последнее время.",
    "A short self-check of your mood and stress lately.",
  ),
  instruction: L(
    "So'nggi 2 hafta haqida o'ylang. Samimiy javob bering: bu faqat sizga yordam berish uchun.",
    "Подумайте о последних двух неделях. Отвечайте честно: это нужно только для того, чтобы вам помочь.",
    "Think about the last two weeks. Answer honestly: this is only here to help you.",
  ),
  questions: [
    q("q1", L("Ertalab uyg'onganda o'zimni charchagan his qilaman.", "Утром я просыпаюсь уставшим(ей).", "I wake up feeling tired."), freq()),
    q("q2", L("Darslar yoki uy vazifasi tufayli xavotirlanaman.", "Я переживаю из-за уроков или домашних заданий.", "I worry about lessons or homework."), freq()),
    q("q3", L("Oldin yoqqan narsalar endi qiziq emas.", "То, что раньше нравилось, стало неинтересным.", "Things I used to enjoy feel less interesting."), freq()),
    q("q4", L("Tengdoshlar bilan muloqotda o'zimni noqulay his qilaman.", "Мне неловко общаться со сверстниками.", "I feel awkward around people my age."), freq()),
    q("q5", L("Uxlashim qiyin yoki tez-tez uyg'onib ketaman.", "Мне трудно заснуть или я часто просыпаюсь ночью.", "I have trouble sleeping or wake up often."), freq()),
  ],
  scales: [
    scale(
      0,
      5,
      "green",
      L("Barqaror kayfiyat", "Ровное настроение", "Balanced Mood"),
      L(
        "Javoblaringiz kayfiyatingiz asosan barqaror ekanini ko'rsatadi. Ba'zan charchash yoki xavotir — hamma uchun tabiiy.",
        "Ваши ответы показывают, что настроение в основном ровное. Усталость и тревога иногда бывают у всех.",
        "Your answers suggest your mood is mostly steady. Feeling tired or worried sometimes is normal for everyone.",
      ),
      L(
        "Kun tartibi, uyqu, harakat va do'stlar bilan muloqotni saqlang. Ota-onalar: ochiq suhbat uchun vaqt ajrating.",
        "Сохраняйте режим сна, движение и общение с друзьями. Родителям: находите время для открытого разговора.",
        "Keep up sleep, movement and time with friends. Parents: make time for open conversations.",
      ),
    ),
    scale(
      6,
      10,
      "amber",
      L("Biroz stress", "Немного напряжения", "Some Stress"),
      L(
        "Hozir ma'lum bir zo'riqish sezilmoqda. Bu o'tkinchi bo'lishi mumkin, ammo e'tibor va qo'llab-quvvatlash foydali.",
        "Сейчас заметно некоторое напряжение. Оно может быть временным, но внимание и поддержка будут полезны.",
        "There is some tension right now. It may be temporary, but attention and support will help.",
      ),
      L(
        "Yuklamani birga ko'rib chiqing, dam olish va jismoniy faollikni ko'paytiring. 2-3 hafta davom etsa, maktab psixologiga murojaat qiling.",
        "Вместе пересмотрите нагрузку, добавьте отдых и физическую активность. Если это длится 2-3 недели, обратитесь к школьному психологу.",
        "Review workload together and add rest and physical activity. If it lasts 2-3 weeks, talk to the school psychologist.",
      ),
    ),
    scale(
      11,
      15,
      "red",
      L("Suhbat va yordam tavsiya etiladi", "Рекомендуется поддержка и разговор", "A Conversation Is Recommended"),
      L(
        "Javoblar yuqori zo'riqish yoki charchoqni ko'rsatadi. Bu tashxis emas, lekin mutaxassis bilan gaplashish foydali bo'ladi.",
        "Ответы указывают на высокое напряжение или усталость. Это не диагноз, но разговор со специалистом будет полезен.",
        "Your answers point to high tension or fatigue. This is not a diagnosis, but talking to a specialist would help.",
      ),
      L(
        "Ishonchli kattalar (ota-ona, o'qituvchi) bilan gaplashing va maktab psixologiga yoziling. Bola his-tuyg'ularini tanqid qilmasdan tinglang.",
        "Поговорите с доверенным взрослым и запишитесь к школьному психологу. Родителям: слушайте без критики и оценок.",
        "Talk to a trusted adult and book a session with the school psychologist. Parents: listen without judging.",
      ),
    ),
  ],
};

/* ------------------------------------------------------------------ 4. Career orientation (16-18) */
const career: DemoTest = {
  id: "demo-career-16-18",
  audience: "older",
  topic: "career",
  title: L("Kasb tanlash kompassi", "Компас профессий", "Career Compass"),
  description: L(
    "Qaysi faoliyat turi sizga yaqinligini aniqlang: amaliy, insonlar bilan yoki tahliliy.",
    "Определите, какой тип деятельности вам ближе: практический, с людьми или аналитический.",
    "Discover which kind of work suits you: hands-on, people-oriented or analytical.",
  ),
  instruction: L(
    "Har bir savolda sizga eng yaqin variantni tanlang. Natija yo'nalish beradi, qaror emas.",
    "В каждом вопросе выберите наиболее близкий вариант. Результат — ориентир, а не приговор.",
    "Choose the option closest to you. The result is a guide, not a verdict.",
  ),
  questions: [
    q("q1", L("Ideal ish kuni qanday?", "Каким выглядит идеальный рабочий день?", "What does your ideal workday look like?"), [
      opt("a", 1, "Qo'l bilan biror narsa yasash yoki tuzatish", "Что-то делать или чинить руками", "Building or fixing something hands-on"),
      opt("b", 2, "Odamlar bilan gaplashish va yordam berish", "Общаться с людьми и помогать им", "Talking with and helping people"),
      opt("c", 3, "Ma'lumot bilan ishlash, muammo yechish", "Работать с данными и решать задачи", "Working with data and solving problems"),
    ]),
    q("q2", L("Loyihada qaysi rol sizga mos?", "Какая роль в проекте вам подходит?", "Which role fits you in a project?"), [
      opt("a", 1, "Amalga oshiruvchi", "Исполнитель", "The doer"),
      opt("b", 2, "Jamoa tashkilotchisi", "Организатор команды", "The team organiser"),
      opt("c", 3, "Strateg va tahlilchi", "Стратег и аналитик", "The strategist and analyst"),
    ]),
    q("q3", L("Qaysi fan sizga ko'proq yoqadi?", "Какие предметы нравятся больше?", "Which subjects do you prefer?"), [
      opt("a", 1, "Texnologiya, jismoniy tarbiya, chizmachilik", "Технология, физкультура, черчение", "Technology, PE, technical drawing"),
      opt("b", 2, "Adabiyot, tarix, tillar", "Литература, история, языки", "Literature, history, languages"),
      opt("c", 3, "Matematika, fizika, informatika", "Математика, физика, информатика", "Maths, physics, computer science"),
    ]),
    q("q4", L("Yangi muammoga duch kelsangiz...", "Когда вы сталкиваетесь с новой проблемой...", "When you face a new problem..."), [
      opt("a", 1, "Darhol sinab ko'raman", "Сразу пробую действовать", "I start trying things right away"),
      opt("b", 2, "Boshqalar bilan maslahatlashaman", "Советуюсь с другими", "I discuss it with others"),
      opt("c", 3, "Avval tahlil qilib, reja tuzaman", "Сначала анализирую и составляю план", "I analyse first and make a plan"),
    ]),
  ],
  scales: [
    scale(
      4,
      6,
      "green",
      L("Amaliy yo'nalish", "Практическое направление", "Hands-on Direction"),
      L(
        "Sizga aniq natija beradigan, qo'l va jismoniy faollik talab qiladigan ish yoqadi: muhandislik, qurilish, dizayn, sport.",
        "Вам ближе конкретный результат и практическая работа: инженерия, строительство, дизайн, спорт.",
        "You prefer tangible results and practical work: engineering, construction, design, sports.",
      ),
      L(
        "Texnik kollej, amaliyot va ustaxonalarni ko'rib chiqing. Ota-onalar: qiziqish uchun real tajriba imkonini yarating.",
        "Рассмотрите технические колледжи, стажировки и мастерские. Родителям: дайте возможность попробовать на практике.",
        "Explore technical colleges, internships and workshops. Parents: let them try things for real.",
      ),
    ),
    scale(
      7,
      9,
      "purple",
      L("Insonlar bilan ishlash", "Работа с людьми", "People-oriented"),
      L(
        "Muloqot, tushuntirish va yordam berish sizning kuchli tomoningiz: ta'lim, tibbiyot, huquq, media, marketing.",
        "Общение, объяснение и помощь — ваши сильные стороны: образование, медицина, право, медиа, маркетинг.",
        "Communication, explaining and helping are your strengths: education, healthcare, law, media, marketing.",
      ),
      L(
        "Ko'ngillilik, debat to'garaklari va sohaga oid ochiq eshiklar kunlariga boring.",
        "Попробуйте волонтёрство, дебаты и дни открытых дверей в интересных областях.",
        "Try volunteering, debate clubs and open days in fields that interest you.",
      ),
    ),
    scale(
      10,
      12,
      "blue",
      L("Tahliliy yo'nalish", "Аналитическое направление", "Analytical Direction"),
      L(
        "Mantiq, ma'lumot va murakkab masalalarni yechish sizga yaqin: IT, fan, iqtisod, muhandislik tahlili.",
        "Вам близки логика, данные и сложные задачи: IT, наука, экономика, инженерный анализ.",
        "You enjoy logic, data and complex problems: IT, science, economics, engineering analysis.",
      ),
      L(
        "Olimpiadalar, dasturlash va loyihaviy ishlar bilan qiziqishni chuqurlashtiring; universitet dasturlarini solishtiring.",
        "Углубляйте интерес через олимпиады, программирование и проекты; сравнивайте университетские программы.",
        "Deepen your interest through olympiads, coding and projects; compare university programmes.",
      ),
    ),
  ],
};

export const DEMO_TESTS: DemoTest[] = [interests, emotional, career, readiness];

export function getDemoTest(id: string): DemoTest | undefined {
  return DEMO_TESTS.find((t) => t.id === id);
}
