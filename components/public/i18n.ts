import type { Locale, LocalizedText } from "@/lib/types";
import { tr } from "@/lib/types";

const L = (uz: string, ru: string, en: string): LocalizedText => ({ uz, ru, en });

export const DICT = {
  // generic
  apply: L("Qabulga yozilish", "Записаться на приём", "Apply for admission"),
  tour: L("Ekskursiyaga yozilish", "Записаться на экскурсию", "Book a campus tour"),
  callback: L("Qayta qo'ng'iroq", "Обратный звонок", "Request a callback"),
  learnMore: L("Batafsil", "Подробнее", "Learn more"),
  viewAll: L("Hammasini ko'rish", "Смотреть все", "View all"),
  all: L("Hammasi", "Все", "All"),
  close: L("Yopish", "Закрыть", "Close"),
  pause: L("To'xtatish", "Приостановить", "Pause"),
  play: L("Davom ettirish", "Продолжить", "Play"),
  prevImage: L("Oldingi rasm", "Предыдущее фото", "Previous photo"),
  nextImage: L("Keyingi rasm", "Следующее фото", "Next photo"),
  gradeWord: L("sinf", "класс", "grades"),
  scroll: L("Pastga", "Вниз", "Scroll"),

  // hero / home
  heroBadge: L("Xususiy maktab · 1–11 sinf", "Частная школа · 1–11 классы", "Private school · Grades 1–11"),
  heroSlogan: L("Bilim. Xarakter. Kelajak.", "Знания. Характер. Будущее.", "Knowledge. Character. Future."),
  programsTitle: L("Ta'lim dasturlari", "Образовательные программы", "Our programs"),
  programsSub: L("Har bir yosh bosqichi uchun alohida o'ylangan yo'l.", "Продуманный путь для каждого возраста.", "A thoughtfully designed path for every age."),
  olyBadge: L("Keyingi olimpiada", "Ближайшая олимпиада", "Next olympiad"),
  olyJoin: L("Ro'yxatdan o'tish", "Зарегистрироваться", "Register now"),
  days: L("kun", "дн", "days"),
  hours: L("soat", "час", "hours"),
  minutes: L("daqiqa", "мин", "min"),
  seconds: L("soniya", "сек", "sec"),
  whyTitle: L("Nega aynan biz?", "Почему мы?", "Why choose us?"),
  whySub: L("Ota-onalar bizni shu sabablarga ko'ra tanlashadi.", "Вот за что нас выбирают родители.", "Here is why parents choose us."),
  testimonialsTitle: L("Ota-onalar fikri", "Отзывы родителей", "What parents say"),
  ctaTitle: L("Farzandingiz kelajagini bugun boshlang", "Начните будущее вашего ребёнка уже сегодня", "Start your child's future today"),
  ctaSub: L("Ariza qoldiring — biz 1 ish kuni ichida bog'lanamiz.", "Оставьте заявку — мы свяжемся в течение 1 рабочего дня.", "Leave a request — we will contact you within 1 business day."),

  // about
  aboutTitle: L("Maktab haqida", "О школе", "About the school"),
  aboutSub: L("Bizning hikoyamiz, qadriyatlarimiz va ustunliklarimiz.", "Наша история, ценности и преимущества.", "Our story, values and strengths."),
  mission: L("Missiya", "Миссия", "Mission"),
  vision: L("Qarash", "Видение", "Vision"),
  history: L("Tarix", "История", "History"),
  timelineTitle: L("Rivojlanish yo'li", "Путь развития", "Our journey"),
  valuesTitle: L("Qadriyatlarimiz", "Наши ценности", "Our values"),
  advantagesTitle: L("Bizning ustunliklar", "Наши преимущества", "Our advantages"),

  // programs
  programsPageTitle: L("Ta'lim dasturlari", "Образовательные программы", "Academic programs"),
  programsPageSub: L("1–4, 5–9 va 10–11 sinflar uchun dasturlar, fanlar va to'garaklar.", "Программы, предметы и кружки для 1–4, 5–9 и 10–11 классов.", "Programs, subjects and clubs for grades 1–4, 5–9 and 10–11."),
  subjects: L("O'quv fanlari", "Учебные предметы", "Subjects"),
  clubs: L("To'garaklar", "Кружки и секции", "Clubs & activities"),
  primary: L("Boshlang'ich (1–4)", "Начальная (1–4)", "Primary (1–4)"),
  middle: L("O'rta (5–9)", "Средняя (5–9)", "Middle (5–9)"),
  high: L("Yuqori (10–11)", "Старшая (10–11)", "High (10–11)"),

  // campus
  campusTitle: L("Maktab hayoti", "Жизнь кампуса", "Campus life"),
  campusSub: L("Kun tartibi, ovqatlanish, xavfsizlik va transport.", "Распорядок дня, питание, безопасность и транспорт.", "Daily routine, meals, safety and transport."),
  menuTitle: L("Haftalik menyu", "Меню на неделю", "Weekly menu"),
  scheduleTitle: L("Kun tartibi", "Распорядок дня", "Daily schedule"),
  securityTitle: L("Xavfsizlik", "Безопасность", "Security"),
  transportTitle: L("Maktab transporti", "Школьный транспорт", "School transport"),
  galleryTitle: L("Galereya", "Галерея", "Gallery"),
  tourTitle: L("360° virtual sayr", "Виртуальный 360° тур", "360° virtual tour"),
  tourFallback: L("Virtual sayr tez orada. Hozircha galereyani ko'ring yoki ekskursiyaga yoziling.", "Виртуальный тур скоро появится. Пока смотрите галерею или запишитесь на экскурсию.", "Virtual tour coming soon. Browse the gallery or book an in-person tour."),

  // team
  teamTitle: L("Bizning jamoa", "Наша команда", "Our team"),
  teamSub: L("Ustozlar — maktabning yuragi.", "Педагоги — сердце школы.", "Teachers are the heart of our school."),
  administration: L("Ma'muriyat", "Администрация", "Administration"),
  teachers: L("O'qituvchilar", "Педагоги", "Teachers"),
  years: L("yil tajriba", "лет опыта", "years of experience"),
  watchIntro: L("Tanishuv videosi", "Видео-знакомство", "Intro video"),
  certificates: L("Sertifikatlar", "Сертификаты", "Certificates"),

  // achievements
  achTitle: L("Yutuqlar", "Достижения", "Achievements"),
  achSub: L("O'quvchilarimiz g'alabalari va bitiruvchilarimiz yo'li.", "Победы учеников и путь выпускников.", "Student victories and graduate journeys."),
  catOlympiad: L("Olimpiadalar", "Олимпиады", "Olympiads"),
  catSport: L("Sport", "Спорт", "Sports"),
  catArt: L("San'at", "Искусство", "Arts"),
  catGraduate: L("Bitiruvchilar", "Выпускники", "Graduates"),
  admittedTo: L("Qabul qilingan:", "Поступил(а):", "Admitted to:"),
  gradeShort: L("sinf", "класс", "grade"),
  graduates: L("Bitiruvchilar → universitetlar", "Выпускники → университеты", "Graduates → universities"),

  // contact
  contactTitle: L("Aloqa", "Контакты", "Contact"),
  contactSub: L("Savollaringiz bormi? Yozing yoki qo'ng'iroq qiling.", "Есть вопросы? Напишите или позвоните.", "Questions? Write or call us."),
  address: L("Manzil", "Адрес", "Address"),
  landmark: L("Mo'ljal", "Ориентир", "Landmark"),
  phones: L("Telefon", "Телефон", "Phone"),
  email: L("E-pochta", "Эл. почта", "Email"),
  hoursLabel: L("Ish vaqti", "Часы работы", "Working hours"),
  directions: L("Qanday borish mumkin", "Как добраться", "How to get here"),
  dirMetro: L("Metro: «Minor» bekatidan 7 daqiqa piyoda yoki 2 bekat avtobus.", "Метро: от станции «Минор» 7 минут пешком или 2 остановки на автобусе.", "Metro: 7 minutes on foot from Minor station, or 2 stops by bus."),
  dirCar: L("Avtomobil: o'z parkovkamiz bor, kirish ko'cha tomondan.", "На авто: собственная парковка, въезд со стороны улицы.", "By car: our own parking lot, entrance from the street."),
  dirBus: L("Avtobus: 45, 67, 82 marshrutlari «Bilimdonlar» bekati.", "Автобус: маршруты 45, 67, 82, остановка «Билимдонлар».", "Bus: routes 45, 67, 82, stop Bilimdonlar."),
  openMap: L("Xaritada ochish", "Открыть на карте", "Open in maps"),
  mapFallback: L("Xarita yuklanmadi", "Карта недоступна", "Map unavailable"),
  formTitle: L("Ariza qoldiring", "Оставьте заявку", "Send a request"),
  typeAdmission: L("Qabul", "Приём", "Admission"),
  typeTour: L("Ekskursiya", "Экскурсия", "Campus tour"),
  typeCallback: L("Qo'ng'iroq", "Звонок", "Callback"),
  parentName: L("Ota-ona ismi", "Имя родителя", "Parent name"),
  childName: L("Bola ismi", "Имя ребёнка", "Child name"),
  targetGrade: L("Qaysi sinfga", "В какой класс", "Target grade"),
  phone: L("Telefon raqami", "Номер телефона", "Phone number"),
  prefLang: L("Qulay til", "Удобный язык", "Preferred language"),
  message: L("Xabar (ixtiyoriy)", "Сообщение (необязательно)", "Message (optional)"),
  privacyNote: L(
    "Yuborish orqali ma'lumotlaringiz (bola ismi va sinfi ham) faqat qabul jarayoni uchun ishlatilishiga rozilik bildirasiz. Batafsil:",
    "Отправляя форму, вы соглашаетесь, что данные (включая имя и класс ребёнка) используются только для приёма. Подробнее:",
    "By submitting you agree that your details (including your child's name and grade) are used only for admissions. Read our",
  ),
  privacyLink: L("Maxfiylik siyosati", "Политика конфиденциальности", "Privacy statement"),
  submit: L("Yuborish", "Отправить", "Submit"),
  sending: L("Yuborilmoqda…", "Отправка…", "Sending…"),
  success: L("Rahmat! Arizangiz qabul qilindi. Tez orada bog'lanamiz.", "Спасибо! Заявка принята. Мы скоро свяжемся с вами.", "Thank you! Your request was received. We will contact you soon."),
  errGeneric: L("Xatolik yuz berdi. Qayta urinib ko'ring.", "Произошла ошибка. Попробуйте ещё раз.", "Something went wrong. Please try again."),
  errRate: L("Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.", "Слишком много попыток. Повторите позже.", "Too many attempts. Please try again later."),
  errName: L("Ismni kiriting (kamida 2 belgi)", "Введите имя (минимум 2 символа)", "Enter a name (at least 2 characters)"),
  errPhone: L("Telefon raqami noto'g'ri", "Неверный номер телефона", "Invalid phone number"),
  errGrade: L("Sinf 1 dan 11 gacha", "Класс от 1 до 11", "Grade must be 1–11"),
  newRequest: L("Yangi ariza", "Новая заявка", "New request"),
  optional: L("ixtiyoriy", "необязательно", "optional"),
} satisfies Record<string, LocalizedText>;

