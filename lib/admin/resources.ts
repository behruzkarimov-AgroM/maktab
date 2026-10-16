// Schema-driven resource registry for the CMS. Client-safe.
import { SURVEY_RESOURCES, surveyQuestionFields } from "./survey-resources";
import { l, type AdminRole, type Field, type Option, type ResourceDef } from "./types";

const SA: AdminRole = "super_admin";
const ME: AdminRole = "methodist";
const PS: AdminRole = "psychologist";

const active: Field = {
  name: "is_active",
  type: "boolean",
  label: l("Faol", "Активно", "Active"),
  defaultValue: true,
  half: true,
};
const sortOrder: Field = {
  name: "sort_order",
  type: "number",
  int: true,
  label: l("Tartib raqami", "Порядок", "Sort order"),
  defaultValue: 0,
  half: true,
};

const loc = (name: string, uz: string, ru: string, en: string, extra: Partial<Field> = {}): Field => ({
  name,
  type: "localized",
  label: l(uz, ru, en),
  ...extra,
});
const locArea = (name: string, uz: string, ru: string, en: string, extra: Partial<Field> = {}): Field => ({
  name,
  type: "localizedArea",
  label: l(uz, ru, en),
  ...extra,
});

export const gradeOptions: Option[] = Array.from({ length: 11 }, (_, i) => ({
  value: String(i + 1),
  label: l(`${i + 1}-sinf`, `${i + 1} класс`, `Grade ${i + 1}`),
}));

export const difficultyOptions: Option[] = [
  { value: "easy", label: l("Oson", "Легко", "Easy"), tone: "green" },
  { value: "medium", label: l("O'rta", "Средне", "Medium"), tone: "amber" },
  { value: "hard", label: l("Qiyin", "Сложно", "Hard"), tone: "red" },
];

export const registrationStatus: Option[] = [
  { value: "pending", label: l("Kutilmoqda", "Ожидает", "Pending"), tone: "amber" },
  { value: "confirmed", label: l("Tasdiqlangan", "Подтверждено", "Confirmed"), tone: "blue" },
  { value: "attended", label: l("Qatnashdi", "Участвовал", "Attended"), tone: "green" },
  { value: "disqualified", label: l("Diskvalifikatsiya", "Дисквалифицирован", "Disqualified"), tone: "red" },
];

export const applicationStatus: Option[] = [
  { value: "new", label: l("Yangi", "Новая", "New"), tone: "blue" },
  { value: "contacted", label: l("Bog'lanildi", "Связались", "Contacted"), tone: "amber" },
  { value: "interview_scheduled", label: l("Suhbat belgilandi", "Собеседование назначено", "Interview scheduled"), tone: "violet" },
  { value: "accepted", label: l("Qabul qilindi", "Принят", "Accepted"), tone: "green" },
  { value: "rejected", label: l("Rad etildi", "Отклонён", "Rejected"), tone: "red" },
];

const categoryOptions: Option[] = [
  { value: "primary", label: l("Boshlang'ich (1-4)", "Начальная (1-4)", "Primary (1-4)") },
  { value: "middle", label: l("O'rta (5-9)", "Средняя (5-9)", "Middle (5-9)") },
  { value: "high", label: l("Yuqori (10-11)", "Старшая (10-11)", "High (10-11)") },
];

export const topicOptions: Option[] = [
  { value: "interests", label: l("Qiziqishlar", "Интересы", "Interests"), tone: "blue" },
  { value: "temperament", label: l("Temperament", "Темперамент", "Temperament"), tone: "amber" },
  { value: "career", label: l("Kasb tanlash", "Профориентация", "Career"), tone: "violet" },
  { value: "readiness", label: l("Maktabga tayyorlik", "Готовность к школе", "Readiness"), tone: "green" },
  { value: "emotional", label: l("Emotsional holat", "Эмоциональное состояние", "Emotional"), tone: "red" },
];
export const audienceOptions: Option[] = [
  { value: "kids", label: l("Bolalar", "Дети", "Kids") },
  { value: "teens", label: l("O'smirlar", "Подростки", "Teens") },
  { value: "older", label: l("Katta yoshdagilar", "Старшеклассники", "Older students") },
  { value: "parents", label: l("Ota-onalar", "Родители", "Parents") },
];

const GRID_LABEL: Record<string, ReturnType<typeof l>> = {
  "schulte-table": l("Jadval tomoni (N×N)", "Сторона сетки (N×N)", "Grid side (N×N)"),
  "memory-matrix": l("Boshlang'ich o'lcham", "Начальный размер", "Starting size"),
  "mental-math": l("Maksimal operand", "Максимальный операнд", "Max operand"),
  "stroop-test": l("Ranglar soni", "Количество цветов", "Number of colors"),
  "logic-seq": l("Murakkablik (1-3)", "Сложность (1-3)", "Complexity (1-3)"),
  "matching-pairs": l("Raunddagi juftlar (4-12)", "Пар в раунде (4-12)", "Pairs per round (4-12)"),
  "true-false": l("Jonlar soni", "Количество жизней", "Lives"),
  "quiz-race": l("Raunddagi savollar soni (vaqt = har savolga soniya)", "Вопросов в раунде (время = секунд на вопрос)", "Questions per round (time = seconds per question)"),
};

/** Fields for the form; brain_games `grid` is labelled per game. */
export function fieldsFor(res: ResourceDef, values: Record<string, unknown>): Field[] {
  if (res.key === "survey_questions") return surveyQuestionFields(res.fields, values.type);
  if (res.key !== "brain_games") return res.fields;
  const label = GRID_LABEL[String(values.game_slug)];
  if (!label) return res.fields;
  const fix = (fs: Field[]): Field[] => fs.map((f) => (f.name === "grid" ? { ...f, label, max: 200 } : f.fields ? { ...f, fields: fix(f.fields) } : f));
  return fix(res.fields);
}

const subjectsRepeater =(): Field => ({
  name: "subjects",
  type: "repeater",
  label: l("Fanlar", "Предметы", "Subjects"),
  itemLabel: l("Fan", "Предмет", "Subject"),
  fields: [
    { name: "key", type: "text", label: l("Kalit (slug)", "Ключ (slug)", "Key (slug)"), required: true, half: true },
    loc("name", "Nomi", "Название", "Name", { required: true }),
  ],
});

