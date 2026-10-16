import type { LocalizedText } from "./types";

const L = (uz: string, ru: string, en: string): LocalizedText => ({ uz, ru, en });

export type StatItem = { key: string; value: number; suffix?: string; label: LocalizedText };

export type SiteSettingsData = {
  school_name: LocalizedText;
  hero_title: LocalizedText;
  hero_subtitle: LocalizedText;
  hero_video_url: string | null;
  hero_image_url: string | null;
  about_mission: LocalizedText;
  about_vision: LocalizedText;
  about_history: LocalizedText;
  stats: StatItem[];
  address: LocalizedText;
  landmark: LocalizedText;
  phones: string[];
  email: string;
  working_hours: LocalizedText;
  map_lat: number | null;
  map_lng: number | null;
  map_embed_url: string | null;
  social_links: Record<string, string>;
  virtual_tour_url: string | null;
};

export const DEMO_SETTINGS: SiteSettingsData = {
  school_name: L("Children's Academy Group Termez xususiy maktabi", "Частная школа Children's Academy Group Termez", "Children's Academy Group Termez Private School"),
  hero_title: L("Kelajak bugun boshlanadi", "Будущее начинается сегодня", "The future starts today"),
  hero_subtitle: L(
    "Zamonaviy bilim, kuchli xarakter va xalqaro imkoniyatlar — har bir bola uchun.",
    "Современные знания, сильный характер и международные возможности — для каждого ребёнка.",
    "Modern knowledge, strong character and international opportunities — for every child."
  ),
  hero_video_url: null,
  hero_image_url: null,
  about_mission: L(
    "Har bir o'quvchining iste'dodini ochish, uni mustaqil fikrlovchi, mas'uliyatli va dunyoqarashi keng shaxs qilib tarbiyalash.",
    "Раскрывать талант каждого ученика и воспитывать самостоятельно мыслящую, ответственную личность с широким кругозором.",
    "To unlock every student's talent and nurture independent, responsible people with a broad worldview."
  ),
  about_vision: L(
    "Markaziy Osiyoning eng ishonchli innovatsion maktabi bo'lish va bitiruvchilarni jahonning yetakchi universitetlariga yo'llash.",
    "Стать самой доверенной инновационной школой Центральной Азии и вести выпускников в ведущие университеты мира.",
    "To become Central Asia's most trusted innovative school and send graduates to the world's leading universities."
  ),
  about_history: L(
    "2013-yilda kichik oilaviy loyiha sifatida boshlangan maktabimiz bugun zamonaviy kampus, 500+ o'quvchi va 48 malakali ustozga ega.",
    "Начавшись в 2013 году как небольшой семейный проект, сегодня наша школа — современный кампус, 500+ учеников и 48 опытных педагогов.",
    "Started in 2013 as a small family project, today our school is a modern campus with 500+ students and 48 experienced teachers."
  ),
  stats: [
    { key: "students", value: 520, suffix: "+", label: L("O'quvchilar", "Учеников", "Students") },
    { key: "teachers", value: 48, label: L("Malakali ustozlar", "Опытных педагогов", "Expert teachers") },
    { key: "winners", value: 140, suffix: "+", label: L("Olimpiada g'oliblari", "Победителей олимпиад", "Olympiad winners") },
    { key: "universities", value: 97, suffix: "%", label: L("Universitetga kirganlar", "Поступили в вузы", "University admission") },
  ],
  address: L("Toshkent sh., Mirzo Ulug'bek tumani, Bilimdonlar ko'chasi 12", "г. Ташкент, Мирзо-Улугбекский район, ул. Билимдонлар, 12", "12 Bilimdonlar St., Mirzo Ulugbek district, Tashkent"),
  landmark: L("«Ming o'rik» bog'i yonida, metro «Minor» dan 7 daqiqa", "Рядом с парком «Минг урик», 7 минут от метро «Минор»", "Next to Ming Urik park, 7 minutes from Minor metro"),
  phones: ["+998 71 200 00 00", "+998 90 123 45 67"],
  email: "info@example.com",
  working_hours: L("Du–Sha: 08:00 – 18:00", "Пн–Сб: 08:00 – 18:00", "Mon–Sat: 08:00 – 18:00"),
  map_lat: 41.3386,
  map_lng: 69.3341,
  map_embed_url: null,
  social_links: { telegram: "", instagram: "", youtube: "", facebook: "" },
  virtual_tour_url: null,
};