export type DictKey = keyof typeof DICT;

export function makeT(locale: Locale) {
  return (key: DictKey): string => tr(DICT[key], locale);
}

export type Tfn = ReturnType<typeof makeT>;

/* ---------- structured content ---------- */

export const TESTIMONIALS: { name: LocalizedText; role: LocalizedText; text: LocalizedText }[] = [
  { name: L("Madina Rahimova", "Мадина Рахимова", "Madina Rahimova"), role: L("2-sinf o'quvchisi onasi", "Мама ученика 2 класса", "Mother of a 2nd grader"), text: L("Qizim maktabga zavq bilan boradi. Ustozlar har bir bolaga alohida e'tibor berishadi.", "Дочь идёт в школу с радостью. Педагоги уделяют внимание каждому ребёнку.", "My daughter enjoys going to school. Teachers give every child personal attention.") },
  { name: L("Anvar Qodirov", "Анвар Кадыров", "Anvar Kadyrov"), role: L("8-sinf o'quvchisi otasi", "Папа ученика 8 класса", "Father of an 8th grader"), text: L("O'g'lim robototexnika va ingliz tilida katta yutuqlarga erishdi. Ta'lim darajasi a'lo.", "Сын добился больших успехов в робототехнике и английском. Уровень образования отличный.", "My son made great progress in robotics and English. The standard of education is excellent.") },
  { name: L("Shahlo Umarova", "Шахло Умарова", "Shahlo Umarova"), role: L("Bitiruvchi onasi", "Мама выпускника", "Graduate's mother"), text: L("Bitiruvchimiz xorijdagi universitetga grant bilan kirdi. Rahmat butun jamoaga!", "Наш выпускник поступил в зарубежный вуз на грант. Спасибо всей команде!", "Our graduate won a scholarship abroad. Thank you to the entire team!") },
];