export const RESOURCES: ResourceDef[] = [
  {
    key: "site_settings",
    table: "site_settings",
    label: l("Sayt sozlamalari", "Настройки сайта", "Site settings"),
    singular: l("Sozlamalar", "Настройки", "Settings"),
    icon: "Settings",
    group: "content",
    read: [SA, ME],
    write: [SA, ME],
    singleton: true,
    titleField: "school_name",
    columns: [{ name: "school_name", kind: "loc" }],
    search: [],
    sort: { field: "id", dir: "asc" },
    canCreate: false,
    canDelete: false,
    fields: [
      loc("school_name", "Maktab nomi", "Название школы", "School name", {
        required: true,
        section: l("Bosh sahifa (Hero)", "Главная (Hero)", "Home (Hero)"),
      }),
      loc("hero_title", "Hero sarlavha", "Заголовок Hero", "Hero title", { required: true }),
      locArea("hero_subtitle", "Hero qo'shimcha matn", "Подзаголовок Hero", "Hero subtitle"),
      { name: "hero_video_url", type: "url", label: l("Hero video URL", "URL видео Hero", "Hero video URL"), half: true },
      { name: "hero_image_url", type: "image", bucket: "school-media", label: l("Hero rasm", "Изображение Hero", "Hero image"), half: true },
      {
        name: "stats",
        type: "repeater",
        section: l("Statistika hisoblagichlari", "Счётчики статистики", "Stats counters"),
        label: l("Statistika", "Статистика", "Stats"),
        itemLabel: l("Ko'rsatkich", "Показатель", "Stat"),
        fields: [
          { name: "key", type: "text", label: l("Kalit", "Ключ", "Key"), required: true, half: true },
          { name: "value", type: "number", label: l("Qiymat", "Значение", "Value"), required: true, half: true },
          { name: "suffix", type: "text", label: l("Qo'shimcha (+, %)", "Суффикс (+, %)", "Suffix (+, %)"), half: true },
          loc("label", "Yozuv", "Подпись", "Label", { required: true }),
        ],
      },
      locArea("about_mission", "Missiya", "Миссия", "Mission", { section: l("Maktab haqida", "О школе", "About") }),
      locArea("about_vision", "Vizyon", "Видение", "Vision"),
      locArea("about_history", "Tarix", "История", "History"),
      loc("address", "Manzil", "Адрес", "Address", { section: l("Aloqa", "Контакты", "Contacts") }),
      loc("landmark", "Mo'ljal", "Ориентир", "Landmark"),
      { name: "phones", type: "stringList", label: l("Telefonlar", "Телефоны", "Phones"), placeholder: "+998 90 123 45 67" },
      { name: "email", type: "email", label: l("E-pochta", "E-mail", "Email"), half: true },
      loc("working_hours", "Ish vaqti", "Часы работы", "Working hours"),
      { name: "map_lat", type: "number", step: 0.000001, label: l("Xarita: kenglik", "Карта: широта", "Map latitude"), half: true },
      { name: "map_lng", type: "number", step: 0.000001, label: l("Xarita: uzunlik", "Карта: долгота", "Map longitude"), half: true },
      { name: "map_embed_url", type: "url", label: l("Xarita (embed URL)", "Карта (embed URL)", "Map embed URL") },
      {
        name: "social_links",
        type: "group",
        section: l("Ijtimoiy tarmoqlar va tur", "Соцсети и тур", "Socials & tour"),
        label: l("Ijtimoiy tarmoqlar", "Соцсети", "Social links"),
        fields: [
          { name: "telegram", type: "url", label: l("Telegram", "Telegram", "Telegram"), half: true },
          { name: "instagram", type: "url", label: l("Instagram", "Instagram", "Instagram"), half: true },
          { name: "youtube", type: "url", label: l("YouTube", "YouTube", "YouTube"), half: true },
          { name: "facebook", type: "url", label: l("Facebook", "Facebook", "Facebook"), half: true },
        ],
      },
      { name: "virtual_tour_url", type: "url", label: l("Virtual tur URL", "URL виртуального тура", "Virtual tour URL") },
    ],
  },
  {
    key: "programs",
    table: "programs",
    label: l("Dasturlar", "Программы", "Programs"),
    singular: l("Dastur", "Программа", "Program"),
    icon: "GraduationCap",
    group: "content",
    read: [SA, ME],
    write: [SA, ME],
    titleField: "title",
    activeField: "is_active",
    columns: [
      { name: "cover_image_url", kind: "image" },
      { name: "title", kind: "loc", sortable: true },
      { name: "category", kind: "badge" },
      { name: "grade_range", kind: "text" },
      { name: "sort_order", kind: "num", sortable: true },
      { name: "is_active", kind: "bool" },
    ],
    search: ["title", "grade_range"],
    sort: { field: "sort_order", dir: "asc" },
    fields: [
      loc("title", "Sarlavha", "Название", "Title", { required: true }),
      { name: "category", type: "select", options: categoryOptions, label: l("Kategoriya", "Категория", "Category"), required: true, half: true, defaultValue: "primary" },
      { name: "grade_range", type: "text", label: l("Sinflar (masalan 1-4)", "Классы (напр. 1-4)", "Grades (e.g. 1-4)"), half: true },
      locArea("short_description", "Qisqa tavsif", "Краткое описание", "Short description", { required: true }),
      locArea("full_content", "To'liq matn", "Полное описание", "Full content"),
      subjectsRepeater(),
      { name: "icon_name", type: "text", label: l("Ikonka nomi (lucide)", "Иконка (lucide)", "Icon name (lucide)"), half: true },
      { name: "cover_image_url", type: "image", bucket: "school-media", label: l("Muqova rasmi", "Обложка", "Cover image") },
      sortOrder,
      active,
    ],
  },
  {
    key: "campus_life",
    table: "campus_life",
    label: l("Kampus hayoti", "Жизнь кампуса", "Campus life"),
    singular: l("Bo'lim", "Раздел", "Section"),
    icon: "Building2",
    group: "content",
    read: [SA, ME],
    write: [SA, ME],
    titleField: "title",
    activeField: "is_active",
    columns: [
      { name: "title", kind: "loc", sortable: true },
      { name: "section_key", kind: "badge" },
      { name: "sort_order", kind: "num", sortable: true },
      { name: "is_active", kind: "bool" },
    ],
    search: ["title", "section_key"],
    sort: { field: "sort_order", dir: "asc" },
    fields: [
      {
        name: "section_key",
        type: "select",
        required: true,
        label: l("Bo'lim kaliti", "Ключ раздела", "Section key"),
        createOnly: true,
        options: [
          { value: "kitchen", label: l("Oshxona", "Кухня", "Kitchen") },
          { value: "security", label: l("Xavfsizlik", "Безопасность", "Security") },
          { value: "transport", label: l("Transport", "Транспорт", "Transport") },
          { value: "schedule", label: l("Kun tartibi", "Расписание дня", "Schedule") },
        ],
      },
      loc("title", "Sarlavha", "Заголовок", "Title", { required: true }),
      locArea("description", "Tavsif", "Описание", "Description", { required: true }),
      { name: "gallery_urls", type: "imageList", bucket: "school-media", label: l("Galereya", "Галерея", "Gallery") },
      sortOrder,
      active,
    ],
  },
  {
    key: "staff_members",
    table: "staff_members",
    label: l("Jamoa", "Команда", "Team"),
    singular: l("Xodim", "Сотрудник", "Staff member"),
    icon: "Users",
    group: "content",
    read: [SA, ME],
    write: [SA, ME],
    titleField: "full_name",
    activeField: "is_active",
    columns: [
      { name: "photo_url", kind: "image" },
      { name: "full_name", kind: "loc", sortable: true },
      { name: "position", kind: "loc" },
      { name: "is_administration", kind: "bool", label: l("Ma'muriyat", "Администрация", "Admin") },
      { name: "experience_years", kind: "num", sortable: true },
      { name: "is_active", kind: "bool" },
    ],
    search: ["full_name", "position", "subject_key"],
    sort: { field: "sort_order", dir: "asc" },
    fields: [
      loc("full_name", "F.I.Sh.", "ФИО", "Full name", { required: true }),
      loc("position", "Lavozim", "Должность", "Position", { required: true }),
      { name: "is_administration", type: "boolean", label: l("Ma'muriyat a'zosi", "Администрация", "Administration"), half: true },
      { name: "subject_key", type: "text", label: l("Fan kaliti", "Ключ предмета", "Subject key"), half: true },
      locArea("bio", "Biografiya", "Биография", "Bio"),
      { name: "experience_years", type: "number", int: true, min: 0, max: 70, label: l("Tajriba (yil)", "Опыт (лет)", "Experience (years)"), half: true },
      { name: "photo_url", type: "image", bucket: "school-media", label: l("Rasm", "Фото", "Photo") },
      { name: "intro_video_url", type: "url", label: l("Tanishtiruv video URL", "URL видео-визитки", "Intro video URL") },
      { name: "certificates", type: "imageList", bucket: "certificates", label: l("Sertifikatlar", "Сертификаты", "Certificates") },
      sortOrder,
      active,
    ],
  },
  {
    key: "student_achievements",
    table: "student_achievements",
    label: l("Yutuqlar", "Достижения", "Achievements"),
    singular: l("Yutuq", "Достижение", "Achievement"),
    icon: "Trophy",
    group: "content",
    read: [SA, ME],
    write: [SA, ME],
    titleField: "achievement_title",
    activeField: "is_active",
    columns: [
      { name: "photo_url", kind: "image" },
      { name: "student_name", kind: "loc", sortable: true },
      { name: "achievement_title", kind: "loc" },
      { name: "category", kind: "badge" },
      { name: "is_active", kind: "bool" },
    ],
    search: ["student_name", "achievement_title", "grade_or_grad_year"],
    sort: { field: "sort_order", dir: "asc" },
    filters: [
      {
        name: "category",
        label: l("Kategoriya", "Категория", "Category"),
        options: [
          { value: "olympiad", label: l("Olimpiada", "Олимпиада", "Olympiad"), tone: "blue" },
          { value: "sport", label: l("Sport", "Спорт", "Sport"), tone: "green" },
          { value: "art", label: l("San'at", "Искусство", "Art"), tone: "violet" },
          { value: "graduate", label: l("Bitiruvchi", "Выпускник", "Graduate"), tone: "amber" },
        ],
      },
    ],
    fields: [
      loc("student_name", "O'quvchi ismi", "Имя ученика", "Student name", { required: true }),
      { name: "grade_or_grad_year", type: "text", label: l("Sinf / bitirgan yil", "Класс / год выпуска", "Grade / graduation year"), half: true },
      {
        name: "category",
        type: "select",
        required: true,
        half: true,
        defaultValue: "olympiad",
        label: l("Kategoriya", "Категория", "Category"),
        options: [
          { value: "olympiad", label: l("Olimpiada", "Олимпиада", "Olympiad") },
          { value: "sport", label: l("Sport", "Спорт", "Sport") },
          { value: "art", label: l("San'at", "Искусство", "Art") },
          { value: "graduate", label: l("Bitiruvchi", "Выпускник", "Graduate") },
        ],
      },
      loc("achievement_title", "Yutuq nomi", "Название достижения", "Achievement title", { required: true }),
      locArea("description", "Tavsif", "Описание", "Description"),
      loc("university_accepted", "Qabul qilingan universitet", "Университет поступления", "University accepted", { nullable: true }),
      { name: "photo_url", type: "image", bucket: "school-media", label: l("Rasm", "Фото", "Photo"), half: true },
      { name: "certificate_url", type: "image", bucket: "certificates", label: l("Sertifikat", "Сертификат", "Certificate"), half: true },
      sortOrder,
      active,
    ],
  },
  {
    key: "olympiads",
    table: "olympiads",
    label: l("Olimpiadalar", "Олимпиады", "Olympiads"),
    singular: l("Olimpiada", "Олимпиада", "Olympiad"),
    icon: "Medal",
    group: "learn",
    read: [SA, ME],
    write: [SA, ME],
    titleField: "title",
    detail: "olympiad",
    columns: [
      { name: "title", kind: "loc", sortable: true },
      { name: "event_date", kind: "datetime", sortable: true },
      { name: "registration_deadline", kind: "datetime" },
      { name: "is_registration_open", kind: "bool", label: l("Ro'yxat ochiq", "Регистрация", "Reg. open") },
      { name: "is_results_published", kind: "bool", label: l("Natijalar", "Результаты", "Results") },
    ],
    search: ["title"],
    sort: { field: "event_date", dir: "desc" },
    fields: [
      loc("title", "Nomi", "Название", "Title", { required: true }),
      locArea("description", "Tavsif", "Описание", "Description", { required: true }),
      locArea("rules", "Qoidalar", "Правила", "Rules", { nullable: true }),
      subjectsRepeater(),
      { name: "eligible_grades", type: "grades", label: l("Qatnashuvchi sinflar", "Допустимые классы", "Eligible grades") },
      { name: "event_date", type: "datetime", required: true, half: true, label: l("O'tkazilish sanasi", "Дата проведения", "Event date") },
      { name: "registration_deadline", type: "datetime", required: true, half: true, label: l("Ro'yxat muddati", "Крайний срок регистрации", "Registration deadline") },
      loc("location", "Joy", "Место", "Location"),
      { name: "cover_image_url", type: "image", bucket: "school-media", label: l("Muqova", "Обложка", "Cover image") },
      { name: "is_registration_open", type: "boolean", defaultValue: true, half: true, label: l("Ro'yxatdan o'tish ochiq", "Регистрация открыта", "Registration open") },
      { name: "is_results_published", type: "boolean", half: true, label: l("Natijalar e'lon qilingan", "Результаты опубликованы", "Results published") },
    ],
  },
  {
    key: "olympiad_registrations",
    table: "olympiad_registrations",
    label: l("Olimpiada ro'yxati", "Регистрации на олимпиаду", "Olympiad registrations"),
    singular: l("Ro'yxat", "Регистрация", "Registration"),
    icon: "ClipboardList",
    group: "learn",
    read: [SA, ME],
    write: [SA, ME],
    nav: false,
    titleField: "student_full_name",
    parent: { field: "olympiad_id", resource: "olympiads" },
    exportable: true,
    canCreate: false,
    pageSize: 20,
    columns: [
      { name: "ticket_number", kind: "text", sortable: true },
      { name: "student_full_name", kind: "text", sortable: true },
      { name: "grade", kind: "num", sortable: true },
      { name: "subject_key", kind: "text" },
      { name: "parent_phone", kind: "text" },
      { name: "status", kind: "badge", sortable: true },
      { name: "score", kind: "score", sortable: true },
      { name: "rank_place", kind: "num", sortable: true },
      { name: "created_at", kind: "datetime", sortable: true },
    ],
    search: ["ticket_number", "student_full_name", "parent_phone", "current_school"],
    sort: { field: "created_at", dir: "desc" },
    filters: [
      { name: "status", label: l("Holat", "Статус", "Status"), options: registrationStatus },
      { name: "grade", label: l("Sinf", "Класс", "Grade"), options: gradeOptions },
    ],
    fields: [
      { name: "ticket_number", type: "text", readOnly: true, half: true, label: l("Chipta raqami", "Номер билета", "Ticket"), section: l("O'quvchi", "Ученик", "Student") },
      { name: "student_full_name", type: "text", readOnly: true, half: true, label: l("F.I.Sh.", "ФИО", "Full name") },
      { name: "birth_date", type: "date", readOnly: true, half: true, label: l("Tug'ilgan sana", "Дата рождения", "Birth date") },
      { name: "current_school", type: "text", readOnly: true, half: true, label: l("Maktab", "Школа", "School") },
      { name: "grade", type: "number", readOnly: true, half: true, label: l("Sinf", "Класс", "Grade") },
      { name: "subject_key", type: "text", readOnly: true, half: true, label: l("Fan", "Предмет", "Subject") },
      { name: "parent_phone", type: "tel", readOnly: true, half: true, label: l("Ota-ona telefoni", "Телефон родителя", "Parent phone") },
      { name: "extra_phone", type: "tel", readOnly: true, half: true, label: l("Qo'shimcha telefon", "Доп. телефон", "Extra phone") },
      {
        name: "status",
        type: "select",
        options: registrationStatus,
        required: true,
        section: l("Natija", "Результат", "Result"),
        label: l("Holat", "Статус", "Status"),
      },
      { name: "score", type: "number", min: 0, step: 0.5, half: true, label: l("Ball", "Балл", "Score") },
      { name: "max_score", type: "number", min: 1, half: true, defaultValue: 100, label: l("Maksimal ball", "Макс. балл", "Max score") },
      { name: "rank_place", type: "number", int: true, min: 1, half: true, label: l("O'rin", "Место", "Rank") },
    ],
  },
  {
    key: "academic_quizzes",
    table: "academic_quizzes",
    label: l("Fan testlari", "Тесты по предметам", "Academic quizzes"),
    singular: l("Test", "Тест", "Quiz"),
    icon: "FileQuestion",
    group: "learn",
    read: [SA, ME],
    write: [SA, ME],
    titleField: "title",
    activeField: "is_active",
    detail: "quiz",
    columns: [
      { name: "title", kind: "loc", sortable: true },
      { name: "subject_key", kind: "text" },
      { name: "grade", kind: "num", sortable: true },
      { name: "difficulty", kind: "badge" },
      { name: "duration_minutes", kind: "num" },
      { name: "is_active", kind: "bool" },
    ],
    search: ["title", "subject_key"],
    sort: { field: "created_at", dir: "desc" },
    filters: [
      { name: "difficulty", label: l("Qiyinlik", "Сложность", "Difficulty"), options: difficultyOptions },
      { name: "grade", label: l("Sinf", "Класс", "Grade"), options: gradeOptions },
    ],
    fields: [
      loc("title", "Nomi", "Название", "Title", { required: true }),
      locArea("description", "Tavsif", "Описание", "Description", { nullable: true }),
      { name: "subject_key", type: "text", required: true, half: true, label: l("Fan kaliti", "Ключ предмета", "Subject key"), placeholder: "math" },
      loc("subject_name", "Fan nomi", "Название предмета", "Subject name", { required: true }),
      { name: "grade", type: "select", options: gradeOptions, required: true, half: true, defaultValue: "5", label: l("Sinf", "Класс", "Grade") },
      { name: "difficulty", type: "select", options: difficultyOptions, required: true, half: true, defaultValue: "medium", label: l("Qiyinlik", "Сложность", "Difficulty") },
      { name: "duration_minutes", type: "number", int: true, min: 1, max: 240, half: true, defaultValue: 20, label: l("Davomiyligi (daqiqa)", "Длительность (мин)", "Duration (min)") },
      { name: "passing_score_percent", type: "number", int: true, min: 0, max: 100, half: true, defaultValue: 60, label: l("O'tish bali (%)", "Проходной балл (%)", "Passing score (%)") },
      active,
    ],
  },
  {
    key: "academic_questions",
    table: "academic_questions",
    label: l("Test savollari", "Вопросы теста", "Quiz questions"),
    singular: l("Savol", "Вопрос", "Question"),
    icon: "HelpCircle",
    group: "learn",
    read: [SA, ME],
    write: [SA, ME],
    nav: false,
    titleField: "question_text",
    parent: { field: "quiz_id", resource: "academic_quizzes" },
    columns: [{ name: "question_text", kind: "loc" }],
    search: ["question_text"],
    sort: { field: "sort_order", dir: "asc" },
    fields: [
      locArea("question_text", "Savol matni", "Текст вопроса", "Question text", { required: true }),
      { name: "question_image_url", type: "image", bucket: "test-assets", label: l("Savol rasmi", "Изображение вопроса", "Question image") },
      {
        name: "options",
        type: "repeater",
        autoId: "letter",
        minItems: 2,
        maxItems: 6,
        label: l("Javob variantlari", "Варианты ответа", "Answer options"),
        itemLabel: l("Variant", "Вариант", "Option"),
        defaultValue: ["A", "B", "C", "D"].map((id) => ({ id, text: { uz: "", ru: "", en: "" } })),
        fields: [
          { name: "id", type: "text", label: l("ID", "ID", "ID"), readOnly: true, half: true },
          loc("text", "Matn", "Текст", "Text", { required: true }),
        ],
      },
      {
        name: "correct_option_id",
        type: "select",
        required: true,
        half: true,
        defaultValue: "A",
        label: l("To'g'ri javob", "Правильный ответ", "Correct answer"),
        options: ["A", "B", "C", "D", "E", "F"].map((v) => ({ value: v, label: l(v, v, v) })),
      },
      { name: "points", type: "number", int: true, min: 1, max: 100, half: true, defaultValue: 1, label: l("Ball", "Баллы", "Points") },
      locArea("explanation", "Izoh", "Пояснение", "Explanation", { nullable: true }),
      { ...sortOrder, half: false },
    ],
  },
  {
    key: "psych_tests",
    table: "psych_tests",
    label: l("Psixologik testlar", "Психологические тесты", "Psych tests"),
    singular: l("Psixologik test", "Психологический тест", "Psych test"),
    icon: "Brain",
    group: "mind",
    read: [SA, PS],
    write: [SA, PS],
    titleField: "title",
    activeField: "is_active",
    detail: "psych",
    columns: [
      { name: "cover_image_url", kind: "image" },
      { name: "title", kind: "loc", sortable: true },
      { name: "topic", kind: "badge" },
      { name: "target_audience", kind: "badge" },
      { name: "is_active", kind: "bool" },
    ],
    search: ["title"],
    filters: [
      { name: "topic", label: l("Mavzu", "Тема", "Topic"), options: topicOptions },
      { name: "target_audience", label: l("Auditoriya", "Аудитория", "Audience"), options: audienceOptions },
    ],
    sort: { field: "created_at", dir: "desc" },
    fields: [
      loc("title", "Nomi", "Название", "Title", { required: true }),
      locArea("description", "Tavsif", "Описание", "Description", { required: true }),
      locArea("instruction", "Ko'rsatma", "Инструкция", "Instruction", { required: true }),
      { name: "topic", type: "select", required: true, half: true, defaultValue: "interests", label: l("Mavzu", "Тема", "Topic"), options: topicOptions },
      { name: "target_audience", type: "select", required: true, half: true, defaultValue: "kids", label: l("Auditoriya", "Аудитория", "Target audience"), options: audienceOptions },
      { name: "cover_image_url", type: "image", bucket: "test-assets", label: l("Muqova", "Обложка", "Cover image") },
      active,
    ],
  },
  {
    key: "psych_questions",
    table: "psych_questions",
    label: l("Psixologik savollar", "Психологические вопросы", "Psych questions"),
    singular: l("Savol", "Вопрос", "Question"),
    icon: "HelpCircle",
    group: "mind",
    read: [SA, PS],
    write: [SA, PS],
    nav: false,
    titleField: "question_text",
    parent: { field: "psych_test_id", resource: "psych_tests" },
    columns: [{ name: "question_text", kind: "loc" }],
    search: ["question_text"],
    sort: { field: "sort_order", dir: "asc" },
    fields: [
      locArea("question_text", "Savol matni", "Текст вопроса", "Question text", { required: true }),
      { name: "question_image_url", type: "image", bucket: "test-assets", label: l("Savol rasmi", "Изображение вопроса", "Question image") },
      {
        name: "options",
        type: "repeater",
        autoId: "letter",
        minItems: 2,
        maxItems: 8,
        label: l("Variantlar va ballar", "Варианты и баллы", "Options & scores"),
        itemLabel: l("Variant", "Вариант", "Option"),
        defaultValue: ["A", "B", "C"].map((id, i) => ({ id, text: { uz: "", ru: "", en: "" }, score: i })),
        fields: [
          { name: "id", type: "text", label: l("ID", "ID", "ID"), readOnly: true, half: true },
          { name: "score", type: "number", label: l("Ball", "Балл", "Score"), half: true, defaultValue: 0 },
          loc("text", "Matn", "Текст", "Text", { required: true }),
        ],
      },
      { ...sortOrder, half: false },
    ],
  },
  {
    key: "psych_result_scales",
    table: "psych_result_scales",
    label: l("Natija shkalalari", "Шкалы результатов", "Result scales"),
    singular: l("Shkala", "Шкала", "Scale"),
    icon: "BarChart3",
    group: "mind",
    read: [SA, PS],
    write: [SA, PS],
    nav: false,
    titleField: "result_title",
    parent: { field: "psych_test_id", resource: "psych_tests" },
    columns: [{ name: "result_title", kind: "loc" }],
    search: ["result_title"],
    sort: { field: "min_score", dir: "asc" },
    fields: [
      { name: "min_score", type: "number", required: true, half: true, label: l("Min ball", "Мин. балл", "Min score"), defaultValue: 0 },
      { name: "max_score", type: "number", required: true, half: true, label: l("Max ball", "Макс. балл", "Max score"), defaultValue: 10 },
      loc("result_title", "Natija sarlavhasi", "Заголовок результата", "Result title", { required: true }),
      locArea("psychological_analysis", "Psixologik tahlil", "Психологический анализ", "Psychological analysis", { required: true }),
      locArea("recommendations_for_parents", "Ota-onalarga tavsiyalar", "Рекомендации родителям", "Recommendations for parents", { required: true }),
      { name: "badge_color", type: "color", half: true, defaultValue: "#22c55e", label: l("Nishon rangi", "Цвет значка", "Badge color") },
    ],
  },
  ...SURVEY_RESOURCES,
  {
    key: "brain_games",
    table: "brain_games",
    label: l("Miya o'yinlari", "Игры для ума", "Brain games"),
    singular: l("O'yin", "Игра", "Game"),
    icon: "Gamepad2",
    group: "mind",
    // RLS (schema.sql): brain_games write = super_admin + methodist
    read: [SA, ME],
    write: [SA, ME],
    titleField: "title",
    activeField: "is_active",
    canCreate: false,
    canDelete: false,
    columns: [
      { name: "title", kind: "loc", sortable: true },
      { name: "game_slug", kind: "badge" },
      { name: "cognitive_skill", kind: "loc" },
      { name: "sort_order", kind: "num", sortable: true },
      { name: "is_active", kind: "bool" },
    ],
    search: ["title", "game_slug"],
    sort: { field: "sort_order", dir: "asc" },
    fields: [
      { name: "game_slug", type: "text", readOnly: true, half: true, label: l("Slug", "Slug", "Slug") },
      { name: "icon_name", type: "text", half: true, label: l("Ikonka", "Иконка", "Icon") },
      loc("title", "Nomi", "Название", "Title", { required: true }),
      locArea("description", "Tavsif", "Описание", "Description", { required: true }),
      locArea("how_to_play", "Qanday o'ynaladi", "Как играть", "How to play", { required: true }),
      loc("cognitive_skill", "Rivojlanadigan ko'nikma", "Развиваемый навык", "Cognitive skill"),
      {
        name: "config",
        type: "group",
        label: l("Qiyinlik sozlamalari", "Настройки сложности", "Difficulty config"),
        section: l("Qiyinlik sozlamalari", "Настройки сложности", "Difficulty config"),
        fields: (["easy", "medium", "hard"] as const).map(
          (d, i): Field => ({
            name: d,
            type: "group",
            label: difficultyOptions[i].label,
            fields: [
              { name: "grid", type: "number", int: true, min: 1, max: 200, half: true, label: l("Katak / daraja", "Сетка / уровень", "Grid / level") },
              { name: "time_limit", type: "number", int: true, min: 0, max: 3600, half: true, label: l("Vaqt (soniya)", "Время (сек)", "Time limit (s)") },
              { name: "multiplier", type: "number", min: 0, step: 0.1, half: true, label: l("Ko'paytirgich", "Множитель", "Multiplier") },
            ],
          }),
        ),
      },
      sortOrder,
      active,
    ],
  },
  {
    key: "game_leaderboard",
    table: "game_leaderboard",
    label: l("Reyting moderatsiyasi", "Модерация рейтинга", "Leaderboard moderation"),
    singular: l("Natija", "Результат", "Entry"),
    icon: "ListOrdered",
    group: "mind",
    read: [SA, ME],
    write: [SA, ME],
    titleField: "player_name",
    canCreate: false,
    canEdit: false,
    exportable: true,
    clearBy: "game_id",
    columns: [
      { name: "player_name", kind: "text", sortable: true },
      { name: "game_id", kind: "ref", ref: "brain_games", label: l("O'yin", "Игра", "Game") },
      { name: "student_grade", kind: "num" },
      { name: "difficulty", kind: "badge" },
      { name: "score", kind: "num", sortable: true },
      { name: "completion_time_ms", kind: "num", sortable: true },
      { name: "accuracy_percent", kind: "num" },
      { name: "created_at", kind: "datetime", sortable: true },
    ],
    search: ["player_name"],
    sort: { field: "created_at", dir: "desc" },
    filters: [
      { name: "game_id", label: l("O'yin", "Игра", "Game"), ref: "brain_games" },
      { name: "difficulty", label: l("Qiyinlik", "Сложность", "Difficulty"), options: difficultyOptions },
    ],
    fields: [],
  },
  {
    key: "admission_applications",
    table: "admission_applications",
    label: l("Arizalar", "Заявки", "Applications"),
    singular: l("Ariza", "Заявка", "Application"),
    icon: "Inbox",
    group: "system",
    // RLS: all staff read, super_admin + methodist update, only super_admin deletes
    read: [SA, ME, PS],
    write: [SA, ME],
    deleteRoles: [SA],
    titleField: "parent_name",
    canCreate: false,
    exportable: true,
    kanban: { field: "status" },
    columns: [
      { name: "created_at", kind: "datetime", sortable: true },
      { name: "application_type", kind: "badge" },
      { name: "parent_name", kind: "text", sortable: true },
      { name: "child_name", kind: "text" },
      { name: "target_grade", kind: "text" },
      { name: "phone", kind: "text" },
      { name: "preferred_language", kind: "text" },
      { name: "status", kind: "badge", sortable: true },
    ],
    search: ["parent_name", "child_name", "phone"],
    sort: { field: "created_at", dir: "desc" },
    filters: [
      { name: "status", label: l("Holat", "Статус", "Status"), options: applicationStatus },
      {
        name: "application_type",
        label: l("Turi", "Тип", "Type"),
        options: [
          { value: "admission", label: l("Qabul", "Приём", "Admission") },
          { value: "campus_tour", label: l("Kampus turi", "Тур по кампусу", "Campus tour") },
          { value: "callback", label: l("Qayta qo'ng'iroq", "Обратный звонок", "Callback") },
        ],
      },
    ],
    fields: [
      { name: "application_type", type: "text", readOnly: true, half: true, label: l("Turi", "Тип", "Type") },
      { name: "preferred_language", type: "text", readOnly: true, half: true, label: l("Til", "Язык", "Language") },
      { name: "parent_name", type: "text", readOnly: true, half: true, label: l("Ota-ona", "Родитель", "Parent") },
      { name: "child_name", type: "text", readOnly: true, half: true, label: l("Farzand", "Ребёнок", "Child") },
      { name: "target_grade", type: "text", readOnly: true, half: true, label: l("Sinf", "Класс", "Grade") },
      { name: "phone", type: "tel", readOnly: true, half: true, label: l("Telefon", "Телефон", "Phone") },
      { name: "message", type: "textarea", readOnly: true, label: l("Xabar", "Сообщение", "Message") },
      { name: "status", type: "select", options: applicationStatus, required: true, label: l("Holat", "Статус", "Status"), section: l("Boshqaruv", "Управление", "Management") },
      { name: "admin_notes", type: "textarea", label: l("Admin izohlari", "Заметки администратора", "Admin notes") },
    ],
  },
  {
    key: "profiles",
    table: "profiles",
    label: l("Foydalanuvchilar", "Пользователи", "Users"),
    singular: l("Foydalanuvchi", "Пользователь", "User"),
    icon: "UserCog",
    group: "system",
    read: [SA],
    write: [SA],
    titleField: "full_name",
    activeField: "is_active",
    columns: [
      { name: "full_name", kind: "text", sortable: true },
      { name: "email", kind: "text" },
      { name: "role", kind: "badge", sortable: true },
      { name: "phone", kind: "text" },
      { name: "is_active", kind: "bool" },
    ],
    search: ["full_name", "phone"],
    sort: { field: "created_at", dir: "desc" },
    filters: [
      {
        name: "role",
        label: l("Rol", "Роль", "Role"),
        options: [
          { value: "super_admin", label: l("Super admin", "Супер-админ", "Super admin"), tone: "red" },
          { value: "methodist", label: l("Metodist", "Методист", "Methodist"), tone: "blue" },
          { value: "psychologist", label: l("Psixolog", "Психолог", "Psychologist"), tone: "violet" },
          { value: "teacher", label: l("O'qituvchi", "Учитель", "Teacher"), tone: "green" },
          { value: "student", label: l("O'quvchi", "Ученик", "Student"), tone: "gray" },
        ],
      },
    ],
    fields: [
      { name: "email", type: "email", createOnly: true, virtual: true, required: true, half: true, label: l("E-pochta", "E-mail", "Email") },
      { name: "password", type: "password", createOnly: true, virtual: true, required: true, half: true, label: l("Parol (kamida 8)", "Пароль (мин. 8)", "Password (min 8)") },
      { name: "full_name", type: "text", required: true, label: l("F.I.Sh.", "ФИО", "Full name") },
      {
        name: "role",
        type: "select",
        required: true,
        half: true,
        defaultValue: "methodist",
        label: l("Rol", "Роль", "Role"),
        options: [
          { value: "super_admin", label: l("Super admin", "Супер-админ", "Super admin") },
          { value: "methodist", label: l("Metodist", "Методист", "Methodist") },
          { value: "psychologist", label: l("Psixolog", "Психолог", "Psychologist") },
          { value: "teacher", label: l("O'qituvchi", "Учитель", "Teacher") },
          { value: "student", label: l("O'quvchi", "Ученик", "Student") },
        ],
      },
      { name: "phone", type: "tel", half: true, label: l("Telefon", "Телефон", "Phone") },
      { name: "grade", type: "number", int: true, min: 1, max: 11, half: true, label: l("Sinf", "Класс", "Grade") },
      active,
    ],
  },
];