export type ProgramData = {
  id: string;
  category: "primary" | "middle" | "high";
  grade_range: string;
  title: LocalizedText;
  short_description: LocalizedText;
  full_content: LocalizedText;
  subjects: { key: string; name: LocalizedText }[];
  icon_name: string;
  cover_image_url: string | null;
  sort_order: number;
};

export const DEMO_PROGRAMS: ProgramData[] = [
  {
    id: "p1", category: "primary", grade_range: "1–4", icon_name: "sprout", cover_image_url: null, sort_order: 1,
    title: L("Boshlang'ich sinflar", "Начальная школа", "Primary school"),
    short_description: L("Qiziqish, o'yin va mustahkam poydevor.", "Любопытство, игра и прочный фундамент.", "Curiosity, play and a solid foundation."),
    full_content: L(
      "Kichik guruhlar (maks. 16 o'quvchi), ikki tilli o'qitish, o'yin orqali o'rganish va har kuni ijodiy mashg'ulotlar.",
      "Малые группы (до 16 учеников), двуязычное обучение, обучение через игру и ежедневные творческие занятия.",
      "Small classes (max 16 students), bilingual teaching, learning through play and daily creative sessions."
    ),
    subjects: [
      { key: "math", name: L("Matematika", "Математика", "Mathematics") },
      { key: "native", name: L("Ona tili", "Родной язык", "Native language") },
      { key: "english", name: L("Ingliz tili", "Английский язык", "English") },
      { key: "world", name: L("Atrofdagi olam", "Окружающий мир", "World around us") },
      { key: "music", name: L("Musiqa va tasviriy san'at", "Музыка и рисование", "Music & art") },
      { key: "pe", name: L("Jismoniy tarbiya", "Физкультура", "Physical education") },
    ],
  },
  {
    id: "p2", category: "middle", grade_range: "5–9", icon_name: "rocket", cover_image_url: null, sort_order: 2,
    title: L("O'rta bo'g'in", "Средняя школа", "Middle school"),
    short_description: L("Chuqur fan bilimi, STEM va loyihaviy ta'lim.", "Глубокие знания, STEM и проектное обучение.", "Deep subject knowledge, STEM and project-based learning."),
    full_content: L(
      "Fanlar chuqurlashtiriladi, har chorakda loyiha himoyasi, robototexnika va dasturlash darslari kiritilgan.",
      "Углублённое изучение предметов, защита проектов каждую четверть, уроки робототехники и программирования.",
      "Subjects are deepened, projects are defended every quarter, robotics and programming are built into the timetable."
    ),
    subjects: [
      { key: "algebra", name: L("Algebra va geometriya", "Алгебра и геометрия", "Algebra & geometry") },
      { key: "physics", name: L("Fizika", "Физика", "Physics") },
      { key: "chem", name: L("Kimyo", "Химия", "Chemistry") },
      { key: "bio", name: L("Biologiya", "Биология", "Biology") },
      { key: "informatics", name: L("Informatika", "Информатика", "Computer science") },
      { key: "english", name: L("Ingliz va rus tillari", "Английский и русский", "English & Russian") },
      { key: "history", name: L("Tarix va geografiya", "История и география", "History & geography") },
    ],
  },
  {
    id: "p3", category: "high", grade_range: "10–11", icon_name: "graduation", cover_image_url: null, sort_order: 3,
    title: L("Yuqori sinflar", "Старшая школа", "High school"),
    short_description: L("Universitetga tayyorgarlik: IELTS, SAT, profil yo'nalishlar.", "Подготовка к вузу: IELTS, SAT, профильные треки.", "University preparation: IELTS, SAT, specialised tracks."),
    full_content: L(
      "Aniq fanlar, ijtimoiy-gumanitar va IT yo'nalishlari. Individual karyera maslahati va xorijiy universitetlarga hujjat topshirishda yordam.",
      "Точные науки, гуманитарное и IT-направления. Индивидуальная карьерная консультация и помощь с поступлением за рубеж.",
      "STEM, humanities and IT tracks. Personal career counselling and support with overseas applications."
    ),
    subjects: [
      { key: "adv-math", name: L("Oliy matematika asoslari", "Основы высшей математики", "Advanced mathematics") },
      { key: "physics", name: L("Fizika", "Физика", "Physics") },
      { key: "cs", name: L("Dasturlash va AI", "Программирование и ИИ", "Programming & AI") },
      { key: "ielts", name: L("IELTS / SAT tayyorlov", "Подготовка к IELTS / SAT", "IELTS / SAT prep") },
      { key: "econ", name: L("Iqtisodiyot", "Экономика", "Economics") },
      { key: "law", name: L("Huquq asoslari", "Основы права", "Law basics") },
    ],
  },
];