export const WHY_US: { icon: string; title: LocalizedText; text: LocalizedText }[] = [
  { icon: "users", title: L("Kichik sinflar", "Малые классы", "Small classes"), text: L("Har bir sinfda maksimum 16 o'quvchi.", "Максимум 16 учеников в классе.", "A maximum of 16 students per class.") },
  { icon: "globe", title: L("Uch tilda ta'lim", "Три языка обучения", "Trilingual education"), text: L("O'zbek, rus va ingliz tillari kundalik muhitda.", "Узбекский, русский и английский в повседневной среде.", "Uzbek, Russian and English in everyday life.") },
  { icon: "cpu", title: L("STEM va IT", "STEM и IT", "STEM & IT"), text: L("Robototexnika, dasturlash va AI darslari.", "Уроки робототехники, программирования и ИИ.", "Robotics, programming and AI classes.") },
  { icon: "shield", title: L("Xavfsiz muhit", "Безопасная среда", "Safe environment"), text: L("Videokuzatuv, nazorat va tibbiy xizmat.", "Видеонаблюдение, контроль и медслужба.", "CCTV, access control and medical care.") },
  { icon: "heart", title: L("Psixologik yordam", "Психологическая поддержка", "Psychological care"), text: L("Maktab psixologi va rivojlanish testlari.", "Школьный психолог и тесты развития.", "A school psychologist and development tests.") },
  { icon: "award", title: L("Natijalar", "Результаты", "Proven results"), text: L("Olimpiada g'oliblari va yetakchi universitetlarga qabul.", "Победители олимпиад и поступление в ведущие вузы.", "Olympiad winners and admissions to leading universities.") },
];

