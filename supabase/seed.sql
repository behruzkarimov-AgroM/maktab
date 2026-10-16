-- Seed data. Generated from supabase/schema.sql by scripts/db/split.mjs. Run after the migrations.
-- =====================================================================
-- SEED DATA (idempotent: fixed ids + bare ON CONFLICT DO NOTHING, i.e. ANY unique violation - id, slug,
-- section key, "one current school year" - skips the row instead of aborting the run)
-- Demo content only, no real people: names, phones (+998 71 200 00 00) and e-mail (info@example.com) are fictional.
-- Re-running this file re-creates demo rows an editor deleted; skip seed.sql in production
-- (`supabase db push` applies migrations only; seed.sql runs on `supabase db reset` / manual execution).
-- Uzbek uses the proper modifier letter (U+02BB) so no quote escaping is needed.
-- =====================================================================
create or replace function public._l(uz text, ru text, en text)
returns jsonb language sql immutable as $$ select jsonb_build_object('uz', uz, 'ru', ru, 'en', en) $$;
create or replace function public._n(v text)
returns jsonb language sql immutable as $$ select public._l(v, v, v) $$;
create or replace function public._id(n int)
returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Site settings
insert into public.site_settings (
  id, school_name, hero_title, hero_subtitle, about_mission, about_vision, about_history, stats,
  address, landmark, phones, email, working_hours, map_lat, map_lng, social_links
) values (
  1,
  public._l('Children''s Academy Group Termez xususiy maktabi', 'Частная школа «Children''s Academy Group Termez»', 'Children''s Academy Group Termez Private School'),
  public._l('Bilim, mehr va kelajak bir joyda', 'Знания, забота и будущее в одном месте', 'Knowledge, care and future in one place'),
  public._l('Bolangizning iqtidorini kashf etadigan zamonaviy xususiy maktab',
            'Современная частная школа, раскрывающая таланты вашего ребёнка',
            'A modern private school that unlocks your child''s talents'),
  public._l('Har bir bolaga individual yondashuv orqali sifatli ta’lim va tarbiya berish.',
            'Давать качественное образование и воспитание через индивидуальный подход к каждому ребёнку.',
            'To give every child quality education and upbringing through an individual approach.'),
  public._l('Oʻzbekistonning eng ishonchli va innovatsion maktablaridan biri boʻlish.',
            'Стать одной из самых надёжных и инновационных школ Узбекистана.',
            'To become one of the most trusted and innovative schools in Uzbekistan.'),
  public._l('Maktabimiz oʻqituvchilar va ota-onalar jamoasi tomonidan zamonaviy ta’lim gʻoyasi asosida tashkil etilgan.',
            'Наша школа основана командой педагогов и родителей на идее современного образования.',
            'Our school was founded by a team of teachers and parents around the idea of modern education.'),
  jsonb_build_array(
    jsonb_build_object('key','students','value',450,'suffix','+','label',public._l('Oʻquvchilar','Учеников','Students')),
    jsonb_build_object('key','teachers','value',45,'suffix','+','label',public._l('Oʻqituvchilar','Учителей','Teachers')),
    jsonb_build_object('key','years','value',12,'suffix','','label',public._l('Yillik tajriba','Лет опыта','Years of experience')),
    jsonb_build_object('key','winners','value',120,'suffix','+','label',public._l('Olimpiada gʻoliblari','Победителей олимпиад','Olympiad winners'))
  ),
  public._l('Toshkent shahri, Yunusobod tumani, Amir Temur koʻchasi 1', 'г. Ташкент, Юнусабадский район, ул. Амира Темура, 1', '1 Amir Temur Street, Yunusabad district, Tashkent'),
  public._l('Amir Temur xiyoboni yaqinida', 'Рядом со сквером Амира Темура', 'Near Amir Temur Square'),
  array['+998 71 200 00 00', '+998 90 123 45 67'],
  'info@example.com',
  public._l('Du-Sha: 08:00 - 18:00', 'Пн-Сб: 08:00 - 18:00', 'Mon-Sat: 08:00 - 18:00'),
  41.3111, 69.2797,
  jsonb_build_object('telegram','','instagram','','youtube','','facebook','')
) on conflict do nothing;

-- Programs
insert into public.programs (id, category, grade_range, title, short_description, full_content, subjects, icon_name, sort_order) values
 (public._id(1), 'primary', '1-4',
  public._l('Boshlangʻich sinflar', 'Начальная школа', 'Primary school'),
  public._l('Oʻqish, yozish va hisoblashning mustahkam poydevori.', 'Прочный фундамент чтения, письма и счёта.', 'A solid foundation in reading, writing and numeracy.'),
  public._l('1-4 sinflarda bolalar oʻyin orqali oʻrganadi: ona tili, matematika, ingliz tili, tabiatshunoslik va ijodiy mashgʻulotlar.', 'В 1-4 классах дети учатся через игру: родной язык, математика, английский, природоведение и творчество.', 'In grades 1-4 children learn through play: native language, maths, English, nature studies and creative activities.'),
  jsonb_build_array(
    jsonb_build_object('key','math','name',public._l('Matematika','Математика','Mathematics')),
    jsonb_build_object('key','english','name',public._l('Ingliz tili','Английский язык','English')),
    jsonb_build_object('key','native','name',public._l('Ona tili','Родной язык','Native language'))),
  'baby', 1),
 (public._id(2), 'middle', '5-9',
  public._l('Oʻrta sinflar', 'Средняя школа', 'Middle school'),
  public._l('Fanlarni chuqur oʻrganish va tanqidiy fikrlash.', 'Углублённое изучение предметов и критическое мышление.', 'In-depth subjects and critical thinking.'),
  public._l('5-9 sinflarda STEM yoʻnalishi, chet tillari, informatika va loyiha ishlari ustuvor.', 'В 5-9 классах приоритет у STEM, иностранных языков, информатики и проектной работы.', 'Grades 5-9 focus on STEM, foreign languages, informatics and project work.'),
  jsonb_build_array(
    jsonb_build_object('key','algebra','name',public._l('Algebra','Алгебра','Algebra')),
    jsonb_build_object('key','informatics','name',public._l('Informatika','Информатика','Informatics')),
    jsonb_build_object('key','science','name',public._l('Tabiiy fanlar','Естественные науки','Natural sciences'))),
  'rocket', 2),
 (public._id(3), 'high', '10-11',
  public._l('Yuqori sinflar', 'Старшая школа', 'High school'),
  public._l('Universitetga tayyorgarlik va kasbga yoʻnaltirish.', 'Подготовка к университету и профориентация.', 'University preparation and career guidance.'),
  public._l('10-11 sinflarda chuqurlashtirilgan tayyorgarlik, IELTS/SAT kurslari va kasbga yoʻnaltirish.', 'В 10-11 классах углублённая подготовка, курсы IELTS/SAT и профориентация.', 'Grades 10-11 offer advanced preparation, IELTS/SAT courses and career guidance.'),
  jsonb_build_array(
    jsonb_build_object('key','ielts','name',public._l('IELTS tayyorlov','Подготовка к IELTS','IELTS preparation')),
    jsonb_build_object('key','physics','name',public._l('Fizika','Физика','Physics')),
    jsonb_build_object('key','economics','name',public._l('Iqtisodiyot','Экономика','Economics'))),
  'graduation-cap', 3)
on conflict do nothing;

-- Campus life
insert into public.campus_life (id, section_key, title, description, extra_data, sort_order) values
 (public._id(11), 'kitchen',
  public._l('Maktab oshxonasi', 'Школьная столовая', 'School kitchen'),
  public._l('Kuniga 3 mahal sifatli va foydali ovqat, allergiyalar hisobga olinadi.', 'Трёхразовое качественное и полезное питание с учётом аллергий.', 'Three nutritious meals a day, allergies taken into account.'),
  jsonb_build_object('meals_per_day', 3), 1),
 (public._id(12), 'security',
  public._l('Xavfsizlik', 'Безопасность', 'Security'),
  public._l('24/7 qoʻriqlash, videokuzatuv va turniket tizimi.', 'Круглосуточная охрана, видеонаблюдение и система турникетов.', '24/7 guards, CCTV and turnstile access control.'),
  jsonb_build_object('cctv', true), 2),
 (public._id(13), 'transport',
  public._l('Maktab transporti', 'Школьный транспорт', 'School transport'),
  public._l('Shahar boʻylab qulay avtobus marshrutlari, GPS orqali kuzatuv.', 'Удобные автобусные маршруты по городу с GPS-отслеживанием.', 'Convenient bus routes across the city with GPS tracking.'),
  jsonb_build_object('routes', 8), 3),
 (public._id(14), 'schedule',
  public._l('Kun tartibi', 'Распорядок дня', 'Daily schedule'),
  public._l('Dars, ijodiy toʻgaraklar va dam olish muvozanati.', 'Баланс уроков, кружков и отдыха.', 'A balance of lessons, clubs and rest.'),
  jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('time','08:30','label',public._l('Darslar boshlanishi','Начало уроков','Lessons start')),
    jsonb_build_object('time','12:30','label',public._l('Tushlik','Обед','Lunch')),
    jsonb_build_object('time','14:00','label',public._l('Toʻgaraklar','Кружки','Clubs')),
    jsonb_build_object('time','17:00','label',public._l('Uyga qaytish','Возвращение домой','Going home')))), 4)