export type CampusSectionData = {
  section_key: "kitchen" | "security" | "transport" | "schedule";
  title: LocalizedText;
  description: LocalizedText;
  gallery_urls: string[];
  extra_data: Record<string, unknown>;
};

export const DEMO_SCHEDULE: { time: string; title: LocalizedText }[] = [
  { time: "08:00", title: L("Qabul va ertalabki salomlashuv", "Приём и утреннее приветствие", "Arrival & morning greeting") },
  { time: "08:30", title: L("1–2-darslar", "1–2 уроки", "Lessons 1–2") },
  { time: "10:20", title: L("Birinchi nonushta", "Второй завтрак", "Snack break") },
  { time: "10:40", title: L("3–4-darslar", "3–4 уроки", "Lessons 3–4") },
  { time: "12:30", title: L("Issiq tushlik", "Горячий обед", "Hot lunch") },
  { time: "13:15", title: L("To'garaklar va sport", "Кружки и спорт", "Clubs & sports") },
  { time: "15:00", title: L("Uy vazifasi bilan yordam", "Помощь с домашними заданиями", "Homework support") },
  { time: "16:30", title: L("Uzaytirilgan guruh / uyga qaytish", "Группа продлённого дня / домой", "Extended day / going home") },
];

const MENU_DAYS = [
  L("Dushanba", "Понедельник", "Monday"),
  L("Seshanba", "Вторник", "Tuesday"),
  L("Chorshanba", "Среда", "Wednesday"),
  L("Payshanba", "Четверг", "Thursday"),
  L("Juma", "Пятница", "Friday"),
  L("Shanba", "Суббота", "Saturday"),
];
const MENU_ITEMS = [
  L("Mastava, tovuq go'shti kotleti, guruch, kompot", "Мастава, куриная котлета, рис, компот", "Mastava soup, chicken cutlet, rice, compote"),
  L("Lag'mon, salat, mevali pirog, ayron", "Лагман, салат, фруктовый пирог, айран", "Lagman, salad, fruit pie, ayran"),
  L("Borsch, baliq, kartoshka pyuresi, sok", "Борщ, рыба, картофельное пюре, сок", "Borscht, fish, mashed potatoes, juice"),
  L("Shurpa, osh (palov), achchiq-chuchuk salat, choy", "Шурпа, плов, салат ачичук, чай", "Shurpa, plov, achichuk salad, tea"),
  L("Makaron bolonez, sabzavotli salat, yogurt", "Паста болоньезе, овощной салат, йогурт", "Pasta bolognese, veggie salad, yoghurt"),
  L("Manti, sutli shirinlik, meva", "Манты, молочный десерт, фрукты", "Manti, milk dessert, fruit"),
];