export const TIMELINE: { year: string; title: LocalizedText; text: LocalizedText }[] = [
  { year: "2013", title: L("Asos solindi", "Основание", "Founded"), text: L("Birinchi 40 o'quvchi bilan eshiklarimiz ochildi.", "Мы открыли двери для первых 40 учеников.", "We opened our doors to the first 40 students.") },
  { year: "2016", title: L("Yangi kampus", "Новый кампус", "New campus"), text: L("Zamonaviy bino va sport majmuasi qurildi.", "Построено современное здание и спорткомплекс.", "A modern building and sports complex were built.") },
  { year: "2018", title: L("Birinchi bitiruv", "Первый выпуск", "First graduation"), text: L("11-sinf bitiruvchilarining 100% i oliy o'quv yurtiga kirdi.", "100% выпускников 11 класса поступили в вузы.", "100% of our first graduates entered universities.") },
  { year: "2020", title: L("Raqamli ta'lim", "Цифровое обучение", "Digital learning"), text: L("Onlayn platforma va robototexnika laboratoriyasi ishga tushdi.", "Запущены онлайн-платформа и лаборатория робототехники.", "Online platform and robotics lab launched.") },
  { year: "2023", title: L("Xalqaro hamkorlik", "Международное партнёрство", "International partnerships"), text: L("Cambridge va IB dasturlari bilan hamkorlik boshlandi.", "Начато сотрудничество с программами Cambridge и IB.", "Partnerships with Cambridge and IB programs began.") },
  { year: "2026", title: L("Children's Academy", "Children's Academy", "Children's Academy"), text: L("Yangi avlod platformasi: testlar, olimpiadalar va aqliy o'yinlar.", "Платформа нового поколения: тесты, олимпиады и игры для ума.", "A next-gen platform: quizzes, olympiads and brain games.") },
];

