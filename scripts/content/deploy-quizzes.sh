#!/usr/bin/env bash
# Serverda ishga tushiriladi (bir marta, xavfsiz, qayta ishga tushirish mumkin):
#   1) test jadvallarining zaxira nusxasi,  2) quizzes-grades-2-6.sql ni qo'llash (bitta tranzaksiya),  3) natijani tekshirish.
# Foydalanish:  bash deploy-quizzes.sh /root/quizzes-grades-2-6.sql
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/childrensacademy.uz}"
SQL="${1:-/root/quizzes-grades-2-6.sql}"
EXPECT_QUIZZES=20
EXPECT_QUESTIONS=558

[ -f "$SQL" ] || { echo "SQL fayl topilmadi: $SQL"; exit 1; }
cd "$APP_DIR"
set -a; . ./.env.local; set +a
: "${DATABASE_URL:?DATABASE_URL .env.local da yo'q}"

mkdir -p /root/backups
BACKUP="/root/backups/quizzes-before-$(date +%Y%m%d-%H%M%S).dump"
pg_dump "$DATABASE_URL" -t academic_quizzes -t academic_questions -Fc -f "$BACKUP"
echo "1/3 zaxira nusxa: $BACKUP ($(du -h "$BACKUP" | cut -f1))"

echo "2/3 SQL qo'llanmoqda ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$SQL"

Q=$(psql "$DATABASE_URL" -Atc "select count(*) from academic_quizzes where subject_key = 'mixed'")
N=$(psql "$DATABASE_URL" -Atc "select count(*) from academic_questions x join academic_quizzes z on z.id = x.quiz_id where z.subject_key = 'mixed'")
echo "3/3 tekshiruv: quizlar=$Q (kutilgan $EXPECT_QUIZZES), savollar=$N (kutilgan $EXPECT_QUESTIONS)"
psql "$DATABASE_URL" -c "select grade as sinf, count(*) as variantlar, min(duration_minutes) as daqiqa from academic_quizzes where subject_key = 'mixed' group by grade order by grade"
if [ "$Q" != "$EXPECT_QUIZZES" ] || [ "$N" != "$EXPECT_QUESTIONS" ]; then
  echo "DIQQAT: sonlar kutilganiga mos emas. Qaytarish: pg_restore -d \"\$DATABASE_URL\" --clean --if-exists $BACKUP"; exit 2
fi
echo "OK. Sayt testlarni 5 daqiqagacha kechikish bilan ko'rsatishi mumkin."