export const DEMO_CAMPUS: CampusSectionData[] = [
  { section_key: "schedule", title: L("Kun tartibi", "Распорядок дня", "Daily schedule"), description: L("Dars, dam olish va ijodiy mashg'ulotlar muvozanati.", "Баланс уроков, отдыха и творчества.", "A balance of lessons, rest and creativity."), gallery_urls: [], extra_data: { items: DEMO_SCHEDULE } },
  { section_key: "kitchen", title: L("Oshxona va haftalik menyu", "Столовая и меню на неделю", "Canteen & weekly menu"), description: L("Sertifikatlangan oshpazlar, kuniga 3 mahal sog'lom ovqat.", "Сертифицированные повара, здоровое питание 3 раза в день.", "Certified chefs, healthy meals three times a day."), gallery_urls: [], extra_data: { menu: MENU_DAYS.map((day, i) => ({ day, items: MENU_ITEMS[i] })) } },
  { section_key: "security", title: L("Xavfsizlik", "Безопасность", "Security"), description: L("24/7 qo'riqlash, kirish nazorati, videokuzatuv va tibbiy xona.", "Охрана 24/7, контроль доступа, видеонаблюдение и медкабинет.", "24/7 guards, access control, CCTV and an on-site nurse."), gallery_urls: [], extra_data: { points: [
    L("Elektron turniket va o'quvchi kartalari", "Электронные турникеты и карты учеников", "Electronic turnstiles and student cards"),
    L("Barcha hududda videokuzatuv", "Видеонаблюдение по всей территории", "CCTV across the campus"),
    L("Malakali hamshira va tibbiy xona", "Квалифицированная медсестра и медкабинет", "Qualified nurse and clinic room"),
    L("Ota-onalar uchun SMS-xabarnoma", "SMS-уведомления для родителей", "SMS notifications for parents"),
  ] } },
  { section_key: "transport", title: L("Transport", "Транспорт", "Transport"), description: L("Shahar bo'ylab xavfsiz maktab avtobuslari, GPS kuzatuv bilan.", "Безопасные школьные автобусы по городу с GPS-контролем.", "Safe school buses across the city with GPS tracking."), gallery_urls: [], extra_data: { routes: [
    L("Chilonzor — Maktab", "Чиланзар — Школа", "Chilanzar — School"),
    L("Yunusobod — Maktab", "Юнусабад — Школа", "Yunusabad — School"),
    L("Sergeli — Maktab", "Сергели — Школа", "Sergeli — School"),
    L("Yakkasaroy — Maktab", "Яккасарай — Школа", "Yakkasaray — School"),
  ] } },
];

export const DEMO_GALLERY: { caption: LocalizedText; hue: number; emoji: string }[] = [
  { caption: L("Zamonaviy sinfxonalar", "Современные классы", "Modern classrooms"), hue: 250, emoji: "🏫" },
  { caption: L("Robototexnika laboratoriyasi", "Лаборатория робототехники", "Robotics lab"), hue: 190, emoji: "🤖" },
  { caption: L("Sport zali", "Спортзал", "Sports hall"), hue: 20, emoji: "🏀" },
  { caption: L("Kutubxona", "Библиотека", "Library"), hue: 150, emoji: "📚" },
  { caption: L("San'at studiyasi", "Арт-студия", "Art studio"), hue: 330, emoji: "🎨" },
  { caption: L("Oshxona", "Столовая", "Canteen"), hue: 45, emoji: "🍽️" },
  { caption: L("Hovli va o'yin maydoni", "Двор и игровая площадка", "Courtyard & playground"), hue: 120, emoji: "🌳" },
  { caption: L("Aktovy zal", "Актовый зал", "Assembly hall"), hue: 280, emoji: "🎭" },
];

export type StaffData = {
  id: string;
  is_administration: boolean;
  full_name: LocalizedText;
  position: LocalizedText;
  subject_key: string | null;
  bio: LocalizedText;
  experience_years: number;
  certificates: string[];
  photo_url: string | null;
  intro_video_url: string | null;
  sort_order: number;
};

export const SUBJECT_LABELS: Record<string, LocalizedText> = {
  math: L("Matematika", "Математика", "Mathematics"),
  physics: L("Fizika", "Физика", "Physics"),
  english: L("Ingliz tili", "Английский язык", "English"),
  informatics: L("Informatika", "Информатика", "Computer science"),
  chemistry: L("Kimyo", "Химия", "Chemistry"),
  biology: L("Biologiya", "Биология", "Biology"),
  primary: L("Boshlang'ich sinf", "Начальные классы", "Primary"),
  art: L("San'at", "Искусство", "Art"),
};