export const VALUES: { icon: string; title: LocalizedText; text: LocalizedText }[] = [
  { icon: "book", title: L("Bilimga intilish", "Стремление к знаниям", "Love of learning"), text: L("Qiziqish — o'qishning dvigateli.", "Любопытство — двигатель обучения.", "Curiosity drives learning.") },
  { icon: "heart", title: L("Hurmat", "Уважение", "Respect"), text: L("Bir-birimizga va madaniyatimizga hurmat.", "Уважение друг к другу и к нашей культуре.", "Respect for each other and our culture.") },
  { icon: "rocket", title: L("Innovatsiya", "Инновации", "Innovation"), text: L("Yangi usullar va texnologiyalarga ochiqlik.", "Открытость новым методам и технологиям.", "Openness to new methods and technology.") },
  { icon: "shield", title: L("Mas'uliyat", "Ответственность", "Responsibility"), text: L("Har bir qaror uchun javobgarlik.", "Ответственность за каждое решение.", "Ownership of every decision.") },
];

export const CLUBS: { icon: string; name: LocalizedText; text: LocalizedText }[] = [
  { icon: "flask", name: L("STEM laboratoriyasi", "STEM-лаборатория", "STEM lab"), text: L("Tajribalar, 3D modellash, muhandislik.", "Эксперименты, 3D-моделирование, инженерия.", "Experiments, 3D modelling, engineering.") },
  { icon: "code", name: L("IT va dasturlash", "IT и программирование", "IT & coding"), text: L("Python, veb va o'yin yaratish.", "Python, веб и создание игр.", "Python, web and game development.") },
  { icon: "languages", name: L("Tillar klubi", "Языковой клуб", "Language club"), text: L("Ingliz, rus, koreys va xitoy tillari.", "Английский, русский, корейский и китайский.", "English, Russian, Korean and Chinese.") },
  { icon: "bot", name: L("Robototexnika", "Робототехника", "Robotics"), text: L("LEGO, Arduino va musobaqalar.", "LEGO, Arduino и соревнования.", "LEGO, Arduino and competitions.") },
  { icon: "palette", name: L("San'at studiyasi", "Арт-студия", "Art studio"), text: L("Rasm, keramika va teatr.", "Живопись, керамика и театр.", "Painting, ceramics and theatre.") },
  { icon: "trophy", name: L("Sport seksiyalari", "Спортивные секции", "Sports"), text: L("Futbol, suzish, shaxmat, taekvondo.", "Футбол, плавание, шахматы, тхэквондо.", "Football, swimming, chess, taekwondo.") },
];