// Content-driven games (matching / true-false / quiz race): staff-authored question sets (games group).
RESOURCES.push({
  key: "game_content_sets",
  table: "game_content_sets",
  label: l("O'yin kontenti", "Контент игр", "Game content"),
  singular: l("Kontent to'plami", "Набор контента", "Content set"),
  icon: "Library",
  group: "mind",
  // RLS (schema.sql): game_content_sets write = super_admin + methodist; anon has no table grants (RPC only)
  read: [SA, ME],
  write: [SA, ME],
  titleField: "title",
  activeField: "is_active",
  columns: [
    { name: "title", kind: "loc", sortable: true },
    { name: "game_type", kind: "badge", sortable: true },
    { name: "subject_key", kind: "text", sortable: true },
    { name: "grade", kind: "num", sortable: true },
    { name: "difficulty", kind: "badge" },
    { name: "sort_order", kind: "num", sortable: true },
    { name: "is_active", kind: "bool" },
  ],
  search: ["title", "subject_key"],
  sort: { field: "sort_order", dir: "asc" },
  filters: [
    {
      name: "game_type",
      label: l("O'yin turi", "Тип игры", "Game type"),
      options: [
        { value: "matching", label: l("Juftlikni top", "Найди пару", "Matching pairs"), tone: "blue" },
        { value: "true_false", label: l("To'g'ri yoki noto'g'ri", "Верно или неверно", "True or false"), tone: "green" },
        { value: "quiz_race", label: l("Viktorina poygasi", "Гонка викторины", "Quiz race"), tone: "violet" },
      ],
    },
    { name: "difficulty", label: l("Qiyinlik", "Сложность", "Difficulty"), options: difficultyOptions },
    { name: "grade", label: l("Sinf", "Класс", "Grade"), options: gradeOptions },
  ],
  fields: [
    {
      name: "game_type",
      type: "select",
      required: true,
      createOnly: true,
      half: true,
      defaultValue: "matching",
      label: l("O'yin turi", "Тип игры", "Game type"),
      help: l("Yaratilgandan keyin o'zgartirib bo'lmaydi", "После создания изменить нельзя", "Cannot be changed after creation"),
      options: [
        { value: "matching", label: l("Juftlikni top (atama ↔ ta'rif)", "Найди пару (термин ↔ определение)", "Matching pairs (term ↔ definition)") },
        { value: "true_false", label: l("To'g'ri yoki noto'g'ri", "Верно или неверно", "True or false") },
        { value: "quiz_race", label: l("Viktorina poygasi (test)", "Гонка викторины (тест)", "Quiz race (multiple choice)") },
      ],
    },
    {
      name: "subject_key",
      type: "text",
      required: true,
      half: true,
      defaultValue: "general",
      placeholder: "english",
      label: l("Fan kaliti", "Ключ предмета", "Subject key"),
      help: l("english, uzbek, russian, math, science, geography, history, informatics, general, other", "english, uzbek, russian, math, science, geography, history, informatics, general, other", "english, uzbek, russian, math, science, geography, history, informatics, general, other"),
    },
    loc("title", "Nomi", "Название", "Title", { required: true }),
    locArea("description", "Tavsif", "Описание", "Description"),
    { name: "grade", type: "select", options: gradeOptions, half: true, defaultValue: "", label: l("Sinf (ixtiyoriy)", "Класс (необязательно)", "Grade (optional)") },
    { name: "difficulty", type: "select", options: difficultyOptions, required: true, half: true, defaultValue: "medium", label: l("Qiyinlik", "Сложность", "Difficulty") },
    {
      name: "items",
      type: "gameItems",
      required: true,
      section: l("Savollar / juftliklar", "Вопросы / пары", "Items"),
      label: l("Elementlar", "Элементы", "Items"),
      defaultValue: [],
    },
    sortOrder,
    active,
  ],
});