export const DEMO_STAFF: StaffData[] = [
  { id: "s1", is_administration: true, sort_order: 1, full_name: L("Dilnoza Karimova", "Дильноза Каримова", "Dilnoza Karimova"), position: L("Direktor", "Директор", "Director"), subject_key: null, experience_years: 22, certificates: ["MBA Education", "Cambridge Leadership"], photo_url: null, intro_video_url: null, bio: L("22 yillik ta'lim boshqaruvi tajribasi. Maktabning asoschisi.", "22 года опыта управления образованием. Основатель школы.", "22 years in education management. Founder of the school.") },
  { id: "s2", is_administration: true, sort_order: 2, full_name: L("Rustam Aliyev", "Рустам Алиев", "Rustam Aliyev"), position: L("O'quv ishlari bo'yicha direktor o'rinbosari", "Заместитель директора по учебной работе", "Deputy Director for Academics"), subject_key: null, experience_years: 15, certificates: ["IB Coordinator"], photo_url: null, intro_video_url: null, bio: L("O'quv dasturlari va sifat nazorati uchun mas'ul.", "Отвечает за учебные программы и контроль качества.", "Responsible for curricula and quality assurance.") },
  { id: "s3", is_administration: true, sort_order: 3, full_name: L("Malika Yusupova", "Малика Юсупова", "Malika Yusupova"), position: L("Maktab psixologi", "Школьный психолог", "School psychologist"), subject_key: null, experience_years: 11, certificates: ["MSc Psychology"], photo_url: null, intro_video_url: null, bio: L("Bolalar rivojlanishi va oila bilan hamkorlik.", "Развитие детей и работа с семьёй.", "Child development and family partnership.") },
  { id: "t1", is_administration: false, sort_order: 10, full_name: L("Sardor Tursunov", "Сардор Турсунов", "Sardor Tursunov"), position: L("Matematika o'qituvchisi", "Учитель математики", "Mathematics teacher"), subject_key: "math", experience_years: 12, certificates: ["Olympiad coach", "Cambridge Math"], photo_url: null, intro_video_url: "https://www.youtube.com/embed/aqz-KE-bpKQ", bio: L("Xalqaro olimpiada g'oliblarini tayyorlagan.", "Подготовил призёров международных олимпиад.", "Coached international olympiad medalists.") },
  { id: "t2", is_administration: false, sort_order: 11, full_name: L("Nigora Rahimova", "Нигора Рахимова", "Nigora Rahimova"), position: L("Ingliz tili o'qituvchisi", "Учитель английского языка", "English teacher"), subject_key: "english", experience_years: 9, certificates: ["CELTA", "IELTS 8.5"], photo_url: null, intro_video_url: null, bio: L("CELTA sertifikatli, IELTS tayyorlov mutaxassisi.", "Сертифицирована CELTA, специалист по подготовке к IELTS.", "CELTA certified IELTS preparation specialist.") },
  { id: "t3", is_administration: false, sort_order: 12, full_name: L("Bobur Hakimov", "Бобур Хакимов", "Bobur Hakimov"), position: L("Informatika va robototexnika", "Информатика и робототехника", "Informatics & robotics"), subject_key: "informatics", experience_years: 7, certificates: ["Google Certified Educator", "FIRST LEGO League"], photo_url: null, intro_video_url: "https://www.youtube.com/embed/aqz-KE-bpKQ", bio: L("Robototexnika jamoasi murabbiyi.", "Тренер школьной команды по робототехнике.", "Coach of the school robotics team.") },
  { id: "t4", is_administration: false, sort_order: 13, full_name: L("Zarina Ismoilova", "Зарина Исмоилова", "Zarina Ismoilova"), position: L("Fizika o'qituvchisi", "Учитель физики", "Physics teacher"), subject_key: "physics", experience_years: 14, certificates: ["PhD Physics"], photo_url: null, intro_video_url: null, bio: L("Tajribalarga boy, qiziqarli darslar.", "Яркие уроки, богатые экспериментами.", "Experiment-rich, engaging lessons.") },
  { id: "t5", is_administration: false, sort_order: 14, full_name: L("Gulnora Saidova", "Гульнора Саидова", "Gulnora Saidova"), position: L("Boshlang'ich sinf o'qituvchisi", "Учитель начальных классов", "Primary teacher"), subject_key: "primary", experience_years: 16, certificates: ["Montessori Diploma"], photo_url: null, intro_video_url: null, bio: L("Montessori metodikasi mutaxassisi.", "Специалист по методике Монтессори.", "Montessori method specialist.") },
  { id: "t6", is_administration: false, sort_order: 15, full_name: L("Jasur Normatov", "Жасур Норматов", "Jasur Normatov"), position: L("Kimyo va biologiya", "Химия и биология", "Chemistry & biology"), subject_key: "chemistry", experience_years: 10, certificates: ["Science Olympiad Judge"], photo_url: null, intro_video_url: null, bio: L("Laboratoriya amaliyotiga urg'u beradi.", "Делает упор на лабораторную практику.", "Emphasises hands-on lab practice.") },
  { id: "t7", is_administration: false, sort_order: 16, full_name: L("Madina Qodirova", "Мадина Кодирова", "Madina Kodirova"), position: L("San'at o'qituvchisi", "Учитель искусства", "Art teacher"), subject_key: "art", experience_years: 8, certificates: ["BA Fine Arts"], photo_url: null, intro_video_url: null, bio: L("Ko'rgazmalar tashkilotchisi.", "Организатор школьных выставок.", "Organiser of school exhibitions.") },
];