on conflict do nothing;

-- Staff (6)
insert into public.staff_members (id, is_administration, full_name, position, subject_key, bio, experience_years, sort_order) values
 (public._id(21), true,  public._l('Dilnoza Karimova','Дильноза Каримова','Dilnoza Karimova'), public._l('Maktab direktori','Директор школы','School director'), null,
  public._l('Taʼlim boshqaruvi boʻyicha 15 yillik tajriba.','15 лет опыта в управлении образованием.','15 years in education management.'), 15, 1),
 (public._id(22), true,  public._l('Rustam Aliyev','Рустам Алиев','Rustam Aliyev'), public._l('Oʻquv ishlari boʻyicha direktor oʻrinbosari','Заместитель директора по учебной работе','Deputy director for academics'), null,
  public._l('Metodist, innovatsion taʼlim dasturlari muallifi.','Методист, автор инновационных программ.','Methodologist, author of innovative programs.'), 12, 2),
 (public._id(23), false, public._l('Malika Yusupova','Малика Юсупова','Malika Yusupova'), public._l('Matematika oʻqituvchisi','Учитель математики','Mathematics teacher'), 'math',
  public._l('Respublika olimpiadalari tayyorlovchisi.','Тренер республиканских олимпиад.','Coach of national olympiads.'), 9, 3),
 (public._id(24), false, public._l('Jasur Tursunov','Жасур Турсунов','Jasur Tursunov'), public._l('Ingliz tili oʻqituvchisi','Учитель английского языка','English teacher'), 'english',
  public._l('IELTS 8.0, CELTA sertifikati.','IELTS 8.0, сертификат CELTA.','IELTS 8.0, CELTA certified.'), 7, 4),
 (public._id(25), false, public._l('Nigora Rahimova','Нигора Рахимова','Nigora Rahimova'), public._l('Boshlangʻich sinf oʻqituvchisi','Учитель начальных классов','Primary teacher'), 'primary',
  public._l('Bolalar bilan ishlashda 11 yillik tajriba.','11 лет опыта работы с детьми.','11 years of experience working with children.'), 11, 5),
 (public._id(26), false, public._l('Sherzod Normatov','Шерзод Норматов','Sherzod Normatov'), public._l('Informatika oʻqituvchisi','Учитель информатики','Informatics teacher'), 'informatics',
  public._l('Robototexnika va dasturlash toʻgaraklari rahbari.','Руководитель кружков робототехники и программирования.','Head of robotics and coding clubs.'), 6, 6)
on conflict do nothing;

-- Achievements (4)
insert into public.student_achievements (id, student_name, grade_or_grad_year, achievement_title, description, university_accepted, category, sort_order) values
 (public._id(31), public._l('Aziza Qodirova','Азиза Кодирова','Aziza Kodirova'), '9',
  public._l('Respublika matematika olimpiadasi — 1-oʻrin','Республиканская олимпиада по математике — 1 место','National Math Olympiad — 1st place'),
  public._l('Aziza respublika bosqichida mutlaq gʻolib boʻldi.','Азиза стала абсолютной победительницей республиканского этапа.','Aziza won the national round outright.'), null, 'olympiad', 1),
 (public._id(32), public._l('Bekzod Ismoilov','Бекзод Исмоилов','Bekzod Ismoilov'), '2024',
  public._l('Bitiruvchi — Westminster universiteti','Выпускник — Вестминстерский университет','Graduate — Westminster University'),
  public._l('Grant asosida oʻqishga qabul qilindi.','Принят на грант.','Accepted with a scholarship.'),
  public._l('Westminster xalqaro universiteti, Toshkent','Международный Вестминстерский университет в Ташкенте','Westminster International University in Tashkent'), 'graduate', 2),
 (public._id(33), public._l('Sevinch Abdullayeva','Севинч Абдуллаева','Sevinch Abdullayeva'), '7',
  public._l('Shahmat boʻyicha shahar chempioni','Чемпионка города по шахматам','City chess champion'),
  public._l('Yoshlar oʻrtasida shahar turnirida gʻalaba.','Победа в городском турнире среди юниоров.','Won the city junior tournament.'), null, 'sport', 3),
 (public._id(34), public._l('Omar Hasanov','Омар Хасанов','Omar Hasanov'), '5',
  public._l('Xalqaro rassomlik tanlovi — Gran-pri','Международный конкурс рисунка — Гран-при','International art contest — Grand Prix'),
  public._l('"Mening ona yurtim" mavzusidagi tanlov gʻolibi.','Победитель конкурса на тему «Моя родина».','Winner of the "My Homeland" contest.'), null, 'art', 4)
on conflict do nothing;

-- Olympiad (date = now()+14d)
insert into public.olympiads (id, title, description, rules, subjects, eligible_grades, event_date, registration_deadline, location, is_registration_open) values
 (public._id(41),
  public._l('Children''s Academy ochiq olimpiadasi','Открытая олимпиада Children''s Academy','Children''s Academy Open Olympiad'),
  public._l('Barcha maktab oʻquvchilari uchun ochiq intellektual musobaqa.','Открытое интеллектуальное соревнование для школьников.','An open intellectual competition for all school students.'),
  public._l('Ruxsatnoma va pasport/guvohnoma bilan keling. Telefon taqiqlanadi.','Приходите с пропуском и документом. Телефоны запрещены.','Bring your pass and ID. Phones are not allowed.'),
  jsonb_build_array(
    jsonb_build_object('key','math','name',public._l('Matematika','Математика','Mathematics')),
    jsonb_build_object('key','english','name',public._l('Ingliz tili','Английский язык','English')),
    jsonb_build_object('key','science','name',public._l('Tabiiy fanlar','Естественные науки','Natural sciences'))),
  '{1,2,3,4,5,6,7,8,9,10,11}',
  now() + interval '14 days', now() + interval '10 days',
  public._l('Children''s Academy, katta zal','Children''s Academy, большой зал','Children''s Academy, main hall'), true)
on conflict do nothing;

-- Quizzes (2 x 5)
insert into public.academic_quizzes (id, title, description, subject_key, subject_name, grade, difficulty, duration_minutes, passing_score_percent) values
 (public._id(51), public._l('Matematika: 5-sinf sinov testi','Математика: пробный тест 5 класс','Maths: grade 5 practice test'),
  public._l('Asosiy amallar va geometriya.','Основные действия и геометрия.','Core operations and geometry.'),
  'math', public._l('Matematika','Математика','Mathematics'), 5, 'easy', 10, 60),
 (public._id(52), public._l('Tabiiy fanlar: 4-sinf viktorinasi','Естествознание: викторина 4 класс','Science: grade 4 quiz'),
  public._l('Quyosh tizimi, suv va oʻsimliklar.','Солнечная система, вода и растения.','Solar system, water and plants.'),
  'science', public._l('Tabiiy fanlar','Естественные науки','Natural sciences'), 4, 'easy', 10, 60)
on conflict do nothing;