RESOURCES.push({
  key: "audit_log",
  table: "audit_log",
  label: l("Audit jurnali", "Журнал аудита", "Audit log"),
  singular: l("Yozuv", "Запись", "Entry"),
  icon: "ScrollText",
  group: "system",
  read: [SA],
  write: [SA],
  titleField: "action",
  canCreate: false,
  canEdit: false,
  canDelete: false,
  pageSize: 25,
  columns: [
    { name: "created_at", kind: "datetime", sortable: true, label: l("Vaqt", "Время", "Time") },
    { name: "user_email", kind: "text", sortable: true, label: l("Foydalanuvchi", "Пользователь", "User") },
    { name: "action", kind: "badge", label: l("Amal", "Действие", "Action") },
    { name: "resource", kind: "text", sortable: true, label: l("Resurs", "Ресурс", "Resource") },
    { name: "record_id", kind: "text", label: l("Yozuv ID", "ID записи", "Record ID") },
    { name: "diff", kind: "json", label: l("O'zgarishlar", "Изменения", "Changes") },
  ],
  search: ["user_email", "resource", "record_id"],
  sort: { field: "created_at", dir: "desc" },
  filters: [
    {
      name: "action",
      label: l("Amal", "Действие", "Action"),
      options: [
        { value: "create", label: l("Yaratish", "Создание", "Create"), tone: "green" },
        { value: "update", label: l("Tahrirlash", "Изменение", "Update"), tone: "blue" },
        { value: "delete", label: l("O'chirish", "Удаление", "Delete"), tone: "red" },
        { value: "scan", label: l("Skanerlash", "Сканирование", "Scan"), tone: "violet" },
        { value: "export", label: l("Eksport", "Экспорт", "Export"), tone: "amber" },
      ],
    },
    {
      name: "resource",
      label: l("Resurs", "Ресурс", "Resource"),
      options: RESOURCES.filter((r) => r.key !== "audit_log").map((r) => ({ value: r.key, label: r.label })),
    },
  ],
  fields: [],
});

