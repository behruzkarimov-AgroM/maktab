// Resource definitions for the surveys module (spread into RESOURCES in resources.ts). Client-safe.
import { CHOICE_TYPES, type SurveyQuestionType } from "@/lib/surveys/types";
import { l, type AdminRole, type Field, type Option, type ResourceDef } from "./types";

const SA: AdminRole = "super_admin";
const ME: AdminRole = "methodist";
const PS: AdminRole = "psychologist";

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

export const surveyAudienceOptions: Option[] = [
  { value: "all", label: l("Hamma uchun", "Для всех", "Everyone"), tone: "gray" },
  { value: "parents", label: l("Ota-onalar", "Родители", "Parents"), tone: "blue" },
  { value: "students", label: l("O'quvchilar", "Ученики", "Students"), tone: "green" },
  { value: "teachers", label: l("O'qituvchilar", "Учителя", "Teachers"), tone: "violet" },
];

export const surveyQuestionTypeOptions: Option[] = [
  { value: "single", label: l("Bitta javob", "Один ответ", "Single choice"), tone: "blue" },
  { value: "multiple", label: l("Bir nechta javob", "Несколько ответов", "Multiple choice"), tone: "violet" },
  { value: "scale", label: l("Shkala (reyting)", "Шкала (рейтинг)", "Scale (rating)"), tone: "amber" },
  { value: "yesno", label: l("Ha / Yo'q", "Да / Нет", "Yes / No"), tone: "green" },
  { value: "text", label: l("Matnli javob", "Текстовый ответ", "Free text"), tone: "gray" },
];

export const SURVEY_RESOURCES: ResourceDef[] = [
  {
    key: "surveys",
    table: "surveys",
    label: l("So'rovnomalar", "Опросы", "Surveys"),
    singular: l("So'rovnoma", "Опрос", "Survey"),
    icon: "ClipboardList",
    group: "mind",
    // RLS (schema.sql): all staff read, super_admin + methodist write
    read: [SA, ME, PS],
    write: [SA, ME],
    titleField: "title",
    activeField: "is_active",
    detail: "survey",
    columns: [
      { name: "title", kind: "loc", sortable: true },
      { name: "audience", kind: "badge" },
      { name: "starts_at", kind: "datetime", sortable: true },
      { name: "ends_at", kind: "datetime", sortable: true },
      { name: "is_anonymous", kind: "bool" },
      { name: "is_active", kind: "bool" },
    ],
    search: ["title"],
    sort: { field: "created_at", dir: "desc" },
    filters: [{ name: "audience", label: l("Auditoriya", "Аудитория", "Audience"), options: surveyAudienceOptions }],
    fields: [
      loc("title", "Nomi", "Название", "Title", { required: true }),
      locArea("description", "Tavsif", "Описание", "Description"),
      { name: "audience", type: "select", required: true, half: true, defaultValue: "all", label: l("Auditoriya", "Аудитория", "Audience"), options: surveyAudienceOptions },
      { name: "is_active", type: "boolean", defaultValue: true, half: true, label: l("Faol", "Активно", "Active") },
      {
        name: "starts_at",
        type: "datetime",
        half: true,
        label: l("Boshlanish sanasi", "Дата начала", "Starts at"),
        help: l("Bo'sh qoldirilsa, darhol ochiladi", "Если пусто, открывается сразу", "Leave empty to open immediately"),
      },
      {
        name: "ends_at",
        type: "datetime",
        half: true,
        label: l("Tugash sanasi", "Дата окончания", "Ends at"),
        help: l("Bo'sh qoldirilsa, muddatsiz", "Если пусто, без срока", "Leave empty for no end date"),
      },
      {
        name: "is_anonymous",
        type: "boolean",
        defaultValue: true,
        half: true,
        label: l("Anonim", "Анонимный", "Anonymous"),
        help: l("O'chirilsa, respondent guruhi (ota-ona / o'quvchi...) majburiy bo'ladi", "Если выключить, группа респондента (родитель / ученик...) станет обязательной", "If off, the respondent group (parent / student...) becomes mandatory"),
      },
      {
        name: "allow_multiple_responses",
        type: "boolean",
        defaultValue: false,
        half: true,
        label: l("Qayta qatnashishga ruxsat", "Разрешить повторные ответы", "Allow multiple responses"),
        help: l("Odatda bitta brauzer faqat bir marta javob beradi", "По умолчанию один браузер отвечает один раз", "By default one browser answers once"),
      },
    ],
  },
  {
    key: "survey_questions",
    table: "survey_questions",
    label: l("So'rovnoma savollari", "Вопросы опроса", "Survey questions"),
    singular: l("Savol", "Вопрос", "Question"),
    icon: "HelpCircle",
    group: "mind",
    read: [SA, ME, PS],
    write: [SA, ME],
    nav: false,
    titleField: "question_text",
    parent: { field: "survey_id", resource: "surveys" },
    columns: [{ name: "question_text", kind: "loc" }],
    search: ["question_text"],
    sort: { field: "sort_order", dir: "asc" },
    fields: [
      { name: "type", type: "select", required: true, half: true, defaultValue: "single", label: l("Savol turi", "Тип вопроса", "Question type"), options: surveyQuestionTypeOptions },
      { name: "required", type: "boolean", defaultValue: true, half: true, label: l("Majburiy", "Обязательный", "Required") },
      locArea("question_text", "Savol matni", "Текст вопроса", "Question text", { required: true }),
      {
        name: "options",
        type: "repeater",
        autoId: "letter",
        maxItems: 10,
        label: l("Javob variantlari", "Варианты ответа", "Answer options"),
        help: l("Kamida 2 ta variant (bitta / bir nechta javob uchun)", "Минимум 2 варианта (для вопросов с выбором)", "At least 2 options (for choice questions)"),
        itemLabel: l("Variant", "Вариант", "Option"),
        defaultValue: ["A", "B"].map((id) => ({ id, text: { uz: "", ru: "", en: "" } })),
        fields: [
          { name: "id", type: "text", label: l("ID", "ID", "ID"), readOnly: true, half: true },
          loc("text", "Matn", "Текст", "Text"),
        ],
      },
      { name: "scale_min", type: "number", int: true, min: 0, max: 9, required: true, half: true, defaultValue: 1, label: l("Shkala boshi", "Начало шкалы", "Scale from") },
      { name: "scale_max", type: "number", int: true, min: 1, max: 10, required: true, half: true, defaultValue: 5, label: l("Shkala oxiri", "Конец шкалы", "Scale to") },
      loc("scale_min_label", "Past qiymat yozuvi", "Подпись минимума", "Low-end label"),
      loc("scale_max_label", "Yuqori qiymat yozuvi", "Подпись максимума", "High-end label"),
      { name: "sort_order", type: "number", int: true, defaultValue: 0, label: l("Tartib raqami", "Порядок", "Sort order") },
    ],
  },
];

/** Form fields for a survey question: options only for choice types, scale settings only for scales. */
export function surveyQuestionFields(fields: Field[], type: unknown): Field[] {
  const t = String(type ?? "single") as SurveyQuestionType;
  return fields.filter((f) => {
    if (f.name === "options") return CHOICE_TYPES.includes(t);
    if (f.name === "scale_min" || f.name === "scale_max" || f.name === "scale_min_label" || f.name === "scale_max_label") return t === "scale";
    return true;
  });
}