insert into public.academic_questions (id, quiz_id, question_text, options, correct_option_id, explanation, points, sort_order) values
 (public._id(101), public._id(51), public._l('12 × 8 = ?','12 × 8 = ?','12 × 8 = ?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('86')),jsonb_build_object('id','B','text',public._n('96')),jsonb_build_object('id','C','text',public._n('108')),jsonb_build_object('id','D','text',public._n('88'))),
  'B', public._l('12 × 8 = 96.','12 × 8 = 96.','12 × 8 = 96.'), 1, 1),
 (public._id(102), public._id(51), public._l('100 ning 3/4 qismi nechaga teng?','Чему равны 3/4 от 100?','What is 3/4 of 100?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('25')),jsonb_build_object('id','B','text',public._n('50')),jsonb_build_object('id','C','text',public._n('75')),jsonb_build_object('id','D','text',public._n('80'))),
  'C', public._l('100 : 4 × 3 = 75.','100 : 4 × 3 = 75.','100 ÷ 4 × 3 = 75.'), 1, 2),
 (public._id(103), public._id(51), public._l('Tomoni 7 sm boʻlgan kvadratning perimetri?','Периметр квадрата со стороной 7 см?','Perimeter of a square with side 7 cm?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('14 sm','14 см','14 cm')),jsonb_build_object('id','B','text',public._l('21 sm','21 см','21 cm')),jsonb_build_object('id','C','text',public._l('28 sm','28 см','28 cm')),jsonb_build_object('id','D','text',public._l('49 sm','49 см','49 cm'))),
  'C', public._l('P = 4 × 7 = 28 sm.','P = 4 × 7 = 28 см.','P = 4 × 7 = 28 cm.'), 1, 3),
 (public._id(104), public._id(51), public._l('144 : 12 = ?','144 : 12 = ?','144 ÷ 12 = ?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('10')),jsonb_build_object('id','B','text',public._n('11')),jsonb_build_object('id','C','text',public._n('12')),jsonb_build_object('id','D','text',public._n('14'))),
  'C', public._l('12 × 12 = 144.','12 × 12 = 144.','12 × 12 = 144.'), 1, 4),
 (public._id(105), public._id(51), public._l('Eng kichik tub son qaysi?','Какое наименьшее простое число?','Which is the smallest prime number?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('0')),jsonb_build_object('id','B','text',public._n('1')),jsonb_build_object('id','C','text',public._n('2')),jsonb_build_object('id','D','text',public._n('3'))),
  'C', public._l('2 — eng kichik tub son.','2 — наименьшее простое число.','2 is the smallest prime number.'), 1, 5),

 (public._id(111), public._id(52), public._l('Quyoshga eng yaqin sayyora qaysi?','Какая планета ближе всего к Солнцу?','Which planet is closest to the Sun?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('Venera','Венера','Venus')),jsonb_build_object('id','B','text',public._l('Merkuriy','Меркурий','Mercury')),jsonb_build_object('id','C','text',public._l('Mars','Марс','Mars')),jsonb_build_object('id','D','text',public._l('Yer','Земля','Earth'))),
  'B', public._l('Merkuriy Quyoshga eng yaqin.','Меркурий ближе всех к Солнцу.','Mercury is the closest to the Sun.'), 1, 1),
 (public._id(112), public._id(52), public._l('Suv necha daraja Selsiyda qaynaydi?','При скольких градусах Цельсия кипит вода?','At what Celsius temperature does water boil?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('50')),jsonb_build_object('id','B','text',public._n('90')),jsonb_build_object('id','C','text',public._n('100')),jsonb_build_object('id','D','text',public._n('120'))),
  'C', public._l('Normal bosimda suv 100 °C da qaynaydi.','При нормальном давлении вода кипит при 100 °C.','At normal pressure water boils at 100 °C.'), 1, 2),
 (public._id(113), public._id(52), public._l('Yerda nechta qitʼa bor?','Сколько континентов на Земле?','How many continents are there?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('5')),jsonb_build_object('id','B','text',public._n('6')),jsonb_build_object('id','C','text',public._n('7')),jsonb_build_object('id','D','text',public._n('8'))),
  'C', public._l('Yettita qitʼa mavjud.','Существует семь континентов.','There are seven continents.'), 1, 3),
 (public._id(114), public._id(52), public._l('Eng katta okean qaysi?','Какой океан самый большой?','Which is the largest ocean?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('Atlantika','Атлантический','Atlantic')),jsonb_build_object('id','B','text',public._l('Hind','Индийский','Indian')),jsonb_build_object('id','C','text',public._l('Tinch','Тихий','Pacific')),jsonb_build_object('id','D','text',public._l('Shimoliy Muz','Северный Ледовитый','Arctic'))),
  'C', public._l('Tinch okeani eng katta.','Тихий океан — самый большой.','The Pacific is the largest.'), 1, 4),
 (public._id(115), public._id(52), public._l('Oʻsimliklar nafas olishda qaysi gazni yutadi?','Какой газ поглощают растения при фотосинтезе?','Which gas do plants absorb during photosynthesis?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('Kislorod','Кислород','Oxygen')),jsonb_build_object('id','B','text',public._l('Karbonat angidrid','Углекислый газ','Carbon dioxide')),jsonb_build_object('id','C','text',public._l('Azot','Азот','Nitrogen')),jsonb_build_object('id','D','text',public._l('Vodorod','Водород','Hydrogen'))),
  'B', public._l('Fotosintezda CO₂ yutiladi.','При фотосинтезе поглощается CO₂.','CO₂ is absorbed in photosynthesis.'), 1, 5)
on conflict do nothing;

-- Psych tests (2) with scales
insert into public.psych_tests (id, title, description, instruction, target_audience, topic) values
 (public._id(61), public._l('Maktab xavotiri testi','Тест школьной тревожности','School anxiety check'),
  public._l('Maktabdagi hissiyotlarni baholovchi qisqa test.','Короткий тест на оценку школьных переживаний.','A short test about feelings at school.'),
  public._l('Har bir savolga samimiy javob bering — notoʻgʻri javob yoʻq.','Отвечайте честно — неправильных ответов нет.','Answer honestly — there are no wrong answers.'), 'kids', 'emotional'),
 (public._id(62), public._l('Oʻqishga motivatsiya','Мотивация к учёбе','Motivation to learn'),
  public._l('Oʻqishga qiziqish darajasini aniqlaydi.','Определяет уровень интереса к учёбе.','Finds out how motivated the student is.'),
  public._l('Eng mos variantni tanlang.','Выберите наиболее подходящий вариант.','Choose the best fitting option.'), 'teens', 'interests')
on conflict do nothing;

insert into public.psych_questions (id, psych_test_id, question_text, options, sort_order)
select qid, tid, qt, opts, so from (values
  (public._id(201), public._id(61), public._l('Dars oldidan hayajonlanaman.','Я волнуюсь перед уроком.','I feel nervous before lessons.'), 1),
  (public._id(202), public._id(61), public._l('Doskaga chaqirilsam, qoʻrqaman.','Я боюсь, когда меня вызывают к доске.','I am afraid when called to the board.'), 2),
  (public._id(203), public._id(61), public._l('Baholar haqida koʻp tashvishlanaman.','Я сильно переживаю из-за оценок.','I worry a lot about grades.'), 3),
  (public._id(204), public._id(61), public._l('Tunda maktab haqida oʻylab uxlay olmayman.','Ночью я не могу уснуть из-за мыслей о школе.','I cannot sleep thinking about school.'), 4)
) as v(qid, tid, qt, so)
cross join lateral (select jsonb_build_array(
  jsonb_build_object('id','A','text',public._l('Hech qachon','Никогда','Never'),'score',0),
  jsonb_build_object('id','B','text',public._l('Ba’zan','Иногда','Sometimes'),'score',1),
  jsonb_build_object('id','C','text',public._l('Koʻpincha','Часто','Often'),'score',2),
  jsonb_build_object('id','D','text',public._l('Doim','Всегда','Always'),'score',3)) as opts) o
on conflict do nothing;

insert into public.psych_questions (id, psych_test_id, question_text, options, sort_order)
select qid, tid, qt, opts, so from (values
  (public._id(211), public._id(62), public._l('Yangi narsalarni oʻrganish menga yoqadi.','Мне нравится узнавать новое.','I enjoy learning new things.'), 1),
  (public._id(212), public._id(62), public._l('Uy vazifasini oʻz xohishim bilan bajaraman.','Я делаю домашнее задание по своей воле.','I do homework willingly.'), 2),
  (public._id(213), public._id(62), public._l('Qiyin masalalarda taslim boʻlmayman.','Я не сдаюсь на сложных задачах.','I do not give up on hard tasks.'), 3),
  (public._id(214), public._id(62), public._l('Kelajak kasbim haqida oʻylayman.','Я думаю о будущей профессии.','I think about my future career.'), 4)
) as v(qid, tid, qt, so)
cross join lateral (select jsonb_build_array(
  jsonb_build_object('id','A','text',public._l('Kamdan-kam','Редко','Rarely'),'score',1),
  jsonb_build_object('id','B','text',public._l('Ba’zan','Иногда','Sometimes'),'score',2),
  jsonb_build_object('id','C','text',public._l('Koʻpincha','Часто','Often'),'score',3)) as opts) o
on conflict do nothing;

insert into public.psych_result_scales (id, psych_test_id, min_score, max_score, result_title, psychological_analysis, recommendations_for_parents, badge_color) values
 (public._id(301), public._id(61), 0, 3, public._l('Past xavotir','Низкая тревожность','Low anxiety'),
  public._l('Bola maktabda oʻzini xotirjam his qiladi.','Ребёнок спокойно чувствует себя в школе.','The child feels calm at school.'),
  public._l('Qoʻllab-quvvatlashda davom eting va muvaffaqiyatlarni nishonlang.','Продолжайте поддерживать и отмечайте успехи.','Keep supporting and celebrate successes.'), '#22c55e'),
 (public._id(302), public._id(61), 4, 8, public._l('Oʻrtacha xavotir','Умеренная тревожность','Moderate anxiety'),
  public._l('Ba’zi vaziyatlarda xavotir sezilmoqda.','В некоторых ситуациях заметна тревога.','Some situations cause worry.'),
  public._l('Bola bilan ochiq suhbatlashing, kun tartibini barqaror qiling.','Откровенно разговаривайте с ребёнком, наладьте режим дня.','Talk openly with your child and keep a steady routine.'), '#f59e0b'),
 (public._id(303), public._id(61), 9, 12, public._l('Yuqori xavotir','Высокая тревожность','High anxiety'),
  public._l('Xavotir darajasi yuqori, mutaxassis maslahati foydali.','Уровень тревоги высокий, полезна консультация специалиста.','Anxiety is high; a specialist consultation would help.'),
  public._l('Maktab psixologiga murojaat qiling, bosimni kamaytiring.','Обратитесь к школьному психологу, снизьте давление.','Contact the school psychologist and reduce pressure.'), '#ef4444'),
 (public._id(311), public._id(62), 4, 6, public._l('Motivatsiya past','Низкая мотивация','Low motivation'),
  public._l('Oʻqishga qiziqish hozircha past.','Интерес к учёбе пока невысокий.','Interest in learning is currently low.'),
  public._l('Bolaning qiziqishlarini oʻqish bilan bogʻlang.','Свяжите увлечения ребёнка с учёбой.','Connect your child''s hobbies to learning.'), '#f59e0b'),
 (public._id(312), public._id(62), 7, 9, public._l('Motivatsiya oʻrtacha','Средняя мотивация','Moderate motivation'),
  public._l('Qiziqish bor, lekin barqaror emas.','Интерес есть, но он нестабилен.','There is interest but it is not stable.'),
  public._l('Kichik maqsadlar qoʻying va maqtang.','Ставьте небольшие цели и хвалите.','Set small goals and praise progress.'), '#3b82f6'),
 (public._id(313), public._id(62), 10, 12, public._l('Motivatsiya yuqori','Высокая мотивация','High motivation'),
  public._l('Bola oʻqishga juda qiziqadi.','Ребёнок очень увлечён учёбой.','The child is highly motivated.'),
  public._l('Qoʻshimcha loyihalar va olimpiadalarni taklif qiling.','Предложите дополнительные проекты и олимпиады.','Offer extra projects and olympiads.'), '#22c55e')
on conflict do nothing;

-- Brain games (5)
insert into public.brain_games (id, game_slug, title, description, how_to_play, cognitive_skill, icon_name, config, sort_order) values
 (public._id(71), 'schulte-table',
  public._l('Shulte jadvali','Таблица Шульте','Schulte table'),
  public._l('Raqamlarni tartib bilan tez toping.','Быстро находите числа по порядку.','Find numbers in order as fast as you can.'),
  public._l('1 dan boshlab barcha raqamlarni ketma-ket bosing.','Нажимайте числа подряд, начиная с 1.','Tap all numbers in order starting from 1.'),
  public._l('Diqqat va periferik koʻrish','Внимание и периферическое зрение','Attention and peripheral vision'), 'grid-3x3',
  '{"easy":{"grid":4,"time_limit":60,"multiplier":1},"medium":{"grid":5,"time_limit":90,"multiplier":2},"hard":{"grid":6,"time_limit":120,"multiplier":3}}'::jsonb, 1),
 (public._id(72), 'memory-matrix',
  public._l('Xotira matritsasi','Матрица памяти','Memory matrix'),
  public._l('Yonib oʻchgan kataklarni eslab qoling.','Запомните подсвеченные клетки.','Remember the highlighted cells.'),
  public._l('Yorigan kataklarni eslab, keyin ularni bosing.','Запомните подсвеченные клетки и нажмите на них.','Memorise the lit cells then tap them.'),
  public._l('Qisqa muddatli xotira','Кратковременная память','Short-term memory'), 'brain',
  '{"easy":{"grid":3,"time_limit":45,"multiplier":1},"medium":{"grid":4,"time_limit":60,"multiplier":2},"hard":{"grid":5,"time_limit":75,"multiplier":3}}'::jsonb, 2),
 (public._id(73), 'mental-math',
  public._l('Tezkor arifmetika','Устный счёт','Mental math'),
  public._l('Misollarni tez yeching.','Решайте примеры быстро.','Solve sums quickly.'),
  public._l('Vaqt tugaguncha iloji boricha koʻp misol yeching.','Решите как можно больше примеров до конца времени.','Solve as many sums as possible before time runs out.'),
  public._l('Hisoblash tezligi','Скорость счёта','Calculation speed'), 'calculator',
  '{"easy":{"grid":0,"time_limit":60,"multiplier":1},"medium":{"grid":0,"time_limit":60,"multiplier":2},"hard":{"grid":0,"time_limit":60,"multiplier":3}}'::jsonb, 3),
 (public._id(74), 'stroop-test',
  public._l('Stroop testi','Тест Струпа','Stroop test'),
  public._l('Soʻz rangini toping, yozuvni emas.','Выбирайте цвет слова, а не текст.','Pick the colour of the word, not the text.'),
  public._l('Soʻz qanday rangda yozilganini tanlang.','Выберите цвет, которым написано слово.','Choose the colour the word is written in.'),
  public._l('Diqqat va tormozlash nazorati','Внимание и контроль торможения','Attention and inhibition control'), 'palette',
  '{"easy":{"grid":0,"time_limit":45,"multiplier":1},"medium":{"grid":0,"time_limit":45,"multiplier":2},"hard":{"grid":0,"time_limit":45,"multiplier":3}}'::jsonb, 4),
 (public._id(75), 'logic-seq',
  public._l('Mantiqiy ketma-ketlik','Логические последовательности','Logic sequences'),
  public._l('Keyingi raqamni toping.','Найдите следующее число.','Find the next number.'),
  public._l('Ketma-ketlik qonuniyatini aniqlang.','Определите закономерность последовательности.','Work out the pattern of the sequence.'),
  public._l('Mantiqiy fikrlash','Логическое мышление','Logical reasoning'), 'puzzle',
  '{"easy":{"grid":0,"time_limit":90,"multiplier":1},"medium":{"grid":0,"time_limit":90,"multiplier":2},"hard":{"grid":0,"time_limit":90,"multiplier":3}}'::jsonb, 5)
on conflict do nothing;

insert into public.game_leaderboard (id, game_id, player_name, student_grade, difficulty, score, completion_time_ms, accuracy_percent) values
 (public._id(81), public._id(71), 'Aziza', 5, 'easy', 920, 31000, 100),
 (public._id(82), public._id(71), 'Bekzod', 6, 'easy', 840, 36000, 98),
 (public._id(83), public._id(72), 'Sevinch', 4, 'easy', 760, 28000, 95),
 (public._id(84), public._id(73), 'Omar', 7, 'medium', 1300, 60000, 90),
 (public._id(85), public._id(74), 'Malika', 8, 'medium', 1100, 45000, 92),
 (public._id(86), public._id(75), 'Jasur', 9, 'hard', 1500, 80000, 88)
on conflict do nothing;

-- Surveys (2 samples: parents satisfaction, students' interests)
create or replace function public._so(id text, uz text, ru text, en text)
returns jsonb language sql immutable as $$ select jsonb_build_object('id', id, 'text', public._l(uz, ru, en)) $$;

insert into public.surveys (id, title, description, audience, is_anonymous, allow_multiple_responses) values
 (public._id(401),
  public._l('Ota-onalar mamnunligi soʻrovnomasi', 'Опрос удовлетворённости родителей', 'Parent satisfaction survey'),
  public._l('Fikringiz maktabni yaxshilashga yordam beradi. Soʻrovnoma anonim, 2 daqiqa vaqt oladi.',
            'Ваше мнение помогает нам улучшать школу. Опрос анонимный и занимает 2 минуты.',
            'Your opinion helps us improve the school. The survey is anonymous and takes 2 minutes.'),
  'parents', true, false),
 (public._id(402),
  public._l('Oʻquvchilar qiziqishlari soʻrovi', 'Опрос интересов учеников', 'Students'' interests poll'),
  public._l('Sizga nima qiziq? Toʻgaraklar va tadbirlarni sizning fikringiz bilan rejalashtiramiz.',
            'Что вам интересно? Мы планируем кружки и мероприятия с учётом вашего мнения.',
            'What are you into? We plan clubs and events with your input.'),
  'students', true, false)
on conflict do nothing;

insert into public.survey_questions (id, survey_id, type, question_text, options, scale_min, scale_max, scale_min_label, scale_max_label, required, sort_order) values
 (public._id(411), public._id(401), 'scale',
  public._l('Umuman olganda, maktabdan qanchalik mamnunsiz?', 'В целом, насколько вы довольны школой?', 'Overall, how satisfied are you with the school?'),
  '[]'::jsonb, 1, 5,
  public._l('Umuman mamnun emasman', 'Совсем не доволен', 'Not satisfied at all'), public._l('Juda mamnunman', 'Очень доволен', 'Very satisfied'), true, 1),
 (public._id(412), public._id(401), 'single',
  public._l('Maktab haqida qayerdan bilib oldingiz?', 'Как вы узнали о школе?', 'How did you hear about the school?'),
  jsonb_build_array(
    public._so('A', 'Doʻstlar yoki tanishlardan', 'От друзей или знакомых', 'Friends or acquaintances'),
    public._so('B', 'Ijtimoiy tarmoqlardan', 'Из социальных сетей', 'Social media'),
    public._so('C', 'Reklamadan', 'Из рекламы', 'Advertising'),
    public._so('D', 'Boshqa', 'Другое', 'Other')),
  1, 5, public._n(''), public._n(''), true, 2),
 (public._id(413), public._id(401), 'multiple',
  public._l('Quyidagilardan qaysilari siz uchun eng muhim?', 'Что для вас важнее всего?', 'Which of these matter most to you?'),
  jsonb_build_array(
    public._so('A', 'Sifatli taʼlim', 'Качественное образование', 'Quality of teaching'),
    public._so('B', 'Xavfsizlik', 'Безопасность', 'Safety'),
    public._so('C', 'Ovqatlanish', 'Питание', 'Meals'),
    public._so('D', 'Maktab transporti', 'Школьный транспорт', 'School transport'),
    public._so('E', 'Toʻgaraklar', 'Кружки', 'Clubs'),
    public._so('F', 'Ingliz tili', 'Английский язык', 'English language')),
  1, 5, public._n(''), public._n(''), true, 3),
 (public._id(414), public._id(401), 'scale',
  public._l('Oʻqituvchilar bilan aloqa qanchalik qulay?', 'Насколько удобно общение с учителями?', 'How easy is it to communicate with teachers?'),
  '[]'::jsonb, 1, 5, public._l('Qiyin', 'Сложно', 'Difficult'), public._l('Juda qulay', 'Очень удобно', 'Very easy'), true, 4),
 (public._id(415), public._id(401), 'yesno',
  public._l('Maktabni boshqa ota-onalarga tavsiya qilasizmi?', 'Порекомендуете ли вы школу другим родителям?', 'Would you recommend the school to other parents?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), true, 5),
 (public._id(416), public._id(401), 'text',
  public._l('Maktabni yaxshilash boʻyicha takliflaringiz?', 'Ваши предложения по улучшению школы?', 'Any suggestions to improve the school?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), false, 6),

 (public._id(421), public._id(402), 'multiple',
  public._l('Qaysi fanlar sizga yoqadi?', 'Какие предметы вам нравятся?', 'Which subjects do you like?'),
  jsonb_build_array(
    public._so('A', 'Matematika', 'Математика', 'Maths'),
    public._so('B', 'Ingliz tili', 'Английский язык', 'English'),
    public._so('C', 'Tabiiy fanlar', 'Естественные науки', 'Science'),
    public._so('D', 'Tasviriy sanʼat', 'Рисование', 'Art'),
    public._so('E', 'Jismoniy tarbiya', 'Физкультура', 'Sport'),
    public._so('F', 'Informatika', 'Информатика', 'Computer science')),
  1, 5, public._n(''), public._n(''), true, 1),
 (public._id(422), public._id(402), 'single',
  public._l('Qaysi toʻgarakka qatnashgan boʻlardingiz?', 'В какой кружок вы бы пошли?', 'Which club would you join?'),
  jsonb_build_array(
    public._so('A', 'Robototexnika', 'Робототехника', 'Robotics'),
    public._so('B', 'Rassomlik', 'Рисование', 'Art'),
    public._so('C', 'Sport', 'Спорт', 'Sport'),
    public._so('D', 'Musiqa', 'Музыка', 'Music'),
    public._so('E', 'Shaxmat', 'Шахматы', 'Chess')),
  1, 5, public._n(''), public._n(''), true, 2),
 (public._id(423), public._id(402), 'scale',
  public._l('Maktabda oʻzingizni qanday his qilasiz?', 'Как вы себя чувствуете в школе?', 'How do you feel at school?'),
  '[]'::jsonb, 1, 5, public._l('Yoqmaydi', 'Не нравится', 'I don''t like it'), public._l('Juda yoqadi', 'Очень нравится', 'I love it'), true, 3),
 (public._id(424), public._id(402), 'yesno',
  public._l('Koʻproq ekskursiyalar boʻlishini xohlaysizmi?', 'Хотите больше экскурсий?', 'Do you want more field trips?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), true, 4),
 (public._id(425), public._id(402), 'text',
  public._l('Qanday yangi toʻgarak yoki tadbir qoʻshgan boʻlardingiz?', 'Какой новый кружок или мероприятие вы бы добавили?', 'What new club or event would you add?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), false, 5)
on conflict do nothing;
drop function if exists public._so(text, text, text, text);

-- ---- seed: school management reference data (year, 4 terms, 12 subjects, 14 classes). People, schedule,
--      attendance and grades for the DEMO are generated deterministically by lib/school/demo-data.ts (same ids). ----
-- is_current only when no other year is current (unique partial index), terms/classes only when their year exists
insert into public.school_years (id, name, start_date, end_date, is_current)
select public._id(9001), '2026-2027', date '2026-09-01', date '2027-05-31', not exists (select 1 from public.school_years where is_current)
on conflict do nothing;
insert into public.terms (id, year_id, number, name, start_date, end_date)
select v.* from (values
 (public._id(9011), public._id(9001), 1, '1-chorak', date '2026-09-01', date '2026-11-02'),
 (public._id(9012), public._id(9001), 2, '2-chorak', date '2026-11-10', date '2026-12-28'),
 (public._id(9013), public._id(9001), 3, '3-chorak', date '2027-01-11', date '2027-03-15'),
 (public._id(9014), public._id(9001), 4, '4-chorak', date '2027-03-24', date '2027-05-26')
) as v(id, year_id, number, name, start_date, end_date)
where exists (select 1 from public.school_years y where y.id = v.year_id)
on conflict do nothing;
insert into public.subjects (id, name, short, sort_order) values
 (public._id(9101), public._l('Ona tili va adabiyot', 'Родной язык и литература', 'Native language & literature'), 'Ona', 1),
 (public._id(9102), public._l('Rus tili', 'Русский язык', 'Russian'), 'Rus', 2),
 (public._id(9103), public._l('Ingliz tili', 'Английский язык', 'English'), 'Ing', 3),
 (public._id(9104), public._l('Matematika', 'Математика', 'Mathematics'), 'Mat', 4),
 (public._id(9105), public._l('Fizika', 'Физика', 'Physics'), 'Fiz', 5),
 (public._id(9106), public._l('Kimyo', 'Химия', 'Chemistry'), 'Kim', 6),
 (public._id(9107), public._l('Biologiya', 'Биология', 'Biology'), 'Bio', 7),
 (public._id(9108), public._l('Tarix', 'История', 'History'), 'Tar', 8),
 (public._id(9109), public._l('Geografiya', 'География', 'Geography'), 'Geo', 9),
 (public._id(9110), public._l('Informatika', 'Информатика', 'Computer science'), 'Inf', 10),
 (public._id(9111), public._l('Jismoniy tarbiya', 'Физкультура', 'Physical education'), 'JT', 11),
 (public._id(9112), public._l('Tasviriy san''at', 'ИЗО', 'Art'), 'San', 12)
on conflict do nothing;
insert into public.classes (id, year_id, grade, letter, name, room)
select v.* from (values
 (public._id(9201), public._id(9001), 1, 'A', '1A', '101'), (public._id(9202), public._id(9001), 1, 'B', '1B', '102'),
 (public._id(9203), public._id(9001), 2, 'A', '2A', '103'), (public._id(9204), public._id(9001), 2, 'B', '2B', '104'),
 (public._id(9205), public._id(9001), 3, 'A', '3A', '105'), (public._id(9206), public._id(9001), 3, 'B', '3B', '106'),
 (public._id(9207), public._id(9001), 4, 'A', '4A', '201'), (public._id(9208), public._id(9001), 5, 'A', '5A', '202'),
 (public._id(9209), public._id(9001), 6, 'A', '6A', '203'), (public._id(9210), public._id(9001), 7, 'A', '7A', '204'),
 (public._id(9211), public._id(9001), 8, 'A', '8A', '301'), (public._id(9212), public._id(9001), 9, 'A', '9A', '302'),
 (public._id(9213), public._id(9001), 10, 'A', '10A', '303'), (public._id(9214), public._id(9001), 11, 'A', '11A', '304')
) as v(id, year_id, grade, letter, name, room)
where exists (select 1 from public.school_years y where y.id = v.year_id)
on conflict do nothing;

-- Cleanup seed helpers + policy helper
drop function if exists public._l(text, text, text);
drop function if exists public._n(text);
drop function if exists public._id(int);

-- ---- seed: the three games (leaderboard rows reference brain_games) ----
insert into public.brain_games (id, game_slug, title, description, how_to_play, cognitive_skill, icon_name, config, sort_order) values
 ('00000000-0000-4000-8000-00000000b001', 'matching-pairs',
  '{"uz":"Juftlikni top","ru":"Найди пару","en":"Matching pairs"}'::jsonb,
  '{"uz":"Atama va ta’rifni, so‘z va tarjimani juftlang.","ru":"Соединяйте термины с определениями, слова с переводами.","en":"Match terms with definitions and words with translations."}'::jsonb,
  '{"uz":"Mavzu to‘plamini tanlang. Kartalarni oching yoki mos juftlarni ulang. Xatolar ballni kamaytiradi, tezlik oshiradi.","ru":"Выберите набор. Переворачивайте карточки или соединяйте пары. Ошибки снижают очки, скорость повышает.","en":"Pick a set. Flip cards or connect the matching items. Mistakes cost points, speed earns them."}'::jsonb,
  '{"uz":"Xotira va bilim","ru":"Память и знания","en":"Memory & knowledge"}'::jsonb, 'layers',
  '{"easy":{"grid":6,"time_limit":120,"multiplier":1},"medium":{"grid":8,"time_limit":150,"multiplier":1.5},"hard":{"grid":12,"time_limit":180,"multiplier":2}}'::jsonb, 6),
 ('00000000-0000-4000-8000-00000000b002', 'true-false',
  '{"uz":"To‘g‘ri yoki noto‘g‘ri","ru":"Верно или неверно","en":"True or false"}'::jsonb,
  '{"uz":"Tasdiqni tez baholang, kombo to‘plang.","ru":"Быстро оценивайте утверждения и копите комбо.","en":"Judge statements fast and build a combo."}'::jsonb,
  '{"uz":"To‘plamni tanlang. Har bir tasdiq to‘g‘ri yoki noto‘g‘riligini tez belgilang. Xato javob jonni olib qo‘yadi.","ru":"Выберите набор. Быстро отмечайте, верно ли утверждение. Ошибка отнимает жизнь.","en":"Pick a set. Quickly mark each statement true or false. A wrong answer costs a life."}'::jsonb,
  '{"uz":"Tezkor qaror qabul qilish","ru":"Быстрое принятие решений","en":"Quick judgement"}'::jsonb, 'check',
  '{"easy":{"grid":3,"time_limit":60,"multiplier":1},"medium":{"grid":3,"time_limit":60,"multiplier":1.5},"hard":{"grid":2,"time_limit":60,"multiplier":2}}'::jsonb, 7),
 ('00000000-0000-4000-8000-00000000b003', 'quiz-race',
  '{"uz":"Viktorina poygasi","ru":"Гонка викторины","en":"Quiz race"}'::jsonb,
  '{"uz":"Savolga vaqt tugamasdan javob bering, yordamchilardan foydalaning.","ru":"Отвечайте до конца времени и используйте подсказки.","en":"Answer before the countdown ends and use your lifelines."}'::jsonb,
  '{"uz":"Har bir savolga cheklangan vaqt beriladi. 3 ta yordam: 50/50, o‘tkazib yuborish, +vaqt.","ru":"На каждый вопрос ограничено время. 3 подсказки: 50/50, пропуск, +время.","en":"Each question has a countdown. Three lifelines: 50/50, skip and +time."}'::jsonb,
  '{"uz":"Bilim va tezlik","ru":"Знания и скорость","en":"Knowledge & speed"}'::jsonb, 'flag',
  '{"easy":{"grid":8,"time_limit":20,"multiplier":1},"medium":{"grid":10,"time_limit":15,"multiplier":1.5},"hard":{"grid":12,"time_limit":10,"multiplier":2}}'::jsonb, 8)
on conflict do nothing;

-- ---- seed: content sets (same data as components/games/content-seed.json, used by demo mode) ----
insert into public.game_content_sets (id, game_type, title, description, subject_key, grade, difficulty, items, sort_order) values
 ('00000000-0000-4000-8000-00000000c001', 'matching', $j${"uz":"Ingliz–o'zbek lug'ati: kundalik so'zlar","ru":"Англо-узбекский словарь: повседневные слова","en":"English–Uzbek vocabulary: everyday words"}$j$::jsonb, $j${"uz":"Ingliz so'zini o'zbekcha tarjimasi bilan juftlang.","ru":"Соедините английское слово с его узбекским переводом.","en":"Match each English word with its Uzbek translation."}$j$::jsonb, 'english', 3, 'easy', $j$[{"id":"p1","left":{"uz":"apple","ru":"apple","en":"apple"},"right":{"uz":"olma","ru":"olma","en":"olma"}},{"id":"p2","left":{"uz":"book","ru":"book","en":"book"},"right":{"uz":"kitob","ru":"kitob","en":"kitob"}},{"id":"p3","left":{"uz":"water","ru":"water","en":"water"},"right":{"uz":"suv","ru":"suv","en":"suv"}},{"id":"p4","left":{"uz":"house","ru":"house","en":"house"},"right":{"uz":"uy","ru":"uy","en":"uy"}},{"id":"p5","left":{"uz":"friend","ru":"friend","en":"friend"},"right":{"uz":"do'st","ru":"do'st","en":"do'st"}},{"id":"p6","left":{"uz":"school","ru":"school","en":"school"},"right":{"uz":"maktab","ru":"maktab","en":"maktab"}},{"id":"p7","left":{"uz":"bread","ru":"bread","en":"bread"},"right":{"uz":"non","ru":"non","en":"non"}},{"id":"p8","left":{"uz":"sun","ru":"sun","en":"sun"},"right":{"uz":"quyosh","ru":"quyosh","en":"quyosh"}},{"id":"p9","left":{"uz":"teacher","ru":"teacher","en":"teacher"},"right":{"uz":"o'qituvchi","ru":"o'qituvchi","en":"o'qituvchi"}},{"id":"p10","left":{"uz":"cat","ru":"cat","en":"cat"},"right":{"uz":"mushuk","ru":"mushuk","en":"mushuk"}}]$j$::jsonb, 1),
 ('00000000-0000-4000-8000-00000000c002', 'matching', $j${"uz":"Tabiiy fanlar: atama va ta'rif","ru":"Естествознание: термин и определение","en":"Science: term and definition"}$j$::jsonb, $j${"uz":"Fan atamalarini ularning ta'rifi bilan juftlang.","ru":"Соедините научные термины с их определениями.","en":"Match science terms with their definitions."}$j$::jsonb, 'science', 5, 'medium', $j$[{"id":"p1","left":{"uz":"Fotosintez","ru":"Фотосинтез","en":"Photosynthesis"},"right":{"uz":"O'simliklarning yorug'likda oziq modda hosil qilishi","ru":"Образование растениями питательных веществ на свету","en":"Plants making food from light"}},{"id":"p2","left":{"uz":"Gravitatsiya","ru":"Гравитация","en":"Gravity"},"right":{"uz":"Jismlarning bir-biriga tortilish kuchi","ru":"Сила притяжения тел друг к другу","en":"The force that pulls objects together"}},{"id":"p3","left":{"uz":"Ekotizim","ru":"Экосистема","en":"Ecosystem"},"right":{"uz":"Tirik organizmlar va ularning yashash muhiti birligi","ru":"Единство живых организмов и среды их обитания","en":"Living things and the environment they share"}},{"id":"p4","left":{"uz":"Bug'lanish","ru":"Испарение","en":"Evaporation"},"right":{"uz":"Suyuqlikning gazga aylanishi","ru":"Превращение жидкости в газ","en":"A liquid turning into a gas"}},{"id":"p5","left":{"uz":"Atom","ru":"Атом","en":"Atom"},"right":{"uz":"Kimyoviy elementning eng kichik zarrasi","ru":"Мельчайшая частица химического элемента","en":"The smallest particle of a chemical element"}},{"id":"p6","left":{"uz":"Energiya","ru":"Энергия","en":"Energy"},"right":{"uz":"Ish bajarish qobiliyati","ru":"Способность совершать работу","en":"The ability to do work"}},{"id":"p7","left":{"uz":"Yashash muhiti","ru":"Среда обитания","en":"Habitat"},"right":{"uz":"Jonzot yashaydigan tabiiy joy","ru":"Природное место, где живёт организм","en":"The natural home of an organism"}},{"id":"p8","left":{"uz":"Mineral","ru":"Минерал","en":"Mineral"},"right":{"uz":"Tabiiy hosil bo'lgan bir jinsli qattiq modda","ru":"Природное однородное твёрдое вещество","en":"A naturally formed, uniform solid substance"}}]$j$::jsonb, 2),
 ('00000000-0000-4000-8000-00000000c003', 'true_false', $j${"uz":"Geografiya: to'g'ri yoki noto'g'ri?","ru":"География: верно или неверно?","en":"Geography: true or false?"}$j$::jsonb, $j${"uz":"Dunyo va O'zbekiston geografiyasi bo'yicha tezkor savollar.","ru":"Быстрые вопросы по географии мира и Узбекистана.","en":"Quick questions on world and Uzbekistan geography."}$j$::jsonb, 'geography', 5, 'easy', $j$[{"id":"s1","statement":{"uz":"Toshkent — O'zbekistonning poytaxti.","ru":"Ташкент — столица Узбекистана.","en":"Tashkent is the capital of Uzbekistan."},"is_true":true,"explanation":null},{"id":"s2","statement":{"uz":"Amazonka daryosi Afrikada joylashgan.","ru":"Река Амазонка находится в Африке.","en":"The Amazon River is in Africa."},"is_true":false,"explanation":{"uz":"Amazonka Janubiy Amerikada oqadi. Afrikadagi mashhur daryo — Nil.","ru":"Амазонка течёт в Южной Америке. Знаменитая река Африки — Нил.","en":"The Amazon flows in South America. Africa's famous river is the Nile."}},{"id":"s3","statement":{"uz":"Tinch okeani Yerdagi eng katta okeandir.","ru":"Тихий океан — самый большой океан Земли.","en":"The Pacific is the largest ocean on Earth."},"is_true":true,"explanation":null},{"id":"s4","statement":{"uz":"Everest cho'qqisi Alp tog'larida joylashgan.","ru":"Пик Эверест находится в Альпах.","en":"Mount Everest is in the Alps."},"is_true":false,"explanation":{"uz":"Everest Himolay tog'larida, Nepal va Xitoy chegarasida joylashgan.","ru":"Эверест расположен в Гималаях, на границе Непала и Китая.","en":"Everest is in the Himalayas, on the border of Nepal and China."}},{"id":"s5","statement":{"uz":"Antarktida — eng sovuq qit'a.","ru":"Антарктида — самый холодный континент.","en":"Antarctica is the coldest continent."},"is_true":true,"explanation":null},{"id":"s6","statement":{"uz":"Avstraliya Yevropa qit'asida joylashgan.","ru":"Австралия находится в Европе.","en":"Australia is in Europe."},"is_true":false,"explanation":{"uz":"Avstraliya — alohida qit'a, Janubiy yarim sharda joylashgan.","ru":"Австралия — отдельный континент в Южном полушарии.","en":"Australia is a continent of its own, in the Southern Hemisphere."}},{"id":"s7","statement":{"uz":"Samarqand — O'zbekistonning qadimiy shaharlaridan biri.","ru":"Самарканд — один из древних городов Узбекистана.","en":"Samarkand is one of the ancient cities of Uzbekistan."},"is_true":true,"explanation":null},{"id":"s8","statement":{"uz":"Nil daryosi Janubiy Amerikada oqadi.","ru":"Река Нил течёт в Южной Америке.","en":"The Nile flows through South America."},"is_true":false,"explanation":{"uz":"Nil Shimoliy-Sharqiy Afrikadan o'tib, O'rta dengizga quyiladi.","ru":"Нил течёт по северо-востоку Африки и впадает в Средиземное море.","en":"The Nile flows through north-east Africa into the Mediterranean Sea."}},{"id":"s9","statement":{"uz":"Yer yuzida beshta okean bor.","ru":"На Земле пять океанов.","en":"There are five oceans on Earth."},"is_true":true,"explanation":null},{"id":"s10","statement":{"uz":"Orol dengizi Yaponiyada joylashgan.","ru":"Аральское море находится в Японии.","en":"The Aral Sea is in Japan."},"is_true":false,"explanation":{"uz":"Orol dengizi O'zbekiston va Qozog'iston o'rtasida, Markaziy Osiyoda joylashgan.","ru":"Аральское море расположено в Центральной Азии, между Узбекистаном и Казахстаном.","en":"The Aral Sea is in Central Asia, between Uzbekistan and Kazakhstan."}}]$j$::jsonb, 3),
 ('00000000-0000-4000-8000-00000000c004', 'quiz_race', $j${"uz":"Umumiy bilim viktorinasi","ru":"Викторина на общие знания","en":"General knowledge quiz"}$j$::jsonb, $j${"uz":"Tabiat, fan va tarixdan aralash savollar.","ru":"Смешанные вопросы о природе, науке и истории.","en":"Mixed questions on nature, science and history."}$j$::jsonb, 'general', null, 'medium', $j$[{"id":"q1","question":{"uz":"Quyoshga eng yaqin sayyora qaysi?","ru":"Какая планета ближе всего к Солнцу?","en":"Which planet is closest to the Sun?"},"options":[{"id":"A","text":{"uz":"Merkuriy","ru":"Меркурий","en":"Mercury"}},{"id":"B","text":{"uz":"Venera","ru":"Венера","en":"Venus"}},{"id":"C","text":{"uz":"Mars","ru":"Марс","en":"Mars"}},{"id":"D","text":{"uz":"Yupiter","ru":"Юпитер","en":"Jupiter"}}],"correct_option_id":"A","explanation":{"uz":"Merkuriy Quyoshga eng yaqin sayyoradir.","ru":"Меркурий — ближайшая к Солнцу планета.","en":"Mercury is the planet nearest the Sun."}},{"id":"q2","question":{"uz":"Suvning kimyoviy formulasi qanday?","ru":"Какова химическая формула воды?","en":"What is the chemical formula of water?"},"options":[{"id":"A","text":{"uz":"CO2","ru":"CO2","en":"CO2"}},{"id":"B","text":{"uz":"H2O","ru":"H2O","en":"H2O"}},{"id":"C","text":{"uz":"O2","ru":"O2","en":"O2"}},{"id":"D","text":{"uz":"NaCl","ru":"NaCl","en":"NaCl"}}],"correct_option_id":"B","explanation":{"uz":"Suv molekulasi ikkita vodorod va bitta kislorod atomidan iborat.","ru":"Молекула воды состоит из двух атомов водорода и одного атома кислорода.","en":"A water molecule has two hydrogen atoms and one oxygen atom."}},{"id":"q3","question":{"uz":"O'zbekiston Mustaqilligi kuni qachon nishonlanadi?","ru":"Когда отмечается День независимости Узбекистана?","en":"When is Uzbekistan's Independence Day?"},"options":[{"id":"A","text":{"uz":"1-yanvar","ru":"1 января","en":"1 January"}},{"id":"B","text":{"uz":"21-mart","ru":"21 марта","en":"21 March"}},{"id":"C","text":{"uz":"1-sentabr","ru":"1 сентября","en":"1 September"}},{"id":"D","text":{"uz":"9-may","ru":"9 мая","en":"9 May"}}],"correct_option_id":"C","explanation":null},{"id":"q4","question":{"uz":"Eng katta sutemizuvchi hayvon qaysi?","ru":"Какое млекопитающее самое большое?","en":"Which is the largest mammal?"},"options":[{"id":"A","text":{"uz":"Fil","ru":"Слон","en":"Elephant"}},{"id":"B","text":{"uz":"Jirafa","ru":"Жираф","en":"Giraffe"}},{"id":"C","text":{"uz":"Ko'k kit","ru":"Синий кит","en":"Blue whale"}},{"id":"D","text":{"uz":"Qutb ayig'i","ru":"Белый медведь","en":"Polar bear"}}],"correct_option_id":"C","explanation":{"uz":"Ko'k kit Yer tarixidagi eng katta hayvonlardan biridir.","ru":"Синий кит — одно из крупнейших животных в истории Земли.","en":"The blue whale is one of the largest animals ever to live."}},{"id":"q5","question":{"uz":"Mirzo Ulug'bek qaysi sohada mashhur?","ru":"В какой области известен Мирзо Улугбек?","en":"What was Mirzo Ulugbek famous for?"},"options":[{"id":"A","text":{"uz":"Astronomiya","ru":"Астрономия","en":"Astronomy"}},{"id":"B","text":{"uz":"Tibbiyot","ru":"Медицина","en":"Medicine"}},{"id":"C","text":{"uz":"Dengiz sayohati","ru":"Морские путешествия","en":"Sea voyages"}},{"id":"D","text":{"uz":"Kimyo","ru":"Химия","en":"Chemistry"}}],"correct_option_id":"A","explanation":{"uz":"Ulug'bek Samarqandda rasadxona qurdirgan va yulduzlar jadvalini tuzgan.","ru":"Улугбек построил обсерваторию в Самарканде и составил звёздный каталог.","en":"Ulugbek built an observatory in Samarkand and compiled a star catalogue."}},{"id":"q6","question":{"uz":"O'simliklar fotosintezda qaysi gazni yutadi?","ru":"Какой газ поглощают растения при фотосинтезе?","en":"Which gas do plants absorb during photosynthesis?"},"options":[{"id":"A","text":{"uz":"Kislorod","ru":"Кислород","en":"Oxygen"}},{"id":"B","text":{"uz":"Azot","ru":"Азот","en":"Nitrogen"}},{"id":"C","text":{"uz":"Karbonat angidrid","ru":"Углекислый газ","en":"Carbon dioxide"}},{"id":"D","text":{"uz":"Vodorod","ru":"Водород","en":"Hydrogen"}}],"correct_option_id":"C","explanation":{"uz":"O'simliklar karbonat angidridni yutib, kislorod chiqaradi.","ru":"Растения поглощают углекислый газ и выделяют кислород.","en":"Plants take in carbon dioxide and release oxygen."}},{"id":"q7","question":{"uz":"Dunyodagi eng baland tog' qaysi?","ru":"Какая гора самая высокая в мире?","en":"What is the highest mountain in the world?"},"options":[{"id":"A","text":{"uz":"Elbrus","ru":"Эльбрус","en":"Elbrus"}},{"id":"B","text":{"uz":"Everest","ru":"Эверест","en":"Everest"}},{"id":"C","text":{"uz":"Kilimanjaro","ru":"Килиманджаро","en":"Kilimanjaro"}},{"id":"D","text":{"uz":"Mont-Blan","ru":"Монблан","en":"Mont Blanc"}}],"correct_option_id":"B","explanation":null},{"id":"q8","question":{"uz":"Kattalar tanasida nechta suyak bor?","ru":"Сколько костей в теле взрослого человека?","en":"How many bones does an adult human have?"},"options":[{"id":"A","text":{"uz":"106","ru":"106","en":"106"}},{"id":"B","text":{"uz":"206","ru":"206","en":"206"}},{"id":"C","text":{"uz":"306","ru":"306","en":"306"}},{"id":"D","text":{"uz":"406","ru":"406","en":"406"}}],"correct_option_id":"B","explanation":null},{"id":"q9","question":{"uz":"Quyosh qaysi tomondan chiqadi?","ru":"С какой стороны восходит Солнце?","en":"In which direction does the Sun rise?"},"options":[{"id":"A","text":{"uz":"Sharq","ru":"Восток","en":"East"}},{"id":"B","text":{"uz":"G'arb","ru":"Запад","en":"West"}},{"id":"C","text":{"uz":"Shimol","ru":"Север","en":"North"}},{"id":"D","text":{"uz":"Janub","ru":"Юг","en":"South"}}],"correct_option_id":"A","explanation":null},{"id":"q10","question":{"uz":"Qaysi hayvon qush emas?","ru":"Какое животное не является птицей?","en":"Which animal is NOT a bird?"},"options":[{"id":"A","text":{"uz":"Pingvin","ru":"Пингвин","en":"Penguin"}},{"id":"B","text":{"uz":"Burgut","ru":"Орёл","en":"Eagle"}},{"id":"C","text":{"uz":"Ko'rshapalak","ru":"Летучая мышь","en":"Bat"}},{"id":"D","text":{"uz":"Boyqush","ru":"Сова","en":"Owl"}}],"correct_option_id":"C","explanation":{"uz":"Ko'rshapalak — uchadigan sutemizuvchi, qush emas.","ru":"Летучая мышь — летающее млекопитающее, а не птица.","en":"A bat is a flying mammal, not a bird."}}]$j$::jsonb, 4),
 ('00000000-0000-4000-8000-00000000c005', 'quiz_race', $j${"uz":"Matematika poygasi, 4-sinf","ru":"Математическая гонка, 4 класс","en":"Maths race, grade 4"}$j$::jsonb, $j${"uz":"Tez hisoblang va to'g'ri javobni tanlang.","ru":"Считайте быстро и выбирайте верный ответ.","en":"Calculate fast and pick the right answer."}$j$::jsonb, 'math', 4, 'easy', $j$[{"id":"q1","question":{"uz":"7 × 8 = ?","ru":"7 × 8 = ?","en":"7 × 8 = ?"},"options":[{"id":"A","text":{"uz":"54","ru":"54","en":"54"}},{"id":"B","text":{"uz":"56","ru":"56","en":"56"}},{"id":"C","text":{"uz":"63","ru":"63","en":"63"}},{"id":"D","text":{"uz":"48","ru":"48","en":"48"}}],"correct_option_id":"B","explanation":null},{"id":"q2","question":{"uz":"100 − 37 = ?","ru":"100 − 37 = ?","en":"100 − 37 = ?"},"options":[{"id":"A","text":{"uz":"63","ru":"63","en":"63"}},{"id":"B","text":{"uz":"73","ru":"73","en":"73"}},{"id":"C","text":{"uz":"67","ru":"67","en":"67"}},{"id":"D","text":{"uz":"57","ru":"57","en":"57"}}],"correct_option_id":"A","explanation":null},{"id":"q3","question":{"uz":"20 ning 3/4 qismi nechaga teng?","ru":"Чему равны 3/4 от 20?","en":"What is 3/4 of 20?"},"options":[{"id":"A","text":{"uz":"10","ru":"10","en":"10"}},{"id":"B","text":{"uz":"12","ru":"12","en":"12"}},{"id":"C","text":{"uz":"15","ru":"15","en":"15"}},{"id":"D","text":{"uz":"18","ru":"18","en":"18"}}],"correct_option_id":"C","explanation":{"uz":"20 ÷ 4 = 5, 5 × 3 = 15.","ru":"20 ÷ 4 = 5, 5 × 3 = 15.","en":"20 ÷ 4 = 5, then 5 × 3 = 15."}},{"id":"q4","question":{"uz":"Tomoni 6 sm bo'lgan kvadratning perimetri necha sm?","ru":"Чему равен периметр квадрата со стороной 6 см?","en":"What is the perimeter of a square with side 6 cm?"},"options":[{"id":"A","text":{"uz":"12 sm","ru":"12 см","en":"12 cm"}},{"id":"B","text":{"uz":"24 sm","ru":"24 см","en":"24 cm"}},{"id":"C","text":{"uz":"36 sm","ru":"36 см","en":"36 cm"}},{"id":"D","text":{"uz":"18 sm","ru":"18 см","en":"18 cm"}}],"correct_option_id":"B","explanation":{"uz":"Perimetr = 4 × 6 = 24.","ru":"Периметр = 4 × 6 = 24.","en":"Perimeter = 4 × 6 = 24."}},{"id":"q5","question":{"uz":"Qaysi son eng katta?","ru":"Какое число самое большое?","en":"Which number is the largest?"},"options":[{"id":"A","text":{"uz":"0,5","ru":"0,5","en":"0.5"}},{"id":"B","text":{"uz":"0,45","ru":"0,45","en":"0.45"}},{"id":"C","text":{"uz":"0,6","ru":"0,6","en":"0.6"}},{"id":"D","text":{"uz":"0,09","ru":"0,09","en":"0.09"}}],"correct_option_id":"C","explanation":null},{"id":"q6","question":{"uz":"144 ÷ 12 = ?","ru":"144 ÷ 12 = ?","en":"144 ÷ 12 = ?"},"options":[{"id":"A","text":{"uz":"10","ru":"10","en":"10"}},{"id":"B","text":{"uz":"11","ru":"11","en":"11"}},{"id":"C","text":{"uz":"12","ru":"12","en":"12"}},{"id":"D","text":{"uz":"14","ru":"14","en":"14"}}],"correct_option_id":"C","explanation":null},{"id":"q7","question":{"uz":"2,5 soatda necha daqiqa bor?","ru":"Сколько минут в 2,5 часах?","en":"How many minutes are in 2.5 hours?"},"options":[{"id":"A","text":{"uz":"120","ru":"120","en":"120"}},{"id":"B","text":{"uz":"130","ru":"130","en":"130"}},{"id":"C","text":{"uz":"150","ru":"150","en":"150"}},{"id":"D","text":{"uz":"250","ru":"250","en":"250"}}],"correct_option_id":"C","explanation":{"uz":"2 soat = 120 daqiqa, yarim soat = 30 daqiqa.","ru":"2 часа = 120 минут, полчаса = 30 минут.","en":"2 hours = 120 minutes, half an hour = 30 minutes."}},{"id":"q8","question":{"uz":"5 sm × 9 sm to'g'ri to'rtburchakning yuzi qancha?","ru":"Чему равна площадь прямоугольника 5 см × 9 см?","en":"What is the area of a 5 cm × 9 cm rectangle?"},"options":[{"id":"A","text":{"uz":"28 sm²","ru":"28 см²","en":"28 cm²"}},{"id":"B","text":{"uz":"45 sm²","ru":"45 см²","en":"45 cm²"}},{"id":"C","text":{"uz":"14 sm²","ru":"14 см²","en":"14 cm²"}},{"id":"D","text":{"uz":"54 sm²","ru":"54 см²","en":"54 cm²"}}],"correct_option_id":"B","explanation":{"uz":"Yuz = 5 × 9 = 45.","ru":"Площадь = 5 × 9 = 45.","en":"Area = 5 × 9 = 45."}}]$j$::jsonb, 5)
on conflict do nothing;