export const RESOURCE_MAP: Record<string, ResourceDef> = Object.fromEntries(RESOURCES.map((r) => [r.key, r]));

export function getResource(key: string): ResourceDef | undefined {
  return RESOURCE_MAP[key];
}

export const canRead = (r: ResourceDef, role: AdminRole) => role === "super_admin" || r.read.includes(role);
export const canWrite = (r: ResourceDef, role: AdminRole) => role === "super_admin" || r.write.includes(role);
export const canDeleteRow = (r: ResourceDef, role: AdminRole) => role === "super_admin" || (r.deleteRoles ?? r.write).includes(role);

export const GROUP_LABEL = {
  content: l("Kontent", "Контент", "Content"),
  learn: l("Ta'lim", "Обучение", "Learning"),
  mind: l("Psixologiya va o'yinlar", "Психология и игры", "Mind & games"),
  system: l("Tizim", "Система", "System"),
} as const;

/** Walk fields, building a default value object. */
export function defaultsFor(fields: Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.readOnly && f.type !== "text" && f.type !== "number") continue;
    out[f.name] = defaultForField(f);
  }
  return out;
}

export function defaultForField(f: Field): unknown {
  if (f.defaultValue !== undefined) return structuredCloneSafe(f.defaultValue);
  switch (f.type) {
    case "localized":
    case "localizedArea":
      return f.nullable ? null : { uz: "", ru: "", en: "" };
    case "boolean":
      return false;
    case "number":
      return null;
    case "imageList":
    case "stringList":
    case "grades":
    case "repeater":
      return [];
    case "group":
      return defaultsFor(f.fields ?? []);
    case "select":
      return f.required ? (f.options?.[0]?.value ?? "") : "";
    default:
      return "";
  }
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