export type AchievementData = {
  id: string;
  student_name: LocalizedText;
  grade_or_grad_year: string;
  achievement_title: LocalizedText;
  description: LocalizedText;
  university_accepted: LocalizedText | null;
  photo_url: string | null;
  certificate_url: string | null;
  category: "olympiad" | "sport" | "art" | "graduate";
};

export const DEMO_ACHIEVEMENTS: AchievementData[] = [
  { id: "a1", category: "olympiad", student_name: L("Azizbek Rustamov", "Азизбек Рустамов", "Azizbek Rustamov"), grade_or_grad_year: "10", achievement_title: L("Xalqaro matematika olimpiadasi — oltin medal", "Международная олимпиада по математике — золото", "International Math Olympiad — gold medal"), description: L("Respublika bosqichida 1-o'rin.", "1 место на республиканском этапе.", "1st place at the national stage."), university_accepted: null, photo_url: null, certificate_url: null },
  { id: "a2", category: "olympiad", student_name: L("Sevinch Karimova", "Севинч Каримова", "Sevinch Karimova"), grade_or_grad_year: "8", achievement_title: L("Fizika bo'yicha respublika olimpiadasi — 2-o'rin", "Республиканская олимпиада по физике — 2 место", "National Physics Olympiad — 2nd place"), description: L("Eksperimental turda eng yuqori ball.", "Лучший балл в экспериментальном туре.", "Top score in the experimental round."), university_accepted: null, photo_url: null, certificate_url: null },
  { id: "a3", category: "olympiad", student_name: L("Timur Ergashev", "Тимур Эргашев", "Timur Ergashev"), grade_or_grad_year: "11", achievement_title: L("Informatika olimpiadasi — kumush medal", "Олимпиада по информатике — серебро", "Informatics Olympiad — silver medal"), description: L("IOI saralash bosqichi finalisti.", "Финалист отборочного этапа IOI.", "Finalist of the IOI selection stage."), university_accepted: null, photo_url: null, certificate_url: null },
  { id: "a4", category: "sport", student_name: L("Jahongir Sobirov", "Жахонгир Собиров", "Jahongir Sobirov"), grade_or_grad_year: "9", achievement_title: L("Shaxmat bo'yicha yoshlar chempioni", "Чемпион страны по шахматам среди юношей", "National youth chess champion"), description: L("U-16 toifasida respublika chempioni.", "Чемпион республики в категории U-16.", "National champion in the U-16 category."), university_accepted: null, photo_url: null, certificate_url: null },
  { id: "a5", category: "sport", student_name: L("Laylo Abdullayeva", "Лайло Абдуллаева", "Laylo Abdullayeva"), grade_or_grad_year: "7", achievement_title: L("Suzish — 3 ta oltin medal", "Плавание — 3 золотые медали", "Swimming — 3 gold medals"), description: L("Shahar musobaqalarida.", "На городских соревнованиях.", "At city championships."), university_accepted: null, photo_url: null, certificate_url: null },
  { id: "a6", category: "art", student_name: L("Ruxshona Nazarova", "Рухшона Назарова", "Ruxshona Nazarova"), grade_or_grad_year: "6", achievement_title: L("Xalqaro bolalar rasmlari tanlovi — Grand Prix", "Международный конкурс детского рисунка — Гран-при", "International Children's Art Contest — Grand Prix"), description: L("1500 ishtirokchi ichida g'olib.", "Победитель среди 1500 участников.", "Winner among 1,500 participants."), university_accepted: null, photo_url: null, certificate_url: null },
  { id: "a7", category: "art", student_name: L("«Children's Academy» xori", "Хор «Children's Academy»", "Children's Academy Choir"), grade_or_grad_year: "5–9", achievement_title: L("Respublika xorlar festivali — laureat", "Республиканский фестиваль хоров — лауреат", "National choir festival — laureate"), description: L("40 nafarlik jamoa.", "Коллектив из 40 человек.", "An ensemble of 40."), university_accepted: null, photo_url: null, certificate_url: null },
  { id: "a8", category: "graduate", student_name: L("Dilshod Yo'ldoshev", "Дилшод Юлдашев", "Dilshod Yuldoshev"), grade_or_grad_year: "2024", achievement_title: L("Bitiruvchi — IELTS 8.0", "Выпускник — IELTS 8.0", "Graduate — IELTS 8.0"), description: L("Grant asosida o'qiydi.", "Учится на гранте.", "Studying on a full scholarship."), university_accepted: L("Westminster International University in Tashkent", "Вестминстерский университет в Ташкенте", "Westminster International University in Tashkent"), photo_url: null, certificate_url: null },
  { id: "a9", category: "graduate", student_name: L("Aziza Mirzaeva", "Азиза Мирзаева", "Aziza Mirzaeva"), grade_or_grad_year: "2024", achievement_title: L("Bitiruvchi — to'liq grant", "Выпускница — полный грант", "Graduate — full scholarship"), description: L("SAT 1520 ball.", "SAT 1520 баллов.", "SAT score 1520."), university_accepted: L("Nazarbayev University, Astana", "Назарбаев Университет, Астана", "Nazarbayev University, Astana"), photo_url: null, certificate_url: null },
  { id: "a10", category: "graduate", student_name: L("Otabek Jalilov", "Отабек Жалилов", "Otabek Jalilov"), grade_or_grad_year: "2023", achievement_title: L("Bitiruvchi — Informatika fakulteti", "Выпускник — факультет информатики", "Graduate — Computer Science"), description: L("Xalqaro olimpiadalar ishtirokchisi.", "Участник международных олимпиад.", "International olympiad participant."), university_accepted: L("Inha University in Tashkent", "Университет Инха в Ташкенте", "Inha University in Tashkent"), photo_url: null, certificate_url: null },
  { id: "a11", category: "graduate", student_name: L("Kamola Hasanova", "Камола Хасанова", "Kamola Hasanova"), grade_or_grad_year: "2023", achievement_title: L("Bitiruvchi — tibbiyot", "Выпускница — медицина", "Graduate — Medicine"), description: L("Davlat granti g'olibi.", "Обладатель госгранта.", "State grant holder."), university_accepted: L("Toshkent tibbiyot akademiyasi", "Ташкентская медицинская академия", "Tashkent Medical Academy"), photo_url: null, certificate_url: null },
];

export type OlympiadTeaserData = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  event_date: string;
  location: LocalizedText;
};

export function demoOlympiad(): OlympiadTeaserData {
  return {
    id: "demo-oly",
    title: L("«Children's Academy» ochiq olimpiadasi", "Открытая олимпиада «Children's Academy»", "Children's Academy Open Olympiad"),
    description: L("Matematika, fizika, informatika va ingliz tili bo'yicha 1–11 sinf o'quvchilari uchun.", "По математике, физике, информатике и английскому языку для учеников 1–11 классов.", "In maths, physics, informatics and English for students of grades 1–11."),
    event_date: new Date(Date.now() + 14 * 86400000).toISOString(),
    location: L("Maktab kampusi, Toshkent", "Кампус школы, Ташкент", "School campus, Tashkent"),
  };
}
